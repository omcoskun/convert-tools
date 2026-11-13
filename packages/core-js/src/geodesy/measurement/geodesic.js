import { DEGREE, RADIAN, WGS84 } from "../core/ellipsoid.js";
import {
  normalizeLongitude,
  parseCoordinateNumber,
  validatePoint,
} from "../core/numbers.js";
import { ConvertToolsError } from "../../errors.js";

const DEFAULT_TOLERANCE = 1e-13;
const DEFAULT_MAX_ITERATIONS = 200;
const SHOOTING_TOLERANCE = 2e-15;
const INVERSE_ENDPOINT_TOLERANCE = 5e-12;
// Below 0.1 mm, truncated-series noise cannot safely rank cut-locus routes.
const SHORTEST_DISTANCE_TIE_METRES = 1e-4;
const AMBIGUOUS_BEARING_SEPARATION_RADIANS = 1e-6;
const CUT_LOCUS_DERIVATIVE_STEP_RADIANS = 1e-5;
const CUT_LOCUS_SENSITIVITY_METRES = 1;
const MAX_SHORTEST_DISTANCE_FACTOR = Math.PI * 1.01;

function normalizeBearing(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function normalizeRadians(radians) {
  if (radians >= -Math.PI && radians <= Math.PI) {
    return radians;
  }

  return ((radians + Math.PI) % (2 * Math.PI) + 2 * Math.PI) %
    (2 * Math.PI) -
    Math.PI;
}

function convergedRadians(previous, next, tolerance) {
  const scale = Math.min(
    1,
    Math.max(Math.abs(next), tolerance),
  );
  return Math.abs(next - previous) <= tolerance * scale;
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

function coincident(start, end) {
  return (
    start.latitude === end.latitude &&
    (Math.abs(start.latitude) === 90 ||
      Math.abs(normalizeLongitude(start.longitude - end.longitude)) === 0)
  );
}

function exactAntipodes(start, end) {
  const oppositePoles =
    Math.abs(start.latitude) === 90 &&
    end.latitude === -start.latitude;

  return (
    oppositePoles ||
    (Math.abs(start.latitude + end.latitude) <= 1e-13 &&
      Math.abs(
        Math.abs(normalizeLongitude(end.longitude - start.longitude)) - 180,
      ) <= 1e-13)
  );
}

function inverseVincenty(start, end, ellipsoid, tolerance, maxIterations) {
  const { a, b, f } = ellipsoid;
  const latitude1 = start.latitude * DEGREE;
  const latitude2 = end.latitude * DEGREE;
  const longitudeDifference =
    normalizeLongitude(end.longitude - start.longitude) * DEGREE;
  const reducedLatitude1 = Math.atan((1 - f) * Math.tan(latitude1));
  const reducedLatitude2 = Math.atan((1 - f) * Math.tan(latitude2));
  const sinReduced1 = Math.sin(reducedLatitude1);
  const cosReduced1 = Math.cos(reducedLatitude1);
  const sinReduced2 = Math.sin(reducedLatitude2);
  const cosReduced2 = Math.cos(reducedLatitude2);
  let lambda = longitudeDifference;
  let iterations = 0;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let sinAlpha = 0;
  let cosSquaredAlpha = 0;
  let cosDoubleSigmaMiddle = 0;

  for (; iterations < maxIterations; iterations += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    const first =
      cosReduced2 * sinLambda;
    const second =
      cosReduced1 * sinReduced2 -
      sinReduced1 * cosReduced2 * cosLambda;
    sinSigma = Math.hypot(first, second);
    if (sinSigma === 0) {
      return null;
    }

    cosSigma =
      sinReduced1 * sinReduced2 +
      cosReduced1 * cosReduced2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha =
      (cosReduced1 * cosReduced2 * sinLambda) / sinSigma;
    cosSquaredAlpha = Math.max(0, 1 - sinAlpha * sinAlpha);
    cosDoubleSigmaMiddle =
      cosSquaredAlpha <= Number.EPSILON
        ? 0
        : cosSigma -
          (2 * sinReduced1 * sinReduced2) / cosSquaredAlpha;
    const coefficient =
      (f / 16) *
      cosSquaredAlpha *
      (4 + f * (4 - 3 * cosSquaredAlpha));
    const nextLambda =
      longitudeDifference +
      (1 - coefficient) *
        f *
        sinAlpha *
        (sigma +
          coefficient *
            sinSigma *
            (cosDoubleSigmaMiddle +
              coefficient *
                cosSigma *
                (-1 + 2 * cosDoubleSigmaMiddle ** 2)));

    if (convergedRadians(lambda, nextLambda, tolerance)) {
      lambda = nextLambda;
      break;
    }
    lambda = nextLambda;
  }

  if (iterations >= maxIterations) {
    return null;
  }

  const squaredU =
    (cosSquaredAlpha * (a * a - b * b)) / (b * b);
  const coefficientA =
    1 +
    (squaredU / 16384) *
      (4096 +
        squaredU * (-768 + squaredU * (320 - 175 * squaredU)));
  const coefficientB =
    (squaredU / 1024) *
    (256 + squaredU * (-128 + squaredU * (74 - 47 * squaredU)));
  const deltaSigma =
    coefficientB *
    sinSigma *
    (cosDoubleSigmaMiddle +
      (coefficientB / 4) *
        (cosSigma *
          (-1 + 2 * cosDoubleSigmaMiddle ** 2) -
          (coefficientB / 6) *
            cosDoubleSigmaMiddle *
            (-3 + 4 * sinSigma ** 2) *
            (-3 + 4 * cosDoubleSigmaMiddle ** 2)));
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);
  const initialBearing = Math.atan2(
    cosReduced2 * sinLambda,
    cosReduced1 * sinReduced2 -
      sinReduced1 * cosReduced2 * cosLambda,
  );
  const finalBearing = Math.atan2(
    cosReduced1 * sinLambda,
    -sinReduced1 * cosReduced2 +
      cosReduced1 * sinReduced2 * cosLambda,
  );

  return {
    distanceMetres: b * coefficientA * (sigma - deltaSigma),
    initialBearingDegrees: normalizeBearing(initialBearing * RADIAN),
    finalBearingDegrees: normalizeBearing(finalBearing * RADIAN),
    ambiguous: false,
    iterations: iterations + 1,
  };
}

function directVincentyRaw(
  start,
  initialBearingRadians,
  distanceMetres,
  ellipsoid,
  tolerance = DEFAULT_TOLERANCE,
  maxIterations = DEFAULT_MAX_ITERATIONS,
) {
  const { a, b, f } = ellipsoid;
  const latitude1 = start.latitude * DEGREE;
  const longitude1 = start.longitude * DEGREE;
  const reducedLatitude1 = Math.atan((1 - f) * Math.tan(latitude1));
  const sinReduced1 = Math.sin(reducedLatitude1);
  const cosReduced1 = Math.cos(reducedLatitude1);
  const sinBearing = Math.sin(initialBearingRadians);
  const cosBearing = Math.cos(initialBearingRadians);
  const sigma1 = Math.atan2(
    Math.tan(reducedLatitude1),
    cosBearing,
  );
  const sinAlpha = cosReduced1 * sinBearing;
  const cosSquaredAlpha = Math.max(0, 1 - sinAlpha * sinAlpha);
  const squaredU =
    (cosSquaredAlpha * (a * a - b * b)) / (b * b);
  const coefficientA =
    1 +
    (squaredU / 16384) *
      (4096 +
        squaredU * (-768 + squaredU * (320 - 175 * squaredU)));
  const coefficientB =
    (squaredU / 1024) *
    (256 + squaredU * (-128 + squaredU * (74 - 47 * squaredU)));
  let sigma = distanceMetres / (b * coefficientA);
  let previous = Number.POSITIVE_INFINITY;
  let iterations = 0;
  let cosDoubleSigmaMiddle = 0;
  let sinSigma = 0;
  let cosSigma = 1;

  for (; iterations < maxIterations; iterations += 1) {
    cosDoubleSigmaMiddle = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    const deltaSigma =
      coefficientB *
      sinSigma *
      (cosDoubleSigmaMiddle +
        (coefficientB / 4) *
          (cosSigma *
            (-1 + 2 * cosDoubleSigmaMiddle ** 2) -
            (coefficientB / 6) *
              cosDoubleSigmaMiddle *
              (-3 + 4 * sinSigma ** 2) *
              (-3 + 4 * cosDoubleSigmaMiddle ** 2)));
    previous = sigma;
    sigma = distanceMetres / (b * coefficientA) + deltaSigma;
    if (convergedRadians(previous, sigma, tolerance)) {
      break;
    }
  }

  if (iterations >= maxIterations) {
    throw new ConvertToolsError("NO_CONVERGENCE", "Direct geodesic calculation did not converge.");
  }

  sinSigma = Math.sin(sigma);
  cosSigma = Math.cos(sigma);
  cosDoubleSigmaMiddle = Math.cos(2 * sigma1 + sigma);
  const temporary =
    sinReduced1 * sinSigma -
    cosReduced1 * cosSigma * cosBearing;
  const latitude2 = Math.atan2(
    sinReduced1 * cosSigma +
      cosReduced1 * sinSigma * cosBearing,
    (1 - f) * Math.hypot(sinAlpha, temporary),
  );
  const lambda = Math.atan2(
    sinSigma * sinBearing,
    cosReduced1 * cosSigma -
      sinReduced1 * sinSigma * cosBearing,
  );
  const coefficient =
    (f / 16) *
    cosSquaredAlpha *
    (4 + f * (4 - 3 * cosSquaredAlpha));
  const longitudeCorrection =
    lambda -
    (1 - coefficient) *
      f *
      sinAlpha *
      (sigma +
        coefficient *
          sinSigma *
          (cosDoubleSigmaMiddle +
            coefficient *
              cosSigma *
              (-1 + 2 * cosDoubleSigmaMiddle ** 2)));
  const longitude2 = normalizeRadians(longitude1 + longitudeCorrection);
  const finalBearing = Math.atan2(sinAlpha, -temporary);

  return {
    latitudeRadians: latitude2,
    longitudeRadians: longitude2,
    finalBearingRadians: finalBearing,
    iterations: iterations + 1,
  };
}

function endpointResidual(endpoint, targetLatitude, targetLongitude) {
  const latitude = endpoint.latitudeRadians;
  const longitudeDifference = normalizeRadians(
    endpoint.longitudeRadians - targetLongitude,
  );
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const sinTarget = Math.sin(targetLatitude);
  const cosTarget = Math.cos(targetLatitude);

  return [
    cosLatitude * Math.sin(longitudeDifference),
    sinLatitude * cosTarget -
      cosLatitude * sinTarget * Math.cos(longitudeDifference),
  ];
}

function residualNorm(residual) {
  return Math.hypot(residual[0], residual[1]);
}

function inverseEndpointMatches(start, end, result, ellipsoid) {
  const endpoint = directVincentyRaw(
    start,
    result.initialBearingDegrees * DEGREE,
    result.distanceMetres,
    ellipsoid,
  );
  const residual = endpointResidual(
    endpoint,
    end.latitude * DEGREE,
    end.longitude * DEGREE,
  );
  return residualNorm(residual) <= INVERSE_ENDPOINT_TOLERANCE;
}

function validatedVincentyInverse(start, end, candidate, ellipsoid) {
  if (!candidate) {
    return null;
  }
  if (inverseEndpointMatches(start, end, candidate, ellipsoid)) {
    return candidate;
  }

  // Vincenty's fixed point can converge on the conjugate 90°/270° branch.
  // Accept that branch only after a direct endpoint closure check.
  const oppositeInitialBearing = normalizeBearing(
    candidate.initialBearingDegrees + 180,
  );
  const endpoint = directVincentyRaw(
    start,
    oppositeInitialBearing * DEGREE,
    candidate.distanceMetres,
    ellipsoid,
  );
  const residual = endpointResidual(
    endpoint,
    end.latitude * DEGREE,
    end.longitude * DEGREE,
  );
  if (residualNorm(residual) > INVERSE_ENDPOINT_TOLERANCE) {
    return null;
  }

  return {
    ...candidate,
    initialBearingDegrees: oppositeInitialBearing,
    finalBearingDegrees: normalizeBearing(
      endpoint.finalBearingRadians * RADIAN,
    ),
  };
}

function sphericalSeed(start, end, ellipsoid) {
  const latitude1 = start.latitude * DEGREE;
  const latitude2 = end.latitude * DEGREE;
  const longitudeDifference =
    normalizeLongitude(end.longitude - start.longitude) * DEGREE;
  const sinLatitudeDifference = Math.sin((latitude2 - latitude1) / 2);
  const sinLongitudeDifference = Math.sin(longitudeDifference / 2);
  const haversine =
    sinLatitudeDifference ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      sinLongitudeDifference ** 2;
  const centralAngle =
    2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
  const bearing = Math.atan2(
    Math.sin(longitudeDifference) * Math.cos(latitude2),
    Math.cos(latitude1) * Math.sin(latitude2) -
      Math.sin(latitude1) *
        Math.cos(latitude2) *
        Math.cos(longitudeDifference),
  );
  const meanRadius = (2 * ellipsoid.a + ellipsoid.b) / 3;
  return {
    bearing: Number.isFinite(bearing) ? bearing : 0,
    scaledDistance: (centralAngle * meanRadius) / ellipsoid.a,
    centralAngle,
  };
}

function solveShootingSeed(
  start,
  targetLatitude,
  targetLongitude,
  ellipsoid,
  initialBearing,
  initialScaledDistance,
) {
  let bearing = normalizeRadians(initialBearing);
  let scaledDistance = Math.min(
    MAX_SHORTEST_DISTANCE_FACTOR,
    Math.max(0, initialScaledDistance),
  );
  let endpoint = directVincentyRaw(
    start,
    bearing,
    scaledDistance * ellipsoid.a,
    ellipsoid,
  );
  let residual = endpointResidual(endpoint, targetLatitude, targetLongitude);
  let norm = residualNorm(residual);
  const derivativeStep = 2e-6;

  for (let iteration = 0; iteration < 60; iteration += 1) {
    if (norm <= SHOOTING_TOLERANCE) {
      return {
        endpoint,
        bearing,
        distanceMetres: scaledDistance * ellipsoid.a,
        residual: norm,
        iterations: iteration + 1,
      };
    }

    const bearingPlus = directVincentyRaw(
      start,
      bearing + derivativeStep,
      scaledDistance * ellipsoid.a,
      ellipsoid,
    );
    const bearingMinus = directVincentyRaw(
      start,
      bearing - derivativeStep,
      scaledDistance * ellipsoid.a,
      ellipsoid,
    );
    const distancePlus = directVincentyRaw(
      start,
      bearing,
      (scaledDistance + derivativeStep) * ellipsoid.a,
      ellipsoid,
    );
    const distanceMinus = directVincentyRaw(
      start,
      bearing,
      Math.max(0, scaledDistance - derivativeStep) * ellipsoid.a,
      ellipsoid,
    );
    const residualBearingPlus = endpointResidual(
      bearingPlus,
      targetLatitude,
      targetLongitude,
    );
    const residualBearingMinus = endpointResidual(
      bearingMinus,
      targetLatitude,
      targetLongitude,
    );
    const residualDistancePlus = endpointResidual(
      distancePlus,
      targetLatitude,
      targetLongitude,
    );
    const residualDistanceMinus = endpointResidual(
      distanceMinus,
      targetLatitude,
      targetLongitude,
    );
    const distanceDenominator =
      scaledDistance < derivativeStep
        ? scaledDistance + derivativeStep
        : 2 * derivativeStep;
    const j00 =
      (residualBearingPlus[0] - residualBearingMinus[0]) /
      (2 * derivativeStep);
    const j10 =
      (residualBearingPlus[1] - residualBearingMinus[1]) /
      (2 * derivativeStep);
    const j01 =
      (residualDistancePlus[0] - residualDistanceMinus[0]) /
      distanceDenominator;
    const j11 =
      (residualDistancePlus[1] - residualDistanceMinus[1]) /
      distanceDenominator;
    const determinant = j00 * j11 - j01 * j10;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-15) {
      break;
    }

    let bearingStep =
      (-residual[0] * j11 + j01 * residual[1]) / determinant;
    let distanceStep =
      (-j00 * residual[1] + residual[0] * j10) / determinant;
    bearingStep = Math.max(-0.75, Math.min(0.75, bearingStep));
    distanceStep = Math.max(-0.75, Math.min(0.75, distanceStep));

    let accepted = false;
    for (let damping = 1; damping >= 1 / 1024; damping /= 2) {
      const candidateBearing = normalizeRadians(
        bearing + bearingStep * damping,
      );
      const candidateDistance = Math.min(
        MAX_SHORTEST_DISTANCE_FACTOR,
        Math.max(0, scaledDistance + distanceStep * damping),
      );
      const candidateEndpoint = directVincentyRaw(
        start,
        candidateBearing,
        candidateDistance * ellipsoid.a,
        ellipsoid,
      );
      const candidateResidual = endpointResidual(
        candidateEndpoint,
        targetLatitude,
        targetLongitude,
      );
      const candidateNorm = residualNorm(candidateResidual);
      if (candidateNorm < norm) {
        bearing = candidateBearing;
        scaledDistance = candidateDistance;
        endpoint = candidateEndpoint;
        residual = candidateResidual;
        norm = candidateNorm;
        accepted = true;
        break;
      }
    }

    if (!accepted) {
      break;
    }
  }

  return null;
}

