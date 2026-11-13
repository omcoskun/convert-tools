#!/usr/bin/env node
// Regenerates contracts/test-vectors/*.csv (except unit-conversions.csv) from
// independent reference implementations:
//
//   GeographicLib GeoConvert   UTM/UPS forward and inverse, MGRS, EPSG:326xx/327xx
//   GeographicLib GeodSolve    WGS 84 inverse and direct geodesics
//   geographiclib-helper.cpp   GeographicLib PolarStereographic (EPSG:5041/5042),
//                              GARS and Georef classes
//   web_mercator.py            EPSG:3857 defining formula in Python
//
// This script never imports the code under test. Inputs are produced from a
// fixed seed, so the same tool versions produce byte-identical files.
//
// Usage: node contracts/tools/generate-vectors.mjs
// Env:   GEOGRAPHICLIB_PREFIX (default: parent of the GeoConvert binary's dir)
//        PYTHON (default: python3), CXX (default: c++)

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const VECTOR_DIR = path.resolve(TOOLS_DIR, "..", "test-vectors");
const SEED = 0x5eedc0de;

// ---------------------------------------------------------------- utilities

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
const random = mulberry32(SEED);
const uniform = (min, max) => min + random() * (max - min);
const sphereLatitude = () => (Math.asin(uniform(-1, 1)) * 180) / Math.PI;

// Decimal text with at most `digits` fractional digits and no trailing zeros.
// The same text goes to the reference tool and into the CSV, so every
// implementation parses exactly the same double.
function dec(value, digits = 9) {
  let text = value.toFixed(digits);
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  if (text === "-0") text = "0";
  return text;
}

function which(command) {
  return execFileSync("/usr/bin/which", [command]).toString().trim();
}

function runTool(command, args, lines) {
  const result = spawnSync(command, args, {
    input: lines.join("\n") + "\n",
    maxBuffer: 1 << 28,
  });
  if (result.error) throw result.error;
  const output = result.stdout.toString().replace(/\n$/, "").split("\n");
  if (output.length !== lines.length) {
    throw new Error(
      `${command} ${args.join(" ")} returned ${output.length} lines for ${lines.length} inputs:\n${result.stderr}`,
    );
  }
  return output;
}

const isError = (line) => line.startsWith("ERROR") || line.trim() === "";

function writeCsv(name, header, rows) {
  const text = [header.join(","), ...rows.map((row) => row.join(","))].join("\n") + "\n";
  for (const row of rows) {
    if (row.length !== header.length) throw new Error(`${name}: bad row ${row}`);
    if (row.some((cell) => String(cell).includes(","))) throw new Error(`${name}: comma in ${row}`);
  }
  writeFileSync(path.join(VECTOR_DIR, name), text);
  return { name, rows: rows.length, sha256: createHash("sha256").update(text).digest("hex") };
}

// UTM grid text "36n" / UPS "n" -> { zone, hemisphere }
function parseZone(token) {
  const match = /^(\d+)?([ns])$/.exec(token);
  if (!match) throw new Error(`Unexpected zone token ${token}`);
  return { zone: match[1] ? Number(match[1]) : 0, hemisphere: match[2].toUpperCase() };
}

// ---------------------------------------------------------- tool discovery

const GEOCONVERT = which("GeoConvert");
const GEODSOLVE = which("GeodSolve");
const PREFIX =
  process.env.GEOGRAPHICLIB_PREFIX ?? path.resolve(path.dirname(realpathSync(GEOCONVERT)), "..");
const PYTHON = process.env.PYTHON ?? "python3";
const CXX = process.env.CXX ?? "c++";
const BUILD_DIR = mkdtempSync(path.join(tmpdir(), "convert-tools-vectors-"));
const HELPER = path.join(BUILD_DIR, "geographiclib-helper");
execFileSync(CXX, [
  "-std=c++17",
  "-O2",
  `-I${path.join(PREFIX, "include")}`,
  path.join(TOOLS_DIR, "geographiclib-helper.cpp"),
  `-L${path.join(PREFIX, "lib")}`,
  "-lGeographicLib",
  "-o",
  HELPER,
]);

const versions = {
  GeoConvert: execFileSync(GEOCONVERT, ["--version"]).toString().trim(),
  GeodSolve: execFileSync(GEODSOLVE, ["--version"]).toString().trim(),
  python: execFileSync(PYTHON, ["--version"]).toString().trim(),
  cxx: execFileSync(CXX, ["--version"]).toString().split("\n")[0].trim(),
};

