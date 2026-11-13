// The ESM entry points serve src/ unchanged, so src/ itself must parse and run
// in the oldest browsers the README promises: Chrome 67, Firefox 68 and
// Safari 14 (the first versions with BigInt). This test walks the syntax tree
// of every source file and rejects syntax and built-ins newer than those.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseSync, traverse } from "@babel/core";

const SOURCE = fileURLToPath(new URL("../src/", import.meta.url));

// Built-in methods and globals added after Chrome 67 / Firefox 68.
const NEW_PROPERTIES = new Map([
  ["flat", "Array.prototype.flat (Chrome 69)"],
  ["flatMap", "Array.prototype.flatMap (Chrome 69)"],
  ["fromEntries", "Object.fromEntries (Chrome 73)"],
  ["matchAll", "String.prototype.matchAll (Chrome 73)"],
  ["replaceAll", "String.prototype.replaceAll (Chrome 85)"],
  ["at", ".at() (Chrome 92)"],
  ["allSettled", "Promise.allSettled (Chrome 76)"],
  ["any", "Promise.any (Chrome 85)"],
  ["hasOwn", "Object.hasOwn (Chrome 93)"],
  ["findLast", "Array.prototype.findLast (Chrome 97)"],
  ["findLastIndex", "Array.prototype.findLastIndex (Chrome 97)"],
]);
const NEW_GLOBALS = new Map([
  ["globalThis", "globalThis (Chrome 71)"],
  ["structuredClone", "structuredClone (Chrome 98)"],
  ["AggregateError", "AggregateError (Chrome 85)"],
  ["WeakRef", "WeakRef (Chrome 84)"],
  ["FinalizationRegistry", "FinalizationRegistry (Chrome 84)"],
]);

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (entry.name.endsWith(".js")) yield full;
  }
}

function findings(file) {
  const code = readFileSync(file, "utf8");
  const ast = parseSync(code, {
    babelrc: false,
    configFile: false,
    sourceType: "module",
    filename: file,
  });
  const found = [];
  const report = (node, what) =>
    found.push(`${path.relative(SOURCE, file)}:${node.loc.start.line} ${what}`);
  traverse(ast, {
    LogicalExpression(p) {
      if (p.node.operator === "??") report(p.node, "?? (Chrome 80, Firefox 72)");
    },
    OptionalMemberExpression(p) {
      report(p.node, "?. (Chrome 80, Firefox 74)");
    },
    OptionalCallExpression(p) {
      report(p.node, "?.() (Chrome 80, Firefox 74)");
    },
    AssignmentExpression(p) {
      if (["&&=", "||=", "??="].includes(p.node.operator)) {
        report(p.node, `${p.node.operator} (Chrome 85)`);
      }
    },
    NumericLiteral(p) {
      if (p.node.extra?.raw?.includes("_")) report(p.node, "numeric separator (Chrome 75, Firefox 70)");
    },
    BigIntLiteral(p) {
      if (p.node.extra?.raw?.includes("_")) report(p.node, "numeric separator (Chrome 75, Firefox 70)");
    },
    ClassProperty(p) {
      report(p.node, "class field (Chrome 72, Firefox 69)");
    },
    ClassPrivateProperty(p) {
      report(p.node, "private class field (Chrome 74, Firefox 90)");
    },
    ClassPrivateMethod(p) {
      report(p.node, "private method (Chrome 84, Firefox 90)");
    },
    StaticBlock(p) {
      report(p.node, "class static block (Chrome 94)");
    },
    RegExpLiteral(p) {
      const { pattern, flags } = p.node;
      if (/[sdv]/.test(flags)) report(p.node, `RegExp flag ${flags} (Firefox 78)`);
      if (pattern.includes("(?<")) report(p.node, "RegExp named group or lookbehind (Firefox 78)");
      if (/\\[pP]\{/.test(pattern)) report(p.node, "RegExp Unicode property escape (Firefox 78)");
    },
    AwaitExpression(p) {
      if (!p.getFunctionParent()) report(p.node, "top-level await (Chrome 89)");
    },
    MemberExpression(p) {
      const { property, computed } = p.node;
      if (!computed && property.type === "Identifier" && NEW_PROPERTIES.has(property.name)) {
        report(p.node, NEW_PROPERTIES.get(property.name));
      }
    },
    Identifier(p) {
      if (NEW_GLOBALS.has(p.node.name) && !p.scope.hasBinding(p.node.name)) {
        report(p.node, NEW_GLOBALS.get(p.node.name));
      }
    },
  });
  return found;
}

test("kaynak kod README'deki en eski tarayıcılarda ayrıştırılabilir", () => {
  const all = [...sourceFiles(SOURCE)].flatMap(findings);
  assert.deepEqual(all, [], `Syntax newer than Chrome 67 / Firefox 68 / Safari 14:\n${all.join("\n")}`);
});
