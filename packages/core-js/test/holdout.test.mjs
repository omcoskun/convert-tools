// Hold-out checks, gated by contracts/test-vectors/holdout.txt. The
// repository has said "enabled" since the independent test phase ended
// (docs/GEODESIC_VALIDATION.md, section "Hold-out"), so they run on every
// push; with "disabled" they only print one line saying so. They check:
//   (a) arcDegrees, reducedLengthMetres and areaSquareMetres of the inverse
//       and direct solvers against the a12, m12, S12 columns of
//       geodtest-sample.csv, with the tolerances of the contract vectors
//       (contracts/README.md): a12 1e-7 m / (a * 1 degree), m12 1e-7 m, and
//       S12 0.25 m^2 + c^2 * noise, noise = 1e-8 m * (1 / (a cos(lat1)) +
//       1 / (a cos(lat2))), plus 1e-8 m / |m12| for the inverse. S12 moves by
//       c^2 times the azimuth error; an endpoint error d moves the azimuth by
//       about d / (a cos(lat)) near a pole and the inverse solvers fix alp1
//       to about d / |m12|. 1e-8 m is ten times the measured endpoint noise;
//       GeodSolve itself differs from GeodSolve -E by up to 2e4 m^2 on
//       self-generated lines ending within metres of a pole. The inverse a12
//       and m12 limits follow the rule of docs/GEODESIC_VALIDATION.md, ours <=
//       max(2 * reference-binary maximum in the row's GeodTest block, floor),
//       with the GeodSolve maxima of the full 500000-line run
//       (REFERENCE_INVERSE). Only the near-vertex block (a12 = 180 - 1e-7
//       deg, both quantities ill-conditioned there) lifts a limit above its
//       floor; the direct a12 and m12 maxima of GeodSolve (8.53e-14 deg,
//       8.40e-9 m) stay below half their floors in every block;
//   (b) the triaxial inverse and direct solvers against geod3test-sample.csv
//       (a = sqrt(2), b = 1, c = 1/sqrt(2)) with the floors of the full-set
//       limits: inverse distance, direct position and inverse
//       |delta alp1| * |m12*| 1e-13, direct m12, M12, M21 1e-11. Where the
//       sample lists a point pair more than once the inverse azimuth is
//       judged against the best-matching row; a pair whose other shortest
//       lines are not in the sample passes the azimuth check when the line
//       of our azimuth and length reaches point 2 within 1e-13.
// HOLDOUT_VECTOR_DIR (a directory URL or path) replaces contracts/test-vectors
// for this file only; it exists so that the gated code can be exercised on
// synthetic files of the same layout without opening the hold-out data.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  directGeodesic,
  directTriaxialGeodesic,
  inverseGeodesic,
  inverseTriaxialGeodesic,
  triaxialToCartesian,
} from "@convert-tools/core/geodesy";
import { pathToFileURL } from "node:url";
import { MaxError, readCsv } from "./support/vectors.mjs";

const DIRECTORY = process.env.HOLDOUT_VECTOR_DIR
  ? pathToFileURL(`${process.env.HOLDOUT_VECTOR_DIR.replace(/\/$/, "")}/`)
  : new URL("../../../contracts/test-vectors/", import.meta.url);
const SWITCH = readFileSync(new URL("holdout.txt", DIRECTORY), "utf8").trim();
const A = 6378137;
const F = 1 / 298.257223563;
const AREA_FLOOR = 0.25;
const AREA_AZIMUTH_NOISE = 1e-8;
const C2 = (() => {
  const b = A * (1 - F);
  const e = Math.sqrt(F * (2 - F));
  return (A * A + (b * b * Math.atanh(e)) / e) / 2;
})();
// GeodTest blocks in line order (contracts/tools/validate-geodtest.mjs) with
// GeodSolve's largest inverse a12 (deg) and m12 (m) error in each over all
// 500000 lines (GeographicLib 2.7, run of 2026-11-17; near-vertex recomputed
// at its worst line 459433, the others as printed to three digits).
const REFERENCE_INVERSE = [
  ["random", 100000, 5.68e-14, 4.19e-9],
  ["antipodal", 50000, 1.14e-13, 2.66e-8],
  ["short", 50000, 2.59e-14, 3.2e-9],
  ["one-pole", 50000, 5.68e-14, 3.73e-9],
  ["opposite-poles", 50000, 2.84e-14, 1.97e-9],
  ["meridional", 50000, 2.84e-14, 3.73e-9],
  ["equatorial", 50000, 5.68e-14, 4.66e-9],
  ["vertex-to-vertex", 50000, 0, 3e-9],
  ["near-vertex", 50000, 1.3617e-10, 4.537e-5],
];

