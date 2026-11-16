// The triaxial tool's helpers (src/tools/triaxial/triaxial.js). Expected
// values were checked against the core (docs/TRIAXIAL_VALIDATION.md
// validates it against GeographicLib's Geod3Solve).

import assert from "node:assert/strict";
import test from "node:test";
import {
  axesOf,
  runFromCartesian,
  runToCartesian,
  runTriaxialDirect,
  runTriaxialInverse,
  triaxialSnippet,
} from "../src/tools/triaxial/triaxial.js";
import { readJson } from "./support/files.mjs";

const config = readJson("public/config.json");
const preset = (id) => config.triaxial.presets.find((item) => item.id === id);
const earth = axesOf(preset("earth"));

const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

test("the presets are Earth triaxial, Cayley, mild, oblate and prolate", () => {
  assert.deepEqual(
    config.triaxial.presets.map((item) => item.id),
    ["earth", "cayley", "mild", "oblate", "prolate"],
  );
  assert.deepEqual(earth, { a: 6378172, b: 6378102, c: 6356752 });
});

test("inverse (40, 30) -> (41, 29) on the Earth triaxial ellipsoid", () => {
  const result = runTriaxialInverse({ beta1: "40", omega1: "30", beta2: "41", omega2: "29" }, earth);
  assert.equal(result.ok, true);
  close(result.value.distance, 139498.87769082142, 1e-6, "distance");
});

test("direct from (40, 30), heading 45, 100 km", () => {
  const result = runTriaxialDirect({ beta1: "40", omega1: "30", azimuth: "45", distance: "100000" }, earth);
  assert.equal(result.ok, true);
  close(result.value.beta, 40.63475255180542, 1e-9, "beta");
});

test("(β, ω) -> X, Y, Z -> (β, ω) returns the point", () => {
  const cartesian = runToCartesian({ beta: "40", omega: "30" }, earth);
  assert.equal(cartesian.ok, true);
  const back = runFromCartesian(cartesian.value, earth);
  assert.equal(back.ok, true);
  close(back.value.beta, 40, 1e-9, "beta");
  close(back.value.omega, 30, 1e-9, "omega");
});

test("axes with a < b, c <= 0 or text that is not a number fail with INVALID_ARGUMENT", () => {
  const form = { beta1: "40", omega1: "30", beta2: "41", omega2: "29" };
  for (const custom of [
    { a: "1", b: "2", c: "0.5" },
    { a: "1", b: "1", c: "0" },
    { a: "", b: "1", c: "1" },
    { a: "1.", b: "x", c: "1" },
  ]) {
    assert.deepEqual(runTriaxialInverse(form, axesOf({ id: "custom" }, custom)), { ok: false, code: "INVALID_ARGUMENT" }, JSON.stringify(custom));
  }
  // A decimal comma is read in a typed axis.
  assert.deepEqual(axesOf(null, { a: "1,2", b: "1,1", c: "1" }), { a: 1.2, b: 1.1, c: 1 });
});

test("half-typed or empty fields give a code, never an exception", () => {
  for (const value of ["", "-", "4a", "91"]) {
    const inverse = runTriaxialInverse({ beta1: value, omega1: "30", beta2: "41", omega2: "29" }, earth);
    assert.equal(inverse.ok, false, JSON.stringify(value));
    const direct = runTriaxialDirect({ beta1: "40", omega1: "30", azimuth: value === "91" ? "45" : value, distance: value === "91" ? "-1" : "1" }, earth);
    assert.equal(direct.ok, false, JSON.stringify(value));
    assert.equal(runFromCartesian({ x: value, y: "0", z: "0" }, earth).ok, value === "91");
  }
  assert.deepEqual(runFromCartesian({ x: "0", y: "0", z: "0" }, earth), { ok: false, code: "INVALID_ARGUMENT" });
});

test("every example runs in its mode with its preset", () => {
  const modes = new Set();
  for (const example of config.triaxial.examples) {
    const axes = axesOf(preset(example.preset));
    modes.add(example.mode);
    const result =
      example.mode === "inverse"
        ? runTriaxialInverse(example, axes)
        : example.mode === "direct"
          ? runTriaxialDirect(example, axes)
          : runToCartesian(example, axes);
    assert.equal(result.ok, true, example.id);
  }
  assert.deepEqual([...modes].sort(), ["cartesian", "direct", "inverse"]);
});

test("the library call is the call that ran", () => {
  assert.equal(
    triaxialSnippet("inverse", { beta1: "40", omega1: "30", beta2: "41", omega2: "29" }, earth),
    "inverseTriaxialGeodesic({ beta: 40, omega: 30 }, { beta: 41, omega: 29 }, { ellipsoid: { a: 6378172, b: 6378102, c: 6356752 } })",
  );
  assert.equal(
    triaxialSnippet("direct", { beta1: "40", omega1: "30", azimuth: "45", distance: "100000" }, earth),
    "directTriaxialGeodesic({ beta: 40, omega: 30 }, 45, 100000, { ellipsoid: { a: 6378172, b: 6378102, c: 6356752 } })",
  );
  assert.equal(
    triaxialSnippet("toCartesian", { beta: "-40.5", omega: "30" }, earth),
    "triaxialToCartesian({ beta: -40.5, omega: 30 }, { ellipsoid: { a: 6378172, b: 6378102, c: 6356752 } })",
  );
  assert.equal(
    triaxialSnippet("fromCartesian", { x: "1", y: "2,5", z: "3" }, axesOf(preset("mild"))),
    'cartesianToTriaxial({ x: 1, y: "2,5", z: 3 }, { ellipsoid: { a: 1.2, b: 1.1, c: 1 } })',
  );
});