const geoConvert = (args, lines) => runTool(GEOCONVERT, args, lines);
const helper = (args, lines) => runTool(HELPER, args, lines);

const manifest = { seed: `0x${SEED.toString(16)}`, tools: versions, files: [] };
const skipped = {};
const skip = (file, reason, id) => {
  skipped[file] ??= {};
  skipped[file][reason] ??= { count: 0, ids: [] };
  skipped[file][reason].count += 1;
  if (id && !skipped[file][reason].ids.includes(id)) skipped[file][reason].ids.push(id);
};

// ---------------------------------------------------------- shared points

const EPS = 1e-9; // degrees, about 0.1 mm
function utmEdgePoints() {
  const points = [];
  const add = (id, lat, lon) => points.push({ id, lat: dec(lat), lon: dec(lon) });
  for (let boundary = -180; boundary < 180; boundary += 6) {
    for (const lat of [-37.25, 0.5, 49.75]) {
      add(`zone-edge-${boundary}-lat${lat}`, lat, boundary);
      add(`zone-edge-${boundary}-lat${lat}-east`, lat, boundary + EPS);
      if (boundary > -180) add(`zone-edge-${boundary}-lat${lat}-west`, lat, boundary - EPS);
    }
  }
  for (const lat of [0, 45, -45, 83.9, -79.9]) {
    add(`antimeridian-east-lat${lat}`, lat, 180);
    add(`antimeridian-west-lat${lat}`, lat, -180);
    add(`antimeridian-near-east-lat${lat}`, lat, 180 - EPS);
  }
  for (const lat of [56, 56 + EPS, 56 - EPS, 60, 64 - EPS, 64]) {
    for (const lon of [2.5, 3 - EPS, 3, 3 + EPS, 6, 7.5, 9, 12 - EPS, 12]) {
      add(`norway-${dec(lat)}-${dec(lon)}`, lat, lon);
    }
  }
  for (const lat of [72 - EPS, 72, 78, 84 - EPS]) {
    for (const lon of [0 - EPS, 0, 4.5, 9 - EPS, 9, 15, 21 - EPS, 21, 27, 33 - EPS, 33, 37.5, 42 - EPS, 42]) {
      add(`svalbard-${dec(lat)}-${dec(lon)}`, lat, lon);
    }
  }
  for (const lat of [-80, -80 + EPS, -80 - EPS, 84, 84 - EPS, 84 + EPS]) {
    for (const lon of [-180, -177, 0, 3, 45, 179.5, 180]) {
      add(`lat-limit-${dec(lat)}-${dec(lon)}`, lat, lon);
    }
  }
  for (const lat of [90, -90]) {
    for (const lon of [-180, -135, -90, 0, 47, 90, 180]) add(`pole-${lat}-${lon}`, lat, lon);
  }
  for (const lat of [0, EPS, -EPS]) {
    for (const lon of [-177, -3, 0, 3, 33, 179]) add(`equator-${dec(lat)}-${lon}`, lat, lon);
  }
  for (const lat of [84.5, 87, 90 - EPS, -80.5, -85, -90 + EPS]) {
    for (const lon of [-180, -135, -45, 0, 30, 45, 135, 179.999999999]) {
      add(`ups-${dec(lat)}-${dec(lon)}`, lat, lon);
    }
  }
  return points;
}

function randomUtmPoints(count, prefix) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index).padStart(4, "0")}`,
    lat: dec(uniform(-80, 84)),
    lon: dec(uniform(-180, 180)),
  }));
}

function randomPolarPoints(count, prefix) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index).padStart(4, "0")}`,
    lat: dec(index % 2 === 0 ? uniform(84, 90) : uniform(-90, -80)),
    lon: dec(uniform(-180, 180)),
  }));
}

// ------------------------------------------------------- UTM/UPS forward

const UTM_TOLERANCE = "0.000001"; // metres (1 micrometre)