function inverseByShooting(start, end, ellipsoid) {
  const targetLatitude = end.latitude * DEGREE;
  const targetLongitude = end.longitude * DEGREE;
  const seed = sphericalSeed(start, end, ellipsoid);
  const bearings = [seed.bearing];
  const nearAntipodal = Math.PI - seed.centralAngle < 0.15;

  if (nearAntipodal) {
    for (let degree = -180; degree < 180; degree += 15) {
      bearings.push(degree * DEGREE);
    }
    for (const offsetDegrees of [0.01, 0.1, 1]) {
      const offset = offsetDegrees * DEGREE;
      bearings.push(seed.bearing - offset, seed.bearing + offset);
    }
  } else {
    bearings.push(
      seed.bearing - Math.PI / 3,
      seed.bearing + Math.PI / 3,
    );
  }

  const distanceSeeds = [
    seed.scaledDistance,
    (seed.centralAngle * ellipsoid.b) / ellipsoid.a,
  ];
  if (nearAntipodal) {
    distanceSeeds.push(
      (Math.PI * ellipsoid.b) / ellipsoid.a,
      (Math.PI * (ellipsoid.a + ellipsoid.b)) / (2 * ellipsoid.a),
    );
  }

  const candidates = [];
  let best = null;
  for (const bearing of bearings) {
    for (const distance of distanceSeeds) {
      const candidate = solveShootingSeed(
        start,
        targetLatitude,
        targetLongitude,
        ellipsoid,
        bearing,
        distance,
      );
      if (
        candidate &&
        candidate.residual <= INVERSE_ENDPOINT_TOLERANCE
      ) {
        candidates.push(candidate);
        if (
          !best ||
          preferShootingCandidate(candidate, best, start, end)
        ) {
          best = candidate;
        }
      }
    }
  }

  if (!best) {
    throw new ConvertToolsError("NO_CONVERGENCE", "Ellipsoidal inverse calculation did not converge.");
  }

  const canonicalVertex = canonicalVertexCandidate(
    start,
    end,
    ellipsoid,
    best,
  );
  if (canonicalVertex) {
    candidates.push(canonicalVertex);
    best = canonicalVertex;
  }

  return {
    distanceMetres: best.distanceMetres,
    initialBearingDegrees: normalizeBearing(best.bearing * RADIAN),
    finalBearingDegrees: normalizeBearing(
      best.endpoint.finalBearingRadians * RADIAN,
    ),
    ambiguous:
      nearAntipodal &&
      candidates.some(
        (candidate) =>
          Math.abs(candidate.distanceMetres - best.distanceMetres) <=
            SHORTEST_DISTANCE_TIE_METRES &&
          Math.abs(normalizeRadians(candidate.bearing - best.bearing)) >
            AMBIGUOUS_BEARING_SEPARATION_RADIANS,
      ),
    iterations: best.iterations,
  };
}

