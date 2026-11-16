import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cartesianToTriaxial,
  directGeodesic,
  directTriaxialGeodesic,
  inverseGeodesic,
  inverseTriaxialGeodesic,
  triaxialToCartesian,
} from "../src/index.js";
import { angle, createTriaxialModel } from "../src/geodesy/triaxial/ellipsoid3.js";
import { solveTriaxialInverse } from "../src/geodesy/triaxial/geodesic3.js";

const VECTOR_DIR = new URL("../../../contracts/test-vectors/", import.meta.url);
const CAYLEY = { a: Math.SQRT2, b: 1, c: Math.SQRT1_2 };
const EARTH3 = { a: 6378172, b: 6378102, c: 6356752 };
const MILD = { a: 1.2, b: 1.1, c: 1 };

function readVectors(name) {
  const [header, ...lines] = readFileSync(new URL(name, VECTOR_DIR), "utf8").trim().split("\n");
  const keys = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [keys[index], value])));
}

/** Absolute difference of two headings in radians. */
function headingDifference(x, y) {
  const degrees = ((((Number(x) - Number(y)) % 360) + 540) % 360) - 180;
  return (Math.abs(degrees) * Math.PI) / 180;
}

function cartesianDistance(p, q) {
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}

function pointsOn(count, seed) {
  let state = seed;
  const next = () => (state = (state * 48271) % 2147483647) / 2147483647;
  const points = [];
  for (let i = 0; i < count; i += 1) {
    points.push({ beta: (Math.asin(2 * next() - 1) * 180) / Math.PI, omega: 360 * next() - 180 });
  }
  return points;
}

test("triaxial inverse matches Geod3Solve (contracts/test-vectors/triaxial-inverse.csv)", () => {
  const rows = readVectors("triaxial-inverse.csv");
  assert.equal(rows.length, 70);
  for (const row of rows) {
    const options = { ellipsoid: { a: Number(row.a), b: Number(row.b), c: Number(row.c) } };
    const result = inverseTriaxialGeodesic({ beta: row.bet1, omega: row.omg1 }, { beta: row.bet2, omega: row.omg2 }, options);
    const tolerance = Number(row.tolerance);
    const m12 = Math.abs(result.reducedLength);
    assert.ok(Math.abs(result.distance - Number(row.expected_s12)) <= tolerance, `${row.id}: distance ${result.distance}`);
    assert.ok(headingDifference(result.initialAzimuthDegrees, row.expected_alp1) * m12 <= tolerance, `${row.id}: alp1`);
    assert.ok(headingDifference(result.finalAzimuthDegrees, row.expected_alp2) * m12 <= tolerance, `${row.id}: alp2`);
  }
});

test("inverse finds the shortest geodesic in near-conjugate cases", () => {
  const rows = readVectors("triaxial-shortest.csv");
  for (const row of rows) {
    const options = { ellipsoid: { a: Number(row.a), b: Number(row.b), c: Number(row.c) } };
    const result = inverseTriaxialGeodesic({ beta: row.bet1, omega: row.omg1 }, { beta: row.bet2, omega: row.omg2 }, options);
    assert.ok(result.distance - Number(row.expected_s12) <= 1e-13, `${row.id}: distance ${result.distance}`);
  }
});

test("inverse still solves coincident points and exact antipodes", () => {
  const options = { ellipsoid: CAYLEY };
  const same = inverseTriaxialGeodesic({ beta: 30, omega: 40 }, { beta: 30, omega: 40 }, options);
  assert.equal(same.distance, 0);
  const result = inverseTriaxialGeodesic({ beta: 30, omega: 40 }, { beta: -30, omega: -140 }, options);
  const oracle = solveTriaxialInverse(createTriaxialModel(CAYLEY), angle(30), angle(40), angle(-30), angle(-140), {
    rays: 1440,
    refineRays: 0,
  });
  assert.ok(oracle !== null);
  assert.ok(Math.abs(result.distance - oracle.s12) <= 1e-13, `distance ${result.distance} ${oracle.s12}`);
});

test("triaxial direct matches Geod3Solve (contracts/test-vectors/triaxial-direct.csv)", () => {
  const rows = readVectors("triaxial-direct.csv");
  assert.equal(rows.length, 80);
  for (const row of rows) {
    const options = { ellipsoid: { a: Number(row.a), b: Number(row.b), c: Number(row.c) } };
    const result = directTriaxialGeodesic({ beta: row.bet1, omega: row.omg1 }, row.alp1, row.s12, options);
    const tolerance = Number(row.tolerance);
    const reached = triaxialToCartesian({ beta: result.beta, omega: result.omega }, options);
    const expected = triaxialToCartesian({ beta: row.expected_bet2, omega: row.expected_omg2 }, options);
    assert.ok(cartesianDistance(reached, expected) <= tolerance, `${row.id}: position`);
    assert.ok(headingDifference(result.finalAzimuthDegrees, row.expected_alp2) * Number(row.b) <= tolerance, `${row.id}: alp2`);
  }
});

