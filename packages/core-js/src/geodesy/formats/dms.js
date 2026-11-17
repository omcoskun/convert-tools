import { validatePoint } from "../core/numbers.js";
import { ConvertToolsError } from "../../errors.js";

const HEMISPHERE = /[NSEW]/gi;
const SEPARATORS = /[°ºd:'′’"″]/gi;
const NUMBER_TOKEN = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g;

export function parseAngle(value, axis) {
  const rawSource = String(value).trim().replace(/,/g, ".");
  const numberTokens = rawSource.match(NUMBER_TOKEN) || [];
  if (
    axis === "latitude" &&
    /s\s*$/i.test(rawSource) &&
    numberTokens.length >= 3 &&
    !/["″]\s*s\s*$/i.test(rawSource)
  ) {
    throw new ConvertToolsError("INVALID_ANGLE",
      "A trailing S after three components is ambiguous. Use a seconds quote before S for south.",
    );
  }
  const source = rawSource.toUpperCase();
  if (!source) throw new ConvertToolsError("INVALID_ANGLE", "Angle is empty.");

  const hemispheres = source.match(HEMISPHERE) || [];
  if (hemispheres.length > 1) throw new ConvertToolsError("INVALID_ANGLE", "Angle has multiple hemispheres.");
  const hemisphere = hemispheres[0];
  if (
    hemisphere &&
    ((axis === "latitude" && !/[NS]/.test(hemisphere)) ||
      (axis === "longitude" && !/[EW]/.test(hemisphere)))
  ) {
    throw new ConvertToolsError("INVALID_ANGLE", "Hemisphere does not match the coordinate axis.");
  }

  const cleaned = source
    .replace(HEMISPHERE, " ")
    .replace(SEPARATORS, " ")
    .replace(/[m]/gi, " ")
    .trim();
  if (/[^0-9+\-.\s]/.test(cleaned)) {
    throw new ConvertToolsError("INVALID_ANGLE", "Angle contains unsupported characters.");
  }

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 3) {
    throw new ConvertToolsError("INVALID_ANGLE", "Angle must contain degrees, optional minutes and seconds.");
  }
  const numbers = parts.map(Number);
  if (numbers.some((number) => !Number.isFinite(number))) {
    throw new ConvertToolsError("INVALID_ANGLE", "Angle contains an invalid number.");
  }

  const degrees = numbers[0];
  const minutes = numbers.length > 1 ? numbers[1] : 0;
  const seconds = numbers.length > 2 ? numbers[2] : 0;
  if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
    throw new ConvertToolsError("INVALID_ANGLE", "Minutes and seconds must be in [0, 60).");
  }
  if (parts.slice(1).some((part) => /^[+-]/.test(part))) {
    throw new ConvertToolsError("INVALID_ANGLE", "Only degrees may have a sign.");
  }

  const numericSign = degrees < 0 || Object.is(degrees, -0) ? -1 : 1;
  const hemisphereSign = /[SW]/.test(hemisphere == null ? "" : hemisphere) ? -1 : 1;
  if (hemisphere && numericSign < 0 && hemisphereSign > 0) {
    throw new ConvertToolsError("INVALID_ANGLE", "The sign conflicts with the hemisphere.");
  }

  const sign = hemisphere ? hemisphereSign : numericSign;
  const result = sign * (Math.abs(degrees) + minutes / 60 + seconds / 3600);
  const maximum = axis === "latitude" ? 90 : 180;
  if (Math.abs(result) > maximum) {
    throw new ConvertToolsError(
      axis === "latitude" ? "LATITUDE_OUT_OF_RANGE" : "LONGITUDE_OUT_OF_RANGE",
      `${axis} is outside its valid range.`,
    );
  }
  return result;
}

// x >= 0 as decimal text with `digits` decimals, rounded exactly (toFixed
// rounds the binary value, not a shorter decimal) and an exact tie to even,
// as printf does. An exact tie is x = k / 2^(digits+1) with k odd.
function exactFixed(x, digits) {
  const text = x.toFixed(digits);
  const scaled = x * 2 ** (digits + 1);
  const last = Number(text[text.length - 1]);
  if (Number.isInteger(scaled) && scaled % 2 === 1 && last % 2 === 1) {
    return text.slice(0, -1) + String(last - 1);
  }
  return text;
}