function canonicalVertexCandidate(start, end, ellipsoid, current) {
  if (end.latitude !== -start.latitude) {
    return null;
  }

  const longitudeDifference = normalizeLongitude(
    end.longitude - start.longitude,
  );
  const bearing = (longitudeDifference < 0 ? 270 : 90) * DEGREE;
  const endpoint = directVincentyRaw(
    start,
    bearing,
    current.distanceMetres,
    ellipsoid,
  );
  const residual = residualNorm(
    endpointResidual(
      endpoint,
      end.latitude * DEGREE,
      end.longitude * DEGREE,
    ),
  );
  if (residual > INVERSE_ENDPOINT_TOLERANCE) {
    return null;
  }

  return {
    endpoint,
    bearing,
    distanceMetres: current.distanceMetres,
    residual,
    iterations: current.iterations,
  };
}

function preferShootingCandidate(candidate, current, start, end) {
  const distanceDifference =
    candidate.distanceMetres - current.distanceMetres;
  if (
    Math.abs(distanceDifference) > SHORTEST_DISTANCE_TIE_METRES
  ) {
    return distanceDifference < 0;
  }

  const latitudeBalance = start.latitude + end.latitude;
  const preferredLatitude =
    latitudeBalance === 0 ? start.latitude : latitudeBalance;
  if (preferredLatitude !== 0) {
    const preferredNorthingSign = Math.sign(preferredLatitude);
    const candidateMatches =
      Math.sign(Math.cos(candidate.bearing)) === preferredNorthingSign;
    const currentMatches =
      Math.sign(Math.cos(current.bearing)) === preferredNorthingSign;
    if (candidateMatches !== currentMatches) {
      return candidateMatches;
    }
  } else {
    const candidateCardinalOffset = Math.abs(
      Math.cos(candidate.bearing),
    );
    const currentCardinalOffset = Math.abs(Math.cos(current.bearing));
    if (candidateCardinalOffset !== currentCardinalOffset) {
      return candidateCardinalOffset < currentCardinalOffset;
    }
  }

  if (distanceDifference !== 0) {
    return distanceDifference < 0;
  }
  return candidate.residual < current.residual;
}

