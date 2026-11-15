#!/usr/bin/env node
// Validates the JavaScript triaxial solver, and optionally the Java one,
// against Karney's Geod3Test data set (https://doi.org/10.5281/zenodo.12510796,
// CC0-1.0): rows "bet1 omg1 alp1 bet2 omg2 alp2 s12 m12 M12 M21" on the
// ellipsoid a = sqrt(2), b = 1, c = 1/sqrt(2).
//
// Usage:
//   node contracts/tools/validate-geod3test.mjs /path/to/Geod3Test-v1.txt
//       [--reference /path/to/Geod3Solve] [--java-output /path/to/java.txt]
//       [--workers N] [--synthetic]
//
// The script checks the MD5 and the row count, runs the public inverse and
// direct solvers over every row (in N worker threads, default: all cores)
// and measures, per block and overall (unit b = 1):
//   inv-distance  |s12 - s12*|                             floor 1e-13
//   inv-azimuth   |delta alp1| * |m12*| (endpoint offset)  floor 1e-13
//   dir-position  Cartesian distance of the direct end
//                 point from (bet2*, omg2*)                floor 1e-13
//   m12, M12, M21 of the direct problem (alp1*, s12*),
//                 absolute difference                      floor 1e-11
// (* = the data set). A measure passes in a block if
//   ours <= max(2 * reference-binary maximum in that block, floor).
// --reference runs Geod3Solve (-i and direct, -t a b c -p 16) on the same
// rows; it prints no m12, M12, M21, so those three always use the floor.
// --java-output reads the "MAX <block> <measure> <value> <row> <count>" lines
// that io.github.mertc0604.converttools.Geod3TestFullSet prints and judges
// the Java numbers with the same limits. One table is printed per language,
// with the 0-based row index of each worst case. The exit status is 1 when a
// limit is exceeded, a solver throws, or the row count or MD5 is wrong.
//
// Blocks are derived from the end points of each row, in this order:
//   umbilical     an end point is an umbilic (|bet| = 90, omg = 0 or 180)
//   ellipse       an end point is on a principal ellipse (bet = 0,
//                 |bet| = 90, or omg = 0, 90 or 180 in absolute value)
//   near-umbilic  an end point is within 1 degree of an umbilic in both
//                 90 - |bet| and the distance of omg from 0 or 180
//   general       every other row
//
// Several shortest geodesics: where more than one row lists the same point
// pair (bet1 omg1 bet2 omg2, compared as written in the file), an inverse
// answer is judged against the row of that pair whose azimuths it matches
// best (smallest max(|delta alp1|, |delta alp2|)): its length must match, and
// its azimuth is compared with that row. A pair listed once is judged
// against its own row.
//
// --synthetic is for testing this tool on a file in the data-set layout that
// is not Geod3Test-v1.txt: it skips the MD5 and row-count checks.
//
// This tool is a manual audit; it is not part of CI and is not wired into the
// npm scripts. The data set is not distributed with the repository.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const EXPECTED_MD5 = "495983cb4d8128d1543a22ebd26617d6";
const EXPECTED_ROWS = 500000;
const AXES = { a: Math.SQRT2, b: 1, c: Math.SQRT1_2 };
const MEASURES = [
  ["inv-distance", 1e-13],
  ["inv-azimuth", 1e-13],
  ["dir-position", 1e-13],
  ["m12", 1e-11],
  ["M12", 1e-11],
  ["M21", 1e-11],
];
const BLOCKS = ["umbilical", "ellipse", "near-umbilic", "general"];
// Per-row outputs: s12, alp1, alp2, end point x, y, z, m12, M12, M21.
const OUTPUTS = 9;
const corePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "packages", "core-js", "src", "index.js");

function parseRows(text) {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.trim().split(/\s+/));
}

function blockOf(v) {
  const umbilic = (bet, omg) => Math.abs(bet) === 90 && (omg === 0 || Math.abs(omg) === 180);
  const ellipse = (bet, omg) => bet === 0 || Math.abs(bet) === 90 || [0, 90, 180].includes(Math.abs(omg));
  const near = (bet, omg) => 90 - Math.abs(bet) < 1 && Math.min(Math.abs(omg), 180 - Math.abs(omg)) < 1;
  if (umbilic(v[0], v[1]) || umbilic(v[3], v[4])) return "umbilical";
  if (ellipse(v[0], v[1]) || ellipse(v[3], v[4])) return "ellipse";
  if (near(v[0], v[1]) || near(v[3], v[4])) return "near-umbilic";
  return "general";
}

function headingDifference(x, y) {
  const degrees = ((((x - y) % 360) + 540) % 360) - 180;
  return (Math.abs(degrees) * Math.PI) / 180;
}

function makeMaxima() {
  const maxima = new Map();
  for (const name of [...BLOCKS, "ALL"]) {
    maxima.set(name, Object.fromEntries(MEASURES.map(([measure]) => [measure, { value: 0, row: -1, count: 0 }])));
  }
  return maxima;
}

