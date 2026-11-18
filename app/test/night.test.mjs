// The sun's position and the night mask the satellite map draws over its
// imagery (src/map/night.js). Reference instants: equinoxes and solstices
// of 2024 and NOAA's equation of time.
import assert from "node:assert/strict";
import test from "node:test";
import { MERCATOR_LIMIT, mercatorRowLatitude, nightAlpha, nightMask, subsolarPoint, sunElevation } from "../src/map/night.js";

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ""} ${actual} is not within ${tolerance} of ${expected}`);

test("the sun is over the equator at an equinox and over a tropic at a solstice", () => {
  near(subsolarPoint(new Date("2024-03-20T03:06Z")).latitude, 0, 0.3, "March equinox");
  near(subsolarPoint(new Date("2024-06-20T20:51Z")).latitude, 23.44, 0.3, "June solstice");
  near(subsolarPoint(new Date("2024-12-21T09:20Z")).latitude, -23.44, 0.3, "December solstice");
});

test("the sun's longitude at noon UTC follows the equation of time and moves 15° west an hour", () => {
  near(subsolarPoint(new Date("2024-11-03T12:00Z")).longitude, -4.1, 0.5, "EoT +16.4 min");
  near(subsolarPoint(new Date("2024-02-11T12:00Z")).longitude, 3.55, 0.5, "EoT −14.2 min");
  const noon = subsolarPoint(new Date("2024-11-03T12:00Z")).longitude;
  near(subsolarPoint(new Date("2024-11-03T13:00Z")).longitude, noon - 15, 0.05, "an hour later");
  const evening = subsolarPoint(new Date("2024-11-03T23:00Z")).longitude;
  assert.ok(evening >= -180 && evening <= 180, `longitude ${evening} wrapped to ±180`);
});

test("the sun is overhead at the subsolar point, under the antipode, on the horizon 90° away", () => {
  const sun = { latitude: 12, longitude: -40 };
  near(sunElevation(12, -40, sun), 90, 1e-9);
  near(sunElevation(-12, 140, sun), -90, 1e-9);
  near(sunElevation(-78, -40, sun), 0, 1e-9);
  near(sunElevation(0, 50, { latitude: 0, longitude: -40 }), 0, 1e-9);
});

test("night alpha is clear in daylight, full from 10° below the horizon, and never falls as the sun sinks", () => {
  assert.equal(nightAlpha(5), 0);
  assert.equal(nightAlpha(0), 0);
  assert.equal(nightAlpha(-10), 1);
  assert.equal(nightAlpha(-40), 1);
  let previous = 0;
  for (let elevation = 10; elevation >= -20; elevation -= 0.5) {
    const alpha = nightAlpha(elevation);
    assert.ok(alpha >= previous && alpha <= 1, `elevation ${elevation}`);
    previous = alpha;
  }
});

test("Mercator rows run from the top edge to the bottom edge, symmetric about the equator", () => {
  assert.ok(MERCATOR_LIMIT > 85.0511 && MERCATOR_LIMIT < 85.0512);
  const top = mercatorRowLatitude(0, 512);
  assert.ok(top > 85 && top < MERCATOR_LIMIT, `top row ${top}`);
  for (const row of [0, 17, 100, 255]) near(mercatorRowLatitude(row, 512), -mercatorRowLatitude(511 - row, 512), 1e-9, `row ${row}`);
  assert.ok(Math.abs(mercatorRowLatitude(255, 512)) < 0.4);
});

test("the night mask is clear under the sun and full on the other side of the Earth", () => {
  const size = 64;
  const mask = nightMask(new Date("2024-03-20T12:00Z"), size);
  assert.equal(mask.length, size * size);
  const equatorRow = size / 2;
  const column = (longitude) => Math.floor(((longitude + 180) / 360) * size);
  assert.equal(mask[equatorRow * size + column(0)], 0);
  assert.equal(mask[equatorRow * size + column(179)], 1);
  assert.ok(mask.every((value) => value >= 0 && value <= 1));
});