function cutLocusAmbiguous(start, end, result, ellipsoid) {
  const seed = sphericalSeed(start, end, ellipsoid);
  if (Math.PI - seed.centralAngle >= 0.15) {
    return false;
  }

  const bearing = result.initialBearingDegrees * DEGREE;
  const plus = directVincentyRaw(
    start,
    bearing + CUT_LOCUS_DERIVATIVE_STEP_RADIANS,
    result.distanceMetres,
    ellipsoid,
  );
  const minus = directVincentyRaw(
    start,
    bearing - CUT_LOCUS_DERIVATIVE_STEP_RADIANS,
    result.distanceMetres,
    ellipsoid,
  );
  const endpointSeparation = residualNorm(
    endpointResidual(
      plus,
      minus.latitudeRadians,
      minus.longitudeRadians,
    ),
  );
  const bearingSensitivityMetres =
    (endpointSeparation * ellipsoid.a) /
    (2 * CUT_LOCUS_DERIVATIVE_STEP_RADIANS);
  return bearingSensitivityMetres <= CUT_LOCUS_SENSITIVITY_METRES;
}

/**
 * Ellipsoidal inverse problem: distance and azimuths between two points.
 * Agrees with GeographicLib GeodSolve within 0.1 mm (see
 * contracts/test-vectors/geodesic-wgs84.csv).
 * @param {import("../../types.js").GeoPoint} startValue
 * @param {import("../../types.js").GeoPoint} endValue
 * @param {import("../../types.js").GeodesicOptions} [options]
 * @returns {import("../../types.js").GeodesicResult}
 * @throws {import("../../errors.js").ConvertToolsError} INVALID_ARGUMENT,
 *   INVALID_NUMBER, LATITUDE_OUT_OF_RANGE, LONGITUDE_OUT_OF_RANGE,
 *   NO_CONVERGENCE
 */
