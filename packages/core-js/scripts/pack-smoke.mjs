// Packs @convert-tools/core with `npm pack`, installs the tarball into an
// empty project and loads every public subpath through both `import` and
// `require`. Fails if the tarball contents, the two module systems or a
// known GeoConvert value disagree.
//
// Usage: node scripts/pack-smoke.mjs   (from packages/core-js)

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = mkdtempSync(path.join(tmpdir(), "convert-tools-pack-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

try {
  // Build first so that the prepack output does not mix with --json.
  run(npm, ["run", "build"], packageDirectory);
  const [packed] = JSON.parse(
    run(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", work], packageDirectory),
  );
  const files = packed.files.map((file) => file.path).sort();
  console.log(`tarball: ${packed.filename} (${files.length} files, ${packed.size} bytes)`);

  // Contents: sources, the CommonJS build and docs; no tests or type stubs.
  for (const required of [
    "package.json",
    "README.md",
    "CHANGELOG.md",
    "src/index.js",
    "src/errors.js",
    "dist/cjs/index.js",
    "dist/cjs/package.json",
    "dist/cjs/units/index.js",
    "dist/cjs/geodesy/index.js",
  ]) {
    assert.ok(files.includes(required), `tarball is missing ${required}`);
  }
  for (const file of files) {
    assert.ok(!file.startsWith("test/") && !file.startsWith("scripts/"), `tarball contains ${file}`);
    assert.ok(!/\.(ts|tsx)$/.test(file), `tarball contains TypeScript ${file}`);
  }

  const project = path.join(work, "project");
  mkdirSync(project);
  writeFileSync(path.join(project, "package.json"), '{ "name": "smoke", "private": true }\n');
  run(npm, ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--offline",
    path.join(work, packed.filename)], project);

  // The same checks, written once and run under both module systems.
  // 36SVK8801520370: `echo "39.933365 32.859742" | GeoConvert -m -p 0`.
  // 26PJD: GeoConvert reports "Block JD not in zone/band 26P".
  const checks = (load) => `
    const root = ${load("@convert-tools/core")};
    const length = ${load("@convert-tools/core/length")};
    const units = ${load("@convert-tools/core/units")};
    const geodesy = ${load("@convert-tools/core/geodesy")};
    const out = {};
    out.length = length.convertLength("1", "nautical-mile", "metre").exactValue;
    out.units = units.convertUnits("3", "length", "foot", "inch").exactValue;
    out.rootSame = root.convertLength === undefined ? "missing" : typeof root.convertLength;
    out.mgrs = geodesy.encodeMgrs(39.933365, 32.859742);
    out.bigint = typeof root.toRational("0.1").n;
    try { geodesy.decodeMgrs("26PJD"); out.error = "none"; }
    catch (error) { out.error = error.code + ":" + error.name; }
    out.codes = root.ERROR_CODES.length;
    console.log(JSON.stringify(out));
  `;
  writeFileSync(
    path.join(project, "esm.mjs"),
    checks((name) => `await import(${JSON.stringify(name)})`),
  );
  writeFileSync(
    path.join(project, "cjs.cjs"),
    checks((name) => `require(${JSON.stringify(name)})`),
  );
  const esm = JSON.parse(run(process.execPath, ["esm.mjs"], project));
  const cjs = JSON.parse(run(process.execPath, ["cjs.cjs"], project));
  console.log("import :", JSON.stringify(esm));
  console.log("require:", JSON.stringify(cjs));
  assert.deepEqual(cjs, esm, "import and require disagree");
  assert.deepEqual(esm.length, { numerator: "1852", denominator: "1" });
  assert.deepEqual(esm.units, { numerator: "36", denominator: "1" });
  assert.equal(esm.rootSame, "function");
  assert.equal(esm.mgrs, "36SVK8801520370");
  assert.equal(esm.bigint, "bigint");
  assert.equal(esm.error, "MGRS_SQUARE_NOT_IN_BAND:ConvertToolsError");
  console.log("pack smoke test passed");
} finally {
  rmSync(work, { recursive: true, force: true });
}
