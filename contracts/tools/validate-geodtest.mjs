#!/usr/bin/env node
// Validates the JavaScript core, and optionally the Java core, against
// Karney's GeodTest data set (https://doi.org/10.5281/zenodo.32156, CC0-1.0),
// all ten columns: lat1 lon1 azi1 lat2 lon2 azi2 s12 a12 m12 S12.
//
// Usage:
//   node contracts/tools/validate-geodtest.mjs /path/to/GeodTest.dat
//       [--reference /path/to/GeodSolve] [--java-output /path/to/java.txt]
//       [--synthetic]
//
// The script checks the MD5 of the input file, runs the public inverse and
// direct solvers over every row and measures, per block and overall:
//   inverse distance |s12 - s12*|                        floor 5e-8 m
//   inverse |delta azi1| * |m12*| (endpoint offset)      floor 1e-7 m
//   inverse and direct a12 |a12 - a12*|                  floor 5e-13 deg
//   inverse and direct m12 |m12 - m12*|                  floor 5e-8 m
//   inverse and direct S12 |S12 - S12*|                  floor 0.05 m^2
//   direct position (ground distance to lat2, lon2)      floor 5e-8 m
// (* = the data set). A measure passes in a block if
//   ours <= max(2 * reference-binary maximum in that block, floor).
// --reference runs GeodSolve (-i -f -p 9 and -f -p 9) on the same rows and
// takes its maxima as the reference; without it the floor alone applies.
// --java-output reads the "MAX <block> <measure> <value> <row>" lines that
// io.github.mertc0604.converttools.GeodTestFullSet prints and judges the Java
// numbers with the same limits. One table is printed per language, with the
// 0-based row index of each worst case. The exit status is 1 when a limit is
// exceeded, a solver throws, the row count or MD5 is wrong, or the
// `ambiguous` rule disagrees with the contract.
//
// Several shortest geodesics: where more than one row lists the same point
// pair (lat1 lon1 lat2 lon2, compared as written in the file), an inverse
// answer is judged against the row of that pair whose azimuths it matches
// best (smallest max(|delta azi1|, |delta azi2|)): its length must match, and
// its azimuths, a12, m12 and S12 are compared with that row. A pair listed
// once is judged against its own row.
//
// --synthetic is for testing this tool on a file in the data-set layout
// that is not GeodTest.dat: it skips the MD5 and row-count checks and
// divides every block size by 500 (200 random rows, 100 in each other block).
//
// This tool is a manual audit; it is not part of CI and is not wired into the
// npm scripts. The data set is not distributed with the repository.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXPECTED_MD5 = "3461c4dc2500a8bad9394cd530b13dbe";
const EXPECTED_ROWS = 500000;

// Floors of the acceptance limits (fixed; docs/GEODESIC_VALIDATION.md).
const MEASURES = [
  ["inverseDistance", 5e-8, "m"],
  ["azimuthOffset", 1e-7, "m"],
  ["inverseA12", 5e-13, "deg"],
  ["inverseM12", 5e-8, "m"],
  ["inverseS12", 0.05, "m^2"],
  ["directPosition", 5e-8, "m"],
  ["directA12", 5e-13, "deg"],
  ["directM12", 5e-8, "m"],
  ["directS12", 0.05, "m^2"],
];

// GeodTest blocks, 0-based line indexes.
const CATEGORIES = [
  ["random", 100000],
  ["antipodal", 50000],
  ["short", 50000],
  ["one-pole", 50000],
  ["opposite-poles", 50000],
  ["meridional", 50000],
  ["equatorial", 50000],
  ["vertex-to-vertex", 50000],
  ["near-vertex", 50000],
];

const A = 6378137; // WGS 84 equatorial radius, metres
const F = 1 / 298.257223563; // WGS 84 flattening
const RAD = Math.PI / 180;

// A3 series of Karney (2013), coefficients of eps^5 ... eps^0 as polynomials
// in n. Copied from GeographicLib's Geodesic.js (A3_coeff), series order 6.
const ORDER = 6;
const A3_COEFF = [
  -3, 128, // eps^5, order 0
  -2, -3, 64, // eps^4, order 1
  -1, -3, -1, 16, // eps^3, order 2
  3, -1, -2, 8, // eps^2, order 2
  1, -1, 2, // eps^1, order 1
  1, 1, // eps^0, order 0
];

function polyval(order, coefficients, offset, x) {
  let y = coefficients[offset];
  for (let k = 1; k <= order; k += 1) y = y * x + coefficients[offset + k];
  return y;
}

/** A3 coefficients as a polynomial in eps (Geodesic::A3coeff). */
function a3Coefficients(n) {
  const values = [];
  let offset = 0;
  for (let j = ORDER - 1; j >= 0; j -= 1) {
    const order = Math.min(ORDER - j - 1, j);
    values.push(polyval(order, A3_COEFF, offset, n) / A3_COEFF[offset + order + 1]);
    offset += order + 2;
  }
  return values;
}