export function inverseGeodesic(startValue, endValue, options = {}) {
  const start = readPoint(startValue, "start");
  const end = readPoint(endValue, "end");
  const ellipsoid = readEllipsoid(options.ellipsoid);
  const tolerance = options.tolerance == null ? DEFAULT_TOLERANCE : options.tolerance;
  const maxIterations =
    options.maxIterations == null ? DEFAULT_MAX_ITERATIONS : options.maxIterations;

  if (
    !Number.isFinite(tolerance) ||
    tolerance <= 0 ||
    !Number.isInteger(maxIterations) ||
    maxIterations < 1
  ) {
    throw new ConvertToolsError("INVALID_ARGUMENT", "Geodesic iteration options are invalid.");
  }

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
    });
  }

  const vincentyCandidate = inverseVincenty(
    start,
    end,
    ellipsoid,
    tolerance,
    maxIterations,
  );
  const vincenty = validatedVincentyInverse(
    start,
    end,
    vincentyCandidate,
    ellipsoid,
  );
  const antipodal = exactAntipodes(start, end);
  const result = vincenty == null ? inverseByShooting(start, end, ellipsoid) : vincenty;
  const fallbackUsed = vincenty === null;
  const ambiguous =
    antipodal ||
    result.ambiguous === true ||
    cutLocusAmbiguous(start, end, result, ellipsoid);
  const initialBearingDegrees = antipodal
    ? 0
    : result.initialBearingDegrees;
  const finalBearingDegrees = antipodal
    ? 180
    : result.finalBearingDegrees;

  return Object.freeze({
    distanceMetres: result.distanceMetres,
    initialBearingDegrees,
    finalBearingDegrees,
    azimuthDefined: true,
    ambiguous,
    ellipsoid: ellipsoid.id,
    algorithm: "ellipsoidal",
    solver: fallbackUsed ? "vincenty-direct-shooting" : "vincenty-inverse",
    iterations: result.iterations,
  });
}

