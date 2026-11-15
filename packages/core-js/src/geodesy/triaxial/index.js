/**
 * Public API for geodesics on a triaxial ellipsoid X²/a² + Y²/b² + Z²/c² = 1
 * (a >= b >= c > 0). Positions are the ellipsoidal latitude beta and
 * longitude omega in degrees, headings are clockwise from a line of constant
 * omega in degrees, lengths are in the unit of the semiaxes.
 * See docs/TRIAXIAL_VALIDATION.md for the method and its validation.
 * @module
 */
import { ConvertToolsError } from "../../errors.js";
import { parseCoordinateNumber } from "../core/numbers.js";
import { angle, cartToEllip, createTriaxialModel, degreesOf, ellipToCart } from "./ellipsoid3.js";
import { solveTriaxialDirect, solveTriaxialInverse } from "./geodesic3.js";

function readModel(options) {
  if (!options || typeof options !== "object") {
    throw new ConvertToolsError("INVALID_ARGUMENT", "options.ellipsoid { a, b, c } is required.");
  }
  return createTriaxialModel(options.ellipsoid);
}

function readPoint(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConvertToolsError("INVALID_ARGUMENT", `${name} must be a { beta, omega } object.`);
  }
  const beta = parseCoordinateNumber(value.beta, `${name}.beta`);
  const omega = parseCoordinateNumber(value.omega, `${name}.omega`);
  if (beta < -90 || beta > 90) {
    throw new ConvertToolsError("LATITUDE_OUT_OF_RANGE", `${name}.beta must be between -90 and 90.`);
  }
  if (omega < -180 || omega > 180) {
    throw new ConvertToolsError("LONGITUDE_OUT_OF_RANGE", `${name}.omega must be between -180 and 180.`);
  }
  return { bet: angle(beta), omg: angle(omega) };
}

/** Degrees in [0, 360). */
function heading(pair) {
  const degrees = degreesOf(pair);
  return degrees < 0 ? degrees + 360 : 0 + degrees;
}

/**
 * Cartesian position of an ellipsoidal (beta, omega).
 * @param {import("../../types.js").TriaxialPoint} pointValue
 * @param {import("../../types.js").TriaxialOptions} options
 * @returns {{ x: number, y: number, z: number }}
 * @throws {import("../../errors.js").ConvertToolsError} INVALID_ARGUMENT,
 *   INVALID_NUMBER, LATITUDE_OUT_OF_RANGE, LONGITUDE_OUT_OF_RANGE
 */
export function triaxialToCartesian(pointValue, options) {
  const model = readModel(options);
  const point = readPoint(pointValue, "point");
  const [x, y, z] = ellipToCart(model, point.bet, point.omg);
  return Object.freeze({ x: 0 + x, y: 0 + y, z: 0 + z });
}

/**
 * Ellipsoidal (beta, omega) of a Cartesian position. A point off the surface
 * is first moved along the line through the centre onto the surface. The
 * result has beta in [-90, 90] and omega in (-180, 180].
 * @param {{ x: number | string, y: number | string, z: number | string }} pointValue
 * @param {import("../../types.js").TriaxialOptions} options
 * @returns {import("../../types.js").TriaxialPoint}
 * @throws {import("../../errors.js").ConvertToolsError} INVALID_ARGUMENT,
 *   INVALID_NUMBER
 */
export function cartesianToTriaxial(pointValue, options) {
  const model = readModel(options);
  if (!pointValue || typeof pointValue !== "object" || Array.isArray(pointValue)) {
    throw new ConvertToolsError("INVALID_ARGUMENT", "point must be an { x, y, z } object.");
  }
  const x = parseCoordinateNumber(pointValue.x, "point.x");
  const y = parseCoordinateNumber(pointValue.y, "point.y");
  const z = parseCoordinateNumber(pointValue.z, "point.z");
  const scale = Math.hypot(x / model.a, y / model.b, z / model.c);
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new ConvertToolsError("INVALID_ARGUMENT", "point must not be the centre of the ellipsoid.");
  }
  const [bet, omg] = cartToEllip(model, [x / scale, y / scale, z / scale]);
  return Object.freeze({ beta: 0 + degreesOf(bet), omega: 0 + degreesOf(omg) });
}

/**
 * Inverse problem: the shortest geodesic between two points. For coincident
 * points the distance is 0 and both headings are null.
 * @param {import("../../types.js").TriaxialPoint} startValue
 * @param {import("../../types.js").TriaxialPoint} endValue
 * @param {import("../../types.js").TriaxialOptions} options
 * @returns {import("../../types.js").TriaxialInverseResult}
 * @throws {import("../../errors.js").ConvertToolsError} INVALID_ARGUMENT,
 *   INVALID_NUMBER, LATITUDE_OUT_OF_RANGE, LONGITUDE_OUT_OF_RANGE,
 *   NO_CONVERGENCE
 */
export function inverseTriaxialGeodesic(startValue, endValue, options) {
  const model = readModel(options);
  const start = readPoint(startValue, "start");
  const end = readPoint(endValue, "end");
  const solution = solveTriaxialInverse(model, start.bet, start.omg, end.bet, end.omg);
  if (solution === null) {
    throw new ConvertToolsError("NO_CONVERGENCE", "No geodesic between the points was found.");
  }
  const defined = solution.s12 > 0;
  return Object.freeze({
    distance: solution.s12,
    initialAzimuthDegrees: defined ? heading(solution.alp1) : null,
    finalAzimuthDegrees: defined ? heading(solution.alp2) : null,
    reducedLength: 0 + solution.m12,
    geodesicScale12: solution.M12,
    geodesicScale21: solution.M21,
  });
}

/**
 * Direct problem: the end of the geodesic of length `distanceValue` leaving
 * `startValue` on heading `azimuthDegreesValue`.
 * @param {import("../../types.js").TriaxialPoint} startValue
 * @param {number | string} azimuthDegreesValue
 * @param {number | string} distanceValue non-negative
 * @param {import("../../types.js").TriaxialOptions} options
 * @returns {import("../../types.js").TriaxialDirectResult}
 * @throws {import("../../errors.js").ConvertToolsError} INVALID_ARGUMENT,
 *   INVALID_NUMBER, LATITUDE_OUT_OF_RANGE, LONGITUDE_OUT_OF_RANGE
 */
export function directTriaxialGeodesic(startValue, azimuthDegreesValue, distanceValue, options) {
  const model = readModel(options);
  const start = readPoint(startValue, "start");
  const azimuth = parseCoordinateNumber(azimuthDegreesValue, "azimuthDegrees");
  const distance = parseCoordinateNumber(distanceValue, "distance");
  if (distance < 0) {
    throw new ConvertToolsError("INVALID_ARGUMENT", "distance must not be negative.");
  }
  const solution = solveTriaxialDirect(model, start.bet, start.omg, angle(azimuth), distance);
  return Object.freeze({
    beta: 0 + degreesOf(solution.bet2),
    omega: 0 + degreesOf(solution.omg2),
    finalAzimuthDegrees: heading(solution.alp2),
    reducedLength: 0 + solution.m12,
    geodesicScale12: solution.M12,
    geodesicScale21: solution.M21,
  });
}
