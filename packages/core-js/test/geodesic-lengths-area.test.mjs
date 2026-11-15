// Arc length, reduced length, geodesic scales and area of the ellipsoidal
// geodesic solvers, checked against properties that do not depend on any
// reference data set: closed forms on a sphere, reciprocity, the definitions
// of m12 and M12 (finite differences through the direct solver) and the
// consistency of the inverse with the direct solution on the returned route.
import assert from "node:assert/strict";
import test from "node:test";
import {
  directGeodesic,
  inverseGeodesic,
  measureGeodesicPolyline,
  sampleGeodesicPath,
} from "@convert-tools/core/geodesy";
import {
  createGeodesicLine,
  positionOnLine,
} from "../src/geodesy/measurement/geodesic-direct.js";
import { createGeodesicModel } from "../src/geodesy/measurement/geodesic-series.js";

const RAD = Math.PI / 180;
const WGS84 = { id: "WGS84", a: 6378137, f: 1 / 298.257223563 };
const SPHERE = { id: "SPHERE", a: 6371000, f: 0 };
const OBLATE_50 = { id: "F50", a: 6378137, f: 1 / 50 };
const PROLATE_150 = { id: "P150", a: 6378137, f: -1 / 150 };
const ELLIPSOIDS = [WGS84, SPHERE, OBLATE_50, PROLATE_150];

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPairs(seed, count) {
  const random = mulberry32(seed);
  const uniform = (min, max) => min + random() * (max - min);
  const latitude = () => Math.asin(uniform(-1, 1)) / RAD;
  const pairs = [];
  for (let index = 0; index < count; index += 1) {
    pairs.push([
      { latitude: latitude(), longitude: uniform(-180, 180) },
      { latitude: latitude(), longitude: uniform(-180, 180) },
    ]);
  }
  return pairs;
}

/** Angle in (-180, 180]. */
function wrap180(degrees) {
  const value = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return value === -180 ? 180 : value;
}

/** c^2, the square of the authalic radius, from its closed form. */
function authalicRadiusSquared({ a, f }) {
  const b = a * (1 - f);
  const e2 = f * (2 - f);
  if (e2 === 0) return a * a;
  const e = Math.sqrt(Math.abs(e2));
  const ratio = e2 > 0 ? Math.atanh(e) / e : Math.atan(e) / e;
  return (a * a + b * b * ratio) / 2;
}

/** Signed distance of `point` to the right of a line heading `bearing` at `origin`. */
function normalOffset(origin, bearing, point, ellipsoid) {
  const join = inverseGeodesic(origin, point, { ellipsoid });
  if (join.distanceMetres === 0) return 0;
  return join.distanceMetres * Math.sin((join.initialBearingDegrees - bearing) * RAD);
}

