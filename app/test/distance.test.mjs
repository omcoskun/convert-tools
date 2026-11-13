// Helpers of the distance tool. Distances are checked against GeodSolve 2.7
// (contracts/test-vectors/geodesic-wgs84.csv).

import assert from "node:assert/strict";
import test from "node:test";
import { endpointFromText, measure, swapEndpoints } from "../src/tools/coordinates/distance.js";
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
