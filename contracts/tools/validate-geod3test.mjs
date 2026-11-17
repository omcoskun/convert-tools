#!/usr/bin/env node
// Validates the JavaScript triaxial solver, and optionally the Java one, row
// by row against a file in the layout of Karney's Geod3Test data set
// (https://doi.org/10.5281/zenodo.12510796, CC0-1.0): rows "bet1 omg1 alp1
// bet2 omg2 alp2 s12 m12 M12 M21" on the ellipsoid a = sqrt(2), b = 1,
// c = 1/sqrt(2).
//
// Usage:
//   node contracts/tools/validate-geod3test.mjs /path/to/Geod3Test-v1.txt
//       [--reference /path/to/Geod3Solve] [--rows-out js-rows.tsv]
//       [--java-rows java-rows.tsv] [--outliers outliers.tsv]
//       [--workers N] [--synthetic]
//
// The script checks the MD5 and the row count, runs the public inverse and
// direct solvers over every row (in N worker threads, default: all cores)
// and judges EVERY ROW against the data set with fixed floors (unit b = 1):
//   inv-distance  |s12 - s12*|                             <= 1e-13
//   inv-azimuth   |delta alp1| * |m12*| (endpoint offset)  <= 1e-13
//   dir-position  Cartesian distance of the direct end
//                 point from (bet2*, omg2*)                <= 1e-13
//   m12, M12, M21 of the direct problem (alp1*, s12*),
//                 absolute difference                      <= 1e-11
// (* = the data set). A row fails if a measure is above its floor or is NaN.
// One exception: an inverse answer with another azimuth is accepted as an
// "alternative" when its length matches, the line it describes ends on
// point 2 (closure <= 1e-13) and the solver reported `ambiguous`; such a row
// does not fail inv-azimuth. The rule is in lib/geod3-judge.mjs.
//
// --reference runs Geod3Solve (-i and direct, -t a b c -p 16) on the same
// rows. It is INFORMATIONAL ONLY and never changes a verdict: Geod3Solve 2.7
// prints "ERROR" for some rows and returns a longer geodesic for others
// (docs/TRIAXIAL_VALIDATION.md), so it cannot set the limits.
// --rows-out writes the JavaScript per-row outputs (columns: ROW_COLUMNS of
// lib/geod3-judge.mjs). --java-rows reads the file in the same layout that
// io.github.mertc0604.converttools.Geod3TestFullSet writes and judges the
// Java rows with the same code. --outliers writes one line per failed
// measure: "language row block measure value".
// The exit status is 1 when a row fails in either language, or the row count
// or MD5 is wrong.
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
// best (smallest max(|delta alp1|, |delta alp2|)).
//
// --synthetic is for a file in the data-set layout that is not
// Geod3Test-v1.txt (see make-geod3-synthetic.mjs): it skips the MD5 and
// row-count checks.
//
// This tool is an audit run on demand: by hand, or by the workflow
// .github/workflows/full-validation.yml (manual trigger), not on every push.
// The data set is not distributed with the repository.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

import { BLOCKS, FLOORS, MEASURES, ROW_COLUMNS, blockOf, judgeRow } from "./lib/geod3-judge.mjs";
import { runReference as runSolver } from "./lib/reference-runner.mjs";

const EXPECTED_MD5 = "495983cb4d8128d1543a22ebd26617d6";
const EXPECTED_ROWS = 500000;
const AXES = { a: Math.SQRT2, b: 1, c: Math.SQRT1_2 };
// Per-row outputs: the columns of ROW_COLUMNS after "row".
const OUTPUTS = ROW_COLUMNS.length - 1;
const USAGE =
  "usage: node contracts/tools/validate-geod3test.mjs /path/to/Geod3Test-v1.txt [--reference Geod3Solve] [--rows-out js-rows.tsv] [--java-rows java-rows.tsv] [--outliers outliers.tsv] [--workers N] [--synthetic]";
const corePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "packages", "core-js", "src", "index.js");

function parseRows(text) {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.trim().split(/\s+/));
}

const fmt = (v) => (v == null ? "-" : v === 0 ? "0" : Number.isNaN(v) ? "NaN" : v.toExponential(2));