function record(maxima, block, measure, value, row) {
  for (const name of [block, "ALL"]) {
    const entry = maxima.get(name)[measure];
    entry.count += 1;
    if (entry.row < 0 || Number.isNaN(value) || (!Number.isNaN(entry.value) && value > entry.value)) {
      entry.value = value;
      entry.row = row;
    }
  }
}

/**
 * Maxima of one solver's outputs (s12, alp1, alp2 per row; and, when
 * `direct` is set, end point and m12, M12, M21) over the rows.
 */
function measure(rows, groups, toCartesian, outputs, direct) {
  const maxima = makeMaxima();
  rows.forEach((text, i) => {
    const v = text.map(Number);
    const block = blockOf(v);
    const o = outputs.subarray(i * OUTPUTS, (i + 1) * OUTPUTS);
    record(maxima, block, "inv-distance", Math.abs(o[0] - v[6]), i);
    let best = null;
    for (const j of groups.get(`${text[0]} ${text[1]} ${text[3]} ${text[4]}`)) {
      const w = rows[j].map(Number);
      const score = Math.max(headingDifference(o[1], w[2]), headingDifference(o[2], w[5]));
      if (best === null || score < best.score || Number.isNaN(score)) best = { score, w };
    }
    record(maxima, block, "inv-azimuth", headingDifference(o[1], best.w[2]) * Math.abs(best.w[7]), i);
    const expected = toCartesian(v[3], v[4]);
    record(maxima, block, "dir-position", Math.hypot(o[3] - expected.x, o[4] - expected.y, o[5] - expected.z), i);
    if (direct) {
      record(maxima, block, "m12", Math.abs(o[6] - v[7]), i);
      record(maxima, block, "M12", Math.abs(o[7] - v[8]), i);
      record(maxima, block, "M21", Math.abs(o[8] - v[9]), i);
    }
  });
  return maxima;
}

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

function judge(language, maxima, reference, informational = false) {
  console.log(`\n${language}: block, measure, max, row of max, reference max, limit, verdict`);
  const failures = [];
  for (const block of [...BLOCKS, "ALL"]) {
    for (const [name, floor] of MEASURES) {
      const ours = maxima.get(block)[name];
      if (ours.count === 0) continue;
      const referenceEntry = reference ? reference.get(block)[name] : null;
      const referenceMax = referenceEntry && referenceEntry.count > 0 ? referenceEntry.value : 0;
      const limit = Math.max(2 * referenceMax, floor);
      const pass = ours.value <= limit;
      console.log(
        [
          block.padEnd(13),
          name.padEnd(13),
          fmt(ours.value).padEnd(10),
          `row=${ours.row}`.padEnd(11),
          `ref=${referenceEntry && referenceEntry.count > 0 ? fmt(referenceMax) : "-"}`.padEnd(14),
          `limit=${fmt(limit)}`.padEnd(16),
          informational ? "(reference)" : pass ? "PASS" : "FAIL",
        ].join(" "),
      );
      if (!pass && !informational) failures.push(`${language} ${block} ${name}: ${ours.value} > ${limit} (row ${ours.row})`);
    }
  }
  return failures;
}

function runReference(binary, args, input, count) {
  const result = spawnSync(binary, ["-t", String(AXES.a), String(AXES.b), String(AXES.c), "-p", "16", ...args], {
    input,
    maxBuffer: 1 << 30,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`${binary} ${args.join(" ")} failed: ${result.stderr || result.error}`);
  const lines = result.stdout.split("\n").slice(0, count);
  if (lines.length !== count) throw new Error(`${binary}: ${lines.length} lines for ${count} rows`);
  return lines.map((line) => line.trim().split(/\s+/).map(Number));
}

async function solveAll(file, rows, workers) {
  const outputs = new Float64Array(rows.length * OUTPUTS).fill(Number.NaN);
  let done = 0;
  let reported = 0;
  await Promise.all(
    Array.from({ length: workers }, (_, start) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { file, start, stride: workers } });
        worker.on("message", (message) => {
          if (message.progress) {
            done += message.progress;
            if (done - reported >= rows.length / 20) {
              reported = done;
              console.log(`progress: ${done} / ${rows.length}`);
            }
            return;
          }
          for (let i = start; i < rows.length; i += workers) {
            outputs.set(message.results.subarray(i * OUTPUTS, (i + 1) * OUTPUTS), i * OUTPUTS);
          }
          resolve();
        });
        worker.on("error", reject);
      }),
    ),
  );
  return outputs;
}

