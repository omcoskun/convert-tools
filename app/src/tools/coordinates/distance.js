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

/**
 * The map marker for one point of the form, or null while the text is not a
 * coordinate in range. Only for drawing: the core parses the values again
 * (and stricter) when it measures.
 * @param {string} latitude
 * @param {string} longitude
 */
export function endpointFromText(latitude, longitude) {
  const read = (value) => (String(value).trim() === "" ? Number.NaN : Number(value));
  const lat = read(latitude);
  const lon = read(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: lat, longitude: lon };
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
