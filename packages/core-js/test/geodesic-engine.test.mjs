import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  directGeodesic,
  inverseGeodesic,
  measureGeodesicPolyline,
  sampleGeodesicPath,
} from "@omcoskun/convert-tools/geodesy";
import { groundErrorMetres } from "./support/vectors.mjs";

const VECTOR_URL = new URL(
  "../../../contracts/test-vectors/geodesic-wgs84.csv",
  import.meta.url,
);
const GEODTEST_SAMPLE_URL = new URL(
  "../../../contracts/test-vectors/geodtest-sample.csv",
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

async function geodtestSample() {
  const source = await readFile(GEODTEST_SAMPLE_URL, "utf8");
  const [headerLine, ...lines] = source.trim().split(/\r?\n/);
  const header = headerLine.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    const row = {};
    header.forEach((name, index) => {
      row[name] = cells[index];
    });
    return row;
  });
}

test("inverse geodesic reports the Karney solver and iteration count", () => {
  const result = inverseGeodesic(
    { latitude: 39.933365, longitude: 32.859742 },
    { latitude: 41.008238, longitude: 28.978359 },
  );

  assert.equal(result.solver, "karney-inverse");
  assert.equal(result.algorithm, "ellipsoidal");
  assert.equal(result.azimuthDefined, true);
  assert.ok(Number.isInteger(result.iterations));
  assert.equal(result.iterations, 3);
  assert.ok(Math.abs(result.distanceMetres - 350091.704424932) <= 1e-7);
  assert.ok(
    angularDifference(result.initialBearingDegrees, 291.1840610099589) <=
      1e-9,
  );
  assert.ok(
    angularDifference(result.finalBearingDegrees, 288.66413786860755) <=
      1e-9,
  );

  // Equatorial pair: solved in closed form, so no longitude evaluations.
  const equator = inverseGeodesic(
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
  );
  assert.equal(equator.solver, "karney-inverse");
  assert.equal(equator.iterations, 0);
});

test("near-antipodal pairs use the shortest Karney route", () => {
  const start = { latitude: 0, longitude: 0 };
  const end = { latitude: 0.5, longitude: 179.7 };
  const result = inverseGeodesic(start, end);
  const destination = directGeodesic(
    start,
    result.initialBearingDegrees,
    result.distanceMetres,
  );

  assert.equal(result.solver, "karney-inverse");
  assert.equal(result.ambiguous, false);
  assert.ok(result.iterations > 0);
  assert.ok(Math.abs(result.distanceMetres - 19944127.420750458) <= 1e-7);
  assert.ok(
    groundErrorMetres(
      destination.latitude,
      destination.longitude,
      end.latitude,
      end.longitude,
    ) <= 1e-6,
  );
});

test("exact antipodes take the route over the north pole", () => {
  for (const [start, end] of [
    [
      { latitude: 60, longitude: 25 },
      { latitude: -60, longitude: -155 },
    ],
    [
      { latitude: -60, longitude: -155 },
      { latitude: 60, longitude: 25 },
    ],
  ]) {
    const result = inverseGeodesic(start, end);
    assert.equal(result.solver, "karney-inverse");
    assert.equal(result.ambiguous, true);
    assert.equal(result.azimuthDefined, true);
    assert.equal(result.initialBearingDegrees, 0);
    assert.equal(result.finalBearingDegrees, 180);
    assert.equal(result.iterations, 0);
    assert.ok(
      Math.abs(result.distanceMetres - 20003931.458625447) <= 1e-7,
    );
  }
});