test("sphere: arc length, m12 = R sin(sigma), M12 = M21 = cos(sigma), S12 = R^2 (alp2 - alp1)", (t) => {
  const R = SPHERE.a;
  let worst = { a12: 0, m12: 0, M: 0, S12: 0 };
  for (const [start, end] of randomPairs(0x51a7e, 400)) {
    const phi1 = start.latitude * RAD;
    const phi2 = end.latitude * RAD;
    const dlam = wrap180(end.longitude - start.longitude) * RAD;
    // Independent spherical trigonometry.
    const sigma = Math.atan2(
      Math.hypot(
        Math.cos(phi2) * Math.sin(dlam),
        Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlam),
      ),
      Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dlam),
    );
    if (sigma > 170 * RAD) continue; // azimuths are ill-conditioned near antipodes
    const alp1 = Math.atan2(
      Math.cos(phi2) * Math.sin(dlam),
      Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlam),
    );
    const alp2 = Math.atan2(
      Math.cos(phi1) * Math.sin(dlam),
      -Math.cos(phi2) * Math.sin(phi1) + Math.sin(phi2) * Math.cos(phi1) * Math.cos(dlam),
    );
    const result = inverseGeodesic(start, end, { ellipsoid: SPHERE });
    const area = R * R * wrap180((alp2 - alp1) / RAD) * RAD;
    worst = {
      a12: Math.max(worst.a12, Math.abs(result.arcDegrees - sigma / RAD)),
      m12: Math.max(worst.m12, Math.abs(result.reducedLengthMetres - R * Math.sin(sigma))),
      M: Math.max(
        worst.M,
        Math.abs(result.geodesicScale12 - Math.cos(sigma)),
        Math.abs(result.geodesicScale21 - Math.cos(sigma)),
      ),
      // Round-off of the two independent azimuths, amplified by 1/sin(sigma)
      // near the antipode: |dS12| <= 8 eps R^2 (1 + 1/sin(sigma)).
      S12: Math.max(
        worst.S12,
        Math.abs(result.areaSquareMetres - area) /
          (8 * Number.EPSILON * R * R * (1 + 1 / Math.sin(sigma))),
      ),
    };
    // Direct on the same line: the end point is reached after R sigma.
    const direct = directGeodesic(start, result.initialBearingDegrees, R * sigma, { ellipsoid: SPHERE });
    assert.ok(Math.abs(direct.arcDegrees - sigma / RAD) < 1e-12);
    assert.ok(Math.abs(direct.reducedLengthMetres - R * Math.sin(sigma)) < 1e-8);
    assert.ok(Math.abs(direct.geodesicScale12 - Math.cos(sigma)) < 1e-14);
  }
  t.diagnostic(`sphere max: ${JSON.stringify(worst)}`);
  assert.ok(worst.a12 < 1e-12, `a12 ${worst.a12}`);
  assert.ok(worst.m12 < 1e-8, `m12 ${worst.m12}`);
  assert.ok(worst.M < 1e-14, `M ${worst.M}`);
  assert.ok(worst.S12 <= 1, `S12 error / round-off bound ${worst.S12}`);
});

test("area constant: a meridian over the pole has S12 = c^2 pi and the equator has S12 = 0", () => {
  for (const ellipsoid of ELLIPSOIDS) {
    const c2 = authalicRadiusSquared(ellipsoid);
    // A meridian from the equator to the north pole and on over it: S12 jumps
    // by c^2 pi, the area between that meridian, its mirror and the equator.
    const overPole = directGeodesic({ latitude: 10, longitude: 0 }, 0, 12e6, { ellipsoid });
    assert.ok(Math.abs(overPole.areaSquareMetres - c2 * Math.PI) < 0.05, ellipsoid.id);
    const equator = inverseGeodesic({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 20 }, { ellipsoid });
    assert.equal(equator.areaSquareMetres, 0, ellipsoid.id);
  }
});

test("reciprocity: swapping the end points keeps a12 and m12, swaps M12/M21 and negates S12", () => {
  for (const ellipsoid of ELLIPSOIDS) {
    for (const [start, end] of randomPairs(0xa11ce, 200)) {
      const forward = inverseGeodesic(start, end, { ellipsoid });
      const backward = inverseGeodesic(end, start, { ellipsoid });
      assert.ok(Math.abs(forward.arcDegrees - backward.arcDegrees) < 1e-12, ellipsoid.id);
      assert.ok(Math.abs(forward.reducedLengthMetres - backward.reducedLengthMetres) < 1e-8);
      assert.ok(Math.abs(forward.geodesicScale12 - backward.geodesicScale21) < 1e-14);
      assert.ok(Math.abs(forward.geodesicScale21 - backward.geodesicScale12) < 1e-14);
      assert.ok(Math.abs(forward.areaSquareMetres + backward.areaSquareMetres) < 0.05);
    }
  }
});

