import assert from "node:assert/strict";
import test from "node:test";
import * as view from "../src/map/map-view.js";

test("world zoom floor fits a sphere into the available viewport", () => {
  assert.equal(typeof view.worldMinZoom, "function");
  for (const [width, height] of [[1440, 900], [390, 400], [900, 390]]) {
    const zoom = view.worldMinZoom({ width, height, latitude: 0 });
    const radius = 512 * 2 ** zoom / (2 * Math.PI);
    const distance = height * 1.5;
    const diameter = 2 * radius * distance / Math.sqrt(distance ** 2 + 2 * distance * radius);
    assert.ok(Math.abs(diameter - Math.min(width, height) * 0.9) < 0.001);
  }
});

test("zoom floor follows latitude, padding, projection and resize", () => {
  assert.equal(typeof view.worldMinZoom, "function");
  const base = { width: 1200, height: 800, latitude: 0 };
  const equator = view.worldMinZoom(base);
  assert.ok(Math.abs(view.worldMinZoom({ ...base, latitude: 60 }) - equator + 1) < 1e-10);
  assert.ok(view.worldMinZoom({ ...base, width: 400 }) < equator);
  assert.ok(view.worldMinZoom({ ...base, padding: { left: 700, right: 40, top: 50, bottom: 80 } }) < equator);
  assert.equal(view.worldMinZoom({ width: 512, height: 512, mode: "2d" }), 0);
  assert.equal(view.worldMinZoom({ ...base, mode: "2d", latitude: 85 }), view.worldMinZoom({ ...base, mode: "2d" }));
});

test("the flat world is never shorter than the map, widgets or not", () => {
  const padding = { left: 560, right: 76, top: 118, bottom: 230 };
  const zoom = view.worldMinZoom({ width: 2000, height: 920, mode: "2d", padding });
  assert.ok(Math.abs(512 * 2 ** zoom - 920) < 1e-9);
  // Width does not matter: the flat world repeats sideways.
  assert.equal(view.worldMinZoom({ width: 300, height: 920, mode: "2d" }), zoom);
});

test("hidden and tiny viewports and the poles never produce invalid zooms", () => {
  assert.equal(typeof view.worldMinZoom, "function");
  for (const latitude of [-90, 90]) {
    for (const size of [0, 1, 400]) {
      const zoom = view.worldMinZoom({ width: size, height: size, latitude });
      assert.ok(Number.isFinite(zoom) && zoom >= -2 && zoom <= 20);
    }
  }
});