test("opposite poles are exact antipodes, one pole is not", () => {
  const poles = inverseGeodesic(
    { latitude: 90, longitude: 10 },
    { latitude: -90, longitude: 80 },
  );
  assert.equal(poles.solver, "karney-inverse");
  assert.equal(poles.ambiguous, true);
  assert.equal(poles.initialBearingDegrees, 0);
  assert.equal(poles.finalBearingDegrees, 180);
  assert.ok(Math.abs(poles.distanceMetres - 20003931.458625447) <= 1e-7);

  const onePole = inverseGeodesic(
    { latitude: 90, longitude: 10 },
    { latitude: 45, longitude: 80 },
  );
  assert.equal(onePole.solver, "karney-inverse");
  assert.equal(onePole.ambiguous, false);
  assert.equal(onePole.azimuthDefined, true);
  assert.ok(Math.abs(onePole.distanceMetres - 5017021.351334979) <= 1e-7);
  assert.ok(
    angularDifference(onePole.initialBearingDegrees, 110) <= 1e-9,
  );
  assert.ok(
    angularDifference(onePole.finalBearingDegrees, 180) <= 1e-9,
  );
});

test("equatorial points are ambiguous only beyond the cut locus", () => {
  const ambiguous = inverseGeodesic(
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 179.9 },
  );
  assert.equal(ambiguous.ambiguous, true);
  assert.equal(ambiguous.solver, "karney-inverse");
  assert.ok(
    Math.abs(ambiguous.distanceMetres - 20003008.421509411) <= 1e-7,
  );
  assert.ok(
    angularDifference(ambiguous.initialBearingDegrees, 9.54567269473891) <=
      1e-9,
  );

  const unique = inverseGeodesic(
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 179.0 },
  );
  assert.equal(unique.ambiguous, false);
  assert.equal(unique.iterations, 0);
  assert.ok(Math.abs(unique.distanceMetres - 19926188.851995971) <= 1e-7);
  assert.equal(unique.initialBearingDegrees, 90);
  assert.equal(unique.finalBearingDegrees, 90);

  // The rule's cut-locus branch is active only for f > 0.
  const prolate = { id: "PROLATE", a: 6400000, f: -1 / 300 };
  const prolateEquator = inverseGeodesic(
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 179.9 },
    { ellipsoid: prolate },
  );
  assert.equal(prolateEquator.ambiguous, false);
  const prolateAntipodes = inverseGeodesic(
    { latitude: 60, longitude: 25 },
    { latitude: -60, longitude: -155 },
    { ellipsoid: prolate },
  );
  assert.equal(prolateAntipodes.ambiguous, true);

  // Over the pole is not a shortest route on a prolate ellipsoid, so the
  // solved azimuths are returned and must lead to the end point.
  assert.notEqual(prolateAntipodes.initialBearingDegrees, 0);
  const landing = directGeodesic(
    { latitude: 60, longitude: 25 },
    prolateAntipodes.initialBearingDegrees,
    prolateAntipodes.distanceMetres,
    { ellipsoid: prolate },
  );
  assert.ok(Math.abs(landing.latitude + 60) <= 1e-11);
  assert.ok(angularDifference(landing.longitude, -155) <= 1e-11);
});

test("coincident points have zero distance and no azimuth", () => {
  const point = { latitude: 39.933365, longitude: 32.859742 };
  const result = inverseGeodesic(point, point);
  assert.equal(result.distanceMetres, 0);
  assert.equal(result.azimuthDefined, false);
  assert.equal(result.initialBearingDegrees, null);
  assert.equal(result.finalBearingDegrees, null);
  assert.equal(result.ambiguous, false);
  assert.equal(result.solver, "identity");
  assert.equal(result.algorithm, "ellipsoidal");
  assert.equal(result.iterations, 0);
});

test("pole identity ignores meaningless longitude", () => {
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
});

