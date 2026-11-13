// The position tool's helpers. Expected coordinates come from GeographicLib
// (GeoConvert 2.7, or the contract vectors it generated) or from the
// definition of the format, never from this code's own output.

import assert from "node:assert/strict";
import test from "node:test";
import { coordinateResults } from "@convert-tools/core";
import { compactNumber, readPoint, resolutionLabel, sourceNote } from "../src/tools/coordinates/positions.js";
import { readJson, vector } from "./support/files.mjs";

const { text } = readJson("public/lang.json").tr;
const ANKARA = { ddLat: "39.933365", ddLon: "32.859742" };

// Roughly 1 µm on the ground.
const DEGREE_TOLERANCE = 1e-11;

function assertPoint(actual, latitude, longitude, label) {
  assert.ok(Math.abs(actual.latitude - latitude) <= DEGREE_TOLERANCE, `${label} latitude ${actual.latitude}`);
  assert.ok(Math.abs(actual.longitude - longitude) <= DEGREE_TOLERANCE, `${label} longitude ${actual.longitude}`);
}

test("compactNumber prints fixed-point text without trailing zeros", () => {
  assert.equal(compactNumber(1), "1");
  assert.equal(compactNumber(100000), "100000");
  assert.equal(compactNumber(0.0005), "0.0005");
  assert.equal(compactNumber(5e-11), "0.00000000005");
  assert.equal(compactNumber(-0.25), "-0.25");
  assert.equal(compactNumber(12.3456789, 3), "12.346");
  assert.equal(compactNumber(0.0001, 3), "0");
});

test("readPoint parses DD, DMS and DDM by their definitions", () => {
  assertPoint(readPoint("dd", ANKARA), 39.933365, 32.859742, "dd");
  assertPoint(
    readPoint("dms", { dmsLat: `39°56'00.114"N`, dmsLon: `032°51'35.071"E` }),
    39 + 56 / 60 + 0.114 / 3600,
    32 + 51 / 60 + 35.071 / 3600,
    "dms",
  );
  assertPoint(
    readPoint("ddm", { ddmLat: `39°56.0019'S`, ddmLon: `032°51.5845'W` }),
    -(39 + 56.0019 / 60),
    -(32 + 51.5845 / 60),
    "ddm",
  );
});

test("readPoint decodes MGRS and UTM like GeoConvert", () => {
  // echo 36SVK8801520370 | GeoConvert -g -p 9  (centre of the 1 m cell)
  const mgrs = readPoint("mgrs", { mgrs: "36S VK 88015 20370" });
  assertPoint(mgrs, 39.93336189696109, 32.85973629744993, "mgrs");
  assert.equal(mgrs.sourceKind, "cell");
  assert.equal(mgrs.sourceCellMetres, 1);
  // echo "36N 488015.988 4420370.844" | GeoConvert -g -p 9
  const utm = readPoint("utm", { zone: "36", hemisphere: "N", easting: "488015.988", northing: "4420370.844" });
  assertPoint(utm, 39.93336500326878, 32.85974200254195, "utm");
  assert.equal(utm.sourceKind, "point");
});

test("readPoint decodes GARS and GEOREF to the cell centres of the contract vectors", () => {
  const garsRow = vector("gars.csv", "ankara-p2");
  const gars = readPoint("gars", { gars: garsRow.expected_code });
  assertPoint(gars, Number(garsRow.expected_center_latitude), Number(garsRow.expected_center_longitude), "gars");
  assert.equal(gars.sourceCellDegrees, 5 / 60);
  const georefRow = vector("georef.csv", "ankara-p4");
  const georef = readPoint("georef", { georef: georefRow.expected_code });
  assertPoint(
    georef,
    Number(georefRow.expected_center_latitude),
    Number(georefRow.expected_center_longitude),
    "georef",
  );
  assert.ok(Math.abs(georef.sourceCellDegrees - 0.01 / 60) < 1e-18);
});

test("readPoint passes core errors through and rejects an unknown format", () => {
  assert.throws(() => readPoint("mgrs", { mgrs: "36S VK 88015 2037" }), { name: "ConvertToolsError" });
  assert.throws(() => readPoint("dd", { ddLat: "abc", ddLon: "1" }), { code: "INVALID_NUMBER" });
  assert.throws(() => readPoint("w3w", {}), { message: "Unknown input format w3w." });
});

