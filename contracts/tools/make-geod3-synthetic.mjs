#!/usr/bin/env node
// Writes a synthetic file in the layout of Karney's Geod3Test data set (rows
// "bet1 omg1 alp1 bet2 omg2 alp2 s12 m12 M12 M21", ellipsoid a = sqrt(2),
// b = 1, c = 1/sqrt(2)) for developing and testing the tools without the
// hold-out data:
//
//   node contracts/tools/make-geod3-synthetic.mjs <count> <seed> <out.txt>
//
// For each of <count> seeded random starts (bet1 uniform on the sphere, omg1
// and alp1 uniform, s12 uniform in [0, 4.4]) Geod3Solve gives the end point
// (bet2, omg2); Geod3Solve -i then gives the shortest geodesic between the
// two points (alp1, alp2, s12), and a second direct run checks that this
// answer really ends on point 2 (within 1e-12). Rows where Geod3Solve prints
// ERROR or does not close are dropped. m12, M12 and M21 come from this
// library (Geod3Solve does not print them), so those three columns only
// test that the two languages agree.
// Geod3Solve's inverse is occasionally not the shortest geodesic; such a row
// shows up in validate-geod3test.mjs --synthetic as an inv-distance failure
// where the library is SHORTER. Only a LONGER library answer is a library
// defect.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runReference } from "./lib/reference-runner.mjs";

const AXES = { a: Math.SQRT2, b: 1, c: Math.SQRT1_2 };
const corePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "packages", "core-js", "src", "index.js");

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

const [countText, seedText, out] = process.argv.slice(2);
const count = Number(countText);
const seed = Number(seedText);
if (!Number.isInteger(count) || count < 1 || !Number.isInteger(seed) || !out) {
  console.error("usage: node contracts/tools/make-geod3-synthetic.mjs <count> <seed> <out.txt>");
  process.exit(2);
}
const geod3solve = execFileSync("/usr/bin/which", ["Geod3Solve"]).toString().trim();
const solve = (args, lines) =>
  runReference(geod3solve, [...args, "-t", String(AXES.a), String(AXES.b), String(AXES.c), "-p", "16"], lines.join("\n") + "\n", lines.length);
const core = await import(pathToFileURL(corePath).href);
const options = { ellipsoid: AXES };
const cartesian = (beta, omega) => core.triaxialToCartesian({ beta, omega }, options);

const random = mulberry32(seed);
const uniform = (min, max) => min + random() * (max - min);
const starts = [];
for (let i = 0; i < count; i += 1) {
  const bet1 = ((Math.asin(uniform(-1, 1)) * 180) / Math.PI).toFixed(9);
  const omg1 = uniform(-180, 180).toFixed(9);
  const alp1 = uniform(-180, 180).toFixed(9);
  const s12 = uniform(0, 4.4).toFixed(9);
  starts.push({ bet1, omg1, alp1, s12 });
}
const first = solve([], starts.map((p) => `${p.bet1} ${p.omg1} ${p.alp1} ${p.s12}`));
const pairs = starts.map((p, i) => {
  const [bet2, omg2] = first.lines[i].trim().split(/\s+/);
  return { ...p, bet2, omg2 };
});
const inverse = solve(["-i"], pairs.map((p) => `${p.bet1} ${p.omg1} ${p.bet2} ${p.omg2}`));
const answers = pairs.map((p, i) => {
  const [alp1, alp2, s12] = inverse.lines[i].trim().split(/\s+/);
  return { ...p, alp1, alp2, s12 };
});
const usable = answers.filter((_, i) => !first.errorRows.has(i) && !inverse.errorRows.has(i));
const second = solve([], usable.map((p) => `${p.bet1} ${p.omg1} ${p.alp1} ${p.s12}`));
const rows = [];
let open = 0;
usable.forEach((p, i) => {
  const [bet, omg] = second.lines[i].trim().split(/\s+/).map(Number);
  const end = second.errorRows.has(i) ? { x: Number.NaN, y: 0, z: 0 } : cartesian(bet, omg);
  const target = cartesian(Number(p.bet2), Number(p.omg2));
  if (!(Math.hypot(end.x - target.x, end.y - target.y, end.z - target.z) <= 1e-12)) {
    open += 1;
    return;
  }
  const line = core.directTriaxialGeodesic({ beta: Number(p.bet1), omega: Number(p.omg1) }, Number(p.alp1), Number(p.s12), options);
  rows.push([p.bet1, p.omg1, p.alp1, p.bet2, p.omg2, p.alp2, p.s12, line.reducedLength, line.geodesicScale12, line.geodesicScale21].join(" "));
});
writeFileSync(out, rows.join("\n") + "\n");
console.log(
  `synthetic (seed ${seed}): candidates ${count}, Geod3Solve ERROR rows ${count - usable.length}, not closing ${open}, written ${rows.length} rows to ${out}`,
);