function utmUpsForward() {
  const header = [
    "id", "latitude", "longitude", "zone", "expected_zone", "expected_hemisphere",
    "expected_easting", "expected_northing", "tolerance_metres",
  ];
  const rows = [];
  const standard = [
    ...utmEdgePoints(),
    ...randomUtmPoints(3000, "random"),
    ...randomPolarPoints(600, "random-polar"),
  ];
  const output = geoConvert(["-s", "-u", "-p", "9"], standard.map((p) => `${p.lat} ${p.lon}`));
  standard.forEach((point, index) => {
    if (isError(output[index])) throw new Error(`GeoConvert refused ${point.id}: ${output[index]}`);
    const [zoneToken, easting, northing] = output[index].split(/\s+/);
    const { zone, hemisphere } = parseZone(zoneToken);
    rows.push([`std-${point.id}`, point.lat, point.lon, "", zone, hemisphere, easting, northing, UTM_TOLERANCE]);
  });

  // Forced zones: neighbours across zone boundaries and wide offsets from the
  // central meridian, as far as GeographicLib's UTM range allows.
  const forced = [];
  for (let index = 0; index < 1500; index += 1) {
    const zone = 1 + Math.floor(random() * 60);
    const offset = index < 500 ? uniform(-3.5, 3.5) : uniform(-6, 6);
    const centre = zone * 6 - 183;
    let lon = centre + offset;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    forced.push({ id: `forced-${String(index).padStart(4, "0")}`, zone, lat: dec(uniform(-80, 84)), lon: dec(lon) });
  }
  const byZone = new Map();
  for (const point of forced) {
    if (!byZone.has(point.zone)) byZone.set(point.zone, []);
    byZone.get(point.zone).push(point);
  }
  for (const [zone, points] of [...byZone].sort((a, b) => a[0] - b[0])) {
    const lines = geoConvert(["-z", String(zone), "-u", "-p", "9"], points.map((p) => `${p.lat} ${p.lon}`));
    points.forEach((point, index) => {
      if (isError(lines[index])) {
        skip("utm-ups-forward.csv", "GeoConvert outside UTM legal range (forced zone)");
        return;
      }
      const [zoneToken, easting, northing] = lines[index].split(/\s+/);
      const parsed = parseZone(zoneToken);
      rows.push([point.id, point.lat, point.lon, zone, parsed.zone, parsed.hemisphere, easting, northing, UTM_TOLERANCE]);
    });
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  manifest.files.push({
    ...writeCsv("utm-ups-forward.csv", header, rows),
    source: "GeoConvert -s -u -p 9 (standard zones); GeoConvert -z ZONE -u -p 9 (forced zone rows)",
  });
  return rows;
}

// ------------------------------------------------------- UTM/UPS inverse

function utmUpsInverse(forwardRows) {
  const header = [
    "id", "zone", "hemisphere", "easting", "northing",
    "expected_latitude", "expected_longitude", "tolerance_metres",
  ];
  const inputs = forwardRows
    .filter((_, index) => index % 2 === 0)
    .map((row) => ({
      id: `from-${row[0]}`,
      zone: Number(row[4]),
      hemisphere: row[5],
      easting: dec(Number(row[6]), 3),
      northing: dec(Number(row[7]), 3),
    }));
  // Grid extremes that do not come from a geographic point.
  for (const zone of [1, 31, 32, 36, 60]) {
    for (const [easting, northing, hemisphere] of [
      [500000, 0, "N"], [166000, 0, "N"], [834000, 0, "N"],
      [500000, 9300000, "N"], [300000, 9000000, "N"], [700000, 9000000, "N"],
      [500000, 10000000, "S"], [500000, 1200000, "S"], [180000, 1500000, "S"],
      [820000, 9999999.999, "S"], [500000, 0.001, "N"],
    ]) {
      inputs.push({ id: `grid-${zone}${hemisphere}-${easting}-${northing}`, zone, hemisphere, easting: dec(easting, 3), northing: dec(northing, 3) });
    }
  }
  for (const hemisphere of ["N", "S"]) {
    for (const [easting, northing] of [[2000000, 2000000], [1200000, 2000000], [2800000, 2800000], [2000000.001, 1999999.999]]) {
      inputs.push({ id: `grid-ups${hemisphere}-${easting}-${northing}`, zone: 0, hemisphere, easting: dec(easting, 3), northing: dec(northing, 3) });
    }
  }
  const lines = geoConvert(
    ["-g", "-p", "9"],
    inputs.map((p) => `${p.zone === 0 ? "" : p.zone}${p.hemisphere.toLowerCase()} ${p.easting} ${p.northing}`),
  );
  const rows = [];
  inputs.forEach((input, index) => {
    if (isError(lines[index])) {
      skip("utm-ups-inverse.csv", "GeoConvert outside UTM/UPS legal range");
      return;
    }
    const [latitude, longitude] = lines[index].split(/\s+/);
    rows.push([input.id, input.zone, input.hemisphere, input.easting, input.northing, latitude, longitude, UTM_TOLERANCE]);
  });
  manifest.files.push({
    ...writeCsv("utm-ups-inverse.csv", header, rows),
    source: "GeoConvert -g -p 9 with input 'ZONEh EASTING NORTHING'",
  });
}

// ------------------------------------------------------------------ MGRS

function mgrsPoints() {
  const points = [...utmEdgePoints()];
  const add = (id, lat, lon) => points.push({ id, lat: dec(lat), lon: dec(lon) });
  for (let band = -80; band <= 72; band += 8) {
    for (const lon of [-171, -3, 9, 33, 177]) {
      add(`band-${band}-${lon}`, band, lon);
      add(`band-${band}-${lon}-below`, band - EPS, lon);
      add(`band-${band}-${lon}-above`, band + EPS, lon);
    }
  }
  for (const lon of [-171, 33]) add(`band-x-top-${lon}`, 84 - EPS, lon);
  for (const point of randomUtmPoints(800, "random")) points.push(point);
  for (const point of randomPolarPoints(200, "random-polar")) points.push(point);
  return points;
}

// Points 1 mm on either side of 100 km square edges, built from grid
// coordinates with GeoConvert's own inverse.
function mgrsSquareEdgePoints() {
  const grid = [];
  for (const zone of [1, 17, 31, 32, 36, 60]) {
    for (const easting of [200000, 500000, 800000]) {
      for (const northing of [100000, 4400000, 8800000]) {
        // Both coordinates are offset so neither lies exactly on a line.
        for (const [de, dn] of [[-0.001, 0.0005], [0.001, 0.0005], [0.0005, -0.001], [0.0005, 0.001], [-0.001, -0.001]]) {
          for (const hemisphere of ["n", "s"]) {
            grid.push({ id: `square-edge-${zone}${hemisphere}-${dec(easting + de, 4)}-${dec(northing + dn, 4)}`, text: `${zone}${hemisphere} ${dec(easting + de, 4)} ${dec(northing + dn, 4)}` });
          }
        }
      }
    }
  }
  for (const hemisphere of ["n", "s"]) {
    for (const easting of [1900000, 2000000, 2100000]) {
      for (const [de, dn] of [[-0.001, 0.0005], [0.001, 0.0005], [0.0005, -0.001], [0.0005, 0.001]]) {
        grid.push({ id: `square-edge-ups${hemisphere}-${dec(easting + de, 4)}-${dec(2100000 + dn, 4)}`, text: `${hemisphere} ${dec(easting + de, 4)} ${dec(2100000 + dn, 4)}` });
      }
    }
  }
  const lines = geoConvert(["-g", "-p", "9"], grid.map((g) => g.text));
  const points = [];
  grid.forEach((g, index) => {
    if (isError(lines[index])) return;
    const [lat, lon] = lines[index].split(/\s+/);
    points.push({ id: g.id, lat, lon });
  });
  return points;
}

function nearTruncationEdge(value, cell) {
  const remainder = value - Math.floor(value / cell) * cell;
  const distance = Math.min(remainder, cell - remainder);
  return distance > 0 && distance < 1e-6;
}

function mgrsForward() {
  const header = ["id", "latitude", "longitude", "precision", "expected_mgrs"];
  const points = [...mgrsPoints(), ...mgrsSquareEdgePoints()];
  const lines = points.map((p) => `${p.lat} ${p.lon}`);
  const grid = geoConvert(["-s", "-u", "-p", "9"], lines);
  const rows = [];
  const codes = new Set();
  for (let precision = 0; precision <= 5; precision += 1) {
    const output = geoConvert(["-m", "-p", String(precision - 5)], lines);
    const cell = 10 ** (5 - precision);
    points.forEach((point, index) => {
      if (isError(output[index])) throw new Error(`GeoConvert MGRS refused ${point.id}`);
      const [, easting, northing] = grid[index].split(/\s+/);
      // A point within 1 micrometre of a truncation edge has no robust
      // expected digit at 1 micrometre accuracy; exact hits are kept.
      if (nearTruncationEdge(Number(easting), cell) || nearTruncationEdge(Number(northing), cell)) {
        skip("mgrs-forward.csv", "within 1 micrometre of a truncation edge", point.id);
        return;
      }
      rows.push([`${point.id}-p${precision}`, point.lat, point.lon, precision, output[index]]);
      codes.add(output[index]);
    });
  }
  manifest.files.push({
    ...writeCsv("mgrs-forward.csv", header, rows),
    source: "GeoConvert -m -p (PRECISION-5)",
  });
  return [...codes].sort();
}

function randomMgrsCandidates(count) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bands = "CDEFGHJKLMNPQRSTUVWX";
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const ups = index % 5 === 0;
    const digits = [0, 2, 10][index % 3];
    let numeric = "";
    for (let d = 0; d < digits; d += 1) numeric += Math.floor(random() * 10);
    const pick = (alphabet) => alphabet[Math.floor(random() * alphabet.length)];
    const code = ups
      ? `${pick("ABYZ")}${pick(letters)}${pick(letters)}${numeric}`
      : `${1 + Math.floor(random() * 60)}${pick(bands)}${pick(letters)}${pick(letters.slice(0, 20))}${numeric}`;
    candidates.push(code);
  }
  return candidates;
}