test("a sphere f = 0 works and matches the app distance", () => {
  const sphere = { id: "SPHERE", a: 6371008.8, f: 0 };
  const start = { latitude: 39.933365, longitude: 32.859742 };
  const end = { latitude: 41.008238, longitude: 28.978359 };
  const result = inverseGeodesic(start, end, { ellipsoid: sphere });

  assert.equal(result.solver, "karney-inverse");
  assert.equal(result.ellipsoid, "SPHERE");
  assert.equal(result.ambiguous, false);
  assert.ok(Math.abs(result.distanceMetres - 349365.585) <= 1e-3);
  assert.ok(Math.abs(result.distanceMetres - 349365.585359739) <= 1e-6);

  const destination = directGeodesic(
    start,
    result.initialBearingDegrees,
    result.distanceMetres,
    { ellipsoid: sphere },
  );
  assert.equal(destination.algorithm, "karney-direct");
  assert.ok(
    groundErrorMetres(
      destination.latitude,
      destination.longitude,
      end.latitude,
      end.longitude,
    ) <= 1e-6,
  );

  const equator = inverseGeodesic(
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 179.9 },
    { ellipsoid: sphere },
  );
  assert.equal(equator.ambiguous, false);
  assert.ok(
    Math.abs(equator.distanceMetres - 20003994.934012569) <= 1e-6,
  );
});

test("±180° longitudes wrap exactly", () => {
  const same = inverseGeodesic(
    { latitude: 0, longitude: -180 },
    { latitude: 0, longitude: 180 },
  );
  assert.equal(same.distanceMetres, 0);
  assert.equal(same.solver, "identity");

  const across = inverseGeodesic(
    { latitude: 0, longitude: 179.9 },
    { latitude: 0, longitude: -179.9 },
  );
  assert.equal(across.solver, "karney-inverse");
  assert.equal(across.ambiguous, false);
  assert.ok(Math.abs(across.distanceMetres - 22263.8981586534) <= 1e-7);
  assert.equal(across.initialBearingDegrees, 90);
  assert.equal(across.finalBearingDegrees, 90);

  const antipodes = inverseGeodesic(
    { latitude: 0, longitude: -180 },
    { latitude: 0, longitude: 0 },
  );
  assert.equal(antipodes.ambiguous, true);
  assert.equal(antipodes.initialBearingDegrees, 0);
  assert.equal(antipodes.finalBearingDegrees, 180);
  assert.ok(
    Math.abs(antipodes.distanceMetres - 20003931.458625447) <= 1e-7,
  );
});

test("sub-millimetre longitude differences preserve floating-point precision", () => {
  const start = { latitude: 0, longitude: 0 };
  const end = { latitude: 0, longitude: 1e-9 };
  const inverse = inverseGeodesic(start, end);
  const expectedDistance = (6_378_137 * 1e-9 * Math.PI) / 180;

  assert.equal(inverse.solver, "karney-inverse");
  assert.equal(inverse.iterations, 0);
  assert.ok(Math.abs(inverse.distanceMetres - expectedDistance) <= 1e-15);
  const destination = directGeodesic(
    start,
    inverse.initialBearingDegrees,
    inverse.distanceMetres,
  );
  assert.ok(Math.abs(destination.latitude) <= 1e-18);
  assert.ok(Math.abs(destination.longitude - end.longitude) <= 1e-18);
});

test("direct geodesic uses the geodesic line solver", () => {
  const result = directGeodesic({ latitude: 40, longitude: 30 }, 45, 1_000_000);
  assert.equal(result.algorithm, "karney-direct");
  assert.equal(result.iterations, 0);
  assert.ok(Math.abs(result.latitude - 46.024528045618133) <= 1e-9);
  assert.ok(Math.abs(result.longitude - 39.133640278666221) <= 1e-9);
  assert.ok(
    angularDifference(result.finalBearingDegrees, 51.24627648456358) <= 1e-9,
  );

  const zero = directGeodesic({ latitude: 40, longitude: 30 }, 45, 0);
  assert.equal(zero.latitude, 40);
  assert.equal(zero.longitude, 30);
  assert.equal(zero.finalBearingDegrees, 45);
  assert.equal(zero.algorithm, "karney-direct");
  assert.equal(zero.iterations, 0);
});