// As GeographicLib DMS::Encode: the whole degrees are split off first
// (exactly), the rest is turned into minutes or seconds with one rounding
// and written with `digits` decimals (exactFixed); a carry to 60 goes into
// the next component. perDegree is 60 (minutes) or 3600 (seconds).
// Returns the whole degrees, the whole minutes or seconds below a degree
// (0 ... perDegree, already carried) and the decimal fraction text.
function encodeParts(value, perDegree, digits) {
  const magnitude = Math.abs(value);
  const whole = Math.floor(magnitude);
  const text = exactFixed((magnitude - whole) * perDegree, digits);
  const point = text.indexOf(".");
  const units = Number(point < 0 ? text : text.slice(0, point));
  return {
    degrees: whole + Math.floor(units / perDegree),
    units: units % perDegree,
    fraction: point < 0 ? "" : text.slice(point),
  };
}

function validateAxisValue(value, axis) {
  if (axis !== "latitude" && axis !== "longitude") {
    throw new ConvertToolsError("INVALID_ARGUMENT", 'Axis must be "latitude" or "longitude".');
  }
  const maximum = axis === "latitude" ? 90 : 180;
  if (!Number.isFinite(value) || Math.abs(value) > maximum) {
    throw new ConvertToolsError(
      axis === "latitude" ? "LATITUDE_OUT_OF_RANGE" : "LONGITUDE_OUT_OF_RANGE",
      "Angle is outside its valid range.",
    );
  }
}

function validateDigits(digits) {
  if (!Number.isInteger(digits) || digits < 0 || digits > 9) {
    throw new ConvertToolsError("INVALID_PRECISION", "Angle precision must be between 0 and 9.");
  }
}

/**
 * @param {number} value degrees
 * @param {"latitude" | "longitude"} axis
 * @param {number} [secondDigits=5] 0 … 9
 * @returns {string} e.g. `39°56'00.11400" N`
 * @throws {import("../../errors.js").ConvertToolsError} INVALID_ARGUMENT,
 *   LATITUDE_OUT_OF_RANGE, LONGITUDE_OUT_OF_RANGE, INVALID_PRECISION
 */
export function formatDms(value, axis, secondDigits = 5) {
  validateAxisValue(value, axis);
  validateDigits(secondDigits);
  const { degrees, units, fraction } = encodeParts(value, 3600, secondDigits);
  const minutes = Math.floor(units / 60);
  const seconds = `${String(units % 60).padStart(2, "0")}${fraction}`;
  const degreeWidth = axis === "longitude" ? 3 : 2;
  const hemisphere =
    axis === "latitude"
      ? value < 0
        ? "S"
        : "N"
      : value < 0
        ? "W"
        : "E";
  return `${String(degrees).padStart(degreeWidth, "0")}°${String(minutes).padStart(2, "0")}'${seconds}"${hemisphere}`;
}

/**
 * @param {number} value degrees
 * @param {"latitude" | "longitude"} axis
 * @param {number} [minuteDigits=7] 0 … 9
 * @returns {string}
 */
export function formatDdm(value, axis, minuteDigits = 7) {
  validateAxisValue(value, axis);
  validateDigits(minuteDigits);
  const { degrees, units, fraction } = encodeParts(value, 60, minuteDigits);
  const minutes = `${String(units).padStart(2, "0")}${fraction}`;
  const degreeWidth = axis === "longitude" ? 3 : 2;
  const hemisphere =
    axis === "latitude"
      ? value < 0
        ? "S"
        : "N"
      : value < 0
        ? "W"
        : "E";
  return `${String(degrees).padStart(degreeWidth, "0")}°${minutes}'${hemisphere}`;
}

export function parseCoordinatePair(latitude, longitude) {
  return validatePoint(
    parseAngle(latitude, "latitude"),
    parseAngle(longitude, "longitude"),
  );
}
