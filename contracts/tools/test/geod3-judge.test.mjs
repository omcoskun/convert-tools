import assert from "node:assert/strict";
import test from "node:test";

import { ROW_COLUMNS, blockOf, judgeRow } from "../lib/geod3-judge.mjs";

// A stand-in for the real conversion: the tests only need a fixed map.
const toCartesian = (beta, omega) => ({ x: beta / 100, y: omega / 100, z: 0 });
// bet1 omg1 alp1 bet2 omg2 alp2 s12 m12 M12 M21
const v = [10, 20, 30, 40, 50, 60, 1.5, 0.9, 0.1, 0.2];
// s12 alp1 alp2 ambiguous closure x y z m12 M12 M21
const exact = [1.5, 30, 60, 0, 0, 0.4, 0.5, 0, 0.9, 0.1, 0.2];
const withValues = (changes) => exact.map((value, index) => changes[index] ?? value);

test("the row columns are the row index and eleven numbers", () => {
  assert.equal(ROW_COLUMNS.length, 12);
  assert.equal(ROW_COLUMNS[0], "row");
});

test("an exact answer passes every measure", () => {
  const j = judgeRow(v, exact, [v], toCartesian);
  assert.deepEqual(j.failed, []);
  assert.equal(j.alternative, false);
  assert.equal(j.invDistance, 0);
});

test("a longer distance fails inv-distance", () => {
  const j = judgeRow(v, withValues({ 0: 1.5 + 2e-13 }), [v], toCartesian);
  assert.deepEqual(j.failed, ["inv-distance"]);
});

test("an equal-length mirror answer marked ambiguous is an alternative", () => {
  const j = judgeRow(v, withValues({ 1: 150, 2: 120, 3: 1, 4: 1e-15 }), [v], toCartesian);
  assert.equal(j.alternative, true);
  assert.deepEqual(j.failed, []);
});

test("a different azimuth that is not marked ambiguous fails", () => {
  const j = judgeRow(v, withValues({ 1: 150, 2: 120, 3: 0, 4: 1e-15 }), [v], toCartesian);
  assert.equal(j.alternative, false);
  assert.deepEqual(j.failed, ["inv-azimuth"]);
});

test("an ambiguous answer that does not close on point 2 fails", () => {
  const j = judgeRow(v, withValues({ 1: 150, 2: 120, 3: 1, 4: 1e-9 }), [v], toCartesian);
  assert.deepEqual(j.failed, ["inv-azimuth"]);
});

test("a NaN output fails every measure it feeds", () => {
  const j = judgeRow(v, withValues({ 0: Number.NaN, 1: Number.NaN, 2: Number.NaN }), [v], toCartesian);
  assert.ok(j.failed.includes("inv-distance"));
  assert.ok(j.failed.includes("inv-azimuth"));
  assert.ok(!j.failed.includes("m12"));
});

test("rows listed twice are judged against the best-matching row", () => {
  const rowA = [10, 20, 10, 40, 50, 20, 1.5, 0.9, 0.1, 0.2];
  const rowB = [10, 20, 170, 40, 50, 160, 1.5, 0.9, 0.1, 0.2];
  const j = judgeRow(rowA, withValues({ 1: 170, 2: 160 }), [rowA, rowB], toCartesian);
  assert.equal(j.invAzimuth, 0);
  assert.deepEqual(j.failed, []);
});

test("blocks follow the end points", () => {
  assert.equal(blockOf([90, 0, 0, 10, 20, 0, 1, 1, 1, 1]), "umbilical");
  assert.equal(blockOf([0, 30, 0, 10, 20, 0, 1, 1, 1, 1]), "ellipse");
  assert.equal(blockOf([89.5, 0.5, 0, 10, 20, 0, 1, 1, 1, 1]), "near-umbilic");
  assert.equal(blockOf([10, 20, 0, 30, 40, 0, 1, 1, 1, 1]), "general");
});