test("reversed line: travelling back along azi2 + 180 swaps M12/M21 and negates S12", () => {
  for (const ellipsoid of ELLIPSOIDS) {
    const random = mulberry32(0xbacc);
    for (let index = 0; index < 200; index += 1) {
      const start = { latitude: Math.asin(2 * random() - 1) / RAD, longitude: 360 * random() - 180 };
      const azimuth = 360 * random();
      const distance = 1 + 1.9e7 * random();
      const out = directGeodesic(start, azimuth, distance, { ellipsoid });
      const back = directGeodesic(out, out.finalBearingDegrees + 180, distance, { ellipsoid });
      assert.ok(Math.abs(back.latitude - start.latitude) < 1e-9, ellipsoid.id);
      assert.ok(Math.abs(wrap180(back.longitude - start.longitude) * Math.cos(start.latitude * RAD)) < 1e-9);
      assert.ok(Math.abs(back.arcDegrees - out.arcDegrees) < 1e-11);
      assert.ok(Math.abs(back.reducedLengthMetres - out.reducedLengthMetres) < 1e-7);
      assert.ok(Math.abs(back.geodesicScale12 - out.geodesicScale21) < 1e-13);
      assert.ok(Math.abs(back.geodesicScale21 - out.geodesicScale12) < 1e-13);
      assert.ok(Math.abs(back.areaSquareMetres + out.areaSquareMetres) < 0.5);
    }
  }
});

test("line convention: a negative distance gives m21 = -m12 and swapped scales", () => {
  for (const ellipsoid of ELLIPSOIDS) {
    const model = createGeodesicModel(ellipsoid.a, ellipsoid.f);
    const random = mulberry32(0xc0de);
    for (let index = 0; index < 100; index += 1) {
      const latitude = Math.asin(2 * random() - 1) / RAD;
      const azimuth = 360 * random() - 180;
      const distance = 1e3 + 1.5e7 * random();
      const line = createGeodesicLine(model, latitude, 0, azimuth);
      const before = positionOnLine(line, -distance);
      // The same geodesic, travelled forwards from the earlier point.
      const forward = positionOnLine(
        createGeodesicLine(model, before.latitude, before.longitude, before.finalBearingDegrees),
        distance,
      );
      assert.ok(Math.abs(forward.latitude - latitude) < 1e-9, ellipsoid.id);
      assert.ok(Math.abs(forward.m12 + before.m12) < 1e-7, `${ellipsoid.id} m12`);
      assert.ok(Math.abs(forward.M12 - before.M21) < 1e-13);
      assert.ok(Math.abs(forward.M21 - before.M12) < 1e-13);
      assert.ok(Math.abs(forward.a12 + before.a12) < 1e-11);
      assert.ok(Math.abs(forward.S12 + before.S12) < 0.5);
    }
  }
});

test("finite differences through the direct solver reproduce m12, M12 and M21", (t) => {
  const delta = 1e-6; // radians of azimuth for m12
  const offset = 1; // metres of parallel offset for M12
  for (const ellipsoid of ELLIPSOIDS) {
    const options = { ellipsoid };
    const random = mulberry32(0xfd);
    let worst = { m12: 0, M12: 0, M21: 0 };
    for (let index = 0; index < 60; index += 1) {
      const start = { latitude: 170 * random() - 85, longitude: 0 };
      const azimuth = 360 * random();
      const distance = 1e4 + 1.7e7 * random();
      const end = directGeodesic(start, azimuth, distance, options);
      const bearing2 = end.finalBearingDegrees;

      // m12: rotate the initial azimuth by +/- delta.
      const plus = directGeodesic(start, azimuth + delta / RAD, distance, options);
      const minus = directGeodesic(start, azimuth - delta / RAD, distance, options);
      const m12 =
        (normalOffset(end, bearing2, plus, ellipsoid) - normalOffset(end, bearing2, minus, ellipsoid)) /
        (2 * delta);

      // M12: two geodesics that leave parallel from points +/- offset to the
      // right of point 1.
      const right = directGeodesic(start, azimuth + 90, offset, options);
      const left = directGeodesic(start, azimuth - 90, offset, options);
      const rightEnd = directGeodesic(right, right.finalBearingDegrees - 90, distance, options);
      const leftEnd = directGeodesic(left, left.finalBearingDegrees + 90, distance, options);
      const M12 =
        (normalOffset(end, bearing2, rightEnd, ellipsoid) - normalOffset(end, bearing2, leftEnd, ellipsoid)) /
        (2 * offset);

      // M21: the same at point 1 for geodesics parallel at point 2.
      const back = bearing2 + 180;
      const right2 = directGeodesic(end, back + 90, offset, options);
      const left2 = directGeodesic(end, back - 90, offset, options);
      const rightStart = directGeodesic(right2, right2.finalBearingDegrees - 90, distance, options);
      const leftStart = directGeodesic(left2, left2.finalBearingDegrees + 90, distance, options);
      const arrival = azimuth + 180;
      const M21 =
        (normalOffset(start, arrival, rightStart, ellipsoid) - normalOffset(start, arrival, leftStart, ellipsoid)) /
        (2 * offset);

      worst = {
        m12: Math.max(worst.m12, Math.abs(m12 - end.reducedLengthMetres) / (1 + Math.abs(end.reducedLengthMetres))),
        M12: Math.max(worst.M12, Math.abs(M12 - end.geodesicScale12)),
        M21: Math.max(worst.M21, Math.abs(M21 - end.geodesicScale21)),
      };
    }
    // Round-off of the offsets (~1e-9 m) divided by 2 delta or 2 offset bounds
    // these: 1e-9 / 2e-6 = 5e-4 m (relative 1e-7 for m12 ~ 6e6 m) and 5e-10.
    t.diagnostic(`${ellipsoid.id} finite differences max: ${JSON.stringify(worst)}`);
    assert.ok(worst.m12 < 1e-6, `${ellipsoid.id} m12 relative ${worst.m12}`);
    assert.ok(worst.M12 < 1e-7, `${ellipsoid.id} M12 ${worst.M12}`);
    assert.ok(worst.M21 < 1e-7, `${ellipsoid.id} M21 ${worst.M21}`);
  }
});

