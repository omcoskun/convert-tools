// Pure helpers between the distance tool and MapLibre: display limits,
// antimeridian handling, picking precision and the basemap style rules.

import assert from "node:assert/strict";
import test from "node:test";
import { sampleGeodesicPath } from "@convert-tools/core";
import {
  MERCATOR_LATITUDE_LIMIT,
  coordinateFromLngLat,
  decimalsForResolution,
  displayLatitude,
  fallbackStyle,
  formatPickedCoordinate,
  isBeyondDisplay,
  markerPosition,
  routeBounds,
  routeFeatureCollection,
  routeMidpoint,
  tuneBasemapStyle,
  unwrapPath,
  wrapLongitude,
} from "../src/map/map-adapter.js";

test("polar points are drawn on the Web Mercator edge; their values are untouched", () => {
  const pole = { latitude: 89.9, longitude: 90 };
  assert.equal(isBeyondDisplay(pole), true);
  assert.equal(isBeyondDisplay({ latitude: 85, longitude: 0 }), false);
  assert.deepEqual(markerPosition(pole), [90, MERCATOR_LATITUDE_LIMIT]);
  assert.equal(displayLatitude(-90), -MERCATOR_LATITUDE_LIMIT);
  assert.equal(pole.latitude, 89.9);
});

test("a route across the antimeridian stays one short line", () => {
  const path = sampleGeodesicPath({ latitude: "10", longitude: "179.9" }, { latitude: "10", longitude: "-179.9" });
  const coordinates = unwrapPath(path.points);
  for (let index = 1; index < coordinates.length; index += 1) {
    assert.ok(Math.abs(coordinates[index][0] - coordinates[index - 1][0]) < 1, `step ${index}`);
  }
  const [[west], [east]] = routeBounds(path.points);
  assert.ok(east - west < 1, "bounds span 0.2°, not the whole world");
  assert.ok(east > 180, "B is unwrapped past 180°");
  assert.equal(routeFeatureCollection(path.points).features[0].geometry.type, "LineString");
  assert.ok(Math.abs(routeMidpoint(path.points)[0] - 180) < 1e-6);
});

test("fewer than two points draw no route", () => {
  assert.deepEqual(routeFeatureCollection(null).features, []);
  assert.deepEqual(routeFeatureCollection([{ latitude: 1, longitude: 2 }]).features, []);
  assert.equal(routeBounds([]), null);
  assert.equal(routeMidpoint([{ latitude: 1, longitude: 2 }]), null);
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
