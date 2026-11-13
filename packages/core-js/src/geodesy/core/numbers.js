import { ConvertToolsError } from "../../errors.js";

export const DEGREE = Math.PI / 180;
export const RADIAN = 180 / Math.PI;

export function parseCoordinateNumber(value, name) {
  const source = String(value).trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(source)) {
    throw new ConvertToolsError("INVALID_NUMBER", `${name} is not a valid number.`);
  }

  const result = Number(source);
  if (!Number.isFinite(result)) {
    throw new ConvertToolsError("INVALID_NUMBER", `${name} is not finite.`);
  }
  return result;
}

export function validatePoint(latitude, longitude) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ConvertToolsError("LATITUDE_OUT_OF_RANGE", "Latitude must be between -90 and 90.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ConvertToolsError("LONGITUDE_OUT_OF_RANGE", "Longitude must be between -180 and 180.");
  }
  return { latitude, longitude };
}

export function pointFromValues(latitude, longitude) {
  return validatePoint(
    parseCoordinateNumber(latitude, "Latitude"),
    parseCoordinateNumber(longitude, "Longitude"),
  );
}

export function normalizeLongitude(longitude) {
  if (longitude >= -180 && longitude <= 180) {
    return longitude;
  }

  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 && longitude > 0 ? 180 : normalized;
}

export function fixed(value, digits) {
  const normalized = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return normalized.toFixed(digits);
}

export function compactNumber(value, digits = 10) {
  return fixed(value, digits)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}
