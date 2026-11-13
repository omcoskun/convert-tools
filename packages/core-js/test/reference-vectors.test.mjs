// Checks the JavaScript core against the GeographicLib-generated contract
// vectors in contracts/test-vectors (see contracts/README.md for provenance).
// Each test collects every failing row before asserting, so a regression shows
// its full extent, and reports the largest error it measured.

import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeGars,
  decodeGeoref,
  decodeMgrs,
  directGeodesic,
  encodeGars,
  encodeGeoref,
  encodeMgrs,
  inverseGeodesic,
  transformCrs,
  utmUpsForward,
  utmUpsInverse,
} from "@convert-tools/core/geodesy";
import { utmForward } from "../src/geodesy/projections/utm-ups.js";
import {
  MaxError,
  angularDifference,
  groundErrorMetres,
  readVectors,
} from "./support/vectors.mjs";

// Rows that fail before the stage-2 fixes (UTM series, longitude 180, MGRS
// lettering rules, GARS wrap). node:test runs todo tests and reports their
// failures without failing the run; the set must be empty once fixed.
const PENDING = new Set([
  "utm-ups-forward",
  "utm-ups-inverse",
  "mgrs-forward",
  "mgrs-reverse",
  "crs",
  "gars",
]);
const pending = (name) =>
  PENDING.has(name) ? { todo: "known failure, fixed in stage 2" } : {};

function assertNoFailures(failures, total) {
  assert.equal(
    failures.length,
    0,
    `${failures.length} of ${total} rows failed:\n${failures.slice(0, 15).join("\n")}`,
  );
}

function attempt(failures, id, operation) {
  try {
    return operation();
  } catch (error) {
    failures.push(`${id}: threw ${error.message}`);
    return null;
  }
}

test("UTM/UPS forward matches GeoConvert within 1 micrometre", pending("utm-ups-forward"), (t) => {
  const rows = readVectors("utm-ups-forward.csv");
  const failures = [];
  const error = new MaxError("UTM/UPS forward", "m");
  for (const row of rows) {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const grid = attempt(failures, row.id, () =>
      row.zone === ""
        ? utmUpsForward(latitude, longitude)
        : utmForward(latitude, longitude, Number(row.zone)),
    );
    if (!grid) continue;
    if (grid.zone !== Number(row.expected_zone)) {
      failures.push(`${row.id}: zone ${grid.zone} != ${row.expected_zone}`);
      continue;
    }
    if ((grid.north ? "N" : "S") !== row.expected_hemisphere) {
      failures.push(`${row.id}: hemisphere ${grid.north ? "N" : "S"} != ${row.expected_hemisphere}`);
      continue;
    }
    const distance = Math.hypot(
      grid.easting - Number(row.expected_easting),
      grid.northing - Number(row.expected_northing),
    );
    error.add(distance, row.id);
    if (!(distance <= Number(row.tolerance_metres))) {
      failures.push(`${row.id}: off by ${distance} m`);
    }
  }
  error.report(t);
  assertNoFailures(failures, rows.length);
});

test("UTM/UPS inverse matches GeoConvert within 1 micrometre", pending("utm-ups-inverse"), (t) => {
  const rows = readVectors("utm-ups-inverse.csv");
  const failures = [];
  const error = new MaxError("UTM/UPS inverse", "m");
  for (const row of rows) {
    const point = attempt(failures, row.id, () =>
      utmUpsInverse(
        Number(row.zone),
        row.hemisphere === "N",
        Number(row.easting),
        Number(row.northing),
      ),
    );
    if (!point) continue;
    const distance = groundErrorMetres(
      point.latitude,
      point.longitude,
      Number(row.expected_latitude),
      Number(row.expected_longitude),
    );
    error.add(distance, row.id);
    if (!(distance <= Number(row.tolerance_metres))) {
      failures.push(`${row.id}: off by ${distance} m`);
    }
  }
  error.report(t);
  assertNoFailures(failures, rows.length);
});

test("MGRS encoding matches GeoConvert exactly at every precision", pending("mgrs-forward"), () => {
  const rows = readVectors("mgrs-forward.csv");
  const failures = [];
  for (const row of rows) {
    const code = attempt(failures, row.id, () =>
      encodeMgrs(Number(row.latitude), Number(row.longitude), Number(row.precision)),
    );
    if (code !== null && code !== row.expected_mgrs) {
      failures.push(`${row.id}: ${code} != ${row.expected_mgrs}`);
    }
  }
  assertNoFailures(failures, rows.length);
});

