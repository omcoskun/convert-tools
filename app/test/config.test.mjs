// public/config.json: every value the demo starts with or offers as an
// example must run through the core without an error.

import assert from "node:assert/strict";
import test from "node:test";
import { convertLength, coordinateResults, transformCrs } from "@convert-tools/core";
import { validateRuntime } from "../src/runtime.js";
import { readPointText } from "../src/lib/point-text.js";
import { checkModel, modelOptions, runDirect, runInverse, runRoute } from "../src/tools/measure/measure.js";
import { INPUT_FORMATS, readPoint } from "../src/tools/positions/positions.js";
import { readJson } from "./support/files.mjs";

const config = readJson("public/config.json");
const lang = readJson("public/lang.json");

test("config.json and lang.json pass the start-up validation", () => {
  assert.doesNotThrow(() => validateRuntime(config, lang));
});

test("length precisions are 24 by default and at most 60; examples convert at both precisions", () => {
  const { defaultPrecision, maxPrecision, examplePrecision, examples } = config.length;
  assert.equal(defaultPrecision, 24);
  assert.equal(maxPrecision, 60);
  assert.ok(examplePrecision >= 0 && examplePrecision <= maxPrecision);
  assert.ok(examples.length > 0);
  for (const example of examples) {
    for (const digits of [defaultPrecision, examplePrecision]) {
      const result = convertLength(example.value, example.from, example.to, digits);
      assert.equal(typeof result.value, "string", `${example.value} ${example.from} -> ${example.to}`);
    }
  }
});

test("the initial position values parse in every input format", () => {
  const { initial } = config.position;
  assert.ok(INPUT_FORMATS.some((format) => format.id === initial.format));
  for (const format of INPUT_FORMATS) {
    const point = readPoint(format.id, initial.values);
    assert.ok(Number.isFinite(point.latitude) && Number.isFinite(point.longitude), format.id);
  }
});

test("MGRS precisions are 0..5 and each label names the MGRS cell size", () => {
  const { precisions, initial } = config.position;
  assert.deepEqual(
    precisions.map((item) => item.digits).sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5],
  );
  assert.ok(precisions.some((item) => item.digits === initial.precision));
  const point = readPoint(initial.format, initial.values);
  for (const { digits, label } of precisions) {
    // MGRS with d digits per axis has 10^(5 - d) metre cells.
    const cellMetres = 10 ** (5 - digits);
    const expected = cellMetres >= 1000 ? `${cellMetres / 1000} km` : `${cellMetres} m`;
    assert.equal(label, expected, `digits ${digits}`);
    assert.equal(coordinateResults(point, digits).resolution.mgrs.cellMetres, cellMetres);
  }
});

test("position examples parse and produce every output at every precision", () => {
  const { initial, examples, precisions } = config.position;
  for (const example of examples) {
    const point = readPoint(example.format, { ...initial.values, ...example.values });
    for (const { digits } of precisions) {
      const results = coordinateResults(point, digits);
      for (const key of ["dd", "dms", "ddm", "mgrs", "utmUps", "gars", "georef"]) {
        assert.equal(typeof results[key], "string", `${example.id} ${key} p${digits}`);
      }
    }
  }
});

test("CRS initial request and examples transform", () => {
  for (const request of [config.crs.initial, ...config.crs.examples]) {
    const result = transformCrs(request.source, request.target, request.x, request.y);
    assert.ok(Number.isFinite(result.x) && Number.isFinite(result.y), `${request.source} -> ${request.target}`);
  }
});

test("measure examples run in their mode within the configured sampling limits", () => {
  const { path: pathOptions, examples, route } = config.measure;
  const modes = new Set();
  for (const example of examples) {
    modes.add(example.mode);
    const points = example.points.map((text) => {
      const reading = readPointText(text);
      assert.equal(reading.status, "valid", `${example.id}: ${text}`);
      return { latitude: reading.latitude, longitude: reading.longitude };
    });
    let result;
    if (example.mode === "inverse") {
      assert.equal(points.length, 2, example.id);
      result = runInverse(points, {}, pathOptions);
      // At most three decimals (millimetres); the core drops trailing zeros.
      assert.match(result.value.lengths.metre, /^\d+(\.\d{1,3})?$/, example.id);
    } else if (example.mode === "direct") {
      assert.equal(points.length, 1, example.id);
      const { azimuth, distance, unit } = example;
      result = runDirect({ start: points[0], azimuth, distance, unit }, {}, pathOptions);
    } else {
      assert.equal(example.mode, "route", example.id);
      assert.ok(points.length >= 2 && points.length <= route.maxPoints, example.id);
      result = runRoute(points, {}, pathOptions);
    }
    assert.equal(result.ok, true, example.id);
    for (const line of result.value.lines) {
      assert.ok(line.points.length >= 2 && line.points.length <= pathOptions.maxPoints, example.id);
    }
  }
  assert.deepEqual([...modes].sort(), ["direct", "inverse", "route"], "every mode has an example");
});

test("the measure models are WGS 84, GRS 80, the sphere and a custom one; the route cap is 50", () => {
  const { models, route } = config.measure;
  assert.deepEqual(
    models.map((model) => model.id),
    ["wgs84", "grs80", "sphere", "custom"],
  );
  for (const model of models.filter(({ id }) => id !== "custom")) {
    assert.deepEqual(checkModel(modelOptions(model)), { ok: true }, model.id);
  }
  assert.equal(route.maxPoints, 50);
});

test("the comparison sphere has a plausible Earth radius in metres", () => {
  const radius = config.measure.comparisonSphereRadiusMetres;
  assert.equal(typeof radius, "number");
  // Between the polar and equatorial semi-axes of WGS 84, both included
  // (some web maps use the equatorial radius 6378137 m).
  assert.ok(radius >= 6356752.314245 && radius <= 6378137, String(radius));
});

test("the basemap is one https vector style and nothing else", () => {
  assert.deepEqual(Object.keys(config.map), ["style"]);
  const url = new URL(config.map.style);
  assert.equal(url.protocol, "https:");
  assert.doesNotMatch(JSON.stringify(config), /arcgis|imagery|satellite/i);
});