test("inverse and direct agree on the returned route for every output", () => {
  for (const ellipsoid of ELLIPSOIDS) {
    const pairs = randomPairs(0xd1ec7, 300);
    const random = mulberry32(0xa7);
    for (let index = 0; index < 100; index += 1) {
      // Nearly antipodal pairs: S12 is ill-conditioned in the end points but
      // well conditioned along a given route.
      const latitude = 120 * random() - 60;
      pairs.push([
        { latitude, longitude: 0 },
        { latitude: -latitude + (random() - 0.5) * 1e-3, longitude: 179.5 + random() * 0.5 },
      ]);
    }
    for (const [start, end] of pairs) {
      const inverse = inverseGeodesic(start, end, { ellipsoid });
      const direct = directGeodesic(start, inverse.initialBearingDegrees, inverse.distanceMetres, { ellipsoid });
      assert.ok(Math.abs(direct.arcDegrees - inverse.arcDegrees) < 1e-11, ellipsoid.id);
      assert.ok(Math.abs(direct.reducedLengthMetres - inverse.reducedLengthMetres) < 1e-7);
      assert.ok(Math.abs(direct.geodesicScale12 - inverse.geodesicScale12) < 1e-12);
      assert.ok(Math.abs(direct.geodesicScale21 - inverse.geodesicScale21) < 1e-12);
      assert.ok(
        Math.abs(direct.areaSquareMetres - inverse.areaSquareMetres) < 1,
        `${ellipsoid.id} S12 ${direct.areaSquareMetres} vs ${inverse.areaSquareMetres}`,
      );
    }
  }
});

