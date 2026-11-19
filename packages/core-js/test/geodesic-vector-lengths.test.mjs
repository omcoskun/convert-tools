// Checks the arc length, reduced length, geodesic scales and area of the
// JavaScript geodesic solvers against the GeodSolve -f columns of the
// contract vectors (WGS 84 and four more ellipsoids of revolution), and the
// distance, azimuths and positions of the two multi-ellipsoid files.
//
// Tolerances (contracts/README.md), all derived from the row's
// toleranceMetres (1e-7 m) or from round-off:
//   arcDegrees            toleranceMetres / (a * 1 degree)
//   reducedLengthMetres   toleranceMetres
//   geodesicScale12/21    toleranceMetres / a
//   areaSquareMetres      direct: AREA_FLOOR; inverse: AREA_FLOOR +
//                         c^2 * AREA_AZIMUTH_NOISE / |m12|
// AREA_FLOOR = 0.25 m^2 is 16 units in the last place of the largest |S12|
// on the Earth (c^2 pi = 1.3e14 m^2). For the inverse problem an azimuth
// error d(alp1) moves S12 by about c^2 d(alp1), and the solvers fix alp1
// only to about (endpoint noise) / |m12|; AREA_AZIMUTH_NOISE = 1e-8 m is ten
// times the measured endpoint noise. Nearly antipodal lines (small |m12|)
// therefore get a wider area tolerance, as their azimuths do.
import test from "node:test";
import assert from "node:assert/strict";
import { directGeodesic, inverseGeodesic } from "@omcoskun/convert-tools/geodesy";
import {
  MaxError,
  angularDifference,
  groundErrorMetres,
  readVectors,
} from "./support/vectors.mjs";

const AREA_FLOOR = 0.25;
const AREA_AZIMUTH_NOISE = 1e-8;
const WGS84 = { id: "WGS84", a: 6378137, f: 1 / 298.257223563 };

function authalicRadiusSquared({ a, f }) {
  const b = a * (1 - f);
  const e2 = f * (2 - f);
  if (e2 === 0) return a * a;
  const e = Math.sqrt(Math.abs(e2));
  return (a * a + b * b * (e2 > 0 ? Math.atanh(e) / e : Math.atan(e) / e)) / 2;
}

function ellipsoidOf(row) {
  return row.ellipsoid === undefined
    ? WGS84
    : { id: row.ellipsoid, a: Number(row.a), f: Number(row.f) };
}

function makeErrors(prefix) {
  return {
    distance: new MaxError(`${prefix} distance`, "m"),
    azimuth: new MaxError(`${prefix} azimuth as endpoint offset`, "m"),
    position: new MaxError(`${prefix} position`, "m"),
    a12: new MaxError(`${prefix} arc length`, "deg"),
    m12: new MaxError(`${prefix} reduced length`, "m"),
    scale: new MaxError(`${prefix} geodesic scale`, ""),
    area: new MaxError(`${prefix} area`, "m^2"),
  };
}

function checkLengths(failures, errors, row, result, expected) {
  const tolerance = Number(row.toleranceMetres);
  const ellipsoid = ellipsoidOf(row);
  const a12 = Math.abs(result.arcDegrees - Number(expected.a12));
  errors.a12.add(a12, row.id);
  if (!(a12 <= tolerance / ((ellipsoid.a * Math.PI) / 180))) failures.push(`${row.id}: a12 off by ${a12}°`);
  const m12 = Math.abs(result.reducedLengthMetres - Number(expected.m12));
  errors.m12.add(m12, row.id);
  if (!(m12 <= tolerance)) failures.push(`${row.id}: m12 off by ${m12} m`);
  if (expected.M12 === "") return; // the route is not unique: no scales, no area
  for (const [actual, value, name] of [
    [result.geodesicScale12, expected.M12, "M12"],
    [result.geodesicScale21, expected.M21, "M21"],
  ]) {
    const scale = Math.abs(actual - Number(value));
    errors.scale.add(scale, row.id);
    if (!(scale <= tolerance / ellipsoid.a)) failures.push(`${row.id}: ${name} off by ${scale}`);
  }
  const area = Math.abs(result.areaSquareMetres - Number(expected.S12));
  errors.area.add(area, row.id);
  const areaTolerance =
    expected.inverse === true
      ? AREA_FLOOR +
        (authalicRadiusSquared(ellipsoid) * AREA_AZIMUTH_NOISE) / Math.abs(Number(expected.m12))
      : AREA_FLOOR;
  if (!(area <= areaTolerance)) {
    failures.push(`${row.id}: S12 off by ${area} m^2 (tolerance ${areaTolerance})`);
  }
}

