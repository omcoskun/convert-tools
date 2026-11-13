import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  directGeodesic,
  inverseGeodesic,
  measureGeodesicPolyline,
  sampleGeodesicPath,
} from "@convert-tools/core/geodesy";

const VECTOR_URL = new URL(
  "../../../contracts/test-vectors/geodesic-wgs84.csv",
  import.meta.url,
);

function angularDifference(actual, expected) {
  const difference = Math.abs(actual - expected) % 360;
  return Math.min(difference, 360 - difference);
}

async function referenceVectors() {
  const source = await readFile(VECTOR_URL, "utf8");
  return source
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [
        id,
        startLatitude,
        startLongitude,
        endLatitude,
        endLongitude,
        distanceMetres,
        initialBearingDegrees,
        finalBearingDegrees,
        toleranceMetres,
      ] = line.split(",");
      return {
        id,
        start: {
          latitude: Number(startLatitude),
          longitude: Number(startLongitude),
        },
        end: {
          latitude: Number(endLatitude),
          longitude: Number(endLongitude),
        },
        distanceMetres: Number(distanceMetres),
        initialBearingDegrees:
          initialBearingDegrees === ""
            ? null
            : Number(initialBearingDegrees),
        finalBearingDegrees:
          finalBearingDegrees === "" ? null : Number(finalBearingDegrees),
        toleranceMetres: Number(toleranceMetres),
      };
    });
}

test("near-antipodal pairs use the convergent ellipsoidal fallback", () => {
  const result = inverseGeodesic(
    { latitude: 0, longitude: 0 },
    { latitude: 0.5, longitude: 179.7 },
  );
  assert.equal(result.solver, "vincenty-direct-shooting");
  assert.ok(Math.abs(result.distanceMetres - 19944127.420750458) < 0.001);
});

test("near-antipodal route ambiguity is explicit and still closes on target", () => {
  const start = { latitude: 43.139205363724, longitude: 0 };
  const end = {
    latitude: -43.13920536372438,
    longitude: 179.55910699284908,
  };
  const inverse = inverseGeodesic(start, end);
  const destination = directGeodesic(
    start,
    inverse.initialBearingDegrees,
    inverse.distanceMetres,
  );

  assert.equal(inverse.ambiguous, true);
  assert.ok(Math.abs(destination.latitude - end.latitude) <= 1e-12);
  assert.ok(
    angularDifference(destination.longitude, end.longitude) <= 1e-12,
  );
});

test("cut-locus sensitivity marks a closing Vincenty route as ambiguous", () => {
  const result = inverseGeodesic(
    { latitude: 86.890600409059, longitude: 0 },
    {
      latitude: -86.89060040905908,
      longitude: 179.9671819225338,
    },
  );

  assert.equal(result.solver, "vincenty-inverse");
  assert.equal(result.ambiguous, true);
});

test("inverse and direct geodesic calculations round-trip", async () => {
  for (const vector of (await referenceVectors()).filter(
    (item) => item.initialBearingDegrees !== null,
  )) {
    const inverse = inverseGeodesic(vector.start, vector.end);
    const destination = directGeodesic(
      vector.start,
      inverse.initialBearingDegrees,
      inverse.distanceMetres,
    );
    assert.ok(
      Math.abs(destination.latitude - vector.end.latitude) < 1e-9,
      `${vector.id}: latitude`,
    );
    assert.ok(
      angularDifference(destination.longitude, vector.end.longitude) < 1e-9,
      `${vector.id}: longitude`,
    );
  }
});

test("sub-millimetre longitude differences preserve floating-point precision", () => {
  const start = { latitude: 0, longitude: 0 };
  const end = { latitude: 0, longitude: 1e-9 };
  const inverse = inverseGeodesic(start, end);
  const expectedDistance = 6_378_137 * 1e-9 * Math.PI / 180;

  assert.ok(
    Math.abs(inverse.distanceMetres - expectedDistance) <= 1e-15,
  );
  const destination = directGeodesic(
    start,
    inverse.initialBearingDegrees,
    inverse.distanceMetres,
  );
  assert.ok(Math.abs(destination.latitude) <= 1e-18);
  assert.ok(Math.abs(destination.longitude - end.longitude) <= 1e-18);
});

test("geodesic distance is symmetric and direct reconstruction stays within 1 mm", () => {
  let seed = 0x5a17c9e3;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  for (let index = 0; index < 250; index += 1) {
    const start = {
      latitude: -89 + random() * 178,
      longitude: -180 + random() * 360,
    };
    const end = {
      latitude: -89 + random() * 178,
      longitude: -180 + random() * 360,
    };
    const forward = inverseGeodesic(start, end);
    const reverse = inverseGeodesic(end, start);
    assert.ok(
      Math.abs(forward.distanceMetres - reverse.distanceMetres) <= 0.001,
      `distance symmetry ${index}`,
    );

    const destination = directGeodesic(
      start,
      forward.initialBearingDegrees,
      forward.distanceMetres,
    );
    const reconstructionError = inverseGeodesic(destination, end);
    assert.ok(
      reconstructionError.distanceMetres <= 0.001,
      `direct reconstruction ${index}: ${reconstructionError.distanceMetres} m`,
    );
  }
});

