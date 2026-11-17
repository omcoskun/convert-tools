#!/usr/bin/env node
// Benchmarks the speed of the triaxial inverse: seeded random point pairs on
// the CAYLEY ellipsoid (both points uniform on the sphere, coordinates
// rounded to 9 decimals) solved one after another by the public
// inverseTriaxialGeodesic.
//
//   node contracts/tools/bench-triaxial-inverse.mjs [--count 1000] [--seed 9] [--save file.tsv] [--compare file.tsv]
//
// --save writes "index s12 alp1 alp2" per pair with 17 significant digits;
// --compare reads such a file (same --count and --seed) and reports the
// largest changes of s12 and alp1.
//
// Prints one line "inverse: pairs N, median M ms, p95 P ms, total T s" and,
// with --compare, a second line "max |ds12| D (pair K), max |dalp1| A degrees
// (pair L)".
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { inverseTriaxialGeodesic } from "../../packages/core-js/src/index.js";

const AXES = { a: Math.SQRT2, b: 1, c: Math.SQRT1_2 };
const OPTIONS = { ellipsoid: AXES };
const USAGE =
  "usage: node contracts/tools/bench-triaxial-inverse.mjs [--count 1000] [--seed 9] [--save file.tsv] [--compare file.tsv]";

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Decimal text with at most `digits` fractional digits and no trailing zeros.
function dec(value, digits = 9) {
  let text = value.toFixed(digits);
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  if (text === "-0") text = "0";
  return text;
}

/** Degrees wrapped to [-180, 180). */
function wrap(degrees) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

function parseArguments(argv) {
  const options = { count: 1000, seed: 9, save: null, compare: null };
  const names = { "--count": "count", "--seed": "seed", "--save": "save", "--compare": "compare" };
  for (let k = 0; k < argv.length; k += 1) {
    const name = names[argv[k]];
    if (name === undefined || k + 1 >= argv.length) return null;
    const value = argv[++k];
    options[name] = name === "save" || name === "compare" ? value : Number(value);
  }
  if (!Number.isInteger(options.count) || options.count < 1) return null;
  if (!Number.isInteger(options.seed)) return null;
  if (options.save === "") return null;
  if (options.compare === "") return null;
  return options;
}

/** N point pairs uniform on the sphere, every coordinate rounded to 9 decimals. */
function generatePairs(count, seed) {
  const random = mulberry32(seed);
  const uniform = (min, max) => min + random() * (max - min);
  const sphereLatitude = () => (Math.asin(uniform(-1, 1)) * 180) / Math.PI;
  const pairs = [];
  for (let i = 0; i < count; i += 1) {
    pairs.push({
      bet1: Number(dec(sphereLatitude())),
      omg1: Number(dec(uniform(-180, 180))),
      bet2: Number(dec(sphereLatitude())),
      omg2: Number(dec(uniform(-180, 180))),
    });
  }
  return pairs;
}

/** Nearest-rank percentile of an ascending array of milliseconds. */
function percentile(sorted, fraction) {
  const rank = Math.max(1, Math.ceil(fraction * sorted.length)) - 1;
  return sorted[Math.min(rank, sorted.length - 1)];
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options === null) {
    console.error(USAGE);
    process.exit(2);
  }
  const pairs = generatePairs(options.count, options.seed);
  const results = [];
  const times = new Float64Array(pairs.length);
  const started = performance.now();
  pairs.forEach((pair, index) => {
    const begin = performance.now();
    const solution = inverseTriaxialGeodesic(
      { beta: pair.bet1, omega: pair.omg1 },
      { beta: pair.bet2, omega: pair.omg2 },
      OPTIONS,
    );
    times[index] = performance.now() - begin;
    results.push(solution);
  });
  const elapsed = performance.now() - started;

  const sorted = Array.from(times).sort((x, y) => x - y);
  const middle = sorted.length >> 1;
  const median = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  console.log(
    `inverse: pairs ${pairs.length}, median ${median.toFixed(2)} ms, ` +
      `p95 ${percentile(sorted, 0.95).toFixed(2)} ms, total ${(elapsed / 1000).toFixed(2)} s`,
  );

  if (options.save !== null) {
    const text = results.map((solution, index) =>
      [index, solution.distance, solution.initialAzimuthDegrees, solution.finalAzimuthDegrees]
        .map((value) => (typeof value === "number" ? value.toPrecision(17) : "NaN"))
        .join(" "),
    );
    writeFileSync(options.save, text.join("\n") + "\n");
  }

  if (options.compare !== null) {
    const lines = readFileSync(options.compare, "utf8").split("\n").filter((line) => line.trim() !== "");
    if (lines.length !== pairs.length) {
      throw new Error(`${options.compare} holds ${lines.length} pairs, expected ${pairs.length}`);
    }
    let worstDistance = -1;
    let worstDistancePair = 0;
    let worstAzimuth = -1;
    let worstAzimuthPair = 0;
    lines.forEach((line, index) => {
      const [before, s12, alp1] = line.trim().split(/\s+/).map(Number);
      if (before !== index) throw new Error(`${options.compare} row ${index} holds pair ${before}`);
      const difference = Math.abs(results[index].distance - s12);
      if (difference > worstDistance) {
        worstDistance = difference;
        worstDistancePair = index;
      }
      const turn = Math.abs(wrap(results[index].initialAzimuthDegrees - alp1));
      if (turn > worstAzimuth) {
        worstAzimuth = turn;
        worstAzimuthPair = index;
      }
    });
    console.log(
      `max |ds12| ${worstDistance.toExponential(3)} (pair ${worstDistancePair}), ` +
        `max |dalp1| ${worstAzimuth.toExponential(3)} degrees (pair ${worstAzimuthPair})`,
    );
  }
}

main();
