// Satellite image requests for the plate carrée map. Expected values follow
// from the frame by hand: pixels per degree = screen width / frame width,
// latitude = -y, and each world copy is shifted by 360 degrees.

import assert from "node:assert/strict";
import test from "node:test";
import { imageryRequests, imageryUrl } from "../src/map/imagery.js";
import { readJson } from "./support/files.mjs";

test("a frame inside one world copy needs one image of the same box", () => {
  // 8 x 4 degrees on 800 px: 100 px per degree.
  const [request, ...rest] = imageryRequests({ x: 26, y: -42, width: 8, height: 4 }, 800);
  assert.equal(rest.length, 0);
  assert.deepEqual(request, { x: 26, y: -42, width: 8, height: 4, bbox: [26, 38, 34, 42], size: [800, 400] });
});

test("a frame across the antimeridian is split at 180 degrees", () => {
  // 20 degrees on 400 px: 20 px per degree; the copy east of 180 is 360 degrees on.
  assert.deepEqual(imageryRequests({ x: 170, y: -20, width: 20, height: 10 }, 400), [
    { x: 170, y: -20, width: 10, height: 10, bbox: [170, 10, 180, 20], size: [200, 200] },
    { x: 180, y: -20, width: 10, height: 10, bbox: [-180, 10, -170, 20], size: [200, 200] },
  ]);
});

test("images stop at the poles", () => {
  const requests = imageryRequests({ x: -180, y: -120, width: 360, height: 240 }, 720);
  assert.deepEqual(requests, [{ x: -180, y: -90, width: 360, height: 180, bbox: [-180, -90, 180, 90], size: [720, 360] }]);
  assert.deepEqual(imageryRequests({ x: 0, y: 95, width: 10, height: 5 }, 100), []);
});

test("image sizes follow the pixel ratio and are capped on the longer side", () => {
  const frame = { x: 26, y: -42, width: 8, height: 4 };
  assert.deepEqual(imageryRequests(frame, 800, { pixelRatio: 2 })[0].size, [1600, 800]);
  // 20 x 10 degrees on 10000 px: 10000 x 5000, scaled to fit 4096.
  assert.deepEqual(imageryRequests({ x: 0, y: -10, width: 20, height: 10 }, 10000)[0].size, [4096, 2048]);
  assert.deepEqual(imageryRequests(frame, 0), []);
});

test("the export URL asks for a WGS 84 image of the box", () => {
  const { exportUrl } = readJson("public/config.json").map.imagery;
  const url = new URL(imageryUrl(exportUrl, { bbox: [26, 38, 34, 42], size: [800, 400] }));
  assert.equal(`${url.origin}${url.pathname}`, exportUrl);
  assert.equal(url.protocol, "https:");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    bbox: "26,38,34,42",
    bboxSR: "4326",
    imageSR: "4326",
    size: "800,400",
    format: "jpg",
    f: "image",
  });
});
