// The measure tool's calculations (tools/measure/measure.js). Every value is
// compared with a direct call of @convert-tools/core or with GeodSolve 2.7
// (contracts/test-vectors/geodesic-wgs84.csv), never with the demo itself.

import assert from "node:assert/strict";
import test from "node:test";
import { directGeodesic, inverseGeodesic, measureGeodesicPolyline, sampleGeodesicPath } from "@convert-tools/core";
import { localeDecimal, signedDecimal } from "../src/lib/locale-decimal.js";
import { unwrapPath } from "../src/map/map-adapter.js";
import {
  LENGTH_UNITS,
  MAX_TAGGED_SEGMENTS,
  callSnippet,
  angleCopy,
  areaDisplay,
  checkModel,
  cutAzimuthBound,
  displayBound,
  directLinePoints,
  displayAngle,
  displayDistance,
  lengthsOf,
  lengthText,
  measureScene,
  modelOptions,
  routeTone,
  runDirect,
  runInverse,
  runRoute,
  sphericalComparison,
  squareKilometres,
} from "../src/tools/measure/measure.js";
import { degreesText, fixedPair, plainNumber } from "../src/lib/number-text.js";
import { readJson, vector } from "./support/files.mjs";

const { path: pathOptions, models, comparisonSphereRadiusMetres } = readJson("public/config.json").measure;
const model = (id) => models.find((entry) => entry.id === id);

const A = { latitude: "39.933365", longitude: "32.859742" };
const B = { latitude: "41.008238", longitude: "28.978359" };
const IZMIR = { latitude: "38.4237", longitude: "27.1428" };

test("runInverse is inverseGeodesic, drawn with sampleGeodesicPath", () => {
  const result = runInverse([A, B], modelOptions(model("wgs84")), pathOptions);
  assert.equal(result.ok, true);
  const { inverse, lengths, lines } = result.value;
  assert.equal(inverse.distanceMetres, inverseGeodesic(A, B).distanceMetres);
  assert.equal(inverse.initialBearingDegrees, inverseGeodesic(A, B).initialBearingDegrees);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].points.length >= 2);
  assert.deepEqual(lines[0].points, sampleGeodesicPath(A, B, pathOptions).points);
  // GeodSolve 2.7 agrees to the vector's tolerance; the lengths come from convertLength.
  const row = vector("geodesic-wgs84.csv", "ankara-istanbul");
  assert.ok(Math.abs(inverse.distanceMetres - Number(row.distanceMetres)) <= Number(row.toleranceMetres));
  assert.equal(lengths.metre, Number(row.distanceMetres).toFixed(3));
  assert.equal(lengths.kilometre, "350.091704425");
  assert.equal(lengths["nautical-mile"], "189.034397638");
});

test("runDirect with the inverse azimuth and distance ends on B", () => {
  const inverse = inverseGeodesic(A, B);
  const result = runDirect(
    { start: A, azimuth: String(inverse.initialBearingDegrees), distance: String(inverse.distanceMetres), unit: "metre" },
    {},
    pathOptions,
  );
  assert.equal(result.ok, true);
  const { direct, lines } = result.value;
  assert.ok(Math.abs(direct.latitude - Number(B.latitude)) < 1e-9, String(direct.latitude));
  assert.ok(Math.abs(direct.longitude - Number(B.longitude)) < 1e-9, String(direct.longitude));
  assert.equal(lines.length, 1);
  // The distance may be given in kilometres or nautical miles; convertLength makes it metres.
  const inKilometres = runDirect(
    { start: A, azimuth: String(inverse.initialBearingDegrees), distance: lengthText(inverse.distanceMetres, "kilometre"), unit: "kilometre" },
    {},
    pathOptions,
  ).value;
  assert.ok(Math.abs(inKilometres.direct.latitude - Number(B.latitude)) < 1e-9);
  assert.equal(runDirect({ start: A, azimuth: "0", distance: "1", unit: "nautical-mile" }, {}, pathOptions).value.distanceMetres, "1852");
});

