#!/usr/bin/env node
// Builds contracts/test-vectors/geod3test-sample.csv from Karney's
// "Test set of geodesics on a triaxial ellipsoid" (Geod3Test-v1.txt,
// DOI 10.5281/zenodo.12510796, CC0-1.0) and registers it in manifest.json.
//
// Usage:
//   node contracts/tools/build-geod3test-sample.mjs /path/to/Geod3Test-v1.txt
//       [--out <directory>] [--synthetic]
//
// The input's MD5 must be 495983cb4d8128d1543a22ebd26617d6. The sample is
// the header plus every 500th line (0-based line index divisible by 500),
// 1,000 rows, with ids geod3test-NNNNNN (the six-digit 0-based line index)
// and the ten values copied as written. --out writes the CSV and updates the
// manifest.json of another directory (default contracts/test-vectors).
// --synthetic is for testing this tool on a file of the same layout that is
// not the data set: it skips the MD5 and the 1,000-row checks.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_MD5 = "495983cb4d8128d1543a22ebd26617d6";
const EXPECTED_ROWS = 1000;
const STEP = 500;
// Column names of the data set's documentation (ellipsoidal latitude,
// longitude and azimuth at both ends, distance, reduced length, scales).
const HEADER = "id,bet1,omg1,alp1,bet2,omg2,alp2,s12,m12,M12,M21";
const SELECTION =
  "awk 'BEGIN{print \"" + HEADER + "\"} (NR-1)%500==0 {printf \"geod3test-%06d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\\n\", NR-1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10}' Geod3Test-v1.txt";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const argv = process.argv.slice(2);
let input = null;
let out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "test-vectors");
let synthetic = false;
for (let k = 0; k < argv.length; k += 1) {
  if (argv[k] === "--out") out = path.resolve(argv[++k] ?? "");
  else if (argv[k] === "--synthetic") synthetic = true;
  else if (input === null && !argv[k].startsWith("--")) input = argv[k];
  else fail(`unexpected argument ${argv[k]}`);
}
if (!input) fail("usage: node contracts/tools/build-geod3test-sample.mjs /path/to/Geod3Test-v1.txt [--out dir] [--synthetic]");

const bytes = readFileSync(input);
const digest = createHash("md5").update(bytes).digest("hex");
if (synthetic) console.log(`SYNTHETIC INPUT: md5 ${digest} not checked`);
else if (digest !== EXPECTED_MD5) fail(`MD5 mismatch: got ${digest}, expected ${EXPECTED_MD5}`);
else console.log(`md5: ${digest} (verified)`);

const lines = bytes.toString("utf8").split(/\r?\n/);
if (lines.at(-1) === "") lines.pop();
const rows = [HEADER];
for (let index = 0; index < lines.length; index += STEP) {
  const values = lines[index].trim().split(/\s+/);
  if (values.length !== 10) fail(`line ${index}: expected 10 values, found ${values.length}`);
  rows.push([`geod3test-${String(index).padStart(6, "0")}`, ...values].join(","));
}
if (!synthetic && rows.length - 1 !== EXPECTED_ROWS) fail(`selected ${rows.length - 1} rows, expected ${EXPECTED_ROWS}`);

const csv = rows.join("\n") + "\n";
const csvPath = path.join(out, "geod3test-sample.csv");
writeFileSync(csvPath, csv);
const sha256 = createHash("sha256").update(csv).digest("hex");

const manifestPath = path.join(out, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { files: [] };
const entry = {
  name: "geod3test-sample.csv",
  rows: rows.length - 1,
  sha256,
  source: `Karney's Geod3Test-v1.txt, DOI 10.5281/zenodo.12510796, CC0-1.0, MD5 ${EXPECTED_MD5}`,
  selection: SELECTION,
};
const at = manifest.files.findIndex((file) => file.name === entry.name);
if (at >= 0) manifest.files[at] = entry;
else manifest.files.push(entry);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${csvPath}: ${rows.length - 1} rows, sha256 ${sha256}; manifest updated`);