function a3f(coefficients, eps) {
  return polyval(ORDER - 1, coefficients, 0, eps);
}

const N = F / (2 - F);
const EP2 = (F * (2 - F)) / ((1 - F) * (1 - F));
const A3 = a3Coefficients(N);

function angleDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return Math.abs(d);
}

/** Longitude difference reduced to (-180, 180]. */
function longitudeDifference(lon1, lon2) {
  let d = (lon2 - lon1) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** The exact `ambiguous` rule of the public contract. */
function contractAmbiguous(lat1, lat2, lon12) {
  if (lat1 + lat2 !== 0) return false;
  if (Math.abs(lat1) === 90) return true;
  if (Math.abs(lon12) === 180) return true;
  if (!(F > 0)) return false;

  const latitude = lat1 * RAD;
  let sbet = (1 - F) * Math.sin(latitude);
  let cbet = Math.cos(latitude);
  const norm = Math.sqrt(sbet * sbet + cbet * cbet);
  sbet /= norm;
  cbet /= norm;
  cbet = Math.max(Number.MIN_VALUE, cbet);
  const k2 = EP2 * sbet * sbet;
  const eps = k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
  const lonCut = 180 * (1 - F * a3f(A3, eps) * cbet);
  return Math.abs(lon12) - lonCut > 1e-9;
}


let blockScale = 1;
function categoryOf(index) {
  let end = 0;
  for (const [name, size] of CATEGORIES) {
    end += size / blockScale;
    if (index < end) return name;
  }
  return "extra";
}

/** Per-block maxima of every measure, with the row of each maximum. */
function makeMaxima() {
  const maxima = new Map();
  for (const name of [...CATEGORIES.map(([block]) => block), "extra", "ALL"]) {
    maxima.set(name, Object.fromEntries(MEASURES.map(([measure]) => [measure, { value: 0, row: -1, count: 0 }])));
  }
  return maxima;
}

function record(maxima, block, measure, value, row) {
  for (const name of [block, "ALL"]) {
    const entry = maxima.get(name)[measure];
    entry.count += 1;
    // A NaN is kept once seen: it fails every limit.
    if (entry.row < 0 || Number.isNaN(value) || (!Number.isNaN(entry.value) && value > entry.value)) {
      entry.value = value;
      entry.row = row;
    }
  }
}

function groundDistance(lat, lon, lat2, lon2) {
  const dLat = (lat - lat2) * RAD;
  const dLon = angleDiff(lon, lon2) * RAD * Math.cos(lat2 * RAD);
  return A * Math.hypot(dLat, dLon);
}

/**
 * Measures one solver over every row. `inverseOf(i)` and `directOf(i)`
 * return {azi1, azi2, s12, a12, m12, S12} and {lat2, lon2, a12, m12, S12}
 * (or throw); the same function judges the core and the reference binary.
 */
function measure(rows, groups, inverseOf, directOf, counters) {
  const maxima = makeMaxima();
  const { data, count } = rows;
  for (let i = 0; i < count; i += 1) {
    const block = categoryOf(i);
    const at = (column) => data[i * 10 + column];
    let inverse = null;
    try {
      inverse = inverseOf(i);
    } catch (error) {
      counters.inverseErrors += 1;
      if (counters.first.length < 5) counters.first.push({ row: i, kind: "inverse", message: String(error?.message ?? error) });
    }
    if (inverse) {
      // Judge the route against the best-matching row of the same point pair.
      let best = i;
      const candidates = groups.get(i);
      if (candidates && inverse.azi1 != null) {
        let bestError = Infinity;
        for (const j of candidates) {
          const e = Math.max(angleDiff(inverse.azi1, data[j * 10 + 2]), angleDiff(inverse.azi2, data[j * 10 + 5]));
          if (e < bestError) {
            bestError = e;
            best = j;
          }
        }
      }
      const ref = (column) => data[best * 10 + column];
      record(maxima, block, "inverseDistance", Math.abs(inverse.s12 - at(6)), i);
      if (inverse.azi1 != null) {
        record(maxima, block, "azimuthOffset", angleDiff(inverse.azi1, ref(2)) * RAD * Math.abs(ref(8)), i);
      }
      record(maxima, block, "inverseA12", Math.abs(inverse.a12 - ref(7)), i);
      record(maxima, block, "inverseM12", Math.abs(inverse.m12 - ref(8)), i);
      record(maxima, block, "inverseS12", Math.abs(inverse.S12 - ref(9)), i);
    }
    try {
      const direct = directOf(i);
      record(maxima, block, "directPosition", groundDistance(direct.lat2, direct.lon2, at(3), at(4)), i);
      record(maxima, block, "directA12", Math.abs(direct.a12 - at(7)), i);
      record(maxima, block, "directM12", Math.abs(direct.m12 - at(8)), i);
      record(maxima, block, "directS12", Math.abs(direct.S12 - at(9)), i);
    } catch (error) {
      counters.directErrors += 1;
      if (counters.first.length < 5) counters.first.push({ row: i, kind: "direct", message: String(error?.message ?? error) });
    }
  }
  return maxima;
}

/** Runs GeodSolve once over all rows; returns the parsed output lines. */
function runReference(binary, args, input) {
  const result = spawnSync(binary, args, { input, maxBuffer: 1 << 30, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${binary} ${args.join(" ")} failed: ${result.stderr || result.error}`);
  }
  const lines = result.stdout.split("\n");
  return (i) => {
    const values = lines[i].trim().split(/\s+/).map(Number);
    if (values.length < 12 || values.some((v) => Number.isNaN(v))) throw new Error(`reference output: ${lines[i]}`);
    return values;
  };
}

/** Parses the MAX lines of GeodTestFullSet's output. */
function readJavaMaxima(file) {
  const maxima = makeMaxima();
  let lines = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] !== "MAX" || parts.length !== 6) continue;
    const [, block, name, value, row, count] = parts;
    if (!maxima.has(block) || !(name in maxima.get(block))) throw new Error(`unknown Java line: ${line}`);
    maxima.get(block)[name] = { value: Number(value), row: Number(row), count: Number(count) };
    lines += 1;
  }
  if (lines === 0) throw new Error(`no MAX lines in ${file}`);
  return maxima;
}

const fmt = (v) => (v == null ? "-" : v === 0 ? "0" : Number.isNaN(v) ? "NaN" : v.toExponential(2));

/** Prints one language's table and returns the failed limits. */
function judge(language, maxima, reference, informational = false) {
  console.log(`\n${language}: block, measure, max, row of max, reference max, limit, verdict`);
  const failures = [];
  for (const block of [...CATEGORIES.map(([name]) => name), "ALL"]) {
    for (const [name, floor, unit] of MEASURES) {
      const ours = maxima.get(block)[name];
      if (ours.count === 0) continue;
      const referenceMax = reference ? reference.get(block)[name].value : 0;
      const limit = Math.max(2 * referenceMax, floor);
      const pass = ours.value <= limit;
      console.log(
        [
          block.padEnd(17),
          name.padEnd(16),
          `${fmt(ours.value)} ${unit}`.padEnd(14),
          `row=${ours.row}`.padEnd(11),
          `ref=${reference ? fmt(referenceMax) : "-"}`.padEnd(14),
          `limit=${fmt(limit)}`.padEnd(16),
          informational ? "(reference)" : pass ? "PASS" : "FAIL",
        ].join(" "),
      );
      if (!pass && !informational) failures.push(`${language} ${block} ${name}: ${ours.value} ${unit} > ${limit} (row ${ours.row})`);
    }
  }
  return failures;
}

async function md5(file) {
  const hash = createHash("md5");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function parseArguments(argv) {
  const options = { data: null, reference: null, javaOutput: null, synthetic: false };
  for (let k = 0; k < argv.length; k += 1) {
    const argument = argv[k];
    if (argument === "--reference") options.reference = argv[++k];
    else if (argument === "--java-output") options.javaOutput = argv[++k];
    else if (argument === "--synthetic") options.synthetic = true;
    else if (argument.startsWith("--") || options.data !== null) {
      throw new Error(`unexpected argument ${argument}`);
    } else options.data = argument;
  }
  if (!options.data || options.reference === undefined || options.javaOutput === undefined) {
    throw new Error("missing value");
  }
  return options;
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  console.error(String(error.message));
  console.error(
    "usage: node contracts/tools/validate-geodtest.mjs /path/to/GeodTest.dat [--reference GeodSolve] [--java-output java.txt] [--synthetic]",
  );
  process.exit(2);
}

const errors = [];
if (options.synthetic) {
  blockScale = 500;
  console.log("SYNTHETIC INPUT: MD5 and row count not checked; block sizes divided by 500");
} else {
  const digest = await md5(options.data);
  if (digest !== EXPECTED_MD5) {
    console.error(`MD5 mismatch: got ${digest}, expected ${EXPECTED_MD5}`);
    process.exit(1);
  }
  console.log(`md5: ${digest} (verified)`);
}

const corePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "packages", "core-js", "src", "index.js");
const { inverseGeodesic, directGeodesic } = await import(pathToFileURL(corePath).href);

// Read every row: numbers for the checks, the text for the reference binary.
const lines = [];
const numbers = [];
for await (const line of createInterface({ input: createReadStream(options.data) })) {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 10) continue;
  lines.push(parts);
  for (let column = 0; column < 10; column += 1) numbers.push(Number(parts[column]));
}
const rows = { data: Float64Array.from(numbers), count: lines.length };
numbers.length = 0;
if (!options.synthetic && rows.count !== EXPECTED_ROWS) errors.push(`rows: ${rows.count}, expected ${EXPECTED_ROWS}`);

// Point pairs listed more than once.
const pairRows = new Map();
for (let i = 0; i < rows.count; i += 1) {
  const key = `${lines[i][0]} ${lines[i][1]} ${lines[i][3]} ${lines[i][4]}`;
  const list = pairRows.get(key);
  if (list) list.push(i);
  else pairRows.set(key, [i]);
}
const groups = new Map();
for (const list of pairRows.values()) if (list.length > 1) for (const i of list) groups.set(i, list);
pairRows.clear();
console.log(`rows: ${rows.count}; rows whose point pair is listed more than once: ${groups.size}`);

const started = Date.now();
const coreCounters = { inverseErrors: 0, directErrors: 0, first: [] };
let ambiguous = 0;
let ambiguousExpected = 0;
let ambiguousMismatches = 0;
const at = (i, column) => rows.data[i * 10 + column];
const coreMaxima = measure(
  rows,
  groups,
  (i) => {
    const result = inverseGeodesic(
      { latitude: at(i, 0), longitude: at(i, 1) },
      { latitude: at(i, 3), longitude: at(i, 4) },
    );
    const expected = contractAmbiguous(at(i, 0), at(i, 3), longitudeDifference(at(i, 1), at(i, 4)));
    if (result.ambiguous) ambiguous += 1;
    if (expected) ambiguousExpected += 1;
    if (Boolean(result.ambiguous) !== expected) ambiguousMismatches += 1;
    return {
      azi1: result.initialBearingDegrees,
      azi2: result.finalBearingDegrees,
      s12: result.distanceMetres,
      a12: result.arcDegrees,
      m12: result.reducedLengthMetres,
      S12: result.areaSquareMetres,
    };
  },
  (i) => {
    const result = directGeodesic({ latitude: at(i, 0), longitude: at(i, 1) }, at(i, 2), at(i, 6));
    return {
      lat2: result.latitude,
      lon2: result.longitude,
      a12: result.arcDegrees,
      m12: result.reducedLengthMetres,
      S12: result.areaSquareMetres,
    };
  },
  coreCounters,
);
console.log(`JavaScript seconds: ${((Date.now() - started) / 1000).toFixed(1)}`);
if (coreCounters.inverseErrors) errors.push(`inverse exceptions: ${coreCounters.inverseErrors}`);
if (coreCounters.directErrors) errors.push(`direct exceptions: ${coreCounters.directErrors}`);
if (coreCounters.first.length) console.log("first errors:", JSON.stringify(coreCounters.first));
console.log(`ambiguous: ${ambiguous} expected: ${ambiguousExpected} mismatches: ${ambiguousMismatches}`);
if (ambiguousMismatches) errors.push(`ambiguous rule mismatches: ${ambiguousMismatches}`);

let referenceMaxima = null;
if (options.reference) {
  const inverseOutput = runReference(
    options.reference,
    ["-i", "-f", "-p", "9"],
    lines.map((p) => `${p[0]} ${p[1]} ${p[3]} ${p[4]}`).join("\n") + "\n",
  );
  const directOutput = runReference(
    options.reference,
    ["-f", "-p", "9"],
    lines.map((p) => `${p[0]} ${p[1]} ${p[2]} ${p[6]}`).join("\n") + "\n",
  );
  const referenceCounters = { inverseErrors: 0, directErrors: 0, first: [] };
  referenceMaxima = measure(
    rows,
    groups,
    (i) => {
      const v = inverseOutput(i);
      return { azi1: v[2], azi2: v[5], s12: v[6], a12: v[7], m12: v[8], S12: v[11] };
    },
    (i) => {
      const v = directOutput(i);
      return { lat2: v[3], lon2: v[4], a12: v[7], m12: v[8], S12: v[11] };
    },
    referenceCounters,
  );
  if (referenceCounters.inverseErrors + referenceCounters.directErrors > 0) {
    errors.push(`reference output unreadable on ${referenceCounters.inverseErrors + referenceCounters.directErrors} rows`);
  }
  judge(`Reference (${path.basename(options.reference)})`, referenceMaxima, null, true);
}

const failures = judge("JavaScript", coreMaxima, referenceMaxima);
if (options.javaOutput) failures.push(...judge("Java", readJavaMaxima(options.javaOutput), referenceMaxima));
errors.push(...failures);
if (!options.reference) console.log("\nno --reference: every limit is its floor");

if (errors.length > 0) {
  console.error("FAIL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("PASS: all limits met");