test("runDirect reports bad numbers and a negative distance with the core's code", () => {
  for (const [request, code] of [
    [{ start: A, azimuth: "x", distance: "10", unit: "kilometre" }, "INVALID_NUMBER"],
    [{ start: A, azimuth: "90", distance: "", unit: "kilometre" }, "INVALID_NUMBER"],
    [{ start: A, azimuth: "90", distance: "-5", unit: "kilometre" }, "INVALID_ARGUMENT"],
    [{ start: { latitude: "95", longitude: "0" }, azimuth: "90", distance: "5", unit: "kilometre" }, "LATITUDE_OUT_OF_RANGE"],
  ]) {
    assert.deepEqual(runDirect(request, {}, pathOptions), { ok: false, code }, JSON.stringify(request));
  }
});

test("runRoute is measureGeodesicPolyline, one sampled line per segment", () => {
  const points = [A, B, IZMIR];
  const result = runRoute(points, {}, pathOptions);
  assert.equal(result.ok, true);
  const { polyline, lines } = result.value;
  assert.equal(polyline.distanceMetres, measureGeodesicPolyline(points).distanceMetres);
  assert.equal(polyline.segmentCount, 2);
  assert.equal(polyline.segments.length, 2);
  assert.equal(lines.length, 2);
  // Checked against the core when the plan was written: 677359.732 m.
  assert.ok(Math.abs(polyline.distanceMetres - 677359.732) < 0.001, String(polyline.distanceMetres));
  assert.deepEqual(lines[1].points, sampleGeodesicPath(B, IZMIR, pathOptions).points);
  assert.equal(new Set(lines.map((line) => line.id)).size, 2, "line ids are unique");
});

test("modelOptions: WGS 84 is the default, GRS 80 and the sphere come from config", () => {
  assert.deepEqual(modelOptions(model("wgs84")), {});
  // A bare id or an entry without parameters is a programming error, not NaN for the core.
  assert.throws(() => modelOptions("sphere"), TypeError);
  assert.throws(() => modelOptions({ id: "grs80" }), TypeError);
  assert.deepEqual(modelOptions(model("grs80")), { ellipsoid: { a: 6378137, f: 1 / 298.257222101 } });
  const sphere = modelOptions(model("sphere"));
  assert.deepEqual(sphere, { ellipsoid: { a: 6371008.8, f: 0 } });
  // Haversine on R = 6371008.8 m (IUGG mean radius): 349365.585 m.
  assert.ok(Math.abs(inverseGeodesic(A, B, sphere).distanceMetres - 349365.585) < 0.001);
  assert.ok(Math.abs(runInverse([A, B], sphere, pathOptions).value.inverse.distanceMetres - 349365.585) < 0.001);
  for (const id of ["wgs84", "grs80", "sphere"]) assert.deepEqual(checkModel(modelOptions(model(id))), { ok: true }, id);
});

test("a custom ellipsoid the core rejects fails with its code; 1/f = 0 is a sphere", () => {
  const custom = (a, inverseFlattening) => modelOptions(model("custom"), { a, inverseFlattening });
  const rejected = custom("6378137", "0.5");
  assert.deepEqual(runInverse([A, B], rejected, pathOptions), { ok: false, code: "INVALID_ARGUMENT" });
  assert.deepEqual(checkModel(rejected), { ok: false, code: "INVALID_ARGUMENT" });
  for (const [a, inverseFlattening] of [
    ["0", "298"],
    ["-6378137", "298"],
    ["", "298"],
    ["abc", "298"],
    ["0x10", "298"],
    ["6378137", ""],
    ["6378137", "1"],
    ["6378137", "-1"],
    ["6378137", "-0.5"],
    ["6378137", "x"],
  ]) {
    assert.deepEqual(checkModel(custom(a, inverseFlattening)), { ok: false, code: "INVALID_ARGUMENT" }, `${a} ${inverseFlattening}`);
  }
  // 1/f = 0 is a sphere and works; a prolate ellipsoid (1/f < -1) too.
  assert.deepEqual(custom("6371008.8", "0"), { ellipsoid: { a: 6371008.8, f: 0 } });
  assert.ok(Math.abs(runInverse([A, B], custom("6371008.8", "0"), pathOptions).value.inverse.distanceMetres - 349365.585) < 0.001);
  assert.equal(runRoute([A, B, IZMIR], custom("6378137", "-300"), pathOptions).ok, true);
  assert.equal(runDirect({ start: A, azimuth: "45", distance: "100", unit: "kilometre" }, custom("6378137", "0"), pathOptions).ok, true);
  assert.deepEqual(custom(" 6378137 ", "298,257223563"), { ellipsoid: { a: 6378137, f: 1 / 298.257223563 } });
});

