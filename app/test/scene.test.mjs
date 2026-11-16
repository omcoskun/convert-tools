// src/map/scene.js: what a workspace tool asks the map to draw, reduced to
// bounds and GeoJSON without MapLibre. Antimeridian and polar cases follow
// the Web Mercator limits of src/map/map-adapter.js.

import assert from "node:assert/strict";
import test from "node:test";
import { sampleGeodesicPath } from "@convert-tools/core";
import { EMPTY_SCENE, longitudeWithin, pinClassName, pinDisplay, sceneBounds, sceneFeatures } from "../src/map/scene.js";

const pin = (id, latitude, longitude) => ({ id, label: id, tone: "ink", latitude, longitude });
const line = (id, ...pairs) => ({ id, points: pairs.map(([latitude, longitude]) => ({ latitude, longitude })) });
const sceneOf = (parts) => ({ ...EMPTY_SCENE, ...parts });

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} is not ${expected}`);
}

test("the empty scene has no bounds and draws nothing", () => {
  assert.deepEqual(EMPTY_SCENE, { pins: [], lines: [], picking: null, fitRequest: 0 });
  assert.ok(Object.isFrozen(EMPTY_SCENE));
  assert.equal(sceneBounds(EMPTY_SCENE), null);
  assert.deepEqual(sceneFeatures(EMPTY_SCENE), { type: "FeatureCollection", features: [] });
});

test("the bounds of two pins are their west-south and east-north corners", () => {
  const scene = sceneOf({ pins: [pin("a", 39.933365, 32.859742), pin("b", 41.008238, 28.978359)] });
  assert.deepEqual(sceneBounds(scene), [
    [28.978359, 39.933365],
    [32.859742, 41.008238],
  ]);
});

test("a line across the antimeridian is drawn as one short piece", () => {
  const scene = sceneOf({
    pins: [pin("a", 10, 179.9), pin("b", 10, -179.9)],
    lines: [line("route", [10, 179.9], [10, -179.9])],
  });
  const [feature, ...rest] = sceneFeatures(scene).features;
  assert.equal(rest.length, 0);
  assert.equal(feature.geometry.type, "LineString");
  const [[startLongitude, startLatitude], [endLongitude, endLatitude]] = feature.geometry.coordinates;
  close(startLongitude, 179.9, "A stays");
  close(endLongitude, 180.1, "B is unwrapped past 180°");
  assert.equal(startLatitude, 10);
  assert.equal(endLatitude, 10);
  // The pins on both sides of ±180° and the line span 0.2°, not the world.
  const [[west], [east]] = sceneBounds(scene);
  close(west, 179.9, "west");
  close(east, 180.1, "east");
});

test("each line is unwrapped on its own", () => {
  const scene = sceneOf({
    lines: [line("east", [10, 179.9], [10, -179.9]), line("west", [0, -179.9], [0, 179.9])],
  });
  const features = sceneFeatures(scene).features;
  assert.deepEqual(
    features.map((feature) => feature.properties.id),
    ["east", "west"],
  );
  const [[first], [second]] = features[1].geometry.coordinates;
  close(first, -179.9, "the second line starts where its own points start");
  close(second, -180.1, "and is unwrapped westwards");
});

test("a sampled geodesic across the antimeridian never jumps", () => {
  // About 22 km, sampled every kilometre.
  const path = sampleGeodesicPath(
    { latitude: "10", longitude: "179.9" },
    { latitude: "10", longitude: "-179.9" },
    { maxSegmentMetres: 1000 },
  );
  const [feature] = sceneFeatures(sceneOf({ lines: [{ id: "route", points: path.points }] })).features;
  const coordinates = feature.geometry.coordinates;
  assert.ok(coordinates.length > 2);
  for (let index = 1; index < coordinates.length; index += 1) {
    assert.ok(Math.abs(coordinates[index][0] - coordinates[index - 1][0]) < 1, `step ${index}`);
  }
});

test("lines carry their id and gradient; fewer than two points draw nothing", () => {
  const scene = sceneOf({
    lines: [
      { ...line("route", [0, 0], [1, 1]), gradient: true, tag: "157 km" },
      line("plain", [0, 0], [2, 2]),
      line("single", [5, 5]),
      line("none"),
    ],
  });
  assert.deepEqual(
    sceneFeatures(scene).features.map((feature) => feature.properties),
    [
      { id: "route", gradient: true },
      { id: "plain", gradient: false },
    ],
  );
});

test("pins beyond the Web Mercator limit are drawn on its edge and say which edge", () => {
  assert.deepEqual(pinDisplay({ latitude: 89.9, longitude: 0 }), {
    longitude: 0,
    latitude: 85.0511287798066,
    clamped: true,
    edge: "north",
  });
  assert.deepEqual(pinDisplay({ latitude: -90, longitude: 12.5 }), {
    longitude: 12.5,
    latitude: -85.0511287798066,
    clamped: true,
    edge: "south",
  });
  assert.deepEqual(pinDisplay({ latitude: 85, longitude: -3 }), { longitude: -3, latitude: 85, clamped: false, edge: null });
});

test("bounds use the drawn latitudes, so polar points stay on the map", () => {
  const scene = sceneOf({ pins: [pin("a", 89.9, 0), pin("b", 89.9, 90)] });
  assert.deepEqual(sceneBounds(scene), [
    [0, 85.0511287798066],
    [90, 85.0511287798066],
  ]);
});

test("a pin's class list keeps MapLibre's marker classes, so every pin stays absolutely positioned", () => {
  // Regression: overwriting className dropped maplibregl-marker and drew each
  // pin after the first below its coordinate (the owner saw B misplaced).
  const library = ["maplibregl-marker", "maplibregl-marker-anchor-bottom", "maplibregl-marker-draggable"];
  const pin = { id: "end", latitude: 41, longitude: 29, tone: "b", draggable: true };
  const classes = pinClassName([...library, "map-pin", "tone-a", "is-hollow"], pin).split(" ");
  for (const name of library) assert.ok(classes.includes(name), name);
  assert.ok(classes.includes("tone-b") && !classes.includes("tone-a"), "the tone follows the pin");
  assert.ok(!classes.includes("is-hollow"), "stale classes of the app are dropped");
  assert.ok(classes.includes("is-draggable"));
});

test("a pin's class list marks hollow, clamped and dragging pins", () => {
  const polar = pinClassName(["maplibregl-marker", "is-dragging"], { latitude: 89.9, longitude: 0, tone: "ink", hollow: true });
  assert.deepEqual(polar.split(" "), ["maplibregl-marker", "map-pin", "tone-ink", "is-hollow", "is-clamped", "edge-north", "is-dragging"]);
  assert.match(pinClassName([], { latitude: -90, longitude: 0, tone: "a" }), /is-clamped edge-south/);
  assert.doesNotMatch(pinClassName([], { latitude: 85, longitude: 0, tone: "a" }), /is-clamped/);
});

test("a pin goes on the copy of the world its line is drawn on", () => {
  // A 30 000 km line east from Ankara ends at lon -57.67, drawn at 302.33.
  const bounds = [
    [32.859742, -40],
    [302.329096, 45],
  ];
  assert.ok(Math.abs(longitudeWithin(-57.670904, bounds) - 302.329096) < 1e-9);
  assert.equal(longitudeWithin(32.859742, bounds), 32.859742);
  // Ordinary bounds leave longitudes as they are.
  assert.equal(longitudeWithin(28.978359, [[28.978359, 39], [32.859742, 41]]), 28.978359);
  // Across the antimeridian (179.9 → -179.9 drawn as 180.1).
  assert.ok(Math.abs(longitudeWithin(-179.9, [[179.9, 9], [180.1, 11]]) - 180.1) < 1e-9);
});
