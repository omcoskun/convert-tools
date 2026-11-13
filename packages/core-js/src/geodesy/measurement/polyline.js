import { inverseGeodesic } from "./geodesic.js";
import { ConvertToolsError } from "../../errors.js";

function compensatedSum(values) {
  let sum = 0;
  let compensation = 0;

  for (const value of values) {
    const next = sum + value;
    compensation +=
      Math.abs(sum) >= Math.abs(value)
        ? sum - next + value
        : value - next + sum;
    sum = next;
  }

  return sum + compensation;
}

export function measureGeodesicPolyline(points, options = {}) {
  if (!Array.isArray(points)) {
    throw new ConvertToolsError("INVALID_ARGUMENT", "points must be an array.");
  }

  if (points.length < 2) {
    return Object.freeze({
      distanceMetres: 0,
      segmentCount: 0,
      ellipsoid: options.ellipsoid?.id ?? "WGS84",
      algorithm: "ellipsoidal-segments",
      segments: Object.freeze([]),
    });
  }

  const segments = [];
  for (let index = 1; index < points.length; index += 1) {
    segments.push(inverseGeodesic(points[index - 1], points[index], options));
  }

  return Object.freeze({
    distanceMetres: compensatedSum(
      segments.map((segment) => segment.distanceMetres),
    ),
    segmentCount: segments.length,
    ellipsoid: segments[0].ellipsoid,
    algorithm: "ellipsoidal-segments",
    segments: Object.freeze(segments),
  });
}