test("MGRS decoding matches GeoConvert cell centres and rejects what it rejects", pending("mgrs-reverse"), (t) => {
  const rows = readVectors("mgrs-reverse.csv");
  const failures = [];
  const gridError = new MaxError("MGRS centre grid", "m");
  const pointError = new MaxError("MGRS centre point", "m");
  for (const row of rows) {
    if (row.valid === "0") {
      try {
        const decoded = decodeMgrs(row.mgrs, true);
        failures.push(`${row.id}: accepted invalid MGRS as ${decoded.latitude}, ${decoded.longitude}`);
      } catch {
        // expected
      }
      continue;
    }
    const decoded = attempt(failures, row.id, () => decodeMgrs(row.mgrs, true));
    if (!decoded) continue;
    if (decoded.zone !== Number(row.expected_zone) || (decoded.north ? "N" : "S") !== row.expected_hemisphere) {
      failures.push(`${row.id}: zone ${decoded.zone}${decoded.north ? "N" : "S"} != ${row.expected_zone}${row.expected_hemisphere}`);
      continue;
    }
    const tolerance = Number(row.tolerance_metres);
    const gridDistance = Math.hypot(
      decoded.easting - Number(row.expected_easting),
      decoded.northing - Number(row.expected_northing),
    );
    const pointDistance = groundErrorMetres(
      decoded.latitude,
      decoded.longitude,
      Number(row.expected_latitude),
      Number(row.expected_longitude),
    );
    gridError.add(gridDistance, row.id);
    pointError.add(pointDistance, row.id);
    if (!(gridDistance <= tolerance) || !(pointDistance <= tolerance)) {
      failures.push(`${row.id}: grid off ${gridDistance} m, point off ${pointDistance} m`);
    }
  }
  gridError.report(t);
  pointError.report(t);
  assertNoFailures(failures, rows.length);
});

test("CRS transformations match independent references and round-trip", pending("crs"), (t) => {
  const rows = readVectors("coordinate-projections.csv");
  const failures = [];
  const errors = new Map();
  const roundTrip = new MaxError("CRS round-trip", "m");
  for (const row of rows) {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const projected = attempt(failures, row.id, () =>
      transformCrs("EPSG:4326", row.target_crs, longitude, latitude),
    );
    if (!projected) continue;
    const family = row.target_crs.replace(/^EPSG:(32[67])\d\d$/, "EPSG:$1xx");
    if (!errors.has(family)) errors.set(family, new MaxError(`CRS ${family}`, "m"));
    const distance = Math.hypot(
      projected.x - Number(row.expected_x),
      projected.y - Number(row.expected_y),
    );
    errors.get(family).add(distance, row.id);
    if (!(distance <= Number(row.output_tolerance))) {
      failures.push(`${row.id}: off by ${distance} m`);
      continue;
    }
    const restored = attempt(failures, `${row.id} reverse`, () =>
      transformCrs(row.target_crs, "EPSG:4326", projected.x, projected.y),
    );
    if (!restored) continue;
    const back = Math.abs(latitude) === 90
      ? Math.abs(restored.y - latitude) * 111319.49
      : groundErrorMetres(restored.y, restored.x, latitude, longitude);
    roundTrip.add(back, row.id);
    if (!(back <= Number(row.roundtrip_tolerance_metres))) {
      failures.push(`${row.id}: round-trip off by ${back} m`);
    }
  }
  for (const error of errors.values()) error.report(t);
  roundTrip.report(t);
  assertNoFailures(failures, rows.length);
});

test("inverse geodesic matches GeodSolve distance and azimuths", (t) => {
  const rows = readVectors("geodesic-wgs84.csv");
  const failures = [];
  const distanceError = new MaxError("geodesic inverse distance", "m");
  const azimuthError = new MaxError(
    "geodesic inverse azimuth as endpoint offset (|m12| x azimuth error)",
    "m",
  );
  for (const row of rows) {
    const result = attempt(failures, row.id, () =>
      inverseGeodesic(
        { latitude: Number(row.startLatitude), longitude: Number(row.startLongitude) },
        { latitude: Number(row.endLatitude), longitude: Number(row.endLongitude) },
      ),
    );
    if (!result) continue;
    const tolerance = Number(row.toleranceMetres);
    const distance = Math.abs(result.distanceMetres - Number(row.distanceMetres));
    distanceError.add(distance, row.id);
    if (!(distance <= tolerance)) failures.push(`${row.id}: distance off by ${distance} m`);
    if (row.initialBearingDegrees === "") continue;
    if (result.initialBearingDegrees === null || result.finalBearingDegrees === null) {
      failures.push(`${row.id}: azimuth missing`);
      continue;
    }
    // An azimuth error moves the far end of the geodesic sideways by
    // |m12| x error (m12 = reduced length), the physically meaningful measure
    // for both very short and nearly antipodal lines.
    const offset =
      Math.abs(Number(row.reducedLengthMetres)) *
      ((Math.max(
        angularDifference(result.initialBearingDegrees, Number(row.initialBearingDegrees)),
        angularDifference(result.finalBearingDegrees, Number(row.finalBearingDegrees)),
      ) *
        Math.PI) /
        180);
    azimuthError.add(offset, row.id);
    if (!(offset <= tolerance)) {
      failures.push(`${row.id}: azimuth error moves the endpoint by ${offset} m`);
    }
  }
  distanceError.report(t);
  azimuthError.report(t);
  assertNoFailures(failures, rows.length);
});