test("triaxial inverse is symmetric and its line closes on point 2", () => {
  for (const ellipsoid of [CAYLEY, EARTH3, MILD]) {
    const options = { ellipsoid };
    const points = pointsOn(8, 1234);
    for (let i = 0; i + 1 < points.length; i += 2) {
      const [p, q] = [points[i], points[i + 1]];
      const forward = inverseTriaxialGeodesic(p, q, options);
      const backward = inverseTriaxialGeodesic(q, p, options);
      const scale = ellipsoid.b;
      assert.ok(Math.abs(forward.distance - backward.distance) <= 1e-13 * scale, "distance symmetry");
      assert.ok(Math.abs(forward.reducedLength - backward.reducedLength) <= 1e-12 * scale, "m12 symmetry");
      assert.ok(Math.abs(forward.geodesicScale12 - backward.geodesicScale21) <= 1e-12, "M12 = reversed M21");
      assert.ok(Math.abs(forward.geodesicScale21 - backward.geodesicScale12) <= 1e-12, "M21 = reversed M12");
      const end = directTriaxialGeodesic(p, forward.initialAzimuthDegrees, forward.distance, options);
      assert.ok(cartesianDistance(triaxialToCartesian(end, options), triaxialToCartesian(q, options)) <= 1e-13 * scale, "closure");
      assert.ok(headingDifference(end.finalAzimuthDegrees, forward.finalAzimuthDegrees) <= 1e-12, "final heading");
    }
  }
});

test("m12 and M21 agree with finite differences of the direct problem", () => {
  for (const ellipsoid of [CAYLEY, EARTH3, MILD]) {
    const options = { ellipsoid };
    const scale = ellipsoid.b;
    for (const [start, azimuth, length] of [
      [{ beta: 12, omega: -40 }, 63, 1.3],
      [{ beta: -50, omega: 100 }, 200, 2.6],
      [{ beta: 89, omega: 3 }, 300, 0.7],
    ]) {
      const s = length * scale;
      const centre = directTriaxialGeodesic(start, azimuth, s, options);
      const h = 1e-4;
      const plus = triaxialToCartesian(directTriaxialGeodesic(start, azimuth + h, s, options), options);
      const minus = triaxialToCartesian(directTriaxialGeodesic(start, azimuth - h, s, options), options);
      const spread = cartesianDistance(plus, minus) / ((2 * h * Math.PI) / 180);
      assert.ok(Math.abs(spread - Math.abs(centre.reducedLength)) <= 1e-6 * scale, `m12 ${spread} ${centre.reducedLength}`);
      const ds = 1e-4 * scale;
      const longer = directTriaxialGeodesic(start, azimuth, s + ds, options).reducedLength;
      const shorter = directTriaxialGeodesic(start, azimuth, s - ds, options).reducedLength;
      assert.ok(Math.abs((longer - shorter) / (2 * ds) - centre.geodesicScale21) <= 1e-7, "M21 = dm12/ds");
    }
    const short = inverseTriaxialGeodesic({ beta: 20, omega: 30 }, { beta: 20.01, omega: 30.01 }, options);
    assert.ok(Math.abs(short.reducedLength / short.distance - 1) <= 1e-3, "m12 ~ s12 for short lines");
    assert.ok(Math.abs(short.geodesicScale12 - 1) <= 1e-3 && Math.abs(short.geodesicScale21 - 1) <= 1e-3, "M ~ 1 for short lines");
  }
});

const DEGREE = Math.PI / 180;

/** Wraps degrees to [-180, 180). */
function wrap(degrees) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/** Random pairs and near-antipodal pairs (offsets of a few tenths of a degree). */
function biaxialPairs() {
  const pairs = [];
  const points = pointsOn(10, 99);
  for (let i = 0; i + 1 < points.length; i += 2) pairs.push([points[i], points[i + 1]]);
  for (const [k, p] of pointsOn(4, 5).entries()) {
    const near = { beta: Math.max(-89, Math.min(89, -p.beta + 0.3 - 0.2 * k)), omega: wrap(p.omega + 180 - 0.7 + 0.4 * k) };
    pairs.push([p, near]);
  }
  return pairs;
}

