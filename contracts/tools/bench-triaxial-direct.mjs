#!/usr/bin/env node
// Benchmarks the accuracy of the triaxial direct problem against Geod3Solve.
//
//   node contracts/tools/bench-triaxial-direct.mjs [--count 2000] [--seed 5]
//
// Draws N direct problems on the CAYLEY ellipsoid (bet1 uniform on the
// sphere, omg1 and alp1 uniform in [-180, 180), s12 uniform in [0, 4.4)) with
// a seeded generator and rounds every input to 9 decimals, so the reference
// and the library parse exactly the same double. Each problem is solved by the
// public directTriaxialGeodesic and by Geod3Solve -t a b c -p 16; the position
// error is the Cartesian distance between the two end points.
//
// Prints one line: "direct: problems N, max position error E (row R), mean M,
// ms per problem T". Row R is the 0-based index of the worst problem.
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import { directTriaxialGeodesic, triaxialToCartesian } from "../../packages/core-js/src/index.js";
import { runReference } from "./lib/reference-runner.mjs";

const AXES = { a: Math.SQRT2, b: 1, c: Math.SQRT1_2 };
const OPTIONS = { ellipsoid: AXES };
const USAGE = "usage: node contracts/tools/bench-triaxial-direct.mjs [--count 2000] [--seed 5]";

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

function parseArguments(argv) {
  const options = { count: 2000, seed: 5 };
  const names = { "--count": "count", "--seed": "seed" };
  for (let k = 0; k < argv.length; k += 1) {
    const name = names[argv[k]];
    if (name === undefined || k + 1 >= argv.length) return null;
    options[name] = Number(argv[++k]);
  }
  if (!Number.isInteger(options.count) || options.count < 1) return null;
  if (!Number.isInteger(options.seed)) return null;
  return options;
}

function generateProblems(count, seed) {
  const random = mulberry32(seed);
  const uniform = (min, max) => min + random() * (max - min);
  const sphereLatitude = () => (Math.asin(uniform(-1, 1)) * 180) / Math.PI;
  const problems = [];
  for (let i = 0; i < count; i += 1) {
    problems.push({
      bet1: dec(sphereLatitude()),
      omg1: dec(uniform(-180, 180)),
      alp1: dec(uniform(-180, 180)),
      s12: dec(uniform(0, 4.4)),
    });
  }
  return problems;
}

function distance(p, q) {
  return Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options === null) {
    console.error(USAGE);
    process.exit(2);
  }
  const problems = generateProblems(options.count, options.seed);
  const binary = execFileSync("/usr/bin/which", ["Geod3Solve"]).toString().trim();
  const input = problems.map((p) => `${p.bet1} ${p.omg1} ${p.alp1} ${p.s12}`).join("\n") + "\n";
  const reference = runReference(
    binary,
    ["-t", String(AXES.a), String(AXES.b), String(AXES.c), "-p", "16"],
    input,
    problems.length,
  );

  const started = performance.now();
  const ends = problems.map((p) =>
    directTriaxialGeodesic({ beta: Number(p.bet1), omega: Number(p.omg1) }, Number(p.alp1), Number(p.s12), OPTIONS),
  );
  const elapsed = performance.now() - started;

  let worst = -1;
  let worstRow = 0;
  let total = 0;
  problems.forEach((p, index) => {
    if (reference.errorRows.has(index)) throw new Error(`Geod3Solve refused row ${index}: ${reference.lines[index]}`);
    const [bet2, omg2] = reference.lines[index].trim().split(/\s+/);
    const expected = triaxialToCartesian({ beta: Number(bet2), omega: Number(omg2) }, OPTIONS);
    const reached = triaxialToCartesian({ beta: ends[index].beta, omega: ends[index].omega }, OPTIONS);
    const error = distance(reached, expected);
    total += error;
    if (error > worst) {
      worst = error;
      worstRow = index;
    }
  });
  const mean = total / problems.length;
  console.log(
    `direct: problems ${problems.length}, max position error ${worst.toExponential(3)} (row ${worstRow}), ` +
      `mean ${mean.toExponential(3)}, ms per problem ${(elapsed / problems.length).toFixed(2)}`,
  );
}

main();
