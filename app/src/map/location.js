// "My location" on the map: the circle of the reported accuracy around the
// device's position, a geodesic circle computed by the core on WGS 84.
// Tested in test/location.test.mjs.

import { directGeodesic } from "@convert-tools/core";

/**
 * A closed ring of `steps` + 1 points `metres` from `center` along the
 * geodesics leaving it every 360 / steps degrees. Longitudes are kept within
 * 180° of the centre's, so a ring across the antimeridian is drawn whole.
 * @param {{ latitude: number, longitude: number }} center
 * @param {number} metres > 0
 * @param {number} [steps=64]
 * @returns {[number, number][]} [longitude, latitude] each
 */
export function accuracyRing(center, metres, steps = 64) {
  const ring = [];
  for (let index = 0; index < steps; index += 1) {
    const { latitude, longitude } = directGeodesic(center, (360 * index) / steps, metres);
    let unwrapped = longitude;
    while (unwrapped - center.longitude > 180) unwrapped -= 360;
    while (unwrapped - center.longitude < -180) unwrapped += 360;
    ring.push([unwrapped, latitude]);
  }
  ring.push(ring[0]);
  return ring;
}

/** Why a position could not be had, from a GeolocationPositionError code. */
export function locationErrorKey(code) {
  if (code === 1) return "mapLocationDenied";
  if (code === 3) return "mapLocationTimeout";
  return "mapLocationUnavailable";
}