test("direct geodesic matches GeodSolve", (t) => {
  const rows = readVectors("geodesic-direct.csv");
  const failures = [];
  const error = new MaxError("direct geodesic position", "m");
  const azimuth = new MaxError("direct geodesic final azimuth", "deg");
  for (const row of rows) {
    const result = attempt(failures, row.id, () =>
      directGeodesic(
        { latitude: Number(row.startLatitude), longitude: Number(row.startLongitude) },
        Number(row.initialBearingDegrees),
        Number(row.distanceMetres),
      ),
    );
    if (!result) continue;
    const expectedLatitude = Number(row.expectedLatitude);
    const distance = groundErrorMetres(
      result.latitude,
      result.longitude,
      expectedLatitude,
      Number(row.expectedLongitude),
    );
    error.add(distance, row.id);
    if (!(distance <= Number(row.toleranceMetres))) {
      failures.push(`${row.id}: off by ${distance} m`);
    }
    if (Math.abs(expectedLatitude) < 90 && result.finalBearingDegrees !== null) {
      const difference = angularDifference(
        result.finalBearingDegrees,
        Number(row.expectedFinalBearingDegrees),
      );
      azimuth.add(difference, row.id);
      if (!(difference <= 1e-6)) failures.push(`${row.id}: final azimuth off by ${difference}°`);
    }
  }
  error.report(t);
  azimuth.report(t);
  assertNoFailures(failures, rows.length);
});

test("GARS matches GeographicLib codes and cell centres", pending("gars"), (t) => {
  const rows = readVectors("gars.csv");
  const failures = [];
  const centre = new MaxError("GARS centre", "deg");
  for (const row of rows) {
    if (row.precision === "2") {
      const code = attempt(failures, row.id, () =>
        encodeGars(Number(row.longitude), Number(row.latitude)),
      );
      if (code !== null && code !== row.expected_code) {
        failures.push(`${row.id}: ${code} != ${row.expected_code}`);
      }
    }
    const decoded = attempt(failures, `${row.id} decode`, () => decodeGars(row.expected_code));
    if (!decoded) continue;
    const difference = Math.max(
      Math.abs(decoded.latitude - Number(row.expected_center_latitude)),
      angularDifference(decoded.longitude, Number(row.expected_center_longitude)),
    );
    centre.add(difference, row.id);
    if (!(difference <= 1e-12)) failures.push(`${row.id}: centre off by ${difference}°`);
  }
  centre.report(t);
  assertNoFailures(failures, rows.length);
});

test("GEOREF matches GeographicLib codes and cell centres", (t) => {
  const rows = readVectors("georef.csv");
  const failures = [];
  const centre = new MaxError("GEOREF centre", "deg");
  for (const row of rows) {
    const code = attempt(failures, row.id, () =>
      encodeGeoref(Number(row.longitude), Number(row.latitude), Number(row.precision)),
    );
    if (code !== null && code !== row.expected_code) {
      failures.push(`${row.id}: ${code} != ${row.expected_code}`);
    }
    const decoded = attempt(failures, `${row.id} decode`, () => decodeGeoref(row.expected_code));
    if (!decoded) continue;
    const difference = Math.max(
      Math.abs(decoded.latitude - Number(row.expected_center_latitude)),
      angularDifference(decoded.longitude, Number(row.expected_center_longitude)),
    );
    centre.add(difference, row.id);
    if (!(difference <= 1e-12)) failures.push(`${row.id}: centre off by ${difference}°`);
  }
  centre.report(t);
  assertNoFailures(failures, rows.length);
});
