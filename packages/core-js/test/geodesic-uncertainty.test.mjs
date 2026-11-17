// The inverse problem's azimuths and area are ill-conditioned for nearly
// antipodal points: an endpoint offset e moves the azimuths by about e / |m12|
// and S12 by about 2 c^2 e / |m12|. Every inverse result reports how far its
// azimuths and area may be from the exact ones, so a display shows only the
// digits that mean something:
//   bearingUncertaintyDegrees    min(180, max(1e-11, deg(1e-7 m / |m12|)))
//   areaUncertaintySquareMetres  2 c^2 rad(bearingUncertainty) + 1e-14 c^2
// 1e-7 m is the contract's azimuth tolerance |delta azi| * |m12| (all 500000
// GeodTest rows meet it; the largest is 7.53e-8 m). These tests check that
// the reported bounds hold on every row of the GeodSolve vectors.
import test from "node:test";
import assert from "node:assert/strict";
import { inverseGeodesic, measureGeodesicPolyline } from "@convert-tools/core";
import { angularDifference, readVectors } from "./support/vectors.mjs";

const WGS84 = { id: "WGS84", a: 6378137, f: 1 / 298.257223563 };

function ellipsoidOf(row) {
  return row.ellipsoid === undefined ? WGS84 : { id: row.ellipsoid, a: Number(row.a), f: Number(row.f) };
}

test("an ordinary line has a tiny azimuth uncertainty and an area uncertainty of square metres", () => {
  // Ankara - Istanbul, m12 = 350 km: 1e-7 m / 350 km is 1.6e-11°, and
  // 2 c^2 times that in radians is 23 m^2, plus 0.41 m^2 of round-off. Over
  // GeodTest, S12 errors behave as c^2 e / |m12| with e up to 2e-8 m, so S12
  // is not known to 0.1 m^2 on ordinary lines either.
  const result = inverseGeodesic({ latitude: 39.933365, longitude: 32.859742 }, { latitude: 41.008238, longitude: 28.978359 });
  assert.ok(result.bearingUncertaintyDegrees > 1e-11 && result.bearingUncertaintyDegrees < 2e-11, String(result.bearingUncertaintyDegrees));
  assert.ok(result.areaUncertaintySquareMetres > 23 && result.areaUncertaintySquareMetres < 24, String(result.areaUncertaintySquareMetres));
});

test("coincident points have no azimuth and no uncertainty", () => {
  const result = inverseGeodesic({ latitude: 10, longitude: 20 }, { latitude: 10, longitude: 20 });
  assert.equal(result.azimuthDefined, false);
  assert.equal(result.bearingUncertaintyDegrees, null);
  assert.equal(result.areaUncertaintySquareMetres, null);
});

test("nearly antipodal points get wide azimuth and area uncertainties", () => {
  // GeodTest row 474500 (near-vertex block): m12 = 8.3e-4 m.
  const result = inverseGeodesic(
    { latitude: "56.796245515064", longitude: "0" },
    { latitude: "-56.796245515064519948", longitude: "179.668926360912281556" },
  );
  assert.ok(Math.abs(result.reducedLengthMetres) < 1, `m12 ${result.reducedLengthMetres}`);
  const expected = (1e-7 / Math.abs(result.reducedLengthMetres)) * (180 / Math.PI);
  assert.ok(Math.abs(result.bearingUncertaintyDegrees - Math.max(1e-11, expected)) <= 1e-12 * Math.max(1, expected));
  assert.ok(result.areaUncertaintySquareMetres > 1);
});

test("the uncertainty never exceeds a half turn, even where m12 vanishes", () => {
  // Opposite poles: m12 is zero to round-off.
  const result = inverseGeodesic({ latitude: 90, longitude: 0 }, { latitude: -90, longitude: 0 });
  assert.equal(result.bearingUncertaintyDegrees, 180);
  assert.ok(Number.isFinite(result.areaUncertaintySquareMetres));
});

test("each route segment reports its own uncertainties", () => {
  const route = measureGeodesicPolyline([
    { latitude: 10, longitude: 0 },
    { latitude: -10, longitude: 179 },
    { latitude: 5, longitude: 5 },
  ]);
  for (const segment of route.segments) {
    assert.equal(typeof segment.bearingUncertaintyDegrees, "number");
    assert.equal(typeof segment.areaUncertaintySquareMetres, "number");
  }
});

for (const name of ["geodesic-wgs84.csv", "geodesic-ellipsoids.csv"]) {
  test(`the reported bounds hold on every row of ${name}`, () => {
    const rows = readVectors(name);
    const failures = [];
    let checked = 0;
    for (const row of rows) {
      if (row.initialBearingDegrees === "") continue; // the route is not unique
      const result = inverseGeodesic(
        { latitude: Number(row.startLatitude), longitude: Number(row.startLongitude) },
        { latitude: Number(row.endLatitude), longitude: Number(row.endLongitude) },
        { ellipsoid: ellipsoidOf(row) },
      );
      if (!result.azimuthDefined) continue;
      checked += 1;
      const azimuth = Math.max(
        angularDifference(result.initialBearingDegrees, Number(row.initialBearingDegrees)),
        angularDifference(result.finalBearingDegrees, Number(row.finalBearingDegrees)),
      );
      if (!(azimuth <= result.bearingUncertaintyDegrees)) {
        failures.push(`${row.id}: azimuth off by ${azimuth}° > ${result.bearingUncertaintyDegrees}°`);
      }
      if (row.areaSquareMetres !== "") {
        const area = Math.abs(result.areaSquareMetres - Number(row.areaSquareMetres));
        if (!(area <= result.areaUncertaintySquareMetres)) {
          failures.push(`${row.id}: S12 off by ${area} m^2 > ${result.areaUncertaintySquareMetres} m^2`);
        }
      }
    }
    assert.ok(checked > 1000, `checked ${checked} rows`);
    assert.equal(failures.length, 0, `${failures.length} rows failed:\n${failures.slice(0, 15).join("\n")}`);
  });
}
