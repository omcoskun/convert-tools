// The stars behind the globe (src/map/stars.js): two repeating tiles that
// shift with the camera as if they hung far behind the Earth.
import assert from "node:assert/strict";
import test from "node:test";
import { STAR_LAYERS, STAR_SPEED, starTile, starTransform, unwrapLongitude } from "../src/map/stars.js";

const near = (actual, expected, tolerance = 1e-9, message = "") =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} ${actual} is not within ${tolerance} of ${expected}`);

/** `actual` and `expected` differ by a whole number of `period`s. */
const samePlace = (actual, expected, period, message = "") => {
  const turns = (actual - expected) / period;
  near(turns, Math.round(turns), 1e-9, message);
};

const viewport = { width: 1000, height: 600, ratio: 2 };
const still = { longitude: 0, latitude: 0, bearing: 0, pitch: 0 };

test("the two tiles have co-prime sizes, so the pattern does not visibly repeat", () => {
  assert.equal(STAR_LAYERS.length, 2);
  const [first, second] = STAR_LAYERS.map(({ size }) => size);
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  assert.equal(gcd(first, second), 1);
  assert.ok(first * second > 100000);
});

test("a tile's stars are deterministic, inside the tile, with their layer's radii and alphas", () => {
  for (const layer of STAR_LAYERS) {
    const stars = starTile(layer);
    assert.deepEqual(starTile(layer), stars);
    assert.equal(stars.length, layer.count);
    for (const star of stars) {
      assert.ok(star.x >= 0 && star.x < layer.size && star.y >= 0 && star.y < layer.size);
      assert.ok(star.radius >= layer.radius[0] && star.radius <= layer.radius[1]);
      assert.ok(star.alpha >= layer.alpha[0] && star.alpha <= layer.alpha[1]);
      assert.equal(typeof star.warm, "boolean");
      assert.equal(typeof star.glow, "boolean");
    }
    if (layer.glow === 0) assert.ok(stars.every(({ glow }) => !glow));
  }
  assert.ok(starTile(STAR_LAYERS[1]).some(({ glow }) => glow), "some bright stars glow");
});

test("the unwrapped longitude follows the shortest turn, across the antimeridian too", () => {
  assert.equal(unwrapLongitude(10, 10, 25), 25);
  assert.equal(unwrapLongitude(10, 10, -5), -5);
  near(unwrapLongitude(179, 179, -179), 181);
  near(unwrapLongitude(-179, -179, 179), -181);
  near(unwrapLongitude(541, 181 - 360, -170), 550);
});

test("with the camera still, the pattern is unrotated and centred on the screen", () => {
  const [a, b, c, d, e, f] = starTransform(still, { ...viewport, size: 389 });
  assert.deepEqual([a, b, c, d], [1, 0, 0, 1]);
  near(e, 1000);
  near(f, 600);
});

test("moving east sends the stars right and moving north sends them up, by the star speed", () => {
  const size = 389;
  const period = size * viewport.ratio;
  const [, , , , e0, f0] = starTransform(still, { ...viewport, size });
  const [, , , , eastE, eastF] = starTransform({ ...still, longitude: 2 }, { ...viewport, size });
  samePlace(eastE - e0, 2 * STAR_SPEED * viewport.ratio, period, "east");
  near(eastF, f0);
  const [, , , , northE, northF] = starTransform({ ...still, latitude: 2 }, { ...viewport, size });
  near(northE, e0);
  samePlace(northF - f0, -2 * STAR_SPEED * viewport.ratio, period, "north");
});

test("tilting the map sends the stars down, without wrapping", () => {
  const [, , , , e0, f0] = starTransform(still, { ...viewport, size: 547 });
  const [, , , , e, f] = starTransform({ ...still, pitch: 40 }, { ...viewport, size: 547 });
  near(e, e0);
  near(f - f0, 40 * STAR_SPEED * viewport.ratio);
});

test("rotating the map turns the stars with it: at bearing 90 east is up", () => {
  const size = 389;
  const [a, b, c, d] = starTransform({ ...still, bearing: 90 }, { ...viewport, size });
  near(a, 0);
  near(b, -1);
  near(c, 1);
  near(d, 0);
  const period = size * viewport.ratio;
  const [, , , , e0, f0] = starTransform({ ...still, bearing: 90 }, { ...viewport, size });
  const [, , , , e, f] = starTransform({ ...still, bearing: 90, longitude: 3 }, { ...viewport, size });
  near(e, e0, 1e-6);
  samePlace(f - f0, -3 * STAR_SPEED * viewport.ratio, period, "east is up");
});

test("the shift stays within one tile however far the camera has turned", () => {
  const size = 547;
  const [, , , , e, f] = starTransform({ longitude: 123456.7, latitude: -89, bearing: 33, pitch: 0 }, { ...viewport, size });
  const reach = size * Math.SQRT2 * viewport.ratio;
  assert.ok(Math.abs(e - 1000) <= reach && Math.abs(f - 600) <= reach, `${e}, ${f}`);
});
