// src/map/scene.js: what a workspace tool asks the map to draw, reduced to
// bounds and GeoJSON without MapLibre. Antimeridian and polar cases follow
// the Web Mercator limits of src/map/map-adapter.js.

import assert from "node:assert/strict";
import test from "node:test";
import { sampleGeodesicPath } from "@convert-tools/core";
import { EMPTY_SCENE, fitTargets, longitudeWithin, pinClassName, polarStretches, sceneBounds, sceneFeatures, scenePoints } from "../src/map/scene.js";
import { LINE_COLORS, gradientColor } from "../src/map/map-adapter.js";

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
      { id: "route", gradient: true, part: 0, from: 0, to: 1 },
      { id: "plain", gradient: false, part: 0, from: 0, to: 1 },
    ],
  );
});

const EDGE = 85.0511287798066;

test("a line over a pole: MapLibre draws the pieces within ±85.05°, the stretch beyond is drawn on its real path", () => {
  // Regression (the owner's screenshots): this line passes 89.54°N. MapLibre's
  // GeoJSON tiles clamp latitudes to ±85.05°, so drawn as one line it ran
  // along the map's edge (on the globe: around the polar cap).
  const path = sampleGeodesicPath(
    { latitude: "36.36341", longitude: "115.56606" },
    { latitude: "44.902554", longitude: "-65.212542" },
  );
  const scene = sceneOf({ lines: [{ id: "inverse", points: path.points, gradient: true }] });
  const features = sceneFeatures(scene).features;
  assert.deepEqual(
    features.map(({ properties }) => [properties.id, properties.part]),
    [
      ["inverse", 0],
      ["inverse", 2],
    ],
  );
  const [before, after] = features;
  for (const [, latitude] of [...before.geometry.coordinates, ...after.geometry.coordinates]) assert.ok(latitude <= EDGE);
  const [stretch, ...others] = polarStretches(scene);
  assert.equal(others.length, 0);
  assert.equal(stretch.id, "inverse");
  // It starts and ends where the pieces leave and rejoin the edge, and keeps
  // its real latitudes in between.
  assert.deepEqual(stretch.coordinates[0], before.geometry.coordinates.at(-1));
  assert.deepEqual(stretch.coordinates.at(-1), after.geometry.coordinates[0]);
  assert.equal(stretch.coordinates[0][1], EDGE);
  const highest = Math.max(...stretch.coordinates.map(([, latitude]) => latitude));
  assert.ok(Math.abs(highest - 89.5386) < 1e-3, `highest ${highest}`);
  // from/to: where each part starts and ends along the whole line (0 at A, 1 at B).
  assert.equal(before.properties.from, 0);
  assert.equal(before.properties.to, stretch.from);
  assert.equal(stretch.to, after.properties.from);
  assert.equal(after.properties.to, 1);
  // About 9° of the line's 99° arc lies beyond 85.05°N.
  assert.ok(stretch.to - stretch.from > 0.07 && stretch.to - stretch.from < 0.11, `share ${stretch.to - stretch.from}`);
  // Its colour runs on from A's towards B's, like the rest of the line.
  assert.deepEqual(stretch.colors, [gradientColor(stretch.from), gradientColor(stretch.to)]);
});

test("the stretch beyond the south edge is cut the same way, and a plain line's stays ink", () => {
  const scene = sceneOf({ lines: [line("route", [-80, 0], [-89, 90], [-80, 180])] });
  assert.deepEqual(
    sceneFeatures(scene).features.map(({ properties }) => properties.part),
    [0, 2],
  );
  const [stretch] = polarStretches(scene);
  assert.deepEqual(
    stretch.coordinates.map(([, latitude]) => latitude),
    [-EDGE, -89, -EDGE],
  );
  close(stretch.coordinates[0][0], (90 * (EDGE - 80)) / 9, "leaves the map where -85.05° is crossed");
  assert.deepEqual(stretch.colors, [LINE_COLORS.ink, LINE_COLORS.ink]);
});