/**
 * Compares the triaxial solver on a biaxial shape with the biaxial solver.
 * `limit.geographic` maps (beta, omega) to the biaxial (latitude, longitude),
 * `limit.turn` gives the biaxial azimuth minus the triaxial heading at a point.
 */
function compareWithBiaxial(options, biaxial, limit, pairs) {
  // The integrator's accuracy is about 5e-14 of the axes.
  const length = 1e-13 * options.ellipsoid.a;
  for (const [p, q] of pairs) {
    const tri = inverseTriaxialGeodesic(p, q, options);
    const bi = inverseGeodesic(limit.geographic(p), limit.geographic(q), biaxial);
    const label = `${JSON.stringify(p)} ${JSON.stringify(q)}`;
    const m12 = Math.abs(bi.reducedLengthMetres);
    assert.ok(Math.abs(tri.distance - bi.distanceMetres) <= length, `distance ${label}: ${tri.distance} ${bi.distanceMetres}`);
    assert.ok(headingDifference(tri.initialAzimuthDegrees + limit.turn(p), bi.initialBearingDegrees) * m12 <= length, `azimuth 1 ${label}`);
    assert.ok(headingDifference(tri.finalAzimuthDegrees + limit.turn(q), bi.finalBearingDegrees) * m12 <= length, `azimuth 2 ${label}`);
    assert.ok(Math.abs(tri.reducedLength - bi.reducedLengthMetres) <= length, `m12 ${label}`);
    assert.ok(Math.abs(tri.geodesicScale12 - bi.geodesicScale12) <= 1e-13, `M12 ${label}`);
    assert.ok(Math.abs(tri.geodesicScale21 - bi.geodesicScale21) <= 1e-13, `M21 ${label}`);
    const direct = directTriaxialGeodesic(p, 37, 15e6, options);
    const reference = directGeodesic(limit.geographic(p), 37 + limit.turn(p), 15e6, biaxial);
    assert.ok(Math.abs(direct.reducedLength - reference.reducedLengthMetres) <= length, `direct m12 ${label}`);
    assert.ok(Math.abs(direct.geodesicScale12 - reference.geodesicScale12) <= 1e-13, `direct M12 ${label}`);
    assert.ok(Math.abs(direct.geodesicScale21 - reference.geodesicScale21) <= 1e-13, `direct M21 ${label}`);
  }
}

test("an oblate triaxial ellipsoid (a = b) reproduces the biaxial solver, near antipodes included", () => {
  const a = 6378137;
  const c = 6356752.314245;
  // beta is the parametric latitude, tan(phi) = (a/c) tan(beta); omega is the longitude.
  compareWithBiaxial({ ellipsoid: { a, b: a, c } }, { ellipsoid: { a, b: c, f: (a - c) / a } }, {
    geographic: (point) => ({ latitude: Math.atan((a / c) * Math.tan(point.beta * DEGREE)) / DEGREE, longitude: point.omega }),
    turn: () => 0,
  }, biaxialPairs());
});

test("a prolate triaxial ellipsoid (b = c) reproduces the biaxial solver, near antipodes included", () => {
  const a = 6420000;
  const b = 6378137;
  // The symmetry axis is X: 90 - |omega| is the parametric latitude
  // (tan(phi) = (b/a) tan(psi)), the longitude is beta for omega > 0 and
  // 180 - beta for omega < 0, and the biaxial azimuth is the heading plus
  // 90 degrees (omega > 0) or minus 90 degrees (omega < 0).
  const pairs = biaxialPairs().map((pair) =>
    pair.map((point) => ({ beta: point.beta, omega: Math.abs(point.omega) < 1 || Math.abs(point.omega) > 179 ? point.omega + 2 : point.omega })),
  );
  compareWithBiaxial({ ellipsoid: { a, b, c: b } }, { ellipsoid: { a: b, b: a, f: (b - a) / b } }, {
    geographic: (point) => ({
      latitude: Math.atan((b / a) * Math.tan((90 - Math.abs(point.omega)) * DEGREE)) / DEGREE,
      longitude: wrap(point.omega > 0 ? point.beta : 180 - point.beta),
    }),
    turn: (point) => (point.omega > 0 ? 90 : -90),
  }, pairs);
});

