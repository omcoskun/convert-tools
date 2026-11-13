// Architectural rules of the demo, checked on the source text:
//   - only src/ui/index.js imports the component library;
//   - the core is used through "@convert-tools/core" and nothing else;
//   - the demo computes no geodesy of its own;
//   - the removed Next/Worker/Cesium/TypeScript stack stays removed.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { REPO_ROOT, SRC, listFiles, sourceFiles } from "./support/files.mjs";

const UI_MODULE = path.join("ui", "index.js");

/** Module specifiers of static imports, re-exports and dynamic imports. */
function specifiers(text) {
  // The keyword must start a token, so id="length-from" is not read as one.
  return [...text.matchAll(/(?:^|[\s;{}])(?:from|import)\s*\(?\s*["']([^"']+)["']/gm)].map((match) => match[1]);
}

const sources = sourceFiles();

test("only src/ui/index.js imports @mui/* or @emotion/*", () => {
  const offenders = [];
  for (const { name, text } of sources) {
    if (name === UI_MODULE) continue;
    for (const specifier of specifiers(text)) {
      if (/^@(mui|emotion)\//.test(specifier)) offenders.push(`${name}: ${specifier}`);
    }
  }
  assert.deepEqual(offenders, []);
  const ui = sources.find(({ name }) => name === UI_MODULE);
  assert.deepEqual(specifiers(ui.text), ["@mui/material"]);
});

test("packages come from an allow-list and the core only from its root entry", () => {
  const allowed = new Set(["react", "react-dom/client", "@convert-tools/core"]);
  const offenders = [];
  for (const { name, text } of sources) {
    for (const specifier of specifiers(text)) {
      if (specifier.startsWith(".")) continue;
      if (name === UI_MODULE && specifier === "@mui/material") continue;
      if (!allowed.has(specifier)) offenders.push(`${name}: ${specifier}`);
    }
  }
  assert.deepEqual(offenders, [], "no subpath such as @convert-tools/core/geodesy");
});

test("relative imports name an existing file inside src/", () => {
  const offenders = [];
  for (const { file, name, text } of sources) {
    for (const specifier of specifiers(text)) {
      if (!specifier.startsWith(".")) continue;
      const target = path.resolve(path.dirname(file), specifier);
      const inside = !path.relative(SRC, target).startsWith("..");
      if (!inside || !existsSync(target) || !/\.jsx?$/.test(target)) offenders.push(`${name}: ${specifier}`);
    }
  }
  assert.deepEqual(offenders, [], "e.g. no ../../packages/core-js/src/...");
});

test("no stylesheets are imported or kept in src/", () => {
  const imports = sources.flatMap(({ name, text }) =>
    specifiers(text)
      .filter((specifier) => /\.(css|scss|sass|less)$/.test(specifier))
      .map((specifier) => `${name}: ${specifier}`),
  );
  assert.deepEqual(imports, []);
  assert.deepEqual(listFiles(SRC).filter((file) => /\.(css|scss|sass|less)$/.test(file)), []);
});

test("the demo has no geodesy formulas of its own", () => {
  // Trigonometry, roots, logarithms and powers belong in @convert-tools/core;
  // the map only needs min, max, floor and abs.
  const formula = /\bMath\.(sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|atanh|sqrt|cbrt|hypot|log\w*|exp|expm1|pow|PI|E|SQRT\w*|LN\w*)\b|\*\*/;
  const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const offenders = sources.filter(({ text }) => formula.test(withoutComments(text))).map(({ name }) => name);
  assert.deepEqual(offenders, []);
});

test("src/ui/index.js re-exports only components the demo uses", () => {
  const ui = sources.find(({ name }) => name === UI_MODULE).text;
  const exported = [...ui.matchAll(/export\s*\{([^}]*)\}/g)]
    .flatMap((match) => match[1].split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
  exported.push(...[...ui.matchAll(/export\s+const\s+(\w+)/g)].map((match) => match[1]));
  const used = new Set();
  for (const { name, text } of sources) {
    if (name === UI_MODULE) continue;
    for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][./]*ui\/index\.js["']/g)) {
      for (const entry of match[1].split(",")) if (entry.trim()) used.add(entry.trim());
    }
  }
  assert.deepEqual(exported.filter((entry) => !used.has(entry)).sort(), []);
});

test("there is no TypeScript in the repository", () => {
  const typescript = listFiles(REPO_ROOT)
    .filter((file) => /\.(ts|tsx|mts|cts)$/.test(file) || path.basename(file) === "tsconfig.json")
    .map((file) => path.relative(REPO_ROOT, file));
  assert.deepEqual(typescript, []);
});

test("the Next.js, Worker, HTTP API and Cesium stack is gone", () => {
  const removed = [
    "app/api",
    "app/layout.tsx",
    "app/page.tsx",
    "app/globals.css",
    "components",
    "lib",
    "worker",
    "public",
    "docs/API.md",
    "next.config.ts",
    "vite.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
    "scripts/build-pages.mjs",
    "tests",
  ];
  assert.deepEqual(removed.filter((entry) => existsSync(path.join(REPO_ROOT, entry))), []);
  const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const name of ["next", "vinext", "wrangler", "cesium", "typescript", "tailwindcss", "vite"]) {
    assert.equal(dependencies[name], undefined, name);
  }
});