test("a line from a point beyond the edge starts with its stretch beyond", () => {
  const scene = sceneOf({ lines: [line("route", [89, 0], [87, 10], [80, 20])] });
  const [stretch] = polarStretches(scene);
  const crossing = (87 - EDGE) / (87 - 80);
  assert.deepEqual(stretch.coordinates.slice(0, 2), [
    [0, 89],
    [10, 87],
  ]);
  close(stretch.coordinates.at(-1)[0], 10 + 10 * crossing, "crossing longitude");
  close(stretch.to, (1 + crossing) / 2, "crossing along the line");
  const [shown] = sceneFeatures(scene).features;
  assert.equal(shown.properties.part, 1);
  assert.deepEqual(shown.geometry.coordinates.at(-1), [20, 80]);
  // A point exactly on the edge is shown, not beyond.
  const edgeScene = sceneOf({ lines: [line("edge", [EDGE, 0], [80, 0])] });
  assert.equal(sceneFeatures(edgeScene).features.length, 1);
  assert.deepEqual(polarStretches(edgeScene), []);
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

test("a pin's class list marks hollow and dragging pins", () => {
  const polar = pinClassName(["maplibregl-marker", "is-dragging"], { latitude: 89.9, longitude: 0, tone: "ink", hollow: true });
  // On the globe a polar pin is drawn where it is, like any other.
  assert.deepEqual(polar.split(" "), ["maplibregl-marker", "map-pin", "tone-ink", "is-hollow", "is-dragging"]);
  assert.equal(pinClassName(["is-clamped", "edge-south"], { latitude: -90, longitude: 0, tone: "a" }), "map-pin tone-a");
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

test("a fit tries the middle of the scene's first line, and nearer the equator when that is near a pole", () => {
  // The owner's route over the pole: its middle is near the pole, where the
  // globe shows both ends; the middle of its bounds (60.7°N, 205°E) is on
  // the far side of the Pacific from both. MapLibre's camera stops at
  // ±85.05° and its globe grows as 1 / cos(latitude) of the centre, so a
  // fit on a phone may show more from a centre further south.
  const path = sampleGeodesicPath(
    { latitude: "36.36341", longitude: "115.56606" },
    { latitude: "44.902554", longitude: "-65.212542" },
  );
  const polar = sceneOf({ pins: [pin("a", 36.36341, 115.56606)], lines: [{ id: "inverse", points: path.points }] });
  const targets = fitTargets(polar);
  for (const [longitude] of targets) assert.ok(Math.abs(longitude - 121.2497) < 1e-3, `longitude ${longitude}`);
  assert.deepEqual(
    targets.map(([, latitude]) => latitude),
    [EDGE, 80, 75, 70, 65, 60],
  );
  // The south too; a middle at 60° or nearer the equator is the only target.
  assert.deepEqual(
    fitTargets(sceneOf({ lines: [line("south", [-70, 10], [-72, 10])] })).map(([, latitude]) => latitude),
    [-71, -65, -60],
  );
  assert.deepEqual(fitTargets(sceneOf({ lines: [line("route", [10, 20], [30, 40])] })), [[30, 20]]);
  // Pins only: the middle of their bounds, across the antimeridian too.
  assert.deepEqual(fitTargets(sceneOf({ pins: [pin("a", 10, 20), pin("b", 30, 40)] })), [[30, 20]]);
  const [across] = fitTargets(sceneOf({ pins: [pin("a", 0, 179), pin("b", 0, -179)] }));
  close(across[0], 180, "across ±180°");
  assert.deepEqual(fitTargets(EMPTY_SCENE), []);
});

test("a fit must show every pin and every vertex of the lines", () => {
  const scene = sceneOf({
    pins: [pin("a", 10, 179.9), pin("b", 89.99, -179.9)],
    lines: [line("route", [10, 179.9], [10, -179.9]), line("single", [5, 5])],
  });
  const bounds = sceneBounds(scene);
  const points = scenePoints(scene, bounds);
  assert.equal(points.length, 4);
  // Pins on the copy of the world their line is drawn on, at their own latitude.
  close(points[0][0], 179.9, "A");
  close(points[1][0], 180.1, "B on the line's copy");
  assert.equal(points[1][1], 89.99);
  // Line vertices unwrapped, as drawn.
  close(points[3][0], 180.1, "the line's end");
  assert.deepEqual(scenePoints(EMPTY_SCENE, null), []);
});
