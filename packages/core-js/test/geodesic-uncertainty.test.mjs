// The inverse problem's azimuths and area are ill-conditioned for nearly
// antipodal points: an endpoint offset e turns the geodesic by about e / |m12|
// at its start, and S12 moves by the area swept between the two geodesics,
// rad(turn) * integral of m(t) dt, which is at most rad(turn) * s12^2 / 2
// (m(t) <= t on an ellipsoid) and about rad(turn) * 2 c^2 for a half
// meridian. Every inverse result reports how far its azimuths and area may be
// from the exact ones, so a display shows only the digits that mean something:
//   bearingUncertaintyDegrees    min(180, max(1e-11, deg(1e-7 m / |m12|)))
//   areaUncertaintySquareMetres  rad(bearingUncertainty) min(2 c^2, s12^2 / 2) + 1e-14 c^2
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

test("an ordinary line has a tiny azimuth uncertainty and an area uncertainty of round-off", () => {
  // Ankara - Istanbul, m12 = s12 = 350 km: 1e-7 m / 350 km is 1.6e-11°; the
  // swept area is 2.9e-13 rad * (350 km)^2 / 2 = 0.02 m^2, plus 0.41 m^2 of
  // round-off.
  const result = inverseGeodesic({ latitude: 39.933365, longitude: 32.859742 }, { latitude: 41.008238, longitude: 28.978359 });
  assert.ok(result.bearingUncertaintyDegrees > 1e-11 && result.bearingUncertaintyDegrees < 2e-11, String(result.bearingUncertaintyDegrees));
  assert.ok(result.areaUncertaintySquareMetres > 0.4 && result.areaUncertaintySquareMetres < 0.45, String(result.areaUncertaintySquareMetres));
});

test("a short line's area uncertainty is round-off, not c^2 times its azimuth uncertainty", () => {
  // 5 km: the azimuths may turn by 1e-7 m / 5 km = 2e-11 rad, which would be
  // 1600 m^2 as 2 c^2 times it; the area swept is 2e-11 * (5 km)^2 / 2.
  const result = inverseGeodesic({ latitude: 39.9, longitude: 32.8 }, { latitude: 39.9, longitude: 32.8586 });
  assert.ok(result.distanceMetres > 4900 && result.distanceMetres < 5100, String(result.distanceMetres));
  assert.ok(result.areaUncertaintySquareMetres < 0.42, String(result.areaUncertaintySquareMetres));
});

test("the area uncertainty is the swept area on the ellipsoid of the measurement", () => {
  const ellipsoid = { id: "oblate-50", a: 6378137, f: 1 / 50 };
  for (const end of [{ latitude: 10, longitude: 30 }, { latitude: -9.9, longitude: 179.5 }]) {
    const result = inverseGeodesic({ latitude: 10, longitude: 0 }, end, { ellipsoid });
    const e2 = ellipsoid.f * (2 - ellipsoid.f);
    const e = Math.sqrt(e2);
    const c2 = (ellipsoid.a ** 2 + (ellipsoid.a * (1 - ellipsoid.f)) ** 2 * (Math.atanh(e) / e)) / 2;
    const turn = result.bearingUncertaintyDegrees * (Math.PI / 180);
    const expected = turn * Math.min(2 * c2, result.distanceMetres ** 2 / 2) + 1e-14 * c2;
    assert.ok(Math.abs(result.areaUncertaintySquareMetres - expected) <= 1e-9 * expected, `${result.areaUncertaintySquareMetres} vs ${expected}`);
  }
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
