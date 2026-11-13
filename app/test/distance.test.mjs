// Helpers of the distance tool. Distances are checked against GeodSolve 2.7
// (contracts/test-vectors/geodesic-wgs84.csv).

import assert from "node:assert/strict";
import test from "node:test";
import {
  displayDistance,
  endpointFromText,
  endpointOf,
  endpointStatus,
  fieldIsInvalid,
  localeDecimal,
  measure,
  swapEndpoints,
} from "../src/tools/coordinates/distance.js";
import { readJson, vector } from "./support/files.mjs";

const { path: pathOptions } = readJson("public/config.json").distance;

test("measure reports the core's distance in metres, kilometres and nautical miles", () => {
  const row = vector("geodesic-wgs84.csv", "ankara-istanbul");
  const result = measure(
    { startLatitude: row.startLatitude, startLongitude: row.startLongitude, endLatitude: row.endLatitude, endLongitude: row.endLongitude },
    pathOptions,
  );
  assert.ok(Math.abs(result.path.distanceMetres - Number(row.distanceMetres)) <= Number(row.toleranceMetres));
  assert.equal(result.metres, Number(row.distanceMetres).toFixed(3));
});

test("endpointFromText draws only coordinates in range", () => {
  assert.deepEqual(endpointFromText("39.9", "-32.5"), { latitude: 39.9, longitude: -32.5 });
  assert.deepEqual(endpointFromText(" 90 ", "180"), { latitude: 90, longitude: 180 });
  for (const [latitude, longitude] of [["", "1"], ["1", " "], ["abc", "1"], ["90.1", "0"], ["0", "-180.5"], ["Infinity", "0"]]) {
    assert.equal(endpointFromText(latitude, longitude), null, `${latitude}, ${longitude}`);
  }
});

test("swapEndpoints exchanges A and B", () => {
  assert.deepEqual(
    swapEndpoints({ startLatitude: "1", startLongitude: "2", endLatitude: "3", endLongitude: "4" }),
    { startLatitude: "3", startLongitude: "4", endLatitude: "1", endLongitude: "2" },
  );
});

test("fieldIsInvalid flags text that can never be a coordinate, not empty fields", () => {
  assert.equal(fieldIsInvalid("", "latitude"), false);
  assert.equal(fieldIsInvalid("  ", "longitude"), false);
  assert.equal(fieldIsInvalid("-90", "latitude"), false);
  assert.equal(fieldIsInvalid("180", "longitude"), false);
  assert.equal(fieldIsInvalid("90.0001", "latitude"), true);
  assert.equal(fieldIsInvalid("120", "latitude"), true);
  assert.equal(fieldIsInvalid("120", "longitude"), false);
  assert.equal(fieldIsInvalid("abc", "longitude"), true);
});

test("endpointStatus tells empty, incomplete, invalid and valid points apart", () => {
  const values = (startLatitude, startLongitude) => ({ startLatitude, startLongitude, endLatitude: "", endLongitude: "" });
  assert.equal(endpointStatus(values("", ""), "start"), "empty");
  assert.equal(endpointStatus(values("39.9", ""), "start"), "incomplete");
  assert.equal(endpointStatus(values("", "x"), "start"), "invalid");
  assert.equal(endpointStatus(values("39.9", "32.8"), "start"), "valid");
  assert.deepEqual(endpointOf(values("39.9", "32.8"), "start"), { latitude: 39.9, longitude: 32.8 });
  assert.equal(endpointOf(values("39.9", "32.8"), "end"), null);
});

test("localeDecimal groups digits per language and pads decimals without floats", () => {
  assert.equal(localeDecimal("1234567.5", 2, "tr"), "1.234.567,50");
  assert.equal(localeDecimal("1234567.5", 2, "en"), "1,234,567.50");
  assert.equal(localeDecimal("999", 0, "tr"), "999");
  assert.equal(localeDecimal("-0.125", 3, "en"), "−0.125");
});

test("displayDistance converts with the core: 1852 m is exactly 1 NM", () => {
  assert.equal(displayDistance(1852, "nautical-mile", 3, "en"), "1.000");
  assert.equal(displayDistance(350123.4567, "kilometre", 2, "tr"), "350,12");
  assert.equal(displayDistance(350123.4567, "metre", 1, "en"), "350,123.5");
});