test("exact antipodes report a12, m12, M12, M21 and S12 of the returned route over the north pole", () => {
  for (const ellipsoid of [WGS84, SPHERE, OBLATE_50]) {
    const c2 = authalicRadiusSquared(ellipsoid);
    for (const latitude of [-60, -30, -1e-7, 0, 1e-7, 30, 60, 89.5]) {
      const start = { latitude, longitude: 10 };
      const end = { latitude: -latitude, longitude: -170 };
      const inverse = inverseGeodesic(start, end, { ellipsoid });
      assert.equal(inverse.initialBearingDegrees, 0);
      assert.equal(inverse.finalBearingDegrees, 180);
      assert.equal(inverse.arcDegrees, 180);
      assert.ok(Math.abs(inverse.areaSquareMetres - c2 * Math.PI) < 0.05);
      // The route over the north pole, travelled by the direct solver.
      const direct = directGeodesic(start, 0, inverse.distanceMetres, { ellipsoid });
      assert.ok(Math.abs(direct.latitude + latitude) < 1e-9, `${ellipsoid.id} ${latitude}`);
      assert.ok(Math.abs(direct.reducedLengthMetres - inverse.reducedLengthMetres) < 1e-7);
      assert.ok(Math.abs(direct.geodesicScale12 - inverse.geodesicScale12) < 1e-13);
      assert.ok(Math.abs(direct.geodesicScale21 - inverse.geodesicScale21) < 1e-13);
      assert.ok(Math.abs(direct.areaSquareMetres - inverse.areaSquareMetres) < 0.05);
    }
    // Opposite poles: every meridian is a shortest route; m12 = 0, M = -1.
    const poles = inverseGeodesic({ latitude: 90, longitude: 0 }, { latitude: -90, longitude: 0 }, { ellipsoid });
    assert.equal(poles.arcDegrees, 180);
    assert.ok(Math.abs(poles.reducedLengthMetres) < 1e-8);
    assert.ok(Math.abs(poles.geodesicScale12 + 1) < 1e-15);
    assert.ok(Math.abs(poles.geodesicScale21 + 1) < 1e-15);
    assert.ok(Math.abs(poles.areaSquareMetres - c2 * Math.PI) < 0.05);
  }
});

test("prolate antipodes keep the solved route and its values", () => {
  const start = { latitude: 30, longitude: 0 };
  const end = { latitude: -30, longitude: 180 };
  const inverse = inverseGeodesic(start, end, { ellipsoid: PROLATE_150 });
  assert.notEqual(inverse.initialBearingDegrees, 0);
  const direct = directGeodesic(start, inverse.initialBearingDegrees, inverse.distanceMetres, {
    ellipsoid: PROLATE_150,
  });
  assert.ok(Math.abs(direct.areaSquareMetres - inverse.areaSquareMetres) < 1);
  assert.ok(Math.abs(direct.reducedLengthMetres - inverse.reducedLengthMetres) < 1e-7);
});

test("coincident points and zero distance give a12 = 0, m12 = 0, M12 = M21 = 1, S12 = 0", () => {
  const point = { latitude: 39.933365, longitude: 32.859742 };
  const expected = {
    arcDegrees: 0,
    reducedLengthMetres: 0,
    geodesicScale12: 1,
    geodesicScale21: 1,
    areaSquareMetres: 0,
  };
  const pick = (result) => Object.fromEntries(Object.keys(expected).map((key) => [key, result[key]]));
  assert.deepEqual(pick(inverseGeodesic(point, point)), expected);
  assert.deepEqual(pick(inverseGeodesic({ latitude: 90, longitude: 10 }, { latitude: 90, longitude: 170 })), expected);
  assert.deepEqual(pick(directGeodesic(point, 45, 0)), expected);
  assert.deepEqual(pick(directGeodesic(point, 45, 0, { ellipsoid: PROLATE_150 })), expected);
});

test("path samples and polyline segments carry the new outputs", () => {
  const start = { latitude: 39.933365, longitude: 32.859742 };
  const end = { latitude: 41.008238, longitude: 28.978359 };
  const inverse = inverseGeodesic(start, end);
  const path = sampleGeodesicPath(start, end, { maxSegmentMetres: 50000 });
  for (const key of ["arcDegrees", "reducedLengthMetres", "geodesicScale12", "geodesicScale21", "areaSquareMetres"]) {
    assert.equal(path[key], inverse[key], key);
  }
  const polyline = measureGeodesicPolyline([start, end, start]);
  assert.equal(polyline.segments[0].areaSquareMetres, inverse.areaSquareMetres);
  assert.ok(Math.abs(polyline.segments[1].areaSquareMetres + inverse.areaSquareMetres) < 0.05);
  assert.equal(polyline.segments[1].geodesicScale12, inverse.geodesicScale21);
});
