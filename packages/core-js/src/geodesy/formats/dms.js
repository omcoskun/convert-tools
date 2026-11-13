import { fixed, validatePoint } from "../core/numbers.js";
import { ConvertToolsError } from "../../errors.js";

const HEMISPHERE = /[NSEW]/gi;
const SEPARATORS = /[°ºd:'′’"″]/gi;
const NUMBER_TOKEN = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g;

export function parseAngle(value, axis) {
  const rawSource = String(value).trim().replace(/,/g, ".");
  const numberTokens = rawSource.match(NUMBER_TOKEN) ?? [];
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

  const hemispheres = source.match(HEMISPHERE) ?? [];
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
  const minutes = numbers[1] ?? 0;
  const seconds = numbers[2] ?? 0;
  if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
    throw new ConvertToolsError("INVALID_ANGLE", "Minutes and seconds must be in [0, 60).");
  }
  if (parts.slice(1).some((part) => /^[+-]/.test(part))) {
    throw new ConvertToolsError("INVALID_ANGLE", "Only degrees may have a sign.");
  }

  const numericSign = degrees < 0 || Object.is(degrees, -0) ? -1 : 1;
  const hemisphereSign = /[SW]/.test(hemisphere ?? "") ? -1 : 1;
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

function splitRounded(value, secondDigits) {
  const totalSeconds = Math.round(Math.abs(value) * 3600 * 10 ** secondDigits);
  const scale = 10 ** secondDigits;
  const degrees = Math.floor(totalSeconds / (3600 * scale));
  const remainder = totalSeconds - degrees * 3600 * scale;
  const minutes = Math.floor(remainder / (60 * scale));
  const seconds = (remainder - minutes * 60 * scale) / scale;
  return { degrees, minutes, seconds };
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

export function formatDms(value, axis, secondDigits = 5) {
  validateAxisValue(value, axis);
  validateDigits(secondDigits);
  const { degrees, minutes, seconds } = splitRounded(value, secondDigits);
  const degreeWidth = axis === "longitude" ? 3 : 2;
  const hemisphere =
    axis === "latitude"
      ? value < 0
        ? "S"
        : "N"
      : value < 0
        ? "W"
        : "E";
  return `${String(degrees).padStart(degreeWidth, "0")}°${String(minutes).padStart(2, "0")}'${fixed(seconds, secondDigits).padStart(3 + secondDigits, "0")}"${hemisphere}`;
}

export function formatDdm(value, axis, minuteDigits = 7) {
  validateAxisValue(value, axis);
  validateDigits(minuteDigits);
  const scale = 10 ** minuteDigits;
  const totalMinutes = Math.round(Math.abs(value) * 60 * scale);
  const degrees = Math.floor(totalMinutes / (60 * scale));
  const minutes = (totalMinutes - degrees * 60 * scale) / scale;
  const degreeWidth = axis === "longitude" ? 3 : 2;
  const hemisphere =
    axis === "latitude"
      ? value < 0
        ? "S"
        : "N"
      : value < 0
        ? "W"
        : "E";
  return `${String(degrees).padStart(degreeWidth, "0")}°${fixed(minutes, minuteDigits).padStart(3 + minuteDigits, "0")}'${hemisphere}`;
}

export function parseCoordinatePair(latitude, longitude) {
  return validatePoint(
    parseAngle(latitude, "latitude"),
    parseAngle(longitude, "longitude"),
  );
}
