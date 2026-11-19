// The CRS tool's helpers (src/tools/crs/crs.js). Expected values come from
// the GeographicLib contract vectors or the EPSG definitions, not from this
// code's own output.

import assert from "node:assert/strict";
import test from "node:test";
import * as core from "@omcoskun/convert-tools";
import {
  CRS_KINDS,
  axesOf,
  codeOf,
  crsSnippet,
  fromGeographic,
  geographicOf,
  kindOf,
  pickRequest,
  resultPair,
  runTransform,
  withSource,
} from "../src/tools/crs/crs.js";
import { degreesText } from "../src/lib/number-text.js";
import { vector } from "./support/files.mjs";

const ANKARA = { latitude: 39.933365, longitude: 32.859742 };

test("codeOf and kindOf map the source and target selects to EPSG codes and back", () => {
  assert.deepEqual(
    CRS_KINDS.map((kind) => kind.id),
    ["geographic", "webMercator", "utmNorth", "utmSouth", "upsNorth", "upsSouth", "custom"],
  );
  assert.equal(codeOf("utmNorth", 36), "EPSG:32636");
  assert.equal(codeOf("utmSouth", "1"), "EPSG:32701");
  assert.equal(codeOf("geographic", 36), "EPSG:4326");
  assert.equal(codeOf("upsSouth"), "EPSG:5042");
  assert.equal(codeOf("custom", 36, " epsg:3857 "), "epsg:3857");
  assert.deepEqual(kindOf("EPSG:32736"), { kind: "utmSouth", zone: 36 });
  assert.deepEqual(kindOf("32660"), { kind: "utmNorth", zone: 60 });
  assert.deepEqual(kindOf("EPSG:3857"), { kind: "webMercator", zone: null });
  assert.deepEqual(kindOf("EPSG:5041"), { kind: "upsNorth", zone: null });
  assert.deepEqual(kindOf("EPSG:9999"), { kind: "custom", zone: null });
  assert.equal(axesOf("EPSG:4326"), "geographic");
  assert.equal(axesOf("EPSG:32636"), "projected");
  assert.equal(axesOf("EPSG:9999"), null);
});

test("geographicOf puts a Web Mercator X/Y back on Ankara", () => {
  const point = geographicOf("EPSG:3857", "3657929.74703834", "4856263.78244475");
  assert.ok(Math.abs(point.latitude - ANKARA.latitude) < 1e-7, `latitude ${point.latitude}`);
  assert.ok(Math.abs(point.longitude - ANKARA.longitude) < 1e-7, `longitude ${point.longitude}`);
  assert.equal(geographicOf("EPSG:3857", "abc", "1"), null);
});

test("runTransform is transformCrs; an unsupported code fails with UNSUPPORTED_CRS", () => {
  const row = vector("coordinate-projections.csv", "crs-mercator-ankara");
  const result = runTransform({ source: "EPSG:4326", target: "EPSG:3857", x: "32.859742", y: "39.933365" });
  assert.ok(result.ok);
  assert.ok(Math.abs(result.value.x - Number(row.expected_x)) < 1e-6);
  assert.ok(Math.abs(result.value.y - Number(row.expected_y)) < 1e-6);
  assert.equal(resultPair(result.value), "3657929.747, 4856263.782");
  assert.equal(resultPair(runTransform({ source: "EPSG:3857", target: "EPSG:4326", x: "3657929.74703834", y: "4856263.78244475" }).value), "32.85974200, 39.93336500");
  assert.deepEqual(runTransform({ source: "EPSG:9999", target: "EPSG:3857", x: "1", y: "2" }), { ok: false, code: "UNSUPPORTED_CRS" });
});