test("deprecated iteration options are validated but ignored", () => {
  const start = { latitude: 0, longitude: 0 };
  const end = { latitude: 0.5, longitude: 179.7 };
  const baseline = inverseGeodesic(start, end);
  const ignored = inverseGeodesic(start, end, {
    tolerance: 1e-3,
    maxIterations: 1,
  });
  assert.equal(ignored.distanceMetres, baseline.distanceMetres);
  assert.equal(ignored.iterations, baseline.iterations);

  assert.throws(
    () => inverseGeodesic(start, end, { tolerance: 0 }),
    /iteration options/i,
  );
  assert.throws(
    () => inverseGeodesic(start, end, { maxIterations: 0 }),
    /iteration options/i,
  );
  assert.throws(
    () => inverseGeodesic(start, end, { maxIterations: 2.5 }),
    /iteration options/i,
  );
});

test("geodtest sample matches inverse and direct within 1e-7 m", async (t) => {
  const rows = await geodtestSample();
  assert.equal(rows.length, 1000);
  const failures = [];
  let maxDistanceError = 0;
  let maxAzimuthOffset = 0;
  let maxDirectError = 0;

  for (const row of rows) {
    const start = {
      latitude: Number(row.lat1),
      longitude: Number(row.lon1),
    };
    const end = {
      latitude: Number(row.lat2),
      longitude: Number(row.lon2),
    };
    const expectedDistance = Number(row.s12);
    const expectedAzimuth1 = Number(row.azi1);
    const expectedAzimuth2 = Number(row.azi2);
    const reducedLength = Number(row.m12);

    const inverse = inverseGeodesic(start, end);
    const distanceError = Math.abs(
      inverse.distanceMetres - expectedDistance,
    );
    maxDistanceError = Math.max(maxDistanceError, distanceError);
    if (!(distanceError <= 1e-7)) {
      failures.push(`${row.id}: inverse distance off by ${distanceError} m`);
    }
    const azimuthOffset =
      (angularDifference(inverse.initialBearingDegrees, expectedAzimuth1) *
        Math.PI *
        Math.abs(reducedLength)) /
      180;
    maxAzimuthOffset = Math.max(maxAzimuthOffset, azimuthOffset);
    if (!(azimuthOffset <= 1e-7)) {
      failures.push(
        `${row.id}: initial azimuth moves the endpoint by ${azimuthOffset} m`,
      );
    }

    const direct = directGeodesic(start, expectedAzimuth1, expectedDistance);
    const positionError = groundErrorMetres(
      direct.latitude,
      direct.longitude,
      end.latitude,
      end.longitude,
    );
    maxDirectError = Math.max(maxDirectError, positionError);
    if (!(positionError <= 1e-7)) {
      failures.push(`${row.id}: direct position off by ${positionError} m`);
    }
    const finalAzimuthError = angularDifference(
      direct.finalBearingDegrees,
      expectedAzimuth2,
    );
    if (
      Math.abs(end.latitude) < 90 &&
      !(finalAzimuthError <= 1e-6)
    ) {
      failures.push(
        `${row.id}: direct final azimuth off by ${finalAzimuthError}°`,
      );
    }
  }

  t.diagnostic(
    `geodtest sample: max distance ${maxDistanceError.toExponential(3)} m, ` +
      `max azimuth offset ${maxAzimuthOffset.toExponential(3)} m, ` +
      `max direct position ${maxDirectError.toExponential(3)} m`,
  );
  assert.deepEqual(failures.slice(0, 10), []);
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
  assert.equal(result.segments[0].solver, "karney-inverse");
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

test("geodesic path sampling reaches exact antipodes and handles caps", () => {
  const antipodal = sampleGeodesicPath(
    { latitude: 60, longitude: 25 },
    { latitude: -60, longitude: -155 },
    { maxSegmentMetres: 1_000_000, maxPoints: 100 },
  );
  assert.equal(antipodal.ambiguous, true);
  assert.deepEqual(antipodal.points.at(-1), {
    latitude: -60,
    longitude: -155,
  });

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
