import {
  parseCoordinateNumber,
  validatePoint,
} from "../core/numbers.js";
import { directGeodesic, inverseGeodesic } from "./geodesic.js";
import { ConvertToolsError } from "../../errors.js";

const DEFAULT_MAX_SEGMENT_METRES = 25000;
const DEFAULT_MAX_POINTS = 2049;
const MAX_POINTS_LIMIT = 10001;

function readPoint(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConvertToolsError("INVALID_ARGUMENT", `${name} must be a { latitude, longitude } object.`);
  }

  return validatePoint(
    parseCoordinateNumber(value.latitude, `${name}.latitude`),
    parseCoordinateNumber(value.longitude, `${name}.longitude`),
  );
}

function freezePoint(point) {
  return Object.freeze({
    latitude: point.latitude,
    longitude: point.longitude,
  });
}

/**
 * Samples the same shortest WGS 84 geodesic returned by inverseGeodesic.
 * The vertices are intended for rendering; they never replace the measured
 * distance returned by the inverse solution.
 */
export function sampleGeodesicPath(startValue, endValue, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new ConvertToolsError("INVALID_ARGUMENT", "options must be an object.");
  }

  const {
    maxSegmentMetres = DEFAULT_MAX_SEGMENT_METRES,
    maxPoints = DEFAULT_MAX_POINTS,
    ...geodesicOptions
  } = options;

  if (!Number.isFinite(maxSegmentMetres) || maxSegmentMetres <= 0) {
    throw new ConvertToolsError("INVALID_ARGUMENT", "maxSegmentMetres must be finite and greater than zero.");
  }
  if (
    !Number.isInteger(maxPoints) ||
    maxPoints < 2 ||
    maxPoints > MAX_POINTS_LIMIT
  ) {
    throw new ConvertToolsError("INVALID_ARGUMENT",
      `maxPoints must be an integer between 2 and ${MAX_POINTS_LIMIT}.`,
    );
  }

  const start = readPoint(startValue, "start");
  const end = readPoint(endValue, "end");
  const measurement = inverseGeodesic(start, end, geodesicOptions);

  if (measurement.distanceMetres === 0) {
    return Object.freeze({
      ...measurement,
      points: Object.freeze([freezePoint(start)]),
      segmentCount: 0,
      sampledMaximumSegmentMetres: 0,
    });
  }

  const requestedSegmentCount = Math.max(
    1,
    Math.ceil(measurement.distanceMetres / maxSegmentMetres),
  );
  const segmentCount = Math.min(requestedSegmentCount, maxPoints - 1);
  const points = [freezePoint(start)];

  for (let index = 1; index < segmentCount; index += 1) {
    const point = directGeodesic(
      start,
      measurement.initialBearingDegrees,
      (measurement.distanceMetres * index) / segmentCount,
      geodesicOptions,
    );
    points.push(freezePoint(point));
  }
  points.push(freezePoint(end));

  return Object.freeze({
    ...measurement,
    points: Object.freeze(points),
    segmentCount,
    sampledMaximumSegmentMetres:
      measurement.distanceMetres / segmentCount,
  });
}