test("a sphere gives great circles", () => {
  const radius = 2;
  const options = { ellipsoid: { a: radius, b: radius, c: radius } };
  for (const [p, q] of [
    [{ beta: 10, omega: 20 }, { beta: -35, omega: 140 }],
    [{ beta: 0, omega: 0 }, { beta: 0, omega: 179 }],
    [{ beta: 60, omega: -170 }, { beta: 61, omega: 170 }],
  ]) {
    const toUnit = (point) => {
      const [b, w] = [(point.beta * Math.PI) / 180, (point.omega * Math.PI) / 180];
      return [Math.cos(b) * Math.cos(w), Math.cos(b) * Math.sin(w), Math.sin(b)];
    };
    const [u, v] = [toUnit(p), toUnit(q)];
    const sigma = Math.atan2(Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]), u[0] * v[0] + u[1] * v[1] + u[2] * v[2]);
    const result = inverseTriaxialGeodesic(p, q, options);
    assert.ok(Math.abs(result.distance - radius * sigma) <= 1e-13 * radius);
    assert.ok(Math.abs(result.reducedLength - radius * Math.sin(sigma)) <= 1e-13 * radius);
    assert.ok(Math.abs(result.geodesicScale12 - Math.cos(sigma)) <= 1e-13);
    assert.ok(Math.abs(result.geodesicScale21 - Math.cos(sigma)) <= 1e-13);
  }
});

test("triaxial coordinates round-trip and zero lengths are exact", () => {
  const options = { ellipsoid: CAYLEY };
  for (const point of pointsOn(20, 7)) {
    const back = cartesianToTriaxial(triaxialToCartesian(point, options), options);
    assert.ok(Math.abs(back.beta - point.beta) <= 1e-12 && Math.abs(back.omega - point.omega) <= 1e-12);
  }
  const R = triaxialToCartesian({ beta: 30, omega: 40 }, options);
  const scaled = cartesianToTriaxial({ x: 3 * R.x, y: 3 * R.y, z: 3 * R.z }, options);
  assert.ok(Math.abs(scaled.beta - 30) <= 1e-12 && Math.abs(scaled.omega - 40) <= 1e-12);
  const same = inverseTriaxialGeodesic({ beta: 30, omega: 40 }, { beta: 30, omega: 40 }, options);
  assert.deepEqual(same, {
    distance: 0,
    initialAzimuthDegrees: null,
    finalAzimuthDegrees: null,
    reducedLength: 0,
    geodesicScale12: 1,
    geodesicScale21: 1,
  });
  const still = directTriaxialGeodesic({ beta: 30, omega: 40 }, 25, 0, options);
  assert.ok(Math.abs(still.beta - 30) <= 1e-13 && Math.abs(still.omega - 40) <= 1e-13);
  assert.ok(Math.abs(still.finalAzimuthDegrees - 25) <= 1e-12);
  assert.equal(still.reducedLength, 0);
});

test("triaxial functions reject invalid input with coded errors", () => {
  const options = { ellipsoid: CAYLEY };
  const code = (fn, expected) => assert.throws(fn, (error) => error.code === expected);
  code(() => inverseTriaxialGeodesic({ beta: 0, omega: 0 }, { beta: 1, omega: 1 }), "INVALID_ARGUMENT");
  code(() => inverseTriaxialGeodesic({ beta: 0, omega: 0 }, { beta: 1, omega: 1 }, { ellipsoid: { a: 1, b: 2, c: 1 } }), "INVALID_ARGUMENT");
  code(() => inverseTriaxialGeodesic({ beta: 0, omega: 0 }, { beta: 1, omega: 1 }, { ellipsoid: { a: 1, b: 1, c: 0 } }), "INVALID_ARGUMENT");
  code(() => inverseTriaxialGeodesic({ beta: 91, omega: 0 }, { beta: 1, omega: 1 }, options), "LATITUDE_OUT_OF_RANGE");
  code(() => inverseTriaxialGeodesic({ beta: 0, omega: 181 }, { beta: 1, omega: 1 }, options), "LONGITUDE_OUT_OF_RANGE");
  code(() => inverseTriaxialGeodesic({ beta: "x", omega: 0 }, { beta: 1, omega: 1 }, options), "INVALID_NUMBER");
  code(() => inverseTriaxialGeodesic([0, 0], { beta: 1, omega: 1 }, options), "INVALID_ARGUMENT");
  code(() => directTriaxialGeodesic({ beta: 0, omega: 0 }, 10, -1, options), "INVALID_ARGUMENT");
  code(() => directTriaxialGeodesic({ beta: 0, omega: 0 }, "north", 1, options), "INVALID_NUMBER");
  code(() => cartesianToTriaxial({ x: 0, y: 0, z: 0 }, options), "INVALID_ARGUMENT");
});