function inverseRows(name, t, checkDistanceAndAzimuth) {
  const rows = readVectors(name);
  const failures = [];
  const errors = makeErrors(`${name} inverse`);
  for (const row of rows) {
    const ellipsoid = ellipsoidOf(row);
    const result = inverseGeodesic(
      { latitude: Number(row.startLatitude), longitude: Number(row.startLongitude) },
      { latitude: Number(row.endLatitude), longitude: Number(row.endLongitude) },
      { ellipsoid },
    );
    if (checkDistanceAndAzimuth) {
      const tolerance = Number(row.toleranceMetres);
      const distance = Math.abs(result.distanceMetres - Number(row.distanceMetres));
      errors.distance.add(distance, row.id);
      if (!(distance <= tolerance)) failures.push(`${row.id}: distance off by ${distance} m`);
      if (row.initialBearingDegrees !== "") {
        const offset =
          (Math.abs(Number(row.reducedLengthMetres)) *
            Math.max(
              angularDifference(result.initialBearingDegrees, Number(row.initialBearingDegrees)),
              angularDifference(result.finalBearingDegrees, Number(row.finalBearingDegrees)),
            ) *
            Math.PI) /
          180;
        errors.azimuth.add(offset, row.id);
        if (!(offset <= tolerance)) failures.push(`${row.id}: azimuth moves the endpoint by ${offset} m`);
      }
    }
    checkLengths(failures, errors, row, result, {
      inverse: true,
      a12: row.arcDegrees,
      m12: row.reducedLengthMetres,
      M12: row.geodesicScale12,
      M21: row.geodesicScale21,
      S12: row.areaSquareMetres,
    });
  }
  for (const error of Object.values(errors)) if (error.count > 0) error.report(t);
  assert.equal(failures.length, 0, `${failures.length} of ${rows.length} rows failed:\n${failures.slice(0, 15).join("\n")}`);
}

function directRows(name, t, checkPosition) {
  const rows = readVectors(name);
  const failures = [];
  const errors = makeErrors(`${name} direct`);
  for (const row of rows) {
    const result = directGeodesic(
      { latitude: Number(row.startLatitude), longitude: Number(row.startLongitude) },
      Number(row.initialBearingDegrees),
      Number(row.distanceMetres),
      { ellipsoid: ellipsoidOf(row) },
    );
    if (checkPosition) {
      const position = groundErrorMetres(
        result.latitude,
        result.longitude,
        Number(row.expectedLatitude),
        Number(row.expectedLongitude),
      );
      errors.position.add(position, row.id);
      if (!(position <= Number(row.toleranceMetres))) failures.push(`${row.id}: position off by ${position} m`);
    }
    checkLengths(failures, errors, row, result, {
      inverse: false,
      a12: row.expectedArcDegrees,
      m12: row.expectedReducedLengthMetres,
      M12: row.expectedGeodesicScale12,
      M21: row.expectedGeodesicScale21,
      S12: row.expectedAreaSquareMetres,
    });
  }
  for (const error of Object.values(errors)) if (error.count > 0) error.report(t);
  assert.equal(failures.length, 0, `${failures.length} of ${rows.length} rows failed:\n${failures.slice(0, 15).join("\n")}`);
}

test("WGS 84 inverse: a12, m12, M12, M21 and S12 match GeodSolve -f", (t) => {
  inverseRows("geodesic-wgs84.csv", t, false);
});

test("WGS 84 direct: a12, m12, M12, M21 and S12 match GeodSolve -f", (t) => {
  directRows("geodesic-direct.csv", t, false);
});

test("sphere, f = 1/150, f = 1/50 and prolate inverse match GeodSolve -f", (t) => {
  inverseRows("geodesic-ellipsoids.csv", t, true);
});

test("sphere, f = 1/150, f = 1/50 and prolate direct match GeodSolve -f", (t) => {
  directRows("geodesic-direct-ellipsoids.csv", t, true);
});
