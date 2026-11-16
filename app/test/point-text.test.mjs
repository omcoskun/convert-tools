// One-field points ("enlem, boylam"), number fields and multi-line pastes:
// what typed or pasted text means, without throwing and without guessing.

import assert from "node:assert/strict";
import test from "node:test";
import { parsePointList, readNumberText, readPointText } from "../src/lib/point-text.js";

test("readPointText: empty, incomplete, invalid and valid text", () => {
  assert.deepEqual(readPointText(""), { status: "empty" });
  assert.deepEqual(readPointText("   "), { status: "empty" });
  assert.deepEqual(readPointText("39.9"), { status: "incomplete" });
  assert.deepEqual(readPointText("abc, 5"), { status: "invalid" });
  assert.deepEqual(readPointText("91, 10"), { status: "invalid" });
  // The digits are kept exactly as typed (no float round trip).
  assert.deepEqual(readPointText("41.73987943886398, 34.01769942871567"), {
    status: "valid",
    latitude: "41.73987943886398",
    longitude: "34.01769942871567",
    swapped: false,
  });
  // Hemisphere letters decide the axes; the longitude was written first.
  assert.deepEqual(readPointText("32.859742 E, 39.933365 N"), {
    status: "valid",
    latitude: "39.933365",
    longitude: "32.859742",
    swapped: true,
  });
});

test("readPointText: half-typed text is incomplete, broken text invalid, nothing throws", () => {
  for (const text of ["-", ".", "39.9,", "39.9 ", "N", "N 39.9", "120 E", "39,9", `41°44'`, `41°44'23.6"N`, "(39.9"]) {
    assert.equal(readPointText(text).status, "incomplete", text);
  }
  for (const text of [
    "200",
    "95 N",
    "39.9, 32.8, 5",
    "39.9 32.8 41.0 28.9",
    `41°74'23.6"N 34°01'03.7"E`,
    "1e5, 3",
    "39.9; abc",
    "N N",
    // Without letters a typed pair is latitude first; this one is not.
    "141.7399, 34.0177",
  ]) {
    assert.equal(readPointText(text).status, "invalid", text);
  }
  for (const text of [null, undefined, 42]) assert.doesNotThrow(() => readPointText(text));
});

test("readPointText reads DMS, decimal commas, brackets and Turkish letters", () => {
  assert.deepEqual(readPointText(`41°44'23.6"N 34°01'03.7"E`), {
    status: "valid",
    latitude: "41.7398888889",
    longitude: "34.0176944444",
    swapped: false,
  });
  assert.equal(readPointText(`34°01'03.7"E 41°44'23.6"N`).swapped, true);
  assert.deepEqual(readPointText("41,7399 34,0177"), { status: "valid", latitude: "41.7399", longitude: "34.0177", swapped: false });
  assert.deepEqual(readPointText(" (41.7399, 34.0177) "), { status: "valid", latitude: "41.7399", longitude: "34.0177", swapped: false });
  assert.deepEqual(readPointText("41.7 K, 34.0 B"), { status: "valid", latitude: "41.7", longitude: "-34.0", swapped: false });
  assert.deepEqual(readPointText("−33.8688, 151.2093"), { status: "valid", latitude: "-33.8688", longitude: "151.2093", swapped: false });
});

test("readNumberText reads one decimal number, with a point or a comma", () => {
  assert.deepEqual(readNumberText(""), { status: "empty" });
  for (const text of ["-", "+", ".", "-."]) assert.deepEqual(readNumberText(text), { status: "incomplete" }, text);
  assert.deepEqual(readNumberText(" 90 "), { status: "valid", value: "90" });
  assert.deepEqual(readNumberText("12,5"), { status: "valid", value: "12.5" });
  assert.deepEqual(readNumberText("4."), { status: "valid", value: "4" });
  assert.deepEqual(readNumberText(".5"), { status: "valid", value: "0.5" });
  assert.deepEqual(readNumberText("+7"), { status: "valid", value: "7" });
  assert.deepEqual(readNumberText("−3.25"), { status: "valid", value: "-3.25" });
  for (const text of ["abc", "1e3", "1,000.5", "1.2.3", "5 km", "--1"]) {
    assert.deepEqual(readNumberText(text), { status: "invalid" }, text);
  }
});

test("parsePointList reads one pair, two pairs or one pair per line", () => {
  assert.deepEqual(parsePointList("41.7399, 34.0177"), { points: [{ latitude: "41.7399", longitude: "34.0177" }], swapped: false });
  assert.equal(parsePointList("141.7399, 34.0177").swapped, true);
  assert.equal(parsePointList("39.933365, 32.859742\n41.008238, 28.978359").points.length, 2);
  // A latitude on one line and its longitude on the next is one pair.
  assert.equal(parsePointList("41.7399\n34.0177").points.length, 1);
  const lines = Array.from({ length: 60 }, (_, index) => `${(index / 2).toFixed(1)}, ${index}`).join("\n");
  const sixty = parsePointList(lines);
  assert.equal(sixty.points.length, 60);
  assert.deepEqual(sixty.points[59], { latitude: "29.5", longitude: "59" });
  assert.equal(parsePointList(`${lines}\nnot a point`), null, "one bad line: a normal paste");
  assert.equal(parsePointList("hello"), null);
  assert.equal(parsePointList(""), null);
});
