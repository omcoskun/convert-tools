import { WGS84 } from "../core/ellipsoid.js";
import {
  normalizeLongitude,
  parseCoordinateNumber,
  validatePoint,
} from "../core/numbers.js";
import { ConvertToolsError } from "../../errors.js";
import { createGeodesicModel } from "./geodesic-series.js";
import { solveInverse } from "./geodesic-inverse.js";
import { createGeodesicLine, positionOnLine } from "./geodesic-direct.js";

// `tolerance` and `maxIterations` are deprecated and ignored: Karney's
// algorithm converges quadratically and carries its own stopping rules. They
// stay in the options object and are validated exactly as before.
const DEFAULT_TOLERANCE = 1e-13;
const DEFAULT_MAX_ITERATIONS = 200;

// Models depend only on (a, f) and callers ask for many solutions on the same
// ellipsoid. The cache is bounded so that sweeping over ellipsoids cannot grow
// it without limit.
const MODEL_CACHE = new Map();
const MODEL_CACHE_LIMIT = 16;

function normalizeBearing(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function readPoint(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConvertToolsError("INVALID_ARGUMENT", `${name} must be a { latitude, longitude } object.`);
  }

  return validatePoint(
    parseCoordinateNumber(value.latitude, `${name}.latitude`),
    parseCoordinateNumber(value.longitude, `${name}.longitude`),
  );
}

function readEllipsoid(value) {
  const ellipsoid = value == null ? WGS84 : value;
  const a = Number(ellipsoid.a);
  const f = Number(ellipsoid.f);
  const b = Number(ellipsoid.b == null ? a * (1 - f) : ellipsoid.b);

  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    !Number.isFinite(f) ||
    a <= 0 ||
    b <= 0 ||
    f <= -1 ||
    f >= 1
  ) {
    throw new ConvertToolsError("INVALID_ARGUMENT", "Ellipsoid axes and flattening are invalid.");
  }

  return Object.freeze({
    id: ellipsoid.id == null ? "CUSTOM" : ellipsoid.id,
    a,
    b,
    f,
  });
}

function geodesicModelFor(ellipsoid) {
  const key = `${ellipsoid.a}:${ellipsoid.f}`;
  let model = MODEL_CACHE.get(key);
  if (model == null) {
    model = createGeodesicModel(ellipsoid.a, ellipsoid.f);
    if (MODEL_CACHE.size >= MODEL_CACHE_LIMIT) MODEL_CACHE.clear();
    MODEL_CACHE.set(key, model);
  }
  return model;
}

/**
 * The deprecated iteration options are still validated, and then ignored.
 * @param {import("../../types.js").GeodesicOptions} options
 */
function validateIterationOptions(options) {
  const tolerance =
    options.tolerance == null ? DEFAULT_TOLERANCE : options.tolerance;
  const maxIterations =
    options.maxIterations == null
      ? DEFAULT_MAX_ITERATIONS
      : options.maxIterations;

  if (
    !Number.isFinite(tolerance) ||
    tolerance <= 0 ||
    !Number.isInteger(maxIterations) ||
    maxIterations < 1
  ) {
    throw new ConvertToolsError("INVALID_ARGUMENT", "Geodesic iteration options are invalid.");
  }
}

// The contract's azimuth tolerance as an endpoint offset, |delta azi| *
// |m12| (all 500000 GeodTest rows meet it; the largest is 7.53e-8 m).
const AZIMUTH_ENDPOINT_TOLERANCE = 1e-7;
// Round-off of a well-conditioned azimuth (GeodTest: at most 1.6e-12°).
const BEARING_UNCERTAINTY_FLOOR = 1e-11;
// Round-off of S12, as a fraction of c^2: a few units in the last place of
// the area scale (0.41 m^2 on WGS 84).
const AREA_ROUND_OFF = 1e-14;

/**
 * How far an inverse result's azimuths and area may be from the exact ones.
 * Nearly antipodal (small |m12|), an endpoint offset e turns the geodesic by
 * about e / |m12| at its start (never more than a half turn). S12 then moves
 * by the area swept between the two geodesics, the turn in radians times the
 * integral of m(t) dt along the line: at most s12^2 / 2, since m(t) <= t on
 * an ellipsoid, and about 2 c^2 for a half meridian. Over all 500000 GeodTest
 * rows, the S12 error is at most 0.083 of this bound.
 * @param {number} m12 reduced length in metres
 * @param {number} s12 distance in metres
 * @param {number} c2 the ellipsoid's authalic radius squared
 */
function inverseUncertainties(m12, s12, c2) {
  const spread = (AZIMUTH_ENDPOINT_TOLERANCE / Math.abs(m12)) * (180 / Math.PI);
  const bearing = Math.min(180, Math.max(BEARING_UNCERTAINTY_FLOOR, spread));
  const swept = Math.min(2 * c2, (s12 * s12) / 2);
  return {
    bearingUncertaintyDegrees: bearing,
    areaUncertaintySquareMetres: bearing * (Math.PI / 180) * swept + AREA_ROUND_OFF * c2,
  };
}

function coincident(start, end) {
  return (
    start.latitude === end.latitude &&
    (Math.abs(start.latitude) === 90 ||
      Math.abs(normalizeLongitude(start.longitude - end.longitude)) === 0)
  );
}