async function main() {
  const args = process.argv.slice(2);
  const options = { workers: os.availableParallelism ? os.availableParallelism() : os.cpus().length };
  let file = null;
  for (let k = 0; k < args.length; k += 1) {
    if (args[k] === "--reference") options.reference = args[++k];
    else if (args[k] === "--java-output") options.javaOutput = args[++k];
    else if (args[k] === "--workers") options.workers = Number(args[++k]);
    else if (args[k] === "--synthetic") options.synthetic = true;
    else if (file === null) file = args[k];
    else throw new Error(`unexpected argument ${args[k]}`);
  }
  if (file === null || !(options.workers >= 1)) {
    console.error(
      "usage: node contracts/tools/validate-geod3test.mjs /path/to/Geod3Test-v1.txt [--reference Geod3Solve] [--java-output java.txt] [--workers N] [--synthetic]",
    );
    process.exit(2);
  }
  const errors = [];
  const bytes = readFileSync(file);
  const md5 = createHash("md5").update(bytes).digest("hex");
  if (options.synthetic) console.log(`md5: ${md5} (synthetic: not checked)`);
  else if (md5 !== EXPECTED_MD5) errors.push(`md5 ${md5}, expected ${EXPECTED_MD5}`);
  else console.log(`md5: ${md5} (verified)`);
  const rows = parseRows(bytes.toString("utf8"));
  if (rows.some((row) => row.length !== 10 || row.some((value) => !Number.isFinite(Number(value))))) {
    errors.push("a row does not have ten numbers");
  }
  if (!options.synthetic && rows.length !== EXPECTED_ROWS) errors.push(`${rows.length} rows, expected ${EXPECTED_ROWS}`);
  console.log(`rows: ${rows.length}, workers: ${options.workers}`);
  if (errors.length > 0) {
    console.error("FAIL");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  const groups = new Map();
  rows.forEach((row, i) => {
    const key = `${row[0]} ${row[1]} ${row[3]} ${row[4]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  const core = await import(pathToFileURL(corePath).href);
  const toCartesian = (beta, omega) => core.triaxialToCartesian({ beta, omega }, { ellipsoid: AXES });

  const started = Date.now();
  const outputs = await solveAll(file, rows, options.workers);
  console.log(`JavaScript seconds: ${((Date.now() - started) / 1000).toFixed(1)}`);
  let failedRows = 0;
  for (let i = 0; i < rows.length; i += 1) {
    if (outputs.subarray(i * OUTPUTS, (i + 1) * OUTPUTS).some(Number.isNaN)) failedRows += 1;
  }
  if (failedRows) errors.push(`solver exceptions or missing headings on ${failedRows} rows`);
  const coreMaxima = measure(rows, groups, toCartesian, outputs, true);

  let referenceMaxima = null;
  if (options.reference) {
    const inverse = runReference(options.reference, ["-i"], rows.map((r) => `${r[0]} ${r[1]} ${r[3]} ${r[4]}`).join("\n") + "\n", rows.length);
    const direct = runReference(options.reference, [], rows.map((r) => `${r[0]} ${r[1]} ${r[2]} ${r[6]}`).join("\n") + "\n", rows.length);
    const referenceOutputs = new Float64Array(rows.length * OUTPUTS).fill(Number.NaN);
    rows.forEach((_, i) => {
      const end = toCartesian(direct[i][0], direct[i][1]);
      referenceOutputs.set([inverse[i][2], inverse[i][0], inverse[i][1], end.x, end.y, end.z], i * OUTPUTS);
    });
    referenceMaxima = measure(rows, groups, toCartesian, referenceOutputs, false);
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
}

// Entry point last, so that every top-level constant above is initialised.
if (!isMainThread) {
  const core = await import(pathToFileURL(corePath).href);
  const options = { ellipsoid: AXES };
  const { file, start, stride } = workerData;
  const rows = parseRows(readFileSync(file, "utf8"));
  const results = new Float64Array(rows.length * OUTPUTS).fill(Number.NaN);
  for (let i = start, done = 0; i < rows.length; i += stride, done += 1) {
    const v = rows[i].map(Number);
    try {
      const inverse = core.inverseTriaxialGeodesic({ beta: v[0], omega: v[1] }, { beta: v[3], omega: v[4] }, options);
      results[i * OUTPUTS] = inverse.distance;
      results[i * OUTPUTS + 1] = inverse.initialAzimuthDegrees ?? Number.NaN;
      results[i * OUTPUTS + 2] = inverse.finalAzimuthDegrees ?? Number.NaN;
    } catch {
      // stays NaN and fails every limit
    }
    try {
      const direct = core.directTriaxialGeodesic({ beta: v[0], omega: v[1] }, v[2], v[6], options);
      const end = core.triaxialToCartesian({ beta: direct.beta, omega: direct.omega }, options);
      results.set([end.x, end.y, end.z, direct.reducedLength, direct.geodesicScale12, direct.geodesicScale21], i * OUTPUTS + 3);
    } catch {
      // stays NaN
    }
    if (done % 500 === 499) parentPort.postMessage({ progress: 500 });
  }
  parentPort.postMessage({ results }, [results.buffer]);
} else {
  await main();
}
