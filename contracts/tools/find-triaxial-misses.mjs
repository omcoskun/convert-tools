#!/usr/bin/env node
// Finds point pairs on the CAYLEY ellipsoid (a = sqrt(2), b = 1,
// c = 1/sqrt(2)) where the default azimuth fan of the triaxial inverse keeps
// a LONGER geodesic than a finer fan: the local minima of the miss distance
// can lie closer together than the coarse 2-degree spacing, so the coarse fan
// sees one seed only.
//
//   node contracts/tools/find-triaxial-misses.mjs --count N --seed S --workers W --out misses.tsv
//
// A quarter of the N pairs comes from each class:
//   a  bet2 = -bet1, |bet1| an integer in 80..90, omg1 and omg2 integers
//   b  |bet1| = |bet2| = 90, omg1 and omg2 uniform
//   c  point 2 near the antipode of point 1 (shifted up to 10 degrees in bet
//      and 60 degrees in omg)
//   d  both points uniform on the sphere
// Every pair is solved twice: with the defaults and with the oracle tuning
// { rays: 1440, refineRays: 0 }. The default answer is a miss when it is
// longer than the oracle by more than 1e-13 (unit b). Geod3Solve -i then gives
// the reference distance of the misses (NaN for an ERROR row).
//
// Output TSV, one line per miss:
//   class bet1 omg1 bet2 omg2 s_default s_oracle s_geod3solve
// and one summary line on stdout: "pairs N, misses M".
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

import { angle, createTriaxialModel } from "../../packages/core-js/src/geodesy/triaxial/ellipsoid3.js";
import { solveTriaxialInverse } from "../../packages/core-js/src/geodesy/triaxial/geodesic3.js";
import { runReference } from "./lib/reference-runner.mjs";

const AXES = { a: Math.SQRT2, b: 1, c: Math.SQRT1_2 };
// The oracle only sees a finer fan; its refinement is off so that it measures
// the coarse fan alone (refineRays: 0 is spelled out to be independent of the
// library's default).
const ORACLE = { rays: 1440, refineRays: 0 };
const USAGE = "usage: node contracts/tools/find-triaxial-misses.mjs --count N --seed S --workers W --out misses.tsv";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Degrees wrapped to [-180, 180). */
function wrap(degrees) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/** N point pairs drawn with the seeded generator, a quarter from each class. */
function generatePairs(count, seed) {
  const random = mulberry32(seed);
  const uniform = (min, max) => min + random() * (max - min);
  const sphereLatitude = () => (Math.asin(uniform(-1, 1)) * 180) / Math.PI;
  const clampBeta = (value) => Math.max(-90, Math.min(90, value));
  const pairs = [];
  for (let i = 0; i < count; i += 1) {
    const kind = "abcd"[i % 4];
    if (kind === "a") {
      const magnitude = 80 + Math.floor(random() * 11);
      const bet1 = random() < 0.5 ? -magnitude : magnitude;
      pairs.push({ kind, bet1, omg1: Math.floor(uniform(-180, 180)), bet2: -bet1, omg2: Math.floor(uniform(-180, 180)) });
    } else if (kind === "b") {
      const sign1 = random() < 0.5 ? -1 : 1;
      const sign2 = random() < 0.5 ? -1 : 1;
      pairs.push({ kind, bet1: sign1 * 90, omg1: uniform(-180, 180), bet2: sign2 * 90, omg2: uniform(-180, 180) });
    } else if (kind === "c") {
      const bet1 = sphereLatitude();
      const omg1 = uniform(-180, 180);
      pairs.push({
        kind,
        bet1,
        omg1,
        bet2: clampBeta(-bet1 + uniform(-10, 10)),
        omg2: wrap(omg1 + 180 + uniform(-60, 60)),
      });
    } else {
      pairs.push({ kind, bet1: sphereLatitude(), omg1: uniform(-180, 180), bet2: sphereLatitude(), omg2: uniform(-180, 180) });
    }
  }
  return pairs;
}