function mgrsReverse(validCodes) {
  const header = [
    "id", "mgrs", "valid", "expected_zone", "expected_hemisphere", "expected_easting",
    "expected_northing", "expected_latitude", "expected_longitude", "tolerance_metres",
  ];
  const codes = [
    ...validCodes.filter((_, index) => index % 3 === 0),
    ...randomMgrsCandidates(1500),
    "36SVK8801520370", "38SLC3918701405", "31UDQ4825111932", "32VKP", "ZAH", "BAN", "YZG", "AZM",
  ];
  const unique = [...new Set(codes)];
  const utm = geoConvert(["-u", "-p", "9"], unique);
  const geo = geoConvert(["-g", "-p", "9"], unique);
  const rows = unique.map((code, index) => {
    const id = `mgrs-${code}`;
    if (isError(utm[index]) || isError(geo[index])) {
      if (isError(utm[index]) !== isError(geo[index])) throw new Error(`Inconsistent GeoConvert verdict for ${code}`);
      return [id, code, 0, "", "", "", "", "", "", ""];
    }
    const [zoneToken, easting, northing] = utm[index].split(/\s+/);
    const { zone, hemisphere } = parseZone(zoneToken);
    const [latitude, longitude] = geo[index].split(/\s+/);
    return [id, code, 1, zone, hemisphere, easting, northing, latitude, longitude, UTM_TOLERANCE];
  });
  manifest.files.push({
    ...writeCsv("mgrs-reverse.csv", header, rows),
    source: "GeoConvert -u -p 9 and GeoConvert -g -p 9 with MGRS input (cell centre); valid=0 where GeoConvert reports ERROR",
  });
}