/**
 * Ellipsoidal inverse problem: distance, azimuths, arc length, reduced
 * length, geodesic scales and area between two points, solved with Karney's
 * algorithm (GeographicLib Geodesic) to sixth order.
 * @param {import("../../types.js").GeoPoint} startValue
 * @param {import("../../types.js").GeoPoint} endValue
 * @param {import("../../types.js").GeodesicOptions} [options]
 * @returns {import("../../types.js").GeodesicResult}
 * @throws {import("../../errors.js").ConvertToolsError} INVALID_ARGUMENT,
 *   INVALID_NUMBER, LATITUDE_OUT_OF_RANGE, LONGITUDE_OUT_OF_RANGE
 */
export function inverseGeodesic(startValue, endValue, options = {}) {
  const start = readPoint(startValue, "start");
  const end = readPoint(endValue, "end");
  const ellipsoid = readEllipsoid(options.ellipsoid);
  validateIterationOptions(options);

  if (coincident(start, end)) {
    return Object.freeze({
      distanceMetres: 0,
      initialBearingDegrees: null,
      finalBearingDegrees: null,
      azimuthDefined: false,
      ambiguous: false,
      ellipsoid: ellipsoid.id,
      algorithm: "ellipsoidal",
      solver: "identity",
      iterations: 0,
      arcDegrees: 0,
      reducedLengthMetres: 0,
      geodesicScale12: 1,
      geodesicScale21: 1,
      areaSquareMetres: 0,
      bearingUncertaintyDegrees: null,
      areaUncertaintySquareMetres: null,
    });
  }

  const model = geodesicModelFor(ellipsoid);
  const solution = solveInverse(
    model,
    start.latitude,
    start.longitude,
    end.latitude,
    end.longitude,
  );

  return Object.freeze({
    distanceMetres: solution.distance,
    initialBearingDegrees: normalizeBearing(solution.azimuth1),
    finalBearingDegrees: normalizeBearing(solution.azimuth2),
    azimuthDefined: true,
    ambiguous: solution.ambiguous,
    ellipsoid: ellipsoid.id,
    algorithm: "ellipsoidal",
    solver: "karney-inverse",
    iterations: solution.iterations,
    arcDegrees: solution.a12,
    reducedLengthMetres: solution.m12,
    geodesicScale12: solution.M12,
    geodesicScale21: solution.M21,
    areaSquareMetres: solution.S12,
    ...inverseUncertainties(solution.m12, solution.distance, model.c2),
  });
}

/**
 * Ellipsoidal direct problem: end point after `distanceMetres` along
 * `initialBearingDegrees`, with the arc length, reduced length, geodesic
 * scales and area of that line, solved on a geodesic line (GeographicLib
 * GeodesicLine). `tolerance` and `maxIterations` are ignored.
 * @param {import("../../types.js").GeoPoint} startValue
 * @param {number | string} initialBearingDegreesValue
 * @param {number | string} distanceMetresValue non-negative
 * @param {import("../../types.js").GeodesicOptions} [options]
 * @returns {import("../../types.js").DirectGeodesicResult}
 * @throws {import("../../errors.js").ConvertToolsError} INVALID_ARGUMENT,
 *   INVALID_NUMBER, LATITUDE_OUT_OF_RANGE, LONGITUDE_OUT_OF_RANGE
 */
export function directGeodesic(
  startValue,
  initialBearingDegreesValue,
  distanceMetresValue,
  options = {},
) {
  const start = readPoint(startValue, "start");
  const initialBearingDegrees = parseCoordinateNumber(
    initialBearingDegreesValue,
    "initialBearingDegrees",
  );
  const distanceMetres = parseCoordinateNumber(
    distanceMetresValue,
    "distanceMetres",
  );
  if (distanceMetres < 0) {
    throw new ConvertToolsError("INVALID_ARGUMENT", "distanceMetres must not be negative.");
  }
  const ellipsoid = readEllipsoid(options.ellipsoid);

  if (distanceMetres === 0) {
    return Object.freeze({
      latitude: start.latitude,
      longitude: start.longitude,
      finalBearingDegrees: normalizeBearing(initialBearingDegrees),
      ellipsoid: ellipsoid.id,
      algorithm: "karney-direct",
      iterations: 0,
      arcDegrees: 0,
      reducedLengthMetres: 0,
      geodesicScale12: 1,
      geodesicScale21: 1,
      areaSquareMetres: 0,
    });
  }

  const line = createGeodesicLine(
    geodesicModelFor(ellipsoid),
    start.latitude,
    start.longitude,
    initialBearingDegrees,
  );
  const position = positionOnLine(line, distanceMetres);

  return Object.freeze({
    latitude: position.latitude,
    longitude: normalizeLongitude(position.longitude),
    finalBearingDegrees: normalizeBearing(position.finalBearingDegrees),
    ellipsoid: ellipsoid.id,
    algorithm: "karney-direct",
    iterations: 0,
    arcDegrees: position.a12,
    reducedLengthMetres: 0 + position.m12,
    geodesicScale12: position.M12,
    geodesicScale21: position.M21,
    areaSquareMetres: 0 + position.S12,
  });
}
