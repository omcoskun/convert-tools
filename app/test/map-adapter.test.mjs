// Pure helpers between the workspace tools and MapLibre: display limits,
// antimeridian handling, picking precision, fit padding around the floating
// widgets and the basemap style rules. Scene bounds and lines are in
// scene.test.mjs.

import assert from "node:assert/strict";
import test from "node:test";
import { sampleGeodesicPath } from "@convert-tools/core";
import {
  MERCATOR_LATITUDE_LIMIT,
  constrainView,
  coordinateFromLngLat,
  decimalsForResolution,
  displayLatitude,
  fallbackStyle,
  fitPadding,
  formatPickedCoordinate,
  gradientColor,
  guardFilter,
  isBeyondDisplay,
  routeMidpoint,
  tuneBasemapStyle,
  unwrapPath,
  wrapLongitude,
} from "../src/map/map-adapter.js";
import { pinDisplay, sceneBounds, sceneFeatures } from "../src/map/scene.js";

test("polar points are drawn on the Web Mercator edge; their values are untouched", () => {
  const pole = { latitude: 89.9, longitude: 90 };
  assert.equal(isBeyondDisplay(pole), true);
  assert.equal(isBeyondDisplay({ latitude: 85, longitude: 0 }), false);
  assert.deepEqual(pinDisplay(pole), { longitude: 90, latitude: MERCATOR_LATITUDE_LIMIT, clamped: true, edge: "north" });
  assert.equal(displayLatitude(-90), -MERCATOR_LATITUDE_LIMIT);
  assert.equal(pole.latitude, 89.9);
});

test("a route across the antimeridian stays one short line", () => {
  const path = sampleGeodesicPath({ latitude: "10", longitude: "179.9" }, { latitude: "10", longitude: "-179.9" });
  const coordinates = unwrapPath(path.points);
  for (let index = 1; index < coordinates.length; index += 1) {
    assert.ok(Math.abs(coordinates[index][0] - coordinates[index - 1][0]) < 1, `step ${index}`);
  }
  const scene = { pins: [], lines: [{ id: "route", points: path.points }], picking: null, fitRequest: 0 };
  const [[west], [east]] = sceneBounds(scene);
  assert.ok(east - west < 1, "bounds span 0.2°, not the whole world");
  assert.ok(east > 180, "B is unwrapped past 180°");
  assert.equal(sceneFeatures(scene).features[0].geometry.type, "LineString");
  assert.ok(Math.abs(routeMidpoint(path.points)[0] - 180) < 1e-6);
});

test("the tag of a line whose middle is beyond the edge sits on the middle of that stretch", () => {
  // The owner's screenshot: the tag sat on the clamped corner where the line
  // reached the edge, next to A. The middle of this line is near the pole,
  // so the tag goes to the middle of the dashed stretch on the edge, where
  // the line passes closest to the pole (about 205° east).
  const path = sampleGeodesicPath(
    { latitude: "36.36341", longitude: "115.56606" },
    { latitude: "44.902554", longitude: "-65.212542" },
  );
  const [longitude, latitude] = routeMidpoint(path.points);
  assert.equal(latitude, MERCATOR_LATITUDE_LIMIT);
  assert.ok(Math.abs(longitude - 205.2) < 2, `longitude ${longitude}`);
  // A line whose middle is on the map keeps its middle vertex.
  const [, shownLatitude] = routeMidpoint([
    { latitude: 89, longitude: 0 },
    { latitude: 80, longitude: 10 },
    { latitude: 70, longitude: 20 },
  ]);
  assert.equal(shownLatitude, 80);
});

test("the line colour runs from A's to B's colour", () => {
  assert.equal(gradientColor(0), "rgb(36, 80, 224)");
  assert.equal(gradientColor(1), "rgb(226, 73, 44)");
  assert.equal(gradientColor(0.5), "rgb(131, 77, 134)");
});

test("fewer than two points draw no route", () => {
  const scene = (points) => ({ pins: [], lines: [{ id: "route", points }], picking: null, fitRequest: 0 });
  assert.deepEqual(sceneFeatures(scene(null)).features, []);
  assert.deepEqual(sceneFeatures(scene([{ latitude: 1, longitude: 2 }])).features, []);
  assert.equal(sceneBounds(scene([])), null);
  assert.equal(routeMidpoint([{ latitude: 1, longitude: 2 }]), null);
});

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

test("the map's centre may reach the Mercator edge, so a fit can bring edge pins below the top bar", () => {
  const range = { minZoom: 0, maxZoom: 20 };
  assert.deepEqual(constrainView({ lng: 45, lat: 84 }, 3, range), { longitude: 45, latitude: 84, zoom: 3 });
  // Longitude is free (world copies); latitude stops at the edge; zoom stays in range.
  assert.deepEqual(constrainView({ lng: 190, lat: 89 }, 25, range), {
    longitude: 190,
    latitude: MERCATOR_LATITUDE_LIMIT,
    zoom: 20,
  });
  assert.deepEqual(constrainView({ lng: -10, lat: -88 }, -1, range), {
    longitude: -10,
    latitude: -MERCATOR_LATITUDE_LIMIT,
    zoom: 0,
  });
});