// ------------------------------------------------------------------- CRS

function crsVectors() {
  const header = [
    "id", "operation", "latitude", "longitude", "target_crs", "expected_zone",
    "expected_hemisphere", "expected_x", "expected_y", "output_tolerance",
    "roundtrip_tolerance_metres",
  ];
  const rows = [];
  const mercatorLimit = 85.0511287798066;
  const mercator = [
    { id: "mercator-origin", lat: "0", lon: "0" },
    { id: "mercator-ankara", lat: "39.933365", lon: "32.859742" },
    { id: "mercator-northeast-limit", lat: dec(mercatorLimit, 13), lon: "180" },
    { id: "mercator-southwest-limit", lat: dec(-mercatorLimit, 13), lon: "-180" },
    ...Array.from({ length: 500 }, (_, index) => ({
      id: `mercator-${String(index).padStart(4, "0")}`,
      lat: dec(uniform(-mercatorLimit, mercatorLimit)),
      lon: dec(uniform(-180, 180)),
    })),
  ];
  runTool(PYTHON, [path.join(TOOLS_DIR, "web_mercator.py")], mercator.map((p) => `${p.lat} ${p.lon}`)).forEach(
    (line, index) => {
      const [x, y] = line.split(/\s+/);
      const point = mercator[index];
      rows.push([`crs-${point.id}`, "CRS", point.lat, point.lon, "EPSG:3857", "", "", x, y, "0.000001", "0.000001"]);
    },
  );

  for (let index = 0; index < 400; index += 1) {
    const zone = 1 + Math.floor(random() * 60);
    const north = index % 2 === 0;
    const lat = north ? uniform(0, 84) : uniform(-80, 0);
    let lon = zone * 6 - 183 + uniform(-3.5, 3.5);
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    const point = { lat: dec(lat), lon: dec(lon) };
    const [line] = geoConvert(["-z", `${zone}${north ? "n" : "s"}`, "-u", "-p", "9"], [`${point.lat} ${point.lon}`]);
    if (isError(line)) {
      skip("coordinate-projections.csv", "GeoConvert outside UTM legal range");
      continue;
    }
    const [, x, y] = line.split(/\s+/);
    const code = `EPSG:${(north ? 32600 : 32700) + zone}`;
    rows.push([`crs-utm-${String(index).padStart(4, "0")}`, "CRS", point.lat, point.lon, code, "", "", x, y, "0.000001", "0.000001"]);
  }

  const polar = [];
  for (let index = 0; index < 400; index += 1) {
    const north = index % 2 === 0;
    polar.push({ north, lat: dec(north ? uniform(60, 90) : uniform(-90, -60)), lon: dec(uniform(-180, 180)) });
  }
  for (const north of [true, false]) {
    for (const lat of [60, 70, 83.5, 89.999999999, 90]) {
      for (const lon of [-180, 0, 90]) polar.push({ north, lat: dec(north ? lat : -lat), lon: dec(lon) });
    }
  }
  helper(["ups-forward"], polar.map((p) => `${p.north ? 1 : 0} ${p.lat} ${p.lon}`)).forEach((line, index) => {
    if (isError(line)) throw new Error(`PolarStereographic refused ${JSON.stringify(polar[index])}`);
    const [x, y] = line.split(/\s+/);
    const point = polar[index];
    rows.push([`crs-ups-${String(index).padStart(4, "0")}`, "CRS", point.lat, point.lon, point.north ? "EPSG:5041" : "EPSG:5042", "", "", x, y, "0.000001", "0.000001"]);
  });

  manifest.files.push({
    ...writeCsv("coordinate-projections.csv", header, rows),
    source: "EPSG:3857 web_mercator.py; EPSG:326xx/327xx GeoConvert -z ZONEh -u -p 9; EPSG:5041/5042 GeographicLib PolarStereographic::UPS() via geographiclib-helper",
  });
}