/**
 * Ellipsoidal direct problem: end point after `distanceMetres` along
 * `initialBearingDegrees`.
 * @param {import("../../types.js").GeoPoint} startValue
 * @param {number | string} initialBearingDegreesValue
 * @param {number | string} distanceMetresValue non-negative
 * @param {import("../../types.js").GeodesicOptions} [options]
 * @returns {import("../../types.js").DirectGeodesicResult}
 * @throws {import("../../errors.js").ConvertToolsError} INVALID_ARGUMENT,
 *   INVALID_NUMBER, NO_CONVERGENCE
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
      algorithm: "vincenty-direct",
      iterations: 0,
    });
  }

  const result = directVincentyRaw(
    start,
    normalizeBearing(initialBearingDegrees) * DEGREE,
    distanceMetres,
    ellipsoid,
    options.tolerance == null ? DEFAULT_TOLERANCE : options.tolerance,
    options.maxIterations == null ? DEFAULT_MAX_ITERATIONS : options.maxIterations,
  );

  return Object.freeze({
    latitude: result.latitudeRadians * RADIAN,
    longitude: normalizeLongitude(result.longitudeRadians * RADIAN),
    finalBearingDegrees: normalizeBearing(
      result.finalBearingRadians * RADIAN,
    ),
    ellipsoid: ellipsoid.id,
    algorithm: "vincenty-direct",
    iterations: result.iterations,
  });
}