test("fits keep the scene clear of the floating widgets", () => {
  const base = { top: 108, right: 76, bottom: 32, left: 32 };
  // 1440 x 900: input widget 16 px from the edge, result widget 20 px above the bottom.
  const stage = rect(0, 0, 1440, 900);
  const input = rect(16, 68, 374, 560);
  const result = rect(340, 900 - 20 - 128, 760, 128);
  assert.deepEqual(fitPadding(stage, { input, result }, base), {
    top: 108,
    right: 76,
    left: 374 + 32,
    bottom: 128 + 32,
  });
  // Hidden widgets (no size) and widgets below the map (the phone sheet) leave the base.
  const phone = rect(0, 0, 375, 480);
  assert.deepEqual(fitPadding(phone, { input: rect(0, 466, 375, 340), result: rect(0, 0, 0, 0) }, base), base);
  assert.deepEqual(fitPadding(stage, { input: null, result: null }, base), base);
  // On a small map the paddings shrink and leave at least 64 px for the scene.
  const small = fitPadding(rect(0, 0, 400, 300), { input: rect(16, 68, 320, 200), result: rect(24, 130, 352, 150) }, base);
  assert.ok(small.left + small.right <= 400 - 64 && small.left + small.right > 400 - 70, JSON.stringify(small));
  assert.ok(small.top + small.bottom <= 300 - 64 && small.top + small.bottom > 300 - 70, JSON.stringify(small));
  assert.ok(small.left > small.right, "the input widget side keeps the larger share");
});

test("picked coordinates resolve one pixel with 5 to 8 decimals", () => {
  assert.equal(decimalsForResolution(0.7), 5, "whole world");
  assert.equal(decimalsForResolution(1e-5), 5);
  assert.equal(decimalsForResolution(3e-6), 6);
  assert.equal(decimalsForResolution(2e-7), 7);
  assert.equal(decimalsForResolution(5e-9), 8, "never more than 8");
  assert.deepEqual(coordinateFromLngLat({ lng: 392.5, lat: 39.123456789 }, 6), { latitude: "39.123457", longitude: "32.500000" });
  assert.deepEqual(coordinateFromLngLat({ lng: -0.000001, lat: 95 }, 5), { latitude: "90.00000", longitude: "0.00000" });
  assert.equal(formatPickedCoordinate(-0.0000001, 5), "0.00000");
});

test("wrapLongitude keeps ±180 and wraps other turns", () => {
  assert.equal(wrapLongitude(180), 180);
  assert.equal(wrapLongitude(-180), -180);
  assert.equal(wrapLongitude(190), -170);
  assert.equal(wrapLongitude(540), 180);
  assert.ok(Number.isNaN(wrapLongitude(Number.NaN)));
});

test("the basemap keeps no raster source, so no imagery is ever requested", () => {
  const style = {
    version: 8,
    sources: {
      openmaptiles: { type: "vector", url: "https://tiles.example/planet" },
      ne2_shaded: { type: "raster", tiles: ["https://tiles.example/ne2sr/{z}/{x}/{y}.png"] },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#fff" } },
      { id: "ne2_shaded", type: "raster", source: "ne2_shaded" },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#000" } },
      { id: "label_city", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": "{name}" } },
    ],
  };
  const tuned = tuneBasemapStyle(style, "tr");
  assert.deepEqual(Object.keys(tuned.sources), ["openmaptiles"]);
  assert.deepEqual(tuned.layers.map((layer) => layer.id), ["background", "water", "label_city"]);
  assert.equal(tuned.layers[1].paint["fill-color"], "#bcd4e6");
  assert.deepEqual(tuned.layers[2].layout["text-field"][1], ["get", "name:tr"]);
  assert.deepEqual(tuneBasemapStyle(style, "en").layers[2].layout["text-field"][1], ["get", "name:en"]);
  assert.equal(style.layers.length, 4, "the input style is not changed");
});

test("the offline fallback style makes no requests", () => {
  const style = fallbackStyle();
  assert.equal(style.version, 8);
  assert.doesNotMatch(JSON.stringify(style), /https?:/);
  assert.ok(Object.values(style.sources).every((source) => source.type === "geojson"));
});

test("number comparisons in basemap filters read a missing property as failing, without a warning", () => {
  const filter = ["all", ["<=", ["get", "ref_length"], 6], [">", ["get", "rank"], 2], ["==", ["get", "class"], "motorway"]];
  assert.deepEqual(guardFilter(filter), [
    "all",
    ["<=", ["coalesce", ["get", "ref_length"], 1e9], 6],
    [">", ["coalesce", ["get", "rank"], -1e9], 2],
    ["==", ["get", "class"], "motorway"],
  ]);
  assert.equal(guardFilter("x"), "x");
  const tuned = tuneBasemapStyle({ sources: {}, layers: [{ id: "shield", type: "symbol", filter }] }, "tr");
  assert.deepEqual(tuned.layers[0].filter, guardFilter(filter));
});