// --------------------------------------------------------------- geodesics

const GEODESIC_HEADER = [
  "id", "startLatitude", "startLongitude", "endLatitude", "endLongitude",
  "distanceMetres", "initialBearingDegrees", "finalBearingDegrees", "toleranceMetres",
  "reducedLengthMetres",
];
const GEODESIC_TOLERANCE = "0.0001"; // metres; see contracts/README.md

function geodesicInverse() {
  const pairs = [];
  const add = (id, lat1, lon1, lat2, lon2) =>
    pairs.push({ id, lat1: dec(lat1, 12), lon1: dec(lon1, 12), lat2: dec(lat2, 12), lon2: dec(lon2, 12) });
  add("equator-one-degree", 0, 0, 0, 1);
  add("equator-one-nanodegree", 0, 0, 0, 1e-9);
  add("meridian-one-degree", 0, 0, 1, 0);
  add("equator-to-north-pole", 0, 0, 90, 0);
  add("latitude-scale-60n", 60, 0, 60, 1);
  add("vertex-branch-east", 0.317670906795, 0, -0.317670906795, 179.3965033097329);
  add("vertex-branch-west", 0.317670906795, 0, -0.317670906795, -179.3965033097329);
  add("antimeridian", 10, 179.9, 10, -179.9);
  add("wellington-salamanca", -41.32, 174.81, 40.96, -5.5);
  add("exact-antipodes", 0, 0, 0, 180);
  add("pole-to-pole", 90, 0, -90, 180);
  add("same-north-pole-arbitrary-longitude", 90, -135, 90, 77);
  add("opposite-poles-arbitrary-longitude", 90, 10, -90, 80);
  add("near-north-pole", 89.9, 0, 89.9, 90);
  add("ankara-istanbul", 39.933365, 32.859742, 41.008238, 28.978359);
  add("near-antipodes", 0, 0, 0.5, 179.7);
  add("coincident", 39.933365, 32.859742, 39.933365, 32.859742);
  for (const dlon of [90, 170, 179, 179.4, 179.5, 179.9, 179.99]) add(`equatorial-${dlon}`, 0, 0, 0, dlon);
  for (const lat of [-89, -45, 0, 45, 89]) add(`meridional-over-pole-${lat}`, lat, 10, 30, -170);
  for (const metres of [1e-3, 1e-2, 1, 1000]) {
    const degrees = metres / 111000;
    add(`short-${metres}m`, 39.933365, 32.859742, 39.933365 + degrees, 32.859742 + degrees);
  }
  for (let index = 0; index < 1500; index += 1) {
    add(`random-${String(index).padStart(4, "0")}`, sphereLatitude(), uniform(-180, 180), sphereLatitude(), uniform(-180, 180));
  }
  for (let index = 0; index < 500; index += 1) {
    const lat = sphereLatitude();
    const lon = uniform(-180, 180);
    const scale = 10 ** uniform(-7, -2);
    add(`short-${String(index).padStart(4, "0")}`, lat, lon, Math.max(-90, Math.min(90, lat + uniform(-1, 1) * scale)), lon + uniform(-1, 1) * scale);
  }
  for (let index = 0; index < 500; index += 1) {
    const lat = uniform(-60, 60);
    const lon = uniform(-180, 180);
    let lon2 = lon + 180 + uniform(-1, 1);
    if (lon2 > 180) lon2 -= 360;
    add(`near-antipodal-${String(index).padStart(4, "0")}`, lat, lon, -lat + uniform(-1, 1), lon2);
  }
  // -f: lat1 lon1 azi1 lat2 lon2 azi2 s12 a12 m12 M12 M21 S12
  const output = runTool(GEODSOLVE, ["-i", "-f", "-p", "9"], pairs.map((p) => `${p.lat1} ${p.lon1} ${p.lat2} ${p.lon2}`));
  const rows = pairs.map((pair, index) => {
    const fields = output[index].split(/\s+/);
    const [azi1, azi2, s12, m12] = [fields[2], fields[5], fields[6], fields[8]];
    // Azimuths are left empty where more than one shortest geodesic exists:
    // coincident points, a pole, exact antipodes, and two equatorial points
    // whose shortest path leaves the equator (it then has an equally short
    // mirror image across the equator). See contracts/README.md.
    const lat1 = Number(pair.lat1);
    const lat2 = Number(pair.lat2);
    const dlon = Math.abs(((Number(pair.lon2) - Number(pair.lon1) + 540) % 360) - 180);
    const undefinedAzimuth =
      Number(s12) === 0 ||
      Math.abs(lat1) === 90 ||
      Math.abs(lat2) === 90 ||
      (lat1 === -lat2 && dlon === 180) ||
      (lat1 === 0 && lat2 === 0 && Math.abs(Number(azi1)) !== 90);
    return [
      pair.id, pair.lat1, pair.lon1, pair.lat2, pair.lon2, s12,
      undefinedAzimuth ? "" : azi1, undefinedAzimuth ? "" : azi2, GEODESIC_TOLERANCE, m12,
    ];
  });
  manifest.files.push({
    ...writeCsv("geodesic-wgs84.csv", GEODESIC_HEADER, rows),
    source: "GeodSolve -i -f -p 9 (azi1, azi2, s12, m12)",
  });
}