/**
 * Runs Geod3Solve once over all rows. Rows it cannot solve (their indices are
 * in `errorRows`) come back as arrays of NaN.
 */
function runReference(binary, args, input, count) {
  const { lines, errorRows } = runSolver(
    binary,
    ["-t", String(AXES.a), String(AXES.b), String(AXES.c), "-p", "16", ...args],
    input,
    count,
  );
  const values = lines.map((line, index) =>
    errorRows.has(index) ? [Number.NaN, Number.NaN, Number.NaN] : line.trim().split(/\s+/).map(Number),
  );
  return { values, errorRows };
}

/** Prints what Geod3Solve does on the same rows. It decides nothing. */
function reportReference(binary, rows, values, toCartesian) {
  const inverse = runReference(binary, ["-i"], rows.map((r) => `${r[0]} ${r[1]} ${r[3]} ${r[4]}`).join("\n") + "\n", rows.length);
  const direct = runReference(binary, [], rows.map((r) => `${r[0]} ${r[1]} ${r[2]} ${r[6]}`).join("\n") + "\n", rows.length);
  const empty = () => ({ rows: 0, inverseErrors: 0, off: 0, distance: 0, distanceRow: -1, directErrors: 0, position: 0, positionRow: -1 });
  const stats = new Map([...BLOCKS, "ALL"].map((name) => [name, empty()]));
  values.forEach((v, i) => {
    for (const name of [blockOf(v), "ALL"]) {
      const s = stats.get(name);
      s.rows += 1;
      if (inverse.errorRows.has(i)) s.inverseErrors += 1;
      else {
        const d = Math.abs(inverse.values[i][2] - v[6]);
        if (d > 1e-9) s.off += 1;
        if (d > s.distance) [s.distance, s.distanceRow] = [d, i];
      }
      if (direct.errorRows.has(i)) s.directErrors += 1;
      else {
        const end = toCartesian(direct.values[i][0], direct.values[i][1]);
        const target = toCartesian(v[3], v[4]);
        const d = Math.hypot(end.x - target.x, end.y - target.y, end.z - target.z);
        if (d > s.position) [s.position, s.positionRow] = [d, i];
      }
    }
  });
  console.log(`\nReference (${path.basename(binary)}), informational only:`);
  console.log("block, rows, inverse ERROR rows, inverse s12 off by > 1e-9, max inv-distance, row, direct ERROR rows, max dir-position, row");
  for (const [name, s] of stats) {
    if (s.rows === 0) continue;
    console.log(
      [
        name.padEnd(13),
        String(s.rows).padEnd(8),
        `errors=${s.inverseErrors}`.padEnd(12),
        `off=${s.off}`.padEnd(10),
        fmt(s.distance).padEnd(10),
        `row=${s.distanceRow}`.padEnd(11),
        `errors=${s.directErrors}`.padEnd(12),
        fmt(s.position).padEnd(10),
        `row=${s.positionRow}`,
      ].join(" "),
    );
  }
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

function writeRows(file, outputs, count) {
  const lines = [ROW_COLUMNS.join("\t")];
  for (let i = 0; i < count; i += 1) {
    const cells = [String(i)];
    for (let k = 0; k < OUTPUTS; k += 1) cells.push(outputs[i * OUTPUTS + k].toPrecision(17));
    lines.push(cells.join("\t"));
  }
  writeFileSync(file, lines.join("\n") + "\n");
}

function readRows(file, count) {
  const lines = readFileSync(file, "utf8").split("\n").filter((line) => line !== "");
  if (lines[0] !== ROW_COLUMNS.join("\t")) throw new Error(`${file}: the header is not "${ROW_COLUMNS.join(" ")}"`);
  if (lines.length !== count + 1) throw new Error(`${file}: ${lines.length - 1} rows, expected ${count}`);
  const outputs = new Float64Array(count * OUTPUTS);
  for (let i = 0; i < count; i += 1) {
    const cells = lines[i + 1].split("\t");
    if (cells.length !== ROW_COLUMNS.length || Number(cells[0]) !== i) throw new Error(`${file}: bad line ${i + 2}: ${lines[i + 1]}`);
    for (let k = 0; k < OUTPUTS; k += 1) outputs[i * OUTPUTS + k] = Number(cells[k + 1]);
  }
  return outputs;
}

/**
 * Judges every row of one language, prints its table and returns, per row,
 * the failed measures joined by "," ("" for a row that passes).
 */
function judgeAll(language, values, groups, outputs, toCartesian, outliers) {
  const empty = () => Object.fromEntries(MEASURES.map((name) => [name, { rows: 0, failed: 0, max: 0, row: -1 }]));
  const tables = new Map([...BLOCKS, "ALL"].map((name) => [name, empty()]));
  const alternatives = new Map([...BLOCKS, "ALL"].map((name) => [name, 0]));
  const verdicts = new Array(values.length);
  let failedRows = 0;
  let nanRows = 0;
  values.forEach((v, i) => {
    const out = outputs.subarray(i * OUTPUTS, (i + 1) * OUTPUTS);
    if (out.some(Number.isNaN)) nanRows += 1;
    const j = judgeRow(v, out, groups[i].map((k) => values[k]), toCartesian);
    const block = blockOf(v);
    const measured = { "inv-distance": j.invDistance, "inv-azimuth": j.invAzimuth, "dir-position": j.dirPosition, m12: j.m12, M12: j.M12, M21: j.M21 };
    for (const name of [block, "ALL"]) {
      if (j.alternative) alternatives.set(name, alternatives.get(name) + 1);
      for (const measure of MEASURES) {
        const entry = tables.get(name)[measure];
        entry.rows += 1;
        if (j.failed.includes(measure)) entry.failed += 1;
        // An accepted alternative has a large azimuth difference by nature.
        if (measure === "inv-azimuth" && j.alternative) continue;
        const value = measured[measure];
        if (entry.row < 0 || Number.isNaN(value) || (!Number.isNaN(entry.max) && value > entry.max)) {
          entry.max = value;
          entry.row = i;
        }
      }
    }
    verdicts[i] = j.failed.join(",");
    if (j.failed.length > 0) {
      failedRows += 1;
      for (const measure of j.failed) outliers.push([language, i, block, measure, measured[measure]].join("\t"));
    }
  });
  console.log(`\n${language}: block, measure, rows, failed rows, max, row of max, floor`);
  for (const [name, table] of tables) {
    for (const measure of MEASURES) {
      const entry = table[measure];
      if (entry.rows === 0) continue;
      console.log(
        [
          name.padEnd(13),
          measure.padEnd(13),
          String(entry.rows).padEnd(8),
          `failed=${entry.failed}`.padEnd(14),
          fmt(entry.max).padEnd(10),
          `row=${entry.row}`.padEnd(11),
          `floor=${fmt(FLOORS[measure])}`,
        ].join(" "),
      );
    }
    if (table[MEASURES[0]].rows > 0) console.log(`${name.padEnd(13)} alternatives  ${alternatives.get(name)}`);
  }
  console.log(`${language}: rows ${values.length}, failed rows ${failedRows}, alternatives ${alternatives.get("ALL")}, rows with NaN ${nanRows}`);
  return { verdicts, failedRows };
}

async function main() {
  const args = process.argv.slice(2);
  const options = { workers: os.availableParallelism ? os.availableParallelism() : os.cpus().length };
  let file = null;
  let bad = false;
  for (let k = 0; k < args.length; k += 1) {
    if (args[k] === "--reference") options.reference = args[++k];
    else if (args[k] === "--rows-out") options.rowsOut = args[++k];
    else if (args[k] === "--java-rows") options.javaRows = args[++k];
    else if (args[k] === "--outliers") options.outliers = args[++k];
    else if (args[k] === "--workers") options.workers = Number(args[++k]);
    else if (args[k] === "--synthetic") options.synthetic = true;
    else if (args[k].startsWith("--") || file !== null) bad = true;
    else file = args[k];
  }
  const missingValue = ["reference", "rowsOut", "javaRows", "outliers"].some((name) => name in options && options[name] === undefined);
  if (bad || missingValue || file === null || !(options.workers >= 1)) {
    console.error(USAGE);
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
  const values = rows.map((row) => row.map(Number));
  const byPair = new Map();
  rows.forEach((row, i) => {
    const key = `${row[0]} ${row[1]} ${row[3]} ${row[4]}`;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(i);
  });
  const groups = rows.map((row) => byPair.get(`${row[0]} ${row[1]} ${row[3]} ${row[4]}`));
  const core = await import(pathToFileURL(corePath).href);
  const toCartesian = (beta, omega) => core.triaxialToCartesian({ beta, omega }, { ellipsoid: AXES });

  if (options.reference) reportReference(options.reference, rows, values, toCartesian);
  else console.log("\nno --reference: Geod3Solve not run (it is informational only)");

  const started = Date.now();
  const outputs = await solveAll(file, rows, options.workers);
  console.log(`JavaScript seconds: ${((Date.now() - started) / 1000).toFixed(1)}`);
  if (options.rowsOut) writeRows(options.rowsOut, outputs, rows.length);

  const outliers = ["language\trow\tblock\tmeasure\tvalue"];
  const js = judgeAll("JavaScript", values, groups, outputs, toCartesian, outliers);
  if (js.failedRows > 0) errors.push(`JavaScript: ${js.failedRows} failed rows`);
  if (options.javaRows) {
    const java = judgeAll("Java", values, groups, readRows(options.javaRows, rows.length), toCartesian, outliers);
    if (java.failedRows > 0) errors.push(`Java: ${java.failedRows} failed rows`);
    const different = [];
    js.verdicts.forEach((verdict, i) => {
      if (verdict !== java.verdicts[i]) different.push(i);
    });
    console.log(`\nrows judged differently in the two languages: ${different.length}${different.length ? ` (first: ${different.slice(0, 10).join(", ")})` : ""}`);
    if (different.length > 0) errors.push(`${different.length} rows judged differently in the two languages`);
  }
  if (options.outliers) writeFileSync(options.outliers, outliers.join("\n") + "\n");
  if (errors.length > 0) {
    console.error("FAIL");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("PASS: every row is within the floors");
}

// Entry point last, so that every top-level constant above is initialised.
if (!isMainThread) {
  const core = await import(pathToFileURL(corePath).href);
  const options = { ellipsoid: AXES };
  const { file, start, stride } = workerData;
  const rows = parseRows(readFileSync(file, "utf8"));
  const results = new Float64Array(rows.length * OUTPUTS).fill(Number.NaN);
  const cartesian = (beta, omega) => core.triaxialToCartesian({ beta, omega }, options);
  for (let i = start, done = 0; i < rows.length; i += stride, done += 1) {
    const v = rows[i].map(Number);
    const o = i * OUTPUTS;
    const target = cartesian(v[3], v[4]);
    try {
      const inverse = core.inverseTriaxialGeodesic({ beta: v[0], omega: v[1] }, { beta: v[3], omega: v[4] }, options);
      results[o] = inverse.distance;
      results[o + 1] = inverse.initialAzimuthDegrees ?? Number.NaN;
      results[o + 2] = inverse.finalAzimuthDegrees ?? Number.NaN;
      results[o + 3] = inverse.ambiguous === true ? 1 : 0;
      // Closure: where the reported line really ends, compared with point 2.
      let end = cartesian(v[0], v[1]);
      if (inverse.initialAzimuthDegrees != null) {
        const line = core.directTriaxialGeodesic({ beta: v[0], omega: v[1] }, inverse.initialAzimuthDegrees, inverse.distance, options);
        end = cartesian(line.beta, line.omega);
      }
      results[o + 4] = Math.hypot(end.x - target.x, end.y - target.y, end.z - target.z);
    } catch {
      // stays NaN and fails every inverse measure
    }
    try {
      const direct = core.directTriaxialGeodesic({ beta: v[0], omega: v[1] }, v[2], v[6], options);
      const end = cartesian(direct.beta, direct.omega);
      results.set([end.x, end.y, end.z, direct.reducedLength, direct.geodesicScale12, direct.geodesicScale21], o + 5);
    } catch {
      // stays NaN
    }
    if (done % 500 === 499) parentPort.postMessage({ progress: 500 });
  }
  parentPort.postMessage({ results }, [results.buffer]);
} else {
  await main();
}
