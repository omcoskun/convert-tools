// The distance tool's reducer: picking A then B on the map, re-picking one
// point, dragging, typing, swapping and clearing.

import assert from "node:assert/strict";
import test from "node:test";
import { createMeasurementState, measurementReducer } from "../src/tools/coordinates/measurement-state.js";

const run = (state, ...actions) => actions.reduce(measurementReducer, state);
const empty = () => createMeasurementState();
const A = { latitude: "39.93337", longitude: "32.85974" };
const B = { latitude: "41.00824", longitude: "28.97836" };

test("pick on the map places A, then continues with B, then stops", () => {
  let state = run(empty(), { type: "startPicking" });
  assert.equal(state.activeTarget, "start");
  state = run(state, { type: "pick", coordinate: A });
  assert.equal(state.activeTarget, "end", "B is armed after A");
  assert.equal(state.values.startLatitude, A.latitude);
  state = run(state, { type: "pick", coordinate: B });
  assert.equal(state.activeTarget, null);
  assert.deepEqual(state.values, {
    startLatitude: A.latitude,
    startLongitude: A.longitude,
    endLatitude: B.latitude,
    endLongitude: B.longitude,
  });
});

test("arming one point re-picks only that point; pressing it again disarms", () => {
  const filled = run(empty(), { type: "startPicking" }, { type: "pick", coordinate: A }, { type: "pick", coordinate: B });
  let state = run(filled, { type: "arm", target: "end" });
  assert.equal(state.activeTarget, "end");
  state = run(state, { type: "pick", coordinate: A });
  assert.equal(state.activeTarget, null, "re-picking B does not continue");
  assert.equal(state.values.endLatitude, A.latitude);
  assert.equal(state.values.startLatitude, A.latitude);
  assert.equal(run(filled, { type: "arm", target: "start" }, { type: "arm", target: "start" }).activeTarget, null);
});

test("cancel (Escape) and typing leave picking without changing other points", () => {
  const picking = run(empty(), { type: "startPicking" });
  assert.equal(run(picking, { type: "cancel" }).activeTarget, null);
  const typed = run(picking, { type: "edit", key: "endLongitude", value: "28.9" });
  assert.equal(typed.activeTarget, null);
  assert.equal(typed.values.endLongitude, "28.9");
  const idle = empty();
  assert.equal(run(idle, { type: "cancel" }), idle, "cancel without picking keeps the same state");
});

test("dragging a marker moves only that point; invalid coordinates are ignored", () => {
  const filled = run(empty(), { type: "startPicking" }, { type: "pick", coordinate: A }, { type: "pick", coordinate: B });
  const moved = run(filled, { type: "move", target: "start", coordinate: { latitude: "10.5", longitude: "-20.25" } });
  assert.equal(moved.values.startLatitude, "10.5");
  assert.equal(moved.values.endLatitude, B.latitude);
  assert.equal(run(filled, { type: "move", target: "start", coordinate: { latitude: "95", longitude: "0" } }), filled);
  const picking = run(empty(), { type: "startPicking" });
  assert.equal(run(picking, { type: "pick", coordinate: { latitude: "x", longitude: "0" } }), picking);
});

test("swap, clear and examples; only examples and fit requests move the map", () => {
  const filled = run(empty(), { type: "startPicking" }, { type: "pick", coordinate: A }, { type: "pick", coordinate: B });
  const swapped = run(filled, { type: "swap" });
  assert.equal(swapped.values.startLatitude, B.latitude);
  assert.equal(swapped.values.endLongitude, A.longitude);
  assert.equal(swapped.fitRequest, filled.fitRequest);
  const cleared = run(filled, { type: "clear" });
  assert.deepEqual(Object.values(cleared.values), ["", "", "", ""]);
  const example = run(cleared, { type: "example", values: { startLatitude: "1", startLongitude: "2", endLatitude: "3", endLongitude: "4" } });
  assert.equal(example.fitRequest, cleared.fitRequest + 1);
  assert.equal(run(example, { type: "fit" }).fitRequest, example.fitRequest + 1);
});
