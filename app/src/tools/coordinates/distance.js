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
