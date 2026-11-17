// The measure tool's reducer: map picks, re-picks, drags, typing, the three
// modes and what each mode switch carries over, route rows and pastes.

import assert from "node:assert/strict";
import test from "node:test";
import { readPointText } from "../src/lib/point-text.js";
import { createMeasureState, measureReducer, modePoints, pickTarget } from "../src/tools/measure/measure-state.js";
import { runDirect, runInverse } from "../src/tools/measure/measure.js";
import { readJson } from "./support/files.mjs";

const config = readJson("public/config.json").measure;
const run = (state, ...actions) => actions.reduce(measureReducer, state);
const empty = () => createMeasureState({ routeMaxPoints: config.route.maxPoints });
const pick = (latitude, longitude) => ({ type: "pick", coordinate: { latitude, longitude } });
const point = (text) => {
  const reading = readPointText(text);
  return { latitude: reading.latitude, longitude: reading.longitude };
};
const example = (id) => config.examples.find((entry) => entry.id === id);

test("a map pick fills A when it is empty, then B; with both set a pick changes nothing", () => {
  let state = empty();
  assert.equal(state.mode, "inverse");
  assert.deepEqual(pickTarget(state), { index: 0, append: false });
  state = run(state, pick("39.93337", "32.85974"));
  assert.equal(state.a, "39.93337, 32.85974");
  assert.deepEqual(pickTarget(state), { index: 1, append: false });
  state = run(state, pick("41.00824", "28.97836"));
  assert.equal(state.b, "41.00824, 28.97836");
  assert.equal(pickTarget(state), null);
  assert.equal(run(state, pick("10", "10")), state, "no empty point: the click does nothing");
});

test("a point's pick button re-places it; pressing it again disarms; Esc pauses picking", () => {
  const filled = run(empty(), pick("1", "2"), pick("3", "4"));
  let state = run(filled, { type: "arm", index: 0 });
  assert.deepEqual(pickTarget(state), { index: 0, append: false });
  state = run(state, pick("5", "6"));
  assert.equal(state.a, "5, 6");
  assert.equal(pickTarget(state), null, "re-placing one point does not continue");
  assert.equal(run(filled, { type: "arm", index: 1 }, { type: "arm", index: 1 }).armed, null);
  // Esc stops picking until the user asks for it again.
  const cancelled = run(empty(), { type: "cancel" });
  assert.equal(pickTarget(cancelled), null);
  assert.equal(run(cancelled, pick("1", "2")), cancelled);
  assert.deepEqual(pickTarget(run(cancelled, { type: "startPicking" })), { index: 0, append: false });
  assert.equal(run(filled, { type: "cancel" }), filled, "nothing to cancel");
});

test("typing, dragging and invalid coordinates", () => {
  const filled = run(empty(), pick("1", "2"), pick("3", "4"));
  const typed = run(filled, { type: "arm", index: 1 }, { type: "edit", index: 1, text: "41.0" });
  assert.equal(typed.b, "41.0");
  assert.equal(typed.armed, null, "typing ends picking of that point");
  const moved = run(filled, { type: "move", index: 0, coordinate: { latitude: "10.5", longitude: "-20.25" } });
  assert.equal(moved.a, "10.5, -20.25");
  assert.equal(moved.b, "3, 4");
  for (const coordinate of [{ latitude: "95", longitude: "0" }, { latitude: "x", longitude: "0" }, { latitude: 1, longitude: 2 }, null]) {
    assert.equal(run(filled, { type: "move", index: 0, coordinate }), filled, JSON.stringify(coordinate));
  }
  assert.equal(run(empty(), { type: "pick", coordinate: { latitude: "x", longitude: "0" } }).a, "");
  assert.equal(run(filled, { type: "edit", index: 5, text: "1, 2" }), filled, "no such point");
});