function parseArguments(argv) {
  const options = { workers: os.availableParallelism ? os.availableParallelism() : os.cpus().length };
  const names = { "--count": "count", "--seed": "seed", "--workers": "workers", "--out": "out" };
  for (let k = 0; k < argv.length; k += 1) {
    const name = names[argv[k]];
    if (name === undefined || k + 1 >= argv.length) return null;
    options[name] = argv[++k];
  }
  options.count = Number(options.count);
  options.seed = Number(options.seed);
  options.workers = Number(options.workers);
  if (!Number.isInteger(options.count) || options.count < 1) return null;
  if (!Number.isInteger(options.seed)) return null;
  if (!Number.isInteger(options.workers) || options.workers < 1) return null;
  if (typeof options.out !== "string" || options.out === "") return null;
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options === null) {
    console.error(USAGE);
    process.exit(2);
  }
  const pairs = generatePairs(options.count, options.seed);
  // A solver that fails gets NaN, which never compares as a shorter answer.
  const results = new Float64Array(pairs.length * 2).fill(Number.NaN);
  let done = 0;
  let reported = 0;
  await Promise.all(
    Array.from({ length: options.workers }, (_, start) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(fileURLToPath(import.meta.url), {
          workerData: { pairs, start, stride: options.workers },
        });
        worker.on("message", (message) => {
          if (message.progress) {
            done += message.progress;
            if (done - reported >= pairs.length / 20) {
              reported = done;
              console.error(`progress: ${done} / ${pairs.length}`);
            }
            return;
          }
          for (let i = start; i < pairs.length; i += options.workers) {
            results.set(message.results.subarray(i * 2, (i + 1) * 2), i * 2);
          }
          resolve();
        });
        worker.on("error", reject);
      }),
    ),
  );

  const misses = [];
  pairs.forEach((pair, i) => {
    const sDefault = results[i * 2];
    const sOracle = results[i * 2 + 1];
    if (!Number.isFinite(sDefault) || !Number.isFinite(sOracle)) return;
    if (sDefault - sOracle > 1e-13) misses.push({ ...pair, sDefault, sOracle });
  });

  // Geod3Solve decides nothing; its s12 only documents the found rows.
  const reference = new Array(misses.length).fill(Number.NaN);
  if (misses.length > 0) {
    const binary = execFileSync("/usr/bin/which", ["Geod3Solve"]).toString().trim();
    const input = misses.map((m) => `${m.bet1} ${m.omg1} ${m.bet2} ${m.omg2}`).join("\n") + "\n";
    const { lines, errorRows } = runReference(
      binary,
      ["-i", "-t", String(AXES.a), String(AXES.b), String(AXES.c), "-p", "16"],
      input,
      misses.length,
    );
    lines.forEach((line, index) => {
      if (!errorRows.has(index)) reference[index] = Number(line.trim().split(/\s+/)[2]);
    });
  }

  const text = misses.map((m, i) => [m.kind, m.bet1, m.omg1, m.bet2, m.omg2, m.sDefault, m.sOracle, reference[i]].join("\t"));
  writeFileSync(options.out, text.length > 0 ? text.join("\n") + "\n" : "");
  console.log(`pairs ${options.count}, misses ${misses.length}`);
}

if (isMainThread) {
  await main();
} else {
  const model = createTriaxialModel(AXES);
  const { pairs, start, stride } = workerData;
  const results = new Float64Array(pairs.length * 2).fill(Number.NaN);
  for (let i = start, done = 0; i < pairs.length; i += stride, done += 1) {
    const pair = pairs[i];
    const bet1 = angle(pair.bet1);
    const omg1 = angle(pair.omg1);
    const bet2 = angle(pair.bet2);
    const omg2 = angle(pair.omg2);
    try {
      const solution = solveTriaxialInverse(model, bet1, omg1, bet2, omg2);
      if (solution !== null) results[i * 2] = solution.s12;
    } catch {
      // stays NaN: the pair cannot be judged
    }
    try {
      const oracle = solveTriaxialInverse(model, bet1, omg1, bet2, omg2, ORACLE);
      if (oracle !== null) results[i * 2 + 1] = oracle.s12;
    } catch {
      // stays NaN: the pair cannot be judged
    }
    if (done % 50 === 49) parentPort.postMessage({ progress: 50 });
  }
  parentPort.postMessage({ results }, [results.buffer]);
}
