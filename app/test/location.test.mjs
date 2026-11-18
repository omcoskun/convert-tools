import assert from "node:assert/strict";
import test from "node:test";
import { inverseGeodesic } from "@convert-tools/core";
import { accuracyRing, locationErrorKey } from "../src/map/location.js";

test("the accuracy ring is closed and every vertex is the accuracy away on WGS 84", () => {
  for (const [center, metres] of [
    [{ latitude: 39.93, longitude: 32.86 }, 25],
    [{ latitude: -33.9, longitude: 151.2 }, 4800],
    [{ latitude: 10, longitude: 179.99 }, 3000],
  ]) {
    const ring = accuracyRing(center, metres, 32);
    assert.equal(ring.length, 33);
    assert.deepEqual(ring[0], ring[32]);
    for (const [longitude, latitude] of ring) {
      assert.ok(Math.abs(longitude - center.longitude) < 1, "kept next to the centre");
      const back = ((longitude + 540) % 360) - 180;
      const { distanceMetres } = inverseGeodesic(center, { latitude, longitude: back });
      assert.ok(Math.abs(distanceMetres - metres) < 1e-3, `${distanceMetres} != ${metres}`);
    }
  }
});

test("geolocation errors name what went wrong", () => {
  assert.equal(locationErrorKey(1), "mapLocationDenied");
  assert.equal(locationErrorKey(2), "mapLocationUnavailable");
  assert.equal(locationErrorKey(3), "mapLocationTimeout");
  assert.equal(locationErrorKey(undefined), "mapLocationUnavailable");
});
