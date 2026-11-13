// Drawing helpers of the SVG map. They only place points on screen, so the
// expectations here are plain plate carrée geometry.

import assert from "node:assert/strict";
import test from "node:test";
import { sampleGeodesicPath } from "@convert-tools/core";
import {
  MINIMUM_FRAME_HEIGHT,
  frameAround,
  geoJsonLinesPath,
  labelsInFrame,
  nearestCopy,
  panFrame,
  pickDigits,
  pickedPoint,
  pickedText,
  polylinePath,
  unwrapPoints,
  worldCopies,
  worldFrame,
  zoomFrame,
} from "../src/map/svg-geometry.js";
import { readJson } from "./support/files.mjs";

const config = readJson("public/config.json");

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function exampleRoute(id) {
  const example = config.distance.examples.find((candidate) => candidate.id === id);
  const path = sampleGeodesicPath(
    { latitude: example.startLatitude, longitude: example.startLongitude },
    { latitude: example.endLatitude, longitude: example.endLongitude },
    config.distance.path,
  );
  return unwrapPoints(path.points);
}

function contains(frame, { x, y }) {
  return x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height;
}

test("unwrapPoints keeps a line across the antimeridian continuous", () => {
  const [a, b] = unwrapPoints([
    { latitude: 10, longitude: 179.9 },
    { latitude: 10, longitude: -179.9 },
  ]);
  assert.deepEqual(a, { x: 179.9, y: -10 });
  close(b.x, 180.1);
  assert.equal(b.y, -10);
  const westward = unwrapPoints([
    { latitude: 0, longitude: -179.9 },
    { latitude: 0, longitude: 179.9 },
  ]);
  close(westward[1].x, -180.1);
});

test("unwrapPoints follows several turns and leaves ordinary steps alone", () => {
  const xs = unwrapPoints(
    [170, -170, -150, 170, 10].map((longitude) => ({ latitude: 0, longitude })),
  ).map((point) => point.x);
  assert.deepEqual(xs, [170, 190, 210, 170, 10]);
});

test("the core's antimeridian example unwraps into small steps", () => {
  const route = exampleRoute("antimeridian");
  for (let index = 1; index < route.length; index += 1) {
    assert.ok(Math.abs(route[index].x - route[index - 1].x) < 1, `step ${index}`);
  }
  assert.equal(route[0].x, 179.9);
  close(route[route.length - 1].x, 180.1, 1e-9);
});

test("polylinePath writes M/L commands with rounded numbers", () => {
  assert.equal(
    polylinePath([
      { x: 1, y: 2 },
      { x: 3.1234567, y: -4 },
      { x: -0.0001, y: 0 },
    ], 3),
    "M1 2L3.123 -4L0 0",
  );
  assert.equal(polylinePath([]), "");
});

test("geoJsonLinesPath draws LineStrings and MultiLineStrings only", () => {
  const collection = {
    type: "FeatureCollection",
    features: [
      { geometry: { type: "LineString", coordinates: [[0, 0], [10, 20]] } },
      { geometry: { type: "MultiLineString", coordinates: [[[1, 1], [2, -2]], [[5, 5]]] } },
      { geometry: { type: "Point", coordinates: [3, 3] } },
      { geometry: null },
    ],
  };
  // y is minus latitude; a one-vertex line is skipped.
  assert.equal(geoJsonLinesPath(collection), "M0 0L10 -20M1 -1L2 2");
});

test("frameAround keeps the aspect ratio, the margin and the minimum height", () => {
  const route = exampleRoute("ankara-istanbul");
  const frame = frameAround(route);
  close(frame.width / frame.height, 2);
  assert.ok(frame.height >= 12);
  for (const point of route) assert.ok(contains(frame, point));
  const custom = frameAround([{ x: 0, y: 0 }, { x: 40, y: -10 }], { aspect: 1.5, margin: 0 });
  close(custom.width / custom.height, 1.5);
  close(custom.width, 40);
});

test("frameAround stays inside the poles plus margin and never exceeds the world", () => {
  for (const id of ["near-pole", "equator-north-pole"]) {
    const route = exampleRoute(id);
    const frame = frameAround(route);
    const pad = frame.height * 0.15;
    assert.ok(frame.y >= -90 - pad - 1e-9, `${id} top ${frame.y}`);
    assert.ok(frame.y + frame.height <= 90 + pad + 1e-9, `${id} bottom`);
    for (const point of route) assert.ok(contains(frame, point), `${id} contains ${point.x},${point.y}`);
  }
  const world = frameAround([{ x: -180, y: 0 }, { x: 180, y: 0 }]);
  assert.equal(world.height, 180);
  assert.equal(world.width, 360);
  assert.deepEqual(frameAround([]), { x: -180, y: -90, width: 360, height: 180 });
});

test("worldCopies lists the whole-turn offsets a frame touches", () => {
  assert.deepEqual(worldCopies({ x: 0, width: 10 }), [0]);
  assert.deepEqual(worldCopies({ x: 170, width: 20 }), [0, 360]);
  assert.deepEqual(worldCopies({ x: -200, width: 40 }), [-360, 0]);
  assert.deepEqual(worldCopies({ x: -540, width: 720 }), [-360, 0, 360]);
});