function geodesicDirect() {
  const header = [
    "id", "startLatitude", "startLongitude", "initialBearingDegrees", "distanceMetres",
    "expectedLatitude", "expectedLongitude", "expectedFinalBearingDegrees", "toleranceMetres",
  ];
  const inputs = [];
  const add = (id, lat, lon, azi, s) => inputs.push({ id, lat: dec(lat, 12), lon: dec(lon, 12), azi: dec(azi, 12), s: dec(s, 6) });
  add("equator-east", 0, 0, 90, 1000000);
  add("meridian-over-pole", 80, 0, 0, 3000000);
  add("half-meridian", 0, 0, 0, 20003931.458625);
  add("zero-distance", 39.933365, 32.859742, 45, 0);
  add("across-antimeridian", 10, 179.9, 90, 50000);
  for (let index = 0; index < 1000; index += 1) {
    add(`random-${String(index).padStart(4, "0")}`, sphereLatitude(), uniform(-180, 180), uniform(0, 360), uniform(0, 19900000));
  }
  const output = runTool(GEODSOLVE, ["-p", "9"], inputs.map((p) => `${p.lat} ${p.lon} ${p.azi} ${p.s}`));
  const rows = inputs.map((input, index) => {
    const [lat2, lon2, azi2] = output[index].split(/\s+/);
    return [input.id, input.lat, input.lon, input.azi, input.s, lat2, lon2, azi2, GEODESIC_TOLERANCE];
  });
  manifest.files.push({
    ...writeCsv("geodesic-direct.csv", header, rows),
    source: "GeodSolve -p 9",
  });
}

