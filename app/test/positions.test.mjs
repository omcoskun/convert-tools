// The position tool's helpers. Expected coordinates come from GeographicLib
// (GeoConvert 2.7, or the contract vectors it generated) or from the
// definition of the format, never from this code's own output.

import assert from "node:assert/strict";
import test from "node:test";
import * as core from "@convert-tools/core";
import {
  compactNumber,
  formatOutputs,
  handoffPoint,
  positionSnippet,
  readPoint,
  readPointWithOptions,
  readPosition,
  valuesFrom,
  resolutionLabel,
  sourceNote,
} from "../src/tools/positions/positions.js";
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
  const results = core.coordinateResults(readPoint("dd", ANKARA), 5);
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
  const { resolution } = core.coordinateResults(readPoint("dd", ANKARA), 5);
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

test("formatOutputs applies the GEOREF precision and the DMS and DDM digits", () => {
  const ankara = readPoint("dd", ANKARA);
  const outputs = formatOutputs(ankara, { mgrsPrecision: 5, georefPrecision: 2, dmsDigits: 0, ddmDigits: 7 });
  assert.equal(outputs.georef, core.encodeGeoref(32.859742, 39.933365, 2));
  assert.equal(outputs.dms.split("  ")[0], core.formatDms(39.933365, "latitude", 0));
  assert.equal(outputs.dms.split("  ")[1], core.formatDms(32.859742, "longitude", 0));
  // The rest is coordinateResults at its own digits.
  const base = core.coordinateResults(ankara, 5);
  for (const key of ["dd", "ddm", "mgrs", "utmUps", "gars"]) assert.equal(outputs[key], base[key], key);
  // Resolution follows the digits: 1″ steps (±0.5″), 1′ GEOREF cells.
  assert.equal(resolutionLabel("dms", outputs.resolution.dms, text), "±0.5″ çıktı yuvarlaması");
  assert.equal(resolutionLabel("georef", outputs.resolution.georef, text), "1′ hücre");
  const coarse = formatOutputs(ankara, { mgrsPrecision: 2, georefPrecision: 0, dmsDigits: 5, ddmDigits: 1 });
  assert.equal(coarse.mgrs, core.coordinateResults(ankara, 2).mgrs);
  assert.equal(coarse.georef, core.encodeGeoref(32.859742, 39.933365, 0));
  assert.equal(resolutionLabel("georef", coarse.resolution.georef, text), "60′ hücre");
  assert.equal(coarse.ddm.split("  ")[0], core.formatDdm(39.933365, "latitude", 1));
  assert.equal(resolutionLabel("ddm", coarse.resolution.ddm, text), "±0.05′ çıktı yuvarlaması");
});

test("readPointWithOptions reads an MGRS square at its centre or its south-west corner", () => {
  // decodeMgrs("36SVK8820", false) and (…, true): the 1 km square's corner and centre.
  const corner = readPointWithOptions("mgrs", { mgrs: "36SVK8820" }, { mgrsCorner: true });
  assert.equal(corner.latitude, 39.93002351597026);
  assert.equal(corner.sourceCellMetres, 1000);
  assert.equal(corner.sourceCorner, true);
  const centre = readPointWithOptions("mgrs", { mgrs: "36SVK8820" }, { mgrsCorner: false });
  assert.equal(centre.latitude, 39.934535397531235);
  assert.equal(sourceNote(corner, text), `${text.cornerSource} 1000 m`);
  // Other formats ignore the option.
  assertPoint(readPointWithOptions("dd", ANKARA, { mgrsCorner: true }), 39.933365, 32.859742, "dd");
});

test("readPosition says what a half-typed, empty or invalid input means and never throws", () => {
  assert.equal(readPosition("dd", { dd: "" }).status, "empty");
  assert.equal(readPosition("dd", { dd: "39.9" }).status, "incomplete");
  assert.equal(readPosition("dd", { dd: "91, 10" }).status, "invalid");
  const valid = readPosition("dd", { dd: "39.933365, 32.859742" });
  assert.equal(valid.status, "valid");
  assertPoint(valid.source, 39.933365, 32.859742, "dd text");
  assert.equal(readPosition("mgrs", { mgrs: "  " }).status, "empty");
  assert.deepEqual(readPosition("mgrs", { mgrs: "36S VK 88015 2037" }), { status: "error", code: "INVALID_MGRS" });
  assert.equal(readPosition("utm", { zone: "36", hemisphere: "N", easting: "", northing: "" }).status, "empty");
});

test("positionSnippet writes the core calls that produced the outputs, and they run", () => {
  const options = { mgrsPrecision: 5, georefPrecision: 4, dmsDigits: 5, ddmDigits: 7, mgrsCorner: false };
  const dd = positionSnippet("dd", { dd: "39.933365, 32.859742" }, options);
  assert.equal(dd, 'const point = fromDecimalDegrees("39.933365", "32.859742");\ncoordinateResults(point, 5);');
  const corner = positionSnippet("mgrs", { mgrs: "36SVK8820" }, { ...options, mgrsCorner: true, georefPrecision: 2, dmsDigits: 0 });
  assert.match(corner, /^const point = decodeMgrs\("36SVK8820", false\);/);
  assert.ok(corner.includes("encodeGeoref(point.longitude, point.latitude, 2);"), corner);
  assert.ok(corner.includes('formatDms(point.latitude, "latitude", 0);'), corner);
  for (const snippet of [dd, corner]) {
    assert.doesNotThrow(() => new Function(...Object.keys(core), snippet)(...Object.values(core)), snippet);
  }
});

test("handoffPoint passes typed DD text through and full degrees otherwise", () => {
  assert.deepEqual(handoffPoint("dd", { dd: "39.933365, 32.859742" }, readPoint("dd", ANKARA)), {
    latitude: "39.933365",
    longitude: "32.859742",
  });
  const mgrs = readPoint("mgrs", { mgrs: "36S VK 88015 20370" });
  assert.deepEqual(handoffPoint("mgrs", {}, mgrs), { latitude: String(mgrs.latitude), longitude: String(mgrs.longitude) });
});

test("valuesFrom fills the fields of the format switched to from the current position", () => {
  const ankara = readPoint("dd", ANKARA);
  const outputs = formatOutputs(ankara);
  const point = { latitude: "39.933365", longitude: "32.859742" };
  for (const format of ["dd", "dms", "ddm", "mgrs", "utm", "gars", "georef"]) {
    const read = readPosition(format, valuesFrom(format, outputs, {}, point));
    assert.equal(read.status, "valid", format);
    // Within the format's own cell: GARS is 5′, the others are much finer.
    const tolerance = format === "gars" ? 0.05 : 1e-4;
    assert.ok(Math.abs(read.source.latitude - 39.933365) < tolerance, `${format} ${read.source.latitude}`);
  }
  const ups = valuesFrom("utm", formatOutputs({ latitude: 85, longitude: 0 }), {}, point);
  assert.deepEqual([ups.zone, ups.hemisphere, ups.easting], ["0", "N", "2000000.000"]);
});