test("labelsInFrame keeps labels inside the frame, countries and better ranks first", () => {
  const point = (name, kind, rank, longitude, latitude) => ({
    properties: { name, kind, rank },
    geometry: { type: "Point", coordinates: [longitude, latitude] },
  });
  const collection = {
    features: [
      point("Town", "place", 1, 5, 5),
      point("Far", "country", 1, 100, 5),
      point("Land", "country", 2, 15, 5),
      point("Capital", "country", 1, -5, -5),
      { properties: { name: "Line", kind: "country", rank: 0 }, geometry: { type: "LineString", coordinates: [] } },
    ],
  };
  const frame = { x: -40, y: -20, width: 80, height: 40 };
  assert.deepEqual(
    labelsInFrame(collection, frame).map((label) => label.name),
    ["Capital", "Land", "Town"],
  );
  assert.deepEqual(labelsInFrame(collection, frame, { limit: 2 }).map((label) => label.name), ["Capital", "Land"]);
  const first = labelsInFrame(collection, frame)[0];
  assert.equal(first.x, -5);
  assert.equal(first.y, 5);
});

test("labelsInFrame repeats labels on world copies and thins crowded ones", () => {
  const point = (name, rank, longitude, latitude) => ({
    properties: { name, kind: "place", rank },
    geometry: { type: "Point", coordinates: [longitude, latitude] },
  });
  const across = labelsInFrame({ features: [point("Fiji", 1, -179, -17)] }, { x: 160, y: -20, width: 40, height: 40 });
  assert.equal(across.length, 1);
  assert.equal(across[0].x, 181);
  // Frame 80 x 40: labels closer than 10 horizontally and 3.33 vertically clash.
  const crowded = labelsInFrame(
    { features: [point("A", 1, 0, 0), point("B", 2, 5, 1), point("C", 3, 15, 0)] },
    { x: -40, y: -20, width: 80, height: 40 },
  );
  assert.deepEqual(crowded.map((label) => label.name), ["A", "C"]);
});

test("labelsInFrame keeps labels off the frame edge and away from avoided points", () => {
  const point = (name, rank, longitude, latitude) => ({
    properties: { name, kind: "place", rank },
    geometry: { type: "Point", coordinates: [longitude, latitude] },
  });
  const collection = { features: [point("Edge", 1, 38, 0), point("Marker", 2, 0, 0), point("Free", 3, -20, 10)] };
  const frame = { x: -40, y: -20, width: 80, height: 40 };
  // inset 0.1 leaves anchors in x [-32, 32] and y [-16, 16].
  assert.deepEqual(
    labelsInFrame(collection, frame, { inset: 0.1, avoid: [{ x: 1, y: 0 }] }).map((label) => label.name),
    ["Free"],
  );
});

test("worldFrame spans pole to pole around a centre longitude", () => {
  assert.deepEqual(worldFrame(0, 2), { x: -180, y: -90, width: 360, height: 180 });
  assert.deepEqual(worldFrame(100, 1.5), { x: -35, y: -90, width: 270, height: 180 });
  assert.deepEqual(frameAround([], { aspect: 1.5 }), worldFrame(0, 1.5));
});

test("zoomFrame scales about the centre within the minimum height and the world", () => {
  const frame = { x: 0, y: -40, width: 40, height: 20 };
  const zoomedIn = zoomFrame(frame, 0.5);
  assert.deepEqual(zoomedIn, { x: 10, y: -35, width: 20, height: 10 });
  const zoomedOut = zoomFrame(frame, 100);
  assert.equal(zoomedOut.height, 180);
  close(zoomedOut.width / zoomedOut.height, 2);
  assert.ok(zoomedOut.y >= -90 - 27 && zoomedOut.y + 180 <= 90 + 27, "kept within the poles plus margin");
  assert.equal(zoomFrame(frame, 1e-6).height, MINIMUM_FRAME_HEIGHT);
});

test("panFrame moves freely east-west but stops at the poles", () => {
  assert.deepEqual(panFrame({ x: 0, y: 0, width: 20, height: 10 }, 400, 5), { x: 400, y: 5, width: 20, height: 10 });
  const north = panFrame({ x: 0, y: -80, width: 20, height: 10 }, 0, -50);
  assert.equal(north.y, -90 - 1.5);
});

test("nearestCopy puts a longitude on the world copy closest to the view", () => {
  close(nearestCopy(-179.9, 179), 180.1);
  assert.equal(nearestCopy(10, 0), 10);
  assert.equal(nearestCopy(10, -700), -710);
});

test("pickedPoint reads a map position and ignores space beyond the poles", () => {
  assert.deepEqual(pickedPoint(32.5, -39.9), { latitude: 39.9, longitude: 32.5 });
  assert.deepEqual(pickedPoint(190, 10), { latitude: -10, longitude: -170 });
  assert.deepEqual(pickedPoint(-540, 0), { latitude: 0, longitude: -180 });
  assert.equal(pickedPoint(0, -90.5), null);
  assert.equal(pickedPoint(0, 91), null);
  assert.equal(pickedPoint(Number.NaN, 0), null);
});

test("pickDigits keeps about one screen pixel of precision", () => {
  assert.equal(pickDigits(2), 0);
  assert.equal(pickDigits(0.5), 1);
  assert.equal(pickDigits(0.02), 2);
  assert.equal(pickDigits(0.003), 3);
  assert.equal(pickDigits(0.0004), 4);
  assert.equal(pickDigits(0.00001), 5);
});

test("pickedText writes picked coordinates without a negative zero", () => {
  assert.equal(pickedText(39.93336, 2), "39.93");
  assert.equal(pickedText(-0.004, 2), "0.00");
  assert.equal(pickedText(-0.2, 0), "0");
  assert.equal(pickedText(-12.5, 1), "-12.5");
});