// ----------------------------------------------------------- GARS, GEOREF

function angularPoints(count) {
  const points = [];
  const add = (id, lat, lon) => points.push({ id, lat: dec(lat), lon: dec(lon) });
  for (const lat of [-90, -89.75, 0, 45 + 1 / 12, 89.75, 90]) {
    for (const lon of [-180, -179.5, 0, 106.706797, 179.5, 180 - EPS, 180]) add(`edge-${dec(lat)}-${dec(lon)}`, lat, lon);
  }
  add("hue", 10.775276, 106.706797);
  add("ankara", 39.933365, 32.859742);
  for (let index = 0; index < count; index += 1) add(`random-${String(index).padStart(4, "0")}`, uniform(-90, 90), uniform(-180, 180));
  return points;
}

function garsVectors() {
  const header = ["id", "latitude", "longitude", "precision", "expected_code", "expected_center_latitude", "expected_center_longitude"];
  const points = angularPoints(800);
  const rows = [];
  for (const precision of [0, 1, 2]) {
    const codes = helper(["gars-forward", String(precision)], points.map((p) => `${p.lat} ${p.lon}`));
    const centres = helper(["gars-reverse"], codes);
    points.forEach((point, index) => {
      if (isError(codes[index]) || isError(centres[index])) throw new Error(`GARS refused ${point.id}`);
      const [lat, lon] = centres[index].split(/\s+/);
      rows.push([`${point.id}-p${precision}`, point.lat, point.lon, precision, codes[index], lat, lon]);
    });
  }
  manifest.files.push({
    ...writeCsv("gars.csv", header, rows),
    source: "GeographicLib GARS::Forward(lat, lon, PRECISION) and GARS::Reverse(centerp=true) via geographiclib-helper",
  });
}

function georefVectors() {
  const header = ["id", "latitude", "longitude", "precision", "expected_code", "expected_center_latitude", "expected_center_longitude"];
  const points = angularPoints(500);
  const rows = [];
  // GeographicLib precision p >= 2 means p digits per axis, the same as this
  // library. Precision 1 (10-minute cells) has no GeographicLib equivalent.
  for (const precision of [0, 2, 3, 4, 5]) {
    const codes = helper(["georef-forward", String(precision)], points.map((p) => `${p.lat} ${p.lon}`));
    points.forEach((point, index) => {
      if (isError(codes[index])) {
        skip("georef.csv", "GeographicLib Georef::Forward returns an empty code for longitude +180", point.id);
        codes[index] = "";
      }
    });
    const valid = points.map((point, index) => ({ point, code: codes[index] })).filter((entry) => entry.code);
    const centres = helper(["georef-reverse"], valid.map((entry) => entry.code));
    valid.forEach(({ point, code }, index) => {
      const [lat, lon] = centres[index].split(/\s+/);
      rows.push([`${point.id}-p${precision}`, point.lat, point.lon, precision, code, lat, lon]);
    });
  }
  manifest.files.push({
    ...writeCsv("georef.csv", header, rows),
    source: "GeographicLib Georef::Forward(lat, lon, PRECISION) and Georef::Reverse(centerp=true) via geographiclib-helper",
  });
}

// ------------------------------------------------------------------ run

const forwardRows = utmUpsForward();
utmUpsInverse(forwardRows);
const codes = mgrsForward();
mgrsReverse(codes);
crsVectors();
geodesicInverse();
geodesicDirect();
garsVectors();
georefVectors();

manifest.skipped = skipped;
manifest.files.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(path.join(VECTOR_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