test("directLinePoints follows a 30 000 km line the way it is travelled", () => {
  const points = directLinePoints(A, 90, 30000000, {}, pathOptions);
  assert.ok(points.length > 2 && points.length <= pathOptions.maxPoints, String(points.length));
  const longitudes = unwrapPath(points).map(([longitude]) => longitude);
  for (let index = 1; index < longitudes.length; index += 1) {
    assert.ok(longitudes[index] > longitudes[index - 1], `eastward at ${index}`);
  }
  // Longer than half the globe: not the shortest way back to the end point.
  assert.ok(longitudes[longitudes.length - 1] - longitudes[0] > 180);
  const end = directGeodesic(A, 90, 30000000);
  assert.deepEqual(points[points.length - 1], { latitude: end.latitude, longitude: end.longitude });
  assert.deepEqual(points[0], { latitude: 39.933365, longitude: 32.859742 });
  // runDirect draws exactly this line.
  const run = runDirect({ start: A, azimuth: "90", distance: "30000", unit: "kilometre" }, {}, pathOptions);
  assert.deepEqual(run.value.lines[0].points, points);
  assert.deepEqual(directLinePoints(A, 90, 0, {}, pathOptions), [{ latitude: 39.933365, longitude: 32.859742 }]);
});

test("callSnippet writes the exact core call, and the call gives the same result", () => {
  const inverse = callSnippet("inverse", { points: [A, B] }, {});
  assert.ok(inverse.startsWith("inverseGeodesic("), inverse);
  assert.equal(
    inverse,
    "inverseGeodesic({ latitude: 39.933365, longitude: 32.859742 }, { latitude: 41.008238, longitude: 28.978359 })",
  );
  const sphere = modelOptions(model("sphere"));
  const onSphere = callSnippet("inverse", { points: [A, B] }, sphere);
  assert.ok(onSphere.endsWith(", { ellipsoid: { a: 6371008.8, f: 0 } })"), onSphere);
  const run = (code, name, fn) => new Function(name, `return ${code};`)(fn);
  assert.equal(run(onSphere, "inverseGeodesic", inverseGeodesic).distanceMetres, inverseGeodesic(A, B, sphere).distanceMetres);

  const direct = callSnippet("direct", { points: [A], azimuth: "90", distanceMetres: "30000000" }, {});
  assert.equal(direct, "directGeodesic({ latitude: 39.933365, longitude: 32.859742 }, 90, 30000000)");
  const grs80 = modelOptions(model("grs80"));
  const directGrs80 = callSnippet("direct", { points: [A], azimuth: "45.5", distanceMetres: "1000" }, grs80);
  assert.deepEqual(run(directGrs80, "directGeodesic", directGeodesic), directGeodesic(A, "45.5", "1000", grs80));

  const route = callSnippet("route", { points: [A, B, IZMIR] }, {});
  assert.ok(route.startsWith("measureGeodesicPolyline(["), route);
  assert.equal(run(route, "measureGeodesicPolyline", measureGeodesicPolyline).distanceMetres, measureGeodesicPolyline([A, B, IZMIR]).distanceMetres);
  // Leading zeros and text that is not a plain decimal stay valid JavaScript.
  assert.equal(
    callSnippet("inverse", { points: [{ latitude: "05.5", longitude: "-032.25" }, B] }, {}).slice(0, 52),
    "inverseGeodesic({ latitude: 5.5, longitude: -32.25 }",
  );
});