test("switching to direct after an inverse result fills azimuth and distance; back to inverse B is the computed point", () => {
  const start = createMeasureState({ example: example("ankara-istanbul") });
  const [a, b] = modePoints(start).map(point);
  const inverse = runInverse([a, b], {}, config.path).value;
  const direct = run(start, { type: "mode", mode: "direct", result: inverse });
  assert.equal(direct.mode, "direct");
  assert.equal(direct.a, start.a, "A is shared");
  assert.notEqual(direct.azimuth, "");
  assert.notEqual(direct.distance, "");
  assert.equal(direct.distanceUnit, start.unit);
  assert.ok(Math.abs(Number(direct.azimuth) - inverse.inverse.initialBearingDegrees) < 1e-9, direct.azimuth);
  assert.ok(Math.abs(Number(direct.distance) * 1000 - inverse.inverse.distanceMetres) < 1e-6, direct.distance);
  assert.equal(direct.fitRequest, start.fitRequest + 1, "a new mode shows its scene");

  const computed = runDirect({ start: a, azimuth: direct.azimuth, distance: direct.distance, unit: direct.distanceUnit }, {}, config.path).value;
  const back = run(direct, { type: "mode", mode: "inverse", result: computed });
  assert.equal(back.mode, "inverse");
  const end = point(back.b);
  assert.ok(Math.abs(Number(end.latitude) - Number(b.latitude)) < 1e-8, back.b);
  assert.ok(Math.abs(Number(end.longitude) - Number(b.longitude)) < 1e-8, back.b);
  // Direct to a route: A first, the computed point last.
  const turned = { ...direct, azimuth: "90", distance: "100" };
  const east = runDirect({ start: a, azimuth: "90", distance: "100", unit: direct.distanceUnit }, {}, config.path).value;
  const route = modePoints(run(turned, { type: "mode", mode: "route", result: east }));
  assert.equal(route[0], start.a);
  const last = point(route[route.length - 1]);
  assert.ok(Math.abs(Number(last.latitude) - east.direct.latitude) < 1e-8, route.join(" | "));
  assert.ok(Math.abs(Number(last.longitude) - east.direct.longitude) < 1e-8, route.join(" | "));
  // Without a result nothing is carried over.
  const blank = run(empty(), { type: "mode", mode: "direct", result: null });
  assert.equal(blank.azimuth, "");
  assert.equal(run(blank, { type: "mode", mode: "inverse", result: null }).b, "");
  assert.equal(run(start, { type: "mode", mode: "inverse" }), start, "same mode");
  assert.equal(run(start, { type: "mode", mode: "nope" }), start);
});

test("two points and the route share their points: A is the first, B the last", () => {
  const start = createMeasureState({ example: example("ankara-istanbul") });
  const route = run(start, { type: "mode", mode: "route" });
  assert.deepEqual(modePoints(route), [start.a, start.b]);
  const longer = run(route, { type: "add" }, { type: "edit", index: 2, text: "38.4237, 27.1428" });
  assert.deepEqual(modePoints(longer), [start.a, start.b, "38.4237, 27.1428"]);
  const inverse = run(longer, { type: "mode", mode: "inverse" });
  assert.deepEqual(modePoints(inverse), [start.a, "38.4237, 27.1428"]);
  assert.deepEqual(modePoints(run(inverse, { type: "mode", mode: "route" })), modePoints(longer), "nothing is lost");
});

test("route rows: add, remove, reverse and clear", () => {
  let state = createMeasureState({ example: example("ankara-istanbul-izmir"), routeMaxPoints: 50 });
  assert.equal(state.mode, "route");
  const rows = modePoints(state);
  assert.equal(rows.length, 3);
  assert.deepEqual(modePoints(run(state, { type: "reverse" })), [...rows].reverse());
  state = run(state, { type: "remove", index: 1 });
  assert.deepEqual(modePoints(state), [rows[0], rows[2]]);
  assert.equal(run(state, { type: "remove", index: 0 }), state, "a route keeps at least two rows");
  state = run(state, { type: "add" });
  assert.deepEqual(modePoints(state), [rows[0], rows[2], ""]);
  const cleared = run(state, { type: "clear" });
  assert.deepEqual(modePoints(cleared), ["", ""]);
  // Inverse "swap" is the same reversal.
  const inverse = createMeasureState({ example: example("ankara-istanbul") });
  const swapped = run(inverse, { type: "reverse" });
  assert.equal(swapped.a, inverse.b);
  assert.equal(swapped.b, inverse.a);
  assert.equal(swapped.fitRequest, inverse.fitRequest, "a swap does not move the map");
  // Direct: clear empties A, the azimuth and the distance.
  const direct = run(createMeasureState({ example: example("ankara-east-30000-km") }), { type: "clear" });
  assert.deepEqual([direct.a, direct.azimuth, direct.distance], ["", "", ""]);
});

test("route picking appends while 'add from map' is on, up to the cap", () => {
  let state = run(createMeasureState({ routeMaxPoints: 3 }), { type: "mode", mode: "route" });
  state = run(state, pick("1", "1"), pick("2", "2"));
  assert.equal(pickTarget(state), null, "full rows and adding off: a click does nothing");
  state = run(state, { type: "adding" });
  assert.equal(state.adding, true);
  assert.deepEqual(pickTarget(state), { index: 2, append: true });
  state = run(state, pick("3", "3"));
  assert.deepEqual(modePoints(state), ["1, 1", "2, 2", "3, 3"]);
  assert.equal(pickTarget(state), null, "the cap stops appending");
  assert.equal(run(state, pick("4", "4")), state);
  assert.equal(run(state, { type: "add" }), state);
  // Esc while appending turns adding off.
  const appending = run(state, { type: "remove", index: 2 });
  assert.equal(run(appending, { type: "cancel" }).adding, false);
});

