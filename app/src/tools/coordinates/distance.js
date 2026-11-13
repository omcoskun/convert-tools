// Plain helper for the distance tool. The geodesic, its sampled points and
// the unit conversions all come from @convert-tools/core.

import { convertLength, sampleGeodesicPath } from "@convert-tools/core";

/**
 * Runs the core: sampled geodesic plus the distance in three length units.
 * @param {{ startLatitude: string, startLongitude: string, endLatitude: string, endLongitude: string }} values
 * @param {{ maxSegmentMetres?: number, maxPoints?: number }} pathOptions
 */
export function measure(values, pathOptions) {
  const path = sampleGeodesicPath(
    { latitude: values.startLatitude, longitude: values.startLongitude },
    { latitude: values.endLatitude, longitude: values.endLongitude },
    pathOptions,
  );
  const metres = String(path.distanceMetres);
  return {
    path,
    metres: convertLength(metres, "metre", "metre", 3).value,
    kilometres: convertLength(metres, "metre", "kilometre", 9).value,
    nauticalMiles: convertLength(metres, "metre", "nautical-mile", 9).value,
  };
}

export const EMPTY_POINTS = Object.freeze({
  startLatitude: "",
  startLongitude: "",
  endLatitude: "",
  endLongitude: "",
});

const isBlank = (value) => String(value ?? "").trim() === "";
const readNumber = (value) => (isBlank(value) ? Number.NaN : Number(value));

/**
 * The map marker for one point of the form, or null while the text is not a
 * coordinate in range. Only for drawing and form hints: the core parses the
 * values again (and stricter) when it measures.
 * @param {string} latitude
 * @param {string} longitude
 */
export function endpointFromText(latitude, longitude) {
  const lat = readNumber(latitude);
  const lon = readNumber(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: lat, longitude: lon };
}

/** The marker of point "start" or "end" of the form values, or null. */
export function endpointOf(values, target) {
  return endpointFromText(values[`${target}Latitude`], values[`${target}Longitude`]);
}

/**
 * True when a typed latitude or longitude can never be valid (not a number
 * or out of range). An empty field is not invalid, only incomplete.
 * @param {string} value
 * @param {"latitude" | "longitude"} axis
 */
export function fieldIsInvalid(value, axis) {
  if (isBlank(value)) return false;
  const number = readNumber(value);
  return !Number.isFinite(number) || Math.abs(number) > (axis === "latitude" ? 90 : 180);
}

/** "empty", "incomplete" (one field missing), "invalid" or "valid". */
export function endpointStatus(values, target) {
  const latitude = values[`${target}Latitude`];
  const longitude = values[`${target}Longitude`];
  if (fieldIsInvalid(latitude, "latitude") || fieldIsInvalid(longitude, "longitude")) return "invalid";
  if (isBlank(latitude) && isBlank(longitude)) return "empty";
  if (isBlank(latitude) || isBlank(longitude)) return "incomplete";
  return "valid";
}

/** Form values with the start and end points exchanged. */
export function swapEndpoints(values) {
  return {
    startLatitude: values.endLatitude,
    startLongitude: values.endLongitude,
    endLatitude: values.startLatitude,
    endLongitude: values.startLongitude,
  };
}

/**
 * A plain decimal string grouped for reading, without going through floats:
 * "1234567.5" -> "1.234.567,50" (tr) or "1,234,567.50" (en) for 2 decimals.
 * @param {string} value
 * @param {number} decimals
 * @param {string} language
 */
export function localeDecimal(value, decimals, language) {
  const negative = value.startsWith("-");
  const [integer, fraction = ""] = value.replace("-", "").split(".");
  const turkish = language === "tr";
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, turkish ? "." : ",");
  const digits = decimals > 0 ? fraction.padEnd(decimals, "0").slice(0, decimals) : "";
  return `${negative ? "−" : ""}${grouped}${digits ? (turkish ? "," : ".") + digits : ""}`;
}

/**
 * A distance in metres shown in another unit, rounded by the core.
 * @param {number} metres
 * @param {string} unit length unit id of the core
 * @param {number} decimals
 * @param {string} language
 */
export function displayDistance(metres, unit, decimals, language) {
  return localeDecimal(convertLength(String(metres), "metre", unit, decimals).value, decimals, language);
}
