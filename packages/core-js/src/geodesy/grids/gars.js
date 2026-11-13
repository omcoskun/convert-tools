import { pointFromValues, validatePoint } from "../core/numbers.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * Encodes a point as a 5-minute GARS cell (7 characters, e.g. "574JK19").
 * Follows GeographicLib's GARS::Forward: longitude +180° wraps to band 001
 * and latitude +90° belongs to the northernmost cell.
 * @param {number|string} longitudeValue degrees
 * @param {number|string} latitudeValue degrees
 * @returns {string}
 */
export function encodeGars(longitudeValue, latitudeValue) {
  const { latitude, longitude: rawLongitude } = pointFromValues(
    latitudeValue,
    longitudeValue,
  );
  const longitude = rawLongitude === 180 ? -180 : rawLongitude;
  const clampedLatitude =
    latitude === 90 ? latitude * (1 - Number.EPSILON / 2) : latitude;
  // Work in 5-minute units: 12 per degree.
  let x = Math.floor(longitude * 12) + 180 * 12;
  let y = Math.floor(clampedLatitude * 12) + 90 * 12;
  const longitudeBand = Math.trunc((x * 2) / 12);
  const latitudeBand = Math.trunc((y * 2) / 12);
  x -= (longitudeBand * 12) / 2;
  y -= (latitudeBand * 12) / 2;
  const quadrant = 2 * (1 - Math.trunc(y / 3)) + Math.trunc(x / 3) + 1;
  const keypad = 3 * (2 - (y % 3)) + (x % 3) + 1;
  return (
    String(longitudeBand + 1).padStart(3, "0") +
    ALPHABET[Math.trunc(latitudeBand / 24)] +
    ALPHABET[latitudeBand % 24] +
    quadrant +
    keypad
  );
}

export function decodeGars(value) {
  const source = String(value).toUpperCase().replace(/\s+/g, "");
  if (!/^\d{3}[A-HJ-NP-Z]{2}(?:[1-4](?:[1-9])?)?$/.test(source)) {
    throw new Error("Invalid GARS coordinate.");
  }

  const longitudeBand = Number(source.slice(0, 3));
  const latitudeBand =
    ALPHABET.indexOf(source[3]) * 24 + ALPHABET.indexOf(source[4]);
  if (
    longitudeBand < 1 ||
    longitudeBand > 720 ||
    latitudeBand < 0 ||
    latitudeBand > 359
  ) {
    throw new Error("Invalid GARS band.");
  }

  let longitude = -180 + (longitudeBand - 1) * 0.5;
  let latitude = -90 + latitudeBand * 0.5;
  let cellDegrees = 0.5;
  if (source.length >= 6) {
    const quadrant = Number(source[5]);
    longitude += (quadrant === 2 || quadrant === 4 ? 1 : 0) * 0.25;
    latitude += (quadrant === 1 || quadrant === 2 ? 1 : 0) * 0.25;
    cellDegrees = 0.25;
  }
  if (source.length === 7) {
    const keypadIndex = Number(source[6]) - 1;
    longitude += (keypadIndex % 3) / 12;
    latitude += (2 - Math.floor(keypadIndex / 3)) / 12;
    cellDegrees = 1 / 12;
  }

  return {
    ...validatePoint(
      latitude + cellDegrees / 2,
      longitude + cellDegrees / 2,
    ),
    precision: source.length,
    cellDegrees,
  };
}