test("a route paste of 60 pairs keeps 50 and records that it was truncated", () => {
  const points = Array.from({ length: 60 }, (_, index) => ({ latitude: String(index), longitude: String(index + 1) }));
  const route = run(empty(), { type: "mode", mode: "route" });
  const state = run(route, { type: "paste", index: 0, points, swapped: false });
  const rows = modePoints(state);
  assert.equal(rows.length, 50);
  assert.equal(rows[0], "0, 1");
  assert.equal(rows[49], "49, 50");
  assert.deepEqual(state.lastPaste, { index: 0, count: 50, swapped: false, truncated: true, dropped: 10 });
  // Pasted into a row of a longer route, the points go in after it and empty rows are used first.
  const filled = run(route, { type: "edit", index: 0, text: "1, 1" }, { type: "edit", index: 1, text: "9, 9" });
  const into = run(filled, { type: "paste", index: 0, points: points.slice(0, 2), swapped: true });
  assert.deepEqual(modePoints(into), ["0, 1", "1, 2", "9, 9"]);
  assert.deepEqual(into.lastPaste, { index: 0, count: 2, swapped: true, truncated: false, dropped: 0 });
  // The notice goes with the next change of the points.
  assert.equal(run(into, { type: "fit" }).lastPaste, into.lastPaste);
  assert.equal(run(into, { type: "edit", index: 0, text: "2, 2" }).lastPaste, null);
});

test("two pasted pairs fill A and B in two-point mode; invalid pastes change nothing", () => {
  const A = { latitude: "39.93337", longitude: "32.85974" };
  const B = { latitude: "41.00824", longitude: "28.97836" };
  const state = run(empty(), { type: "paste", index: 1, points: [A, B], swapped: false });
  assert.equal(state.a, "39.93337, 32.85974");
  assert.equal(state.b, "41.00824, 28.97836");
  assert.equal(state.fitRequest, empty().fitRequest, "a paste does not move the map");
  const one = run(empty(), { type: "paste", index: 1, points: [B], swapped: true });
  assert.deepEqual([one.a, one.b], ["", "41.00824, 28.97836"]);
  assert.equal(one.lastPaste.swapped, true);
  const base = empty();
  for (const action of [
    { type: "paste", index: 0, points: [] },
    { type: "paste", index: 0, points: [{ latitude: "95", longitude: "0" }] },
    { type: "paste", index: 0, points: [{ latitude: 1, longitude: 2 }] },
    { type: "paste", index: 7, points: [A] },
  ]) {
    assert.equal(run(base, action), base, JSON.stringify(action));
  }
});

test("examples, fit requests, models and a handed-over point", () => {
  const state = createMeasureState({ example: example("ankara-istanbul") });
  const direct = run(state, { type: "example", example: example("ankara-east-30000-km") });
  assert.equal(direct.mode, "direct");
  assert.deepEqual([direct.azimuth, direct.distance, direct.distanceUnit], ["90", "30000", "kilometre"]);
  assert.equal(direct.fitRequest, state.fitRequest + 1);
  assert.equal(run(state, { type: "fit" }).fitRequest, state.fitRequest + 1);
  assert.equal(run(state, { type: "model", model: "sphere" }).model, "sphere");
  assert.equal(run(state, { type: "custom", field: "inverseFlattening", value: "0" }).custom.inverseFlattening, "0");
  assert.equal(run(state, { type: "unit", unit: "metre" }).unit, "metre");
  // "Ölçümde B yap" from another tool: B is an input in two-point mode.
  const received = run(direct, { type: "receive", slot: "end", coordinate: { latitude: "38.4237", longitude: "27.1428" } });
  assert.equal(received.mode, "inverse");
  assert.equal(received.b, "38.4237, 27.1428");
  assert.equal(received.fitRequest, direct.fitRequest + 1);
  assert.equal(run(state, { type: "receive", coordinate: { latitude: "1", longitude: "2" } }).a, "1, 2", "the start by default");
});

test("reordering a route retains all coordinates and updates shared endpoints", () => {
  const state = run(empty(), { type: "mode", mode: "route" }, pick("1", "2"), pick("3", "4"), { type: "adding", on: true }, pick("5", "6"), { type: "arm", index: 1 });
  const moved = run(state, { type: "reorder", from: 2, to: 0 });
  assert.deepEqual(modePoints(moved), ["5, 6", "1, 2", "3, 4"]);
  assert.equal(moved.armed, null);
  assert.deepEqual(modePoints(run(moved, { type: "mode", mode: "inverse" })), ["5, 6", "3, 4"]);
  assert.deepEqual(modePoints(run(moved, { type: "reorder", from: 0, to: 2 })), ["1, 2", "3, 4", "5, 6"]);
  for (const action of [{ from: -1, to: 0 }, { from: 0, to: 3 }, { from: 0.5, to: 1 }, { from: 1, to: 1 }]) {
    assert.equal(run(state, { type: "reorder", ...action }), state);
  }
  const inverse = empty();
  assert.equal(run(inverse, { type: "reorder", from: 0, to: 1 }), inverse);
});

test("finishing map insertion pauses selection even when a route row is empty", () => {
  const state = run(empty(), { type: "mode", mode: "route" }, { type: "adding", on: true }, pick("1", "2"));
  const finished = run(state, { type: "adding", on: false });
  assert.equal(pickTarget(finished), null);
  assert.deepEqual(modePoints(finished), ["1, 2", ""]);
  assert.equal(run(finished, pick("3", "4")), finished);
  assert.deepEqual(pickTarget(run(finished, { type: "adding", on: true })), { index: 1, append: false });
});