test("lengths, areas and carried values come from the core's exact conversions", () => {
  assert.deepEqual(lengthsOf(1852), { metre: "1852", kilometre: "1.852", "nautical-mile": "1" });
  assert.equal(lengthText(350091.7044249319, "kilometre"), "350.091704425");
  assert.equal(lengthText(350091.7044249319, "metre"), "350091.704425");
  assert.equal(squareKilometres(-1780547722803.9531, 3), "-1780547.723");
  assert.equal(squareKilometres(2500000, 3), "2.5");
  assert.equal(degreesText(291.1840610099589), "291.18406101");
  assert.equal(degreesText(90), "90");
  assert.equal(degreesText(-1e-12), "0");
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

test("signedDecimal always shows the sign and a real minus", () => {
  assert.equal(signedDecimal(-726.119, 1, "en"), "−726.1");
  assert.equal(signedDecimal(0.2071, 3, "tr"), "+0,207");
  assert.equal(signedDecimal(-0.00001, 3, "en"), "0.000");
});

test("sphericalComparison measures the same points on a sphere through the core", () => {
  const row = vector("geodesic-wgs84.csv", "ankara-istanbul");
  const ellipsoidal = Number(row.distanceMetres);
  const result = sphericalComparison([A, B], comparisonSphereRadiusMetres, ellipsoidal);
  // Haversine on R = 6371008.8 m (IUGG mean radius): 349365.585 m.
  assert.ok(Math.abs(result.metres - 349365.585) < 0.01, String(result.metres));
  assert.equal(result.radiusMetres, comparisonSphereRadiusMetres);
  assert.ok(Math.abs(result.differenceMetres - (result.metres - ellipsoidal)) < 1e-9);
  assert.ok(result.differencePercent < -0.2 && result.differencePercent > -0.21, String(result.differencePercent));
  // A route is compared segment by segment.
  const route = sphericalComparison([A, B, IZMIR], 6371008.8, measureGeodesicPolyline([A, B, IZMIR]).distanceMetres);
  const onSphere = measureGeodesicPolyline([A, B, IZMIR], { ellipsoid: { a: 6371008.8, f: 0 } }).distanceMetres;
  assert.equal(route.metres, onSphere);
});

test("sphericalComparison yields no comparison instead of an error", () => {
  const points = [
    { latitude: "39.9", longitude: "32.8" },
    { latitude: "41", longitude: "29" },
  ];
  assert.equal(sphericalComparison(points, 0, 350000), null);
  assert.equal(sphericalComparison(points, "abc", 350000), null);
  assert.equal(sphericalComparison(points, undefined, 350000), null);
  assert.equal(sphericalComparison(points, 6371008.8, 0), null, "no percentage of zero");
  assert.equal(sphericalComparison([points[0], { latitude: "x", longitude: "1" }], 6371008.8, 350000), null);
});

// GeodTest row 474500 (near-vertex block): m12 = 8.3e-4 m, so the azimuths
// may be off by 1e-7 m / m12 = 0.0069° and S12 by about 9800 km^2.
const NEAR_VERTEX = [
  { latitude: "56.796245515064", longitude: "0" },
  { latitude: "-56.796245515064519948", longitude: "179.668926360912281556" },
];

test("an azimuth shows only the decimals its uncertainty leaves, marked ≈ when cut", () => {
  const ordinary = inverseGeodesic(A, B);
  assert.equal(displayAngle(ordinary.initialBearingDegrees, "tr", ordinary.bearingUncertaintyDegrees), "291,1841°");
  assert.equal(displayAngle(291.18406101, "tr", 0.0069), "≈\u00a0291,2°");
  assert.equal(displayAngle(291.18406101, "en", 0.0069), "≈\u00a0291.2°");
  // Coarser than a degree: still whole degrees; the notice gives the bound.
  assert.equal(displayAngle(291.18406101, "en", 7), "≈\u00a0291°");
  const nearVertex = inverseGeodesic(...NEAR_VERTEX);
  assert.ok(Math.abs(nearVertex.bearingUncertaintyDegrees - 0.0069) < 0.0001, String(nearVertex.bearingUncertaintyDegrees));
  assert.match(displayAngle(nearVertex.initialBearingDegrees, "en", nearVertex.bearingUncertaintyDegrees), /^≈\u00a0-?\d+\.\d°$/);
});

test("a copied azimuth keeps the digits its uncertainty leaves, at most 12 decimals", () => {
  // 1.6e-11°: ten decimals mean something (half a unit is 5e-11).
  assert.equal(angleCopy(291.1840610099589, 1.6e-11), "291.18406101");
  assert.equal(angleCopy(291.18406101, 0.0069), "291.2");
  assert.equal(angleCopy(291.18406101, 7), "291");
  assert.equal(angleCopy(-0.00001, 0.0069), "0");
  assert.equal(angleCopy(10.1234567890123, 1e-14), "10.123456789012");
});

test("S12 shows the km² its uncertainty leaves and m² with the uncertainty", () => {
  const ordinary = inverseGeodesic(A, B);
  const area = areaDisplay(ordinary.areaSquareMetres, ordinary.areaUncertaintySquareMetres, "tr");
  // 0.42 m^2: all three decimals of km^2, one of m^2, the bound rounded up.
  assert.equal(area.approximate, false);
  assert.equal(area.value, localeDecimal(squareKilometres(ordinary.areaSquareMetres, 3), 3, "tr"));
  assert.equal(area.copyValue, squareKilometres(ordinary.areaSquareMetres, 6));
  assert.equal(area.note, `${localeDecimal(ordinary.areaSquareMetres.toFixed(1), 1, "tr")} ± 0,5 m²`);

  // 9800 km^2: rounded to 100 000 km^2 (half of it is 50 000 >= 9800).
  const far = areaDisplay(-1780547722803.9531, 9.8e9, "en");
  assert.equal(far.approximate, true);
  assert.equal(far.value, "≈\u00a0−1,800,000");
  assert.equal(far.copyValue, "-1800000");
  assert.equal(far.note, "−1,780,500,000,000 ± 9,800,000,000 m²");
});

test("the notice names the widest azimuth uncertainty among azimuths shown cut", () => {
  const ordinary = inverseGeodesic(A, B);
  const nearVertex = inverseGeodesic(...NEAR_VERTEX);
  const coincident = inverseGeodesic(A, A);
  assert.equal(cutAzimuthBound([ordinary, coincident]), null);
  assert.equal(cutAzimuthBound([ordinary, nearVertex, coincident]), nearVertex.bearingUncertaintyDegrees);
  const route = measureGeodesicPolyline([...NEAR_VERTEX, { latitude: "0", longitude: "0" }]);
  assert.equal(cutAzimuthBound(route.segments), route.segments[0].bearingUncertaintyDegrees);
  // 0.006898°: two significant digits, rounded up.
  assert.equal(displayBound(nearVertex.bearingUncertaintyDegrees, "tr"), "0,0069");
  assert.equal(displayBound(180, "en"), "180");
});

test("S12 without an uncertainty (the direct problem) shows every decimal as before", () => {
  const area = areaDisplay(-1780547722803.9531, undefined, "tr");
  assert.equal(area.approximate, false);
  assert.equal(area.value, "−1.780.547,723");
  assert.equal(area.copyValue, "-1780547.722803953");
  assert.equal(area.note, "−1.780.547.722.804,0 m²");
});

test("computed angles and points: display rounding per language, every digit when copied", () => {
  const { initialBearingDegrees } = inverseGeodesic(A, B);
  assert.equal(displayAngle(initialBearingDegrees, "tr"), "291,1841°");
  assert.equal(displayAngle(initialBearingDegrees, "en"), "291.1841°");
  assert.equal(displayAngle(-0.00001, "en"), "0.0000°");
  // A pair keeps the decimal point in every language: the comma separates the two.
  assert.equal(fixedPair(0.1379323351044609, -57.67090419450879, 6), "0.137932, -57.670904");
  assert.equal(fixedPair(-0.0000001, 10.5, 6), "0.000000, 10.500000");
  assert.equal(plainNumber(-57.67090419450879), "-57.67090419450879");
  assert.equal(plainNumber(1.5e-7), "0.00000015");
  assert.equal(plainNumber(-0), "0");
});

test("the map scene: A and B pins, the computed B hollow and fixed, route pins in A, ink and B colour, tags on ten segments at most", () => {
  const km = LENGTH_UNITS.find((unit) => unit.id === "kilometre");
  const titles = { start: "start", end: "end", computed: "computed", route: (point) => `point ${point}` };
  const valid = (point) => ({ status: "valid", ...point });
  const base = { unit: km, distanceUnit: km, language: "tr", titles };

  const inverse = measureScene({ ...base, mode: "inverse", readings: [valid(A), valid(B)], value: runInverse([A, B], {}, pathOptions).value });
  assert.deepEqual(inverse.pins.map((pin) => [pin.label, pin.tone, pin.draggable, pin.hollow ?? false]), [["A", "a", true, false], ["B", "b", true, false]]);
  assert.equal(inverse.lines.length, 1);
  assert.equal(inverse.lines[0].tag, "350,09 km");
  // An empty or half-typed point has no pin; without a result there is no line.
  const half = measureScene({ ...base, mode: "inverse", readings: [valid(A), { status: "incomplete" }], value: null });
  assert.deepEqual([half.pins.length, half.lines.length], [1, 0]);

  const direct = runDirect({ start: A, azimuth: "90", distance: "100", unit: "kilometre" }, {}, pathOptions).value;
  const directScene = measureScene({ ...base, mode: "direct", readings: [valid(A)], value: direct });
  const end = directScene.pins.find((pin) => pin.id === "end");
  assert.deepEqual([end.label, end.tone, end.hollow, end.draggable, end.title], ["B", "b", true, false, "computed"]);
  assert.deepEqual([end.latitude, end.longitude], [direct.direct.latitude, direct.direct.longitude]);
  assert.equal(directScene.lines[0].tag, "100,00 km");

  const C = { latitude: "38.4237", longitude: "27.1428" };
  const route = measureScene({ ...base, mode: "route", readings: [valid(A), valid(B), valid(C)], value: runRoute([A, B, C], {}, pathOptions).value });
  assert.deepEqual(route.pins.map((pin) => [pin.label, pin.tone, pin.title]), [["1", "a", "point 1"], ["2", "ink", "point 2"], ["3", "b", "point 3"]]);
  assert.equal(route.lines.length, 2);
  assert.ok(route.lines.every((line) => /km$/.test(line.tag)));
  assert.deepEqual([0, 1, 2, 3].map((index) => routeTone(index, 4)), ["a", "ink", "ink", "b"]);

  // More segments than MAX_TAGGED_SEGMENTS: no tags at all.
  const many = Array.from({ length: MAX_TAGGED_SEGMENTS + 2 }, (_, index) => ({ latitude: String(10 + index), longitude: String(20 + index) }));
  const long = measureScene({ ...base, mode: "route", readings: many.map(valid), value: runRoute(many, {}, pathOptions).value });
  assert.equal(long.lines.length, MAX_TAGGED_SEGMENTS + 1);
  assert.ok(long.lines.every((line) => line.tag === undefined));
});

test("the library call keeps every typed digit: a number JavaScript would round is passed as text", () => {
  const snippet = callSnippet("inverse", { points: [{ latitude: "1.500", longitude: "123456789012345678901234" }, B] });
  assert.equal(snippet, 'inverseGeodesic({ latitude: 1.500, longitude: "123456789012345678901234" }, { latitude: 41.008238, longitude: 28.978359 })');
});