/** The REFERENCE_INVERSE entry of the block holding GeodTest line `index`. */
function referenceBlock(index) {
  let first = 0;
  for (const block of REFERENCE_INVERSE) {
    if (index < first + block[1]) return block;
    first += block[1];
  }
  throw new Error(`GeodTest line ${index} is past the last block`);
}

test("hold-out switch says enabled or disabled", () => {
  assert.ok(SWITCH === "enabled" || SWITCH === "disabled", `holdout.txt says ${JSON.stringify(SWITCH)}`);
});

if (SWITCH !== "enabled") {
  test("hold-out checks disabled (contracts/test-vectors/holdout.txt)", (t) => {
    t.diagnostic("hold-out disabled: a12/m12/S12 of geodtest-sample.csv and Geod3Test not checked");
  });
} else {
  test("hold-out: GeodTest sample a12, m12, S12 (inverse and direct)", (t) => {
    const rows = readCsv(new URL("geodtest-sample.csv", DIRECTORY), undefined, "geodtest-sample.csv");
    const errors = {
      inverseA12: new MaxError("GeodTest sample inverse a12", "deg"),
      inverseM12: new MaxError("GeodTest sample inverse m12", "m"),
      inverseS12: new MaxError("GeodTest sample inverse S12", "m^2"),
      directA12: new MaxError("GeodTest sample direct a12", "deg"),
      directM12: new MaxError("GeodTest sample direct m12", "m"),
      directS12: new MaxError("GeodTest sample direct S12", "m^2"),
    };
    const failures = [];
    const check = (name, value, limit, id) => {
      errors[name].add(value, id);
      if (!(value <= limit)) failures.push(`${id}: ${name} off by ${value} (limit ${limit})`);
    };
    for (const row of rows) {
      const start = { latitude: Number(row.lat1), longitude: Number(row.lon1) };
      const m12 = Number(row.m12);
      const inverse = inverseGeodesic(start, { latitude: Number(row.lat2), longitude: Number(row.lon2) });
      const direct = directGeodesic(start, Number(row.azi1), Number(row.s12));
      const [, , referenceA12, referenceM12] = referenceBlock(Number(row.id.replace(/^geodtest-/, "")));
      for (const [kind, result] of [["inverse", inverse], ["direct", direct]]) {
        const a12Floor = 1e-7 / ((A * Math.PI) / 180);
        const a12Limit = kind === "inverse" ? Math.max(2 * referenceA12, a12Floor) : a12Floor;
        const m12Limit = kind === "inverse" ? Math.max(2 * referenceM12, 1e-7) : 1e-7;
        check(`${kind}A12`, Math.abs(result.arcDegrees - Number(row.a12)), a12Limit, row.id);
        check(`${kind}M12`, Math.abs(result.reducedLengthMetres - m12), m12Limit, row.id);
        const polar = 1 / (A * Math.cos((Number(row.lat1) * Math.PI) / 180)) + 1 / (A * Math.cos((Number(row.lat2) * Math.PI) / 180));
        const conditioning = kind === "inverse" ? polar + 1 / Math.abs(m12) : polar;
        const areaLimit = AREA_FLOOR + C2 * AREA_AZIMUTH_NOISE * conditioning;
        check(`${kind}S12`, Math.abs(result.areaSquareMetres - Number(row.S12)), areaLimit, row.id);
      }
    }
    for (const error of Object.values(errors)) error.report(t);
    assert.equal(failures.length, 0, `${failures.length} checks failed:\n${failures.slice(0, 15).join("\n")}`);
  });

  test("hold-out: the reported azimuth and area uncertainties hold on the GeodTest sample", () => {
    const rows = readCsv(new URL("geodtest-sample.csv", DIRECTORY), undefined, "geodtest-sample.csv");
    const turn = (x, y) => Math.abs(((((x - y) % 360) + 540) % 360) - 180);
    const failures = [];
    for (const row of rows) {
      const inverse = inverseGeodesic({ latitude: Number(row.lat1), longitude: Number(row.lon1) }, { latitude: Number(row.lat2), longitude: Number(row.lon2) });
      if (!inverse.azimuthDefined || inverse.ambiguous) continue; // another equally short route may be listed
      const azimuth = Math.max(turn(inverse.initialBearingDegrees, Number(row.azi1)), turn(inverse.finalBearingDegrees, Number(row.azi2)));
      if (!(azimuth <= inverse.bearingUncertaintyDegrees)) failures.push(`${row.id}: azimuth off by ${azimuth}° > ${inverse.bearingUncertaintyDegrees}°`);
      const area = Math.abs(inverse.areaSquareMetres - Number(row.S12));
      if (!(area <= inverse.areaUncertaintySquareMetres)) failures.push(`${row.id}: S12 off by ${area} m^2 > ${inverse.areaUncertaintySquareMetres} m^2`);
    }
    assert.equal(failures.length, 0, `${failures.length} checks failed:\n${failures.slice(0, 15).join("\n")}`);
  });

  test("hold-out: Geod3Test sample present", () => {
    assert.ok(existsSync(new URL("geod3test-sample.csv", DIRECTORY)), "contracts/test-vectors/geod3test-sample.csv is missing");
  });

  test("hold-out: Geod3Test sample inverse and direct", (t) => {
    const options = { ellipsoid: { a: Math.SQRT2, b: 1, c: Math.SQRT1_2 } };
    const rows = readCsv(new URL("geod3test-sample.csv", DIRECTORY), undefined, "geod3test-sample.csv");
    const point = (beta, omega) => triaxialToCartesian({ beta, omega }, options);
    const apart = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    const heading = (x, y) => (Math.abs(((((Number(x) - Number(y)) % 360) + 540) % 360) - 180) * Math.PI) / 180;
    const pairs = new Map();
    for (const row of rows) {
      const key = `${row.bet1} ${row.omg1} ${row.bet2} ${row.omg2}`;
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(row);
    }
    const errors = {
      distance: new MaxError("Geod3Test sample inverse distance", "b"),
      azimuth: new MaxError("Geod3Test sample inverse |dalp1|*|m12|", "b"),
      position: new MaxError("Geod3Test sample direct position", "b"),
      m12: new MaxError("Geod3Test sample direct m12", "b"),
      M12: new MaxError("Geod3Test sample direct M12", ""),
      M21: new MaxError("Geod3Test sample direct M21", ""),
    };
    const failures = [];
    const check = (error, value, limit, id) => {
      error.add(value, id);
      if (!(value <= limit)) failures.push(`${id} ${error.label}: ${value}`);
    };
    for (const row of rows) {
      const inverse = inverseTriaxialGeodesic({ beta: row.bet1, omega: row.omg1 }, { beta: row.bet2, omega: row.omg2 }, options);
      check(errors.distance, Math.abs(inverse.distance - Number(row.s12)), 1e-13, row.id);
      let best = null;
      for (const other of pairs.get(`${row.bet1} ${row.omg1} ${row.bet2} ${row.omg2}`)) {
        const score = Math.max(heading(inverse.initialAzimuthDegrees, other.alp1), heading(inverse.finalAzimuthDegrees, other.alp2));
        if (best === null || score < best.score) best = { score, other };
      }
      let offset = heading(inverse.initialAzimuthDegrees, best.other.alp1) * Math.abs(Number(best.other.m12));
      if (!(offset <= 1e-13)) {
        const line = directTriaxialGeodesic({ beta: row.bet1, omega: row.omg1 }, inverse.initialAzimuthDegrees, inverse.distance, options);
        const reach = apart(point(line.beta, line.omega), point(Number(row.bet2), Number(row.omg2)));
        if (reach <= 1e-13) offset = reach;
      }
      check(errors.azimuth, offset, 1e-13, row.id);
      const direct = directTriaxialGeodesic({ beta: row.bet1, omega: row.omg1 }, row.alp1, row.s12, options);
      check(errors.position, apart(point(direct.beta, direct.omega), point(Number(row.bet2), Number(row.omg2))), 1e-13, row.id);
      check(errors.m12, Math.abs(direct.reducedLength - Number(row.m12)), 1e-11, row.id);
      check(errors.M12, Math.abs(direct.geodesicScale12 - Number(row.M12)), 1e-11, row.id);
      check(errors.M21, Math.abs(direct.geodesicScale21 - Number(row.M21)), 1e-11, row.id);
    }
    for (const error of Object.values(errors)) error.report(t);
    assert.equal(failures.length, 0, `${failures.length} checks failed:\n${failures.slice(0, 15).join("\n")}`);
  });
}
