import { pointFromValues, validatePoint } from "../core/numbers.js";
import { ConvertToolsError } from "../../errors.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DEGREE_ALPHABET = ALPHABET.slice(0, 15);

// GeographicLib Georef::Forward works in units of 1e-9 minute: 6e10 per
// degree. 360° is 2.16e13 units, well inside the 2^53 exact-integer range.
const UNITS_PER_DEGREE = 60e9;
const MAX_PRECISION = 11;

/**
 * Encodes a point as GEOREF. Digits are truncated, never rounded, so the code
 * names the cell that contains the point. Same integer algorithm as
 * GeographicLib's Georef::Forward; longitude +180° wraps to -180° and
 * latitude +90° belongs to the northernmost cell. Precision 1 (10-minute
 * cells) has no GeographicLib equivalent and uses the same truncation.
 * @param {number|string} longitudeValue degrees
 * @param {number|string} latitudeValue degrees
 * @param {number} [precision=4] digits per axis, 0 … 5
 * @returns {string}
 */
export function encodeGeoref(longitudeValue, latitudeValue, precision = 4) {
  const { latitude, longitude: rawLongitude } = pointFromValues(
    latitudeValue,
    longitudeValue,
  );
  if (!Number.isInteger(precision) || precision < 0 || precision > 5) {
    throw new ConvertToolsError("INVALID_PRECISION", "GEOREF precision must be between 0 and 5.");
  }
  const longitude = rawLongitude === 180 ? -180 : rawLongitude;
  const clampedLatitude =
    latitude === 90 ? latitude * (1 - Number.EPSILON / 2) : latitude;
  let x = Math.floor(longitude * UNITS_PER_DEGREE) + 180 * UNITS_PER_DEGREE;
  let y = Math.floor(clampedLatitude * UNITS_PER_DEGREE) + 90 * UNITS_PER_DEGREE;
  const longitudeDegrees = Math.trunc(x / UNITS_PER_DEGREE);
  const latitudeDegrees = Math.trunc(y / UNITS_PER_DEGREE);
  let result =
    ALPHABET[Math.trunc(longitudeDegrees / 15)] +
    ALPHABET[Math.trunc(latitudeDegrees / 15)] +
    DEGREE_ALPHABET[longitudeDegrees % 15] +
    DEGREE_ALPHABET[latitudeDegrees % 15];
  if (precision > 0) {
    x -= UNITS_PER_DEGREE * longitudeDegrees;
    y -= UNITS_PER_DEGREE * latitudeDegrees;
    const divisor = 10 ** (MAX_PRECISION - precision);
    result += String(Math.floor(x / divisor)).padStart(precision, "0");
    result += String(Math.floor(y / divisor)).padStart(precision, "0");
  }
  return result;
}

/**
 * Decodes GEOREF to the centre of its cell.
 * @param {string} value
 * @returns {import("../../types.js").AngularCell}
 * @throws {import("../../errors.js").ConvertToolsError} INVALID_GEOREF
 */
export function decodeGeoref(value) {
  const source = String(value).toUpperCase().replace(/\s+/g, "");
  const match = source.match(/^([A-HJ-NP-Z]{4})(\d*)$/);
  if (!match || match[2].length % 2 !== 0 || match[2].length > 10) {
    throw new ConvertToolsError("INVALID_GEOREF", "Invalid GEOREF coordinate.");
  }

  const [longitudeZone, latitudeZone, longitudeDegree, latitudeDegree] =
    [...match[1]].map((letter, index) => {
      const alphabet = index < 2 ? ALPHABET : DEGREE_ALPHABET;
      return alphabet.indexOf(letter);
    });
  if (
    longitudeZone < 0 ||
    longitudeZone > 23 ||
    latitudeZone < 0 ||
    latitudeZone > 11 ||
    longitudeDegree < 0 ||
    latitudeDegree < 0
  ) {
    throw new ConvertToolsError("INVALID_GEOREF", "Invalid GEOREF grid letters.");
  }

  const precision = match[2].length / 2;
  const longitudeDigits = match[2].slice(0, precision);
  const latitudeDigits = match[2].slice(precision);
  const stepMinutes = precision === 0 ? 60 : 10 ** (2 - precision);
  const longitudeMinutes =
    precision === 0 ? 0 : Number(longitudeDigits) * stepMinutes;
  const latitudeMinutes =
    precision === 0 ? 0 : Number(latitudeDigits) * stepMinutes;
  if (longitudeMinutes >= 60 || latitudeMinutes >= 60) {
    throw new ConvertToolsError("INVALID_GEOREF", "Invalid GEOREF minute value.");
  }

  return {
    ...validatePoint(
      -90 +
        latitudeZone * 15 +
        latitudeDegree +
        (latitudeMinutes + stepMinutes / 2) / 60,
      -180 +
        longitudeZone * 15 +
        longitudeDegree +
        (longitudeMinutes + stepMinutes / 2) / 60,
    ),
    precision,
    cellDegrees: stepMinutes / 60,
  };
}