test("Ankara outputs match GeoConvert and the contract vectors", () => {
  const results = coordinateResults(readPoint("dd", ANKARA), 5);
  // echo "39.933365 32.859742" | GeoConvert -m -p 0
  assert.equal(results.mgrs.replace(/ /g, ""), "36SVK8801520370");
  assert.equal(results.mgrs, "36 S VK 88015 20370");
  // echo "39.933365 32.859742" | GeoConvert -u -p 9 -> 36n 488015.987782238 4420370.843637543
  assert.equal(results.utmUps, "36N  488015.988 E  4420370.844 N");
  // echo "39.933365 32.859742" | GeoConvert -d -p 4 -> 39d56'00.11400"N 032d51'35.07120"E
  assert.equal(results.dms, `39°56'00.11400"N  032°51'35.07120"E`);
  // 0.933365 * 60 = 56.0019 and 0.859742 * 60 = 51.58452 minutes.
  assert.equal(results.ddm, `39°56.0019000'N  032°51.5845200'E`);
  assert.equal(results.gars, vector("gars.csv", "ankara-p2").expected_code);
  assert.equal(results.georef, vector("georef.csv", "ankara-p4").expected_code);
});

test("resolutionLabel shows each output's step in its own unit", () => {
  assert.equal(resolutionLabel("mgrs", { kind: "grid-cell", cellMetres: 1 }, text), "1 m hücre");
  assert.equal(resolutionLabel("mgrs", { kind: "grid-cell", cellMetres: 100000 }, text), "100000 m hücre");
  assert.equal(resolutionLabel("gars", { kind: "angular-cell", cellDegrees: 5 / 60 }, text), "5′ hücre");
  assert.equal(resolutionLabel("georef", { kind: "angular-cell", cellDegrees: 0.01 / 60 }, text), "0.01′ hücre");
  assert.equal(
    resolutionLabel("utmUps", { kind: "grid-rounding", maximumErrorMetresPerAxis: 0.0005 }, text),
    "±0.0005 m çıktı yuvarlaması, eksen başına",
  );
  // Half of the last printed digit: 0.00001″ (DMS), 0.0000001′ (DDM), 1e-10° (DD).
  assert.equal(
    resolutionLabel("dms", { kind: "angular-rounding", maximumErrorDegrees: 0.000005 / 3600 }, text),
    "±0.000005″ çıktı yuvarlaması",
  );
  assert.equal(
    resolutionLabel("ddm", { kind: "angular-rounding", maximumErrorDegrees: 0.00000005 / 60 }, text),
    "±0.00000005′ çıktı yuvarlaması",
  );
  assert.equal(
    resolutionLabel("dd", { kind: "angular-rounding", maximumErrorDegrees: 5e-11 }, text),
    "±0.00000000005° çıktı yuvarlaması",
  );
  assert.equal(resolutionLabel("dd", undefined, text), "");
  assert.equal(resolutionLabel("dd", { kind: "something-else" }, text), "");
});

test("resolutionLabel reads the resolution metadata of coordinateResults", () => {
  const { resolution } = coordinateResults(readPoint("dd", ANKARA), 5);
  const labels = Object.fromEntries(
    Object.entries(resolution).map(([key, value]) => [key, resolutionLabel(key, value, text)]),
  );
  assert.deepEqual(labels, {
    dd: "±0.00000000005° çıktı yuvarlaması",
    dms: "±0.000005″ çıktı yuvarlaması",
    ddm: "±0.00000005′ çıktı yuvarlaması",
    mgrs: "1 m hücre",
    utmUps: "±0.0005 m çıktı yuvarlaması, eksen başına",
    gars: "5′ hücre",
    georef: "0.01′ hücre",
  });
});

test("sourceNote says whether outputs describe the point or the cell centre", () => {
  assert.equal(sourceNote({ sourceKind: "point" }, text), text.pointSource);
  assert.equal(sourceNote({ sourceKind: "cell", sourceCellMetres: 1 }, text), `${text.cellSource} 1 m`);
  assert.equal(sourceNote({ sourceKind: "area", sourceCellDegrees: 5 / 60 }, text), `${text.cellSource} 5′`);
  assert.equal(sourceNote({ sourceKind: "cell", sourceCellDegrees: 0.01 / 60 }, text), `${text.cellSource} 0.01′`);
});