test("fromGeographic writes a map position in the source system, or fails with the core's code", () => {
  const utm = fromGeographic("EPSG:32636", { latitude: "39.933365", longitude: "32.859742" });
  // echo "39.933365 32.859742" | GeoConvert -u -p 9 -> 36n 488015.987782238 4420370.843637543
  assert.ok(utm.ok);
  assert.ok(Math.abs(Number(utm.value.x) - 488015.987782238) < 1e-6 && Math.abs(Number(utm.value.y) - 4420370.843637543) < 1e-6);
  assert.deepEqual(fromGeographic("EPSG:4326", { latitude: "39.9", longitude: "32.8" }), { ok: true, value: { x: "32.8", y: "39.9" } });
  const outside = fromGeographic("EPSG:32636", { latitude: "0", longitude: "120" });
  assert.equal(outside.ok, false);
  assert.ok(core.ERROR_CODES.includes(outside.code), outside.code);
  assert.equal(outside.code, "OUTSIDE_UTM_DOMAIN");
  assert.equal(fromGeographic("EPSG:3857", { latitude: "89", longitude: "0" }).code, "OUTSIDE_CRS_DOMAIN");
});

test("a map click outside the source system's domain keeps X and Y and reports why (Review Focus 5)", () => {
  const request = { source: "EPSG:32636", target: "EPSG:4326", x: "488015.988", y: "4420370.844" };
  const outside = pickRequest(request, { latitude: "0", longitude: "120" });
  assert.equal(outside.request, request, "the fields keep their values");
  assert.equal(outside.failure, "OUTSIDE_UTM_DOMAIN");
  const inside = pickRequest(request, { latitude: "39.933365", longitude: "32.859742" });
  assert.equal(inside.failure, null);
  assert.equal(inside.request.source, "EPSG:32636");
  assert.ok(Math.abs(Number(inside.request.x) - 488015.987782238) < 1e-6);
});

test("crsSnippet writes the exact transformCrs call, and it runs", () => {
  const request = { source: "EPSG:4326", target: "EPSG:3857", x: "32.859742", y: "39.933365" };
  const snippet = crsSnippet(request);
  assert.equal(snippet, 'transformCrs("EPSG:4326", "EPSG:3857", 32.859742, 39.933365)');
  assert.equal(crsSnippet({ ...request, x: "32,5" }), 'transformCrs("EPSG:4326", "EPSG:3857", "32,5", 39.933365)');
  const value = new Function(...Object.keys(core), `return ${snippet};`)(...Object.values(core));
  assert.deepEqual(value, core.transformCrs("EPSG:4326", "EPSG:3857", "32.859742", "39.933365"));
});

test("degreesText hands over degrees without round-trip noise", () => {
  assert.equal(degreesText(17.133999999999972), "17.134");
  assert.equal(degreesText(-0.0000000001), "0");
  assert.equal(degreesText(32.85974200000001), "32.859742");
  assert.equal(degreesText(-180), "-180");
});

test("a new source system keeps the position: X and Y are written again in it", () => {
  const request = { source: "EPSG:4326", target: "EPSG:3857", x: "32.859742", y: "39.933365" };
  const mercator = withSource(request, "EPSG:3857");
  assert.equal(mercator.failure, null);
  assert.equal(mercator.request.source, "EPSG:3857");
  const expected = core.transformCrs("EPSG:4326", "EPSG:3857", "32.859742", "39.933365");
  assert.ok(Math.abs(Number(mercator.request.x) - expected.x) < 1e-3, mercator.request.x);
  assert.ok(Math.abs(Number(mercator.request.y) - expected.y) < 1e-3, mercator.request.y);
  // And back: the same degrees.
  const back = withSource(mercator.request, "EPSG:4326");
  assert.ok(Math.abs(Number(back.request.x) - ANKARA.longitude) < 1e-7, back.request.x);
  assert.ok(Math.abs(Number(back.request.y) - ANKARA.latitude) < 1e-7, back.request.y);
  // Outside the new system's domain X and Y stay as typed, with the core's code.
  const far = withSource(request, "EPSG:32601");
  assert.equal(far.failure, "OUTSIDE_UTM_DOMAIN");
  assert.deepEqual([far.request.source, far.request.x, far.request.y], ["EPSG:32601", "32.859742", "39.933365"]);
  // Without a position only the system changes.
  assert.deepEqual(withSource({ ...request, y: "" }, "EPSG:3857"), { request: { ...request, y: "", source: "EPSG:3857" }, failure: null });
});