test("coincident points have zero distance and no azimuth", () => {
  const point = { latitude: 39.933365, longitude: 32.859742 };
  const result = inverseGeodesic(point, point);
  assert.equal(result.distanceMetres, 0);
  assert.equal(result.azimuthDefined, false);
  assert.equal(result.initialBearingDegrees, null);
});

test("pole identity and antipodal ambiguity ignore meaningless longitude", () => {
  for (const latitude of [-90, 90]) {
    const result = inverseGeodesic(
      { latitude, longitude: -135 },
      { latitude, longitude: 77 },
    );
    assert.equal(result.distanceMetres, 0);
    assert.equal(result.azimuthDefined, false);
    assert.equal(result.initialBearingDegrees, null);
    assert.equal(result.finalBearingDegrees, null);
    assert.equal(result.ambiguous, false);
    assert.equal(result.solver, "identity");
  }

  const antipodal = inverseGeodesic(
    { latitude: 90, longitude: 10 },
    { latitude: -90, longitude: 80 },
  );
  assert.ok(
    Math.abs(antipodal.distanceMetres - 20003931.458625447) <= 0.001,
  );
  assert.equal(antipodal.azimuthDefined, true);
  assert.equal(antipodal.ambiguous, true);
  assert.equal(antipodal.initialBearingDegrees, 0);
  assert.equal(antipodal.finalBearingDegrees, 180);
});

test("polyline length uses ellipsoidal segments and compensated summation", () => {
  const points = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
    { latitude: 1, longitude: 1 },
  ];
  const result = measureGeodesicPolyline(points);
  assert.equal(result.segmentCount, 2);
  assert.ok(
    Math.abs(result.distanceMetres - 221893.87935107236) < 0.001,
  );
  assert.equal(result.segments.length, 2);
});

test("geodesic path sampling follows the measured route at equal distances", () => {
  const start = { latitude: 39.933365, longitude: 32.859742 };
  const end = { latitude: 41.008238, longitude: 28.978359 };
  const path = sampleGeodesicPath(start, end, {
    maxSegmentMetres: 50_000,
    maxPoints: 100,
  });
  const inverse = inverseGeodesic(start, end);

  assert.equal(path.distanceMetres, inverse.distanceMetres);
  assert.deepEqual(path.points[0], start);
  assert.deepEqual(path.points.at(-1), end);
  assert.equal(path.points.length, path.segmentCount + 1);
  assert.ok(path.sampledMaximumSegmentMetres <= 50_000);

  for (let index = 1; index < path.points.length; index += 1) {
    const segment = inverseGeodesic(
      path.points[index - 1],
      path.points[index],
    );
    assert.ok(
      Math.abs(segment.distanceMetres - path.sampledMaximumSegmentMetres) <
        0.001,
      `sample segment ${index}`,
    );
  }
});

test("geodesic path sampling handles caps, poles and zero-length routes", () => {
  const capped = sampleGeodesicPath(
    { latitude: 0, longitude: 0 },
    { latitude: 90, longitude: 120 },
    { maxSegmentMetres: 1_000, maxPoints: 3 },
  );
  assert.equal(capped.points.length, 3);
  assert.equal(capped.segmentCount, 2);
  assert.ok(capped.sampledMaximumSegmentMetres > 1_000);
  assert.ok(
    capped.points.every(
      ({ latitude, longitude }) =>
        Number.isFinite(latitude) && Number.isFinite(longitude),
    ),
  );

  const point = { latitude: 90, longitude: -135 };
  const identity = sampleGeodesicPath(point, {
    latitude: 90,
    longitude: 77,
  });
  assert.equal(identity.distanceMetres, 0);
  assert.equal(identity.segmentCount, 0);
  assert.deepEqual(identity.points, [point]);
});

test("geodesic path sampling validates resource limits", () => {
  const start = { latitude: 0, longitude: 0 };
  const end = { latitude: 1, longitude: 1 };
  assert.throws(
    () => sampleGeodesicPath(start, end, { maxSegmentMetres: 0 }),
    /maxSegmentMetres/,
  );
  assert.throws(
    () => sampleGeodesicPath(start, end, { maxPoints: 10_002 }),
    /maxPoints/,
  );
});

test("invalid geodesic input fails closed", () => {
  assert.throws(
    () =>
      inverseGeodesic(
        { latitude: 91, longitude: 0 },
        { latitude: 0, longitude: 0 },
      ),
    /latitude/i,
  );
  assert.throws(
    () => measureGeodesicPolyline("not-an-array"),
    /array/i,
  );
});
