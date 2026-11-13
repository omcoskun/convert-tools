// public/config.json: every value the demo starts with or offers as an
// example must run through the core without an error.

import assert from "node:assert/strict";
import test from "node:test";
import { convertLength, coordinateResults, transformCrs } from "@convert-tools/core";
import { validateRuntime } from "../src/runtime.js";
import { measure } from "../src/tools/coordinates/distance.js";
import { INPUT_FORMATS, readPoint } from "../src/tools/coordinates/positions.js";
import { readJson } from "./support/files.mjs";

const config = readJson("public/config.json");
const lang = readJson("public/lang.json");

test("config.json and lang.json pass the start-up validation", () => {
  assert.doesNotThrow(() => validateRuntime(config, lang));
});

test("length examples convert at both precisions", () => {
  const { precision, examplePrecision, examples } = config.length;
  assert.ok(examples.length > 0);
  for (const example of examples) {
    for (const digits of [precision, examplePrecision]) {
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

test("distance examples measure within the configured sampling limits", () => {
  const { path: pathOptions, examples } = config.distance;
  for (const example of examples) {
    const result = measure(example, pathOptions);
    assert.ok(result.path.points.length >= 2, example.id);
    assert.ok(result.path.points.length <= pathOptions.maxPoints, example.id);
    // At most three decimals (millimetres); the core drops trailing zeros.
    assert.match(result.metres, /^\d+(\.\d{1,3})?$/, example.id);
  }
});

test("the basemap is one https vector style and nothing else", () => {
  assert.deepEqual(Object.keys(config.map), ["style"]);
  const url = new URL(config.map.style);
  assert.equal(url.protocol, "https:");
  assert.doesNotMatch(JSON.stringify(config), /arcgis|imagery|satellite/i);
});
