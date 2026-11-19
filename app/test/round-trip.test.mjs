// Property tests with a fixed seed: whatever a tool writes can be read back
// within the resolution it states, writing again gives the same text, and
// typed point text keeps its digits. Bounds come from the formats'
// definitions (half a step, half a cell), never from the demo itself.

import assert from "node:assert/strict";
import test from "node:test";
import { formatDdm, formatDms, inverseGeodesic } from "@omcoskun/convert-tools";
import { readPointText } from "../src/lib/point-text.js";
import { plainNumber } from "../src/lib/number-text.js";
import { INPUT_FORMATS, formatOutputs, readPosition, valuesFrom } from "../src/tools/positions/positions.js";

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

const random = mulberry32(0x7e57ab1e);
const integer = (count) => Math.floor(random() * count);
const uniform = (min, max) => min + random() * (max - min);

/** Random points, more of them where formats have edges. */
function points(count) {
  const list = [];
  for (let index = 0; index < count; index += 1) {
    const kind = index % 5;
    let latitude = (Math.asin(uniform(-1, 1)) * 180) / Math.PI;
    let longitude = uniform(-180, 180);
    // Near a pole, the antimeridian, a UTM zone edge or a UTM/UPS limit.
    if (kind === 1) latitude = (random() < 0.5 ? -1 : 1) * uniform(89.9, 90);
    if (kind === 2) longitude = (random() < 0.5 ? -1 : 1) * uniform(179.9999, 180);
    if (kind === 3) longitude = -180 + 6 * integer(61) + uniform(-1e-7, 1e-7);
    if (kind === 4) latitude = [84, -80][integer(2)] + uniform(-1e-6, 1e-6);
    list.push({ latitude: Math.max(-90, Math.min(90, latitude)), longitude: Math.max(-180, Math.min(180, longitude)) });
  }
  return list;
}

// Round-off of a sum of degrees, minutes and seconds near 180°.
const ROUND_OFF = 1e-13;
const angularGap = (first, second) => Math.abs(((((first - second) % 360) + 540) % 360) - 180);

// Output key of each input format, for writing a read position again.
const OUTPUT_OF = { dms: "dms", ddm: "ddm", utm: "utmUps", mgrs: "mgrs", gars: "gars", georef: "georef" };

test("every position format reads back within its stated resolution and writes the same text again", () => {
  const failures = [];
  let checked = 0;
  let zoneChanges = 0;
  for (const point of points(400)) {
    const options = { dmsDigits: integer(10), ddmDigits: integer(10), mgrsPrecision: integer(6), georefPrecision: integer(6) };
    const outputs = formatOutputs(point, options);
    const ddText = { latitude: plainNumber(point.latitude), longitude: plainNumber(point.longitude) };
    for (const { id: format } of INPUT_FORMATS) {
      const where = `${format} ${ddText.latitude}, ${ddText.longitude} ${JSON.stringify(options)}`;
      const read = readPosition(format, valuesFrom(format, outputs, {}, ddText), options);
      if (read.status !== "valid") {
        failures.push(`${where}: ${read.status} ${read.code ?? ""}`);
        continue;
      }
      checked += 1;
      const { latitude, longitude } = read.source;
      const latitudeGap = Math.abs(latitude - point.latitude);
      // At a pole every longitude is the same point.
      const longitudeGap = Math.abs(point.latitude) === 90 ? 0 : angularGap(longitude, point.longitude);
      let within;
      if (format === "dd") {
        within = latitudeGap === 0 && longitudeGap === 0;
      } else if (format === "dms" || format === "ddm") {
        // Half a step, plus the round-off of adding up degrees, minutes and seconds.
        const half = outputs.resolution[format].maximumErrorDegrees + ROUND_OFF;
        within = latitudeGap <= half && longitudeGap <= half;
      } else if (format === "utm") {
        // Easting and northing to 1 mm: at most half a millimetre per axis.
        within = inverseGeodesic(point, { latitude, longitude }).distanceMetres <= 0.0008;
      } else if (format === "mgrs") {
        // The centre of a square of cellMetres on the grid (scale 0.9996 to 1.001).
        within = inverseGeodesic(point, { latitude, longitude }).distanceMetres <= read.source.sourceCellMetres * 0.71;
      } else {
        const half = format === "gars" ? 2.5 / 60 : outputs.resolution.georef.maximumCenterOffsetDegreesPerAxis;
        within = latitudeGap <= half * (1 + 1e-9) && (Math.abs(latitude) >= 90 - half || longitudeGap <= half * (1 + 1e-9));
      }
      if (!within) failures.push(`${where}: read back as ${latitude}, ${longitude}`);
      if (format !== "dd") {
        const before = outputs[OUTPUT_OF[format]];
        const again = formatOutputs({ latitude, longitude }, options)[OUTPUT_OF[format]];
        // The centre of a square on a zone edge (or past 84°N / 80°S) can lie
        // in the next zone or in UPS: written in its own standard zone it is
        // another, equally right code. GeoConvert does the same.
        const zone = (text) => text.split(" ")[0];
        if (again !== before && zone(again) === zone(before)) failures.push(`${where}: ${before} written again as ${again}`);
        if (again !== before && zone(again) !== zone(before)) zoneChanges += 1;
      }
    }
  }
  assert.ok(checked > 2500, `checked ${checked}`);
  // Zone edges are a fifth of the points; most squares there stay in their zone.
  assert.ok(zoneChanges < checked / 20, `${zoneChanges} zone changes`);
  assert.equal(failures.length, 0, `${failures.length} failures:\n${failures.slice(0, 15).join("\n")}`);
});

test("typed point text keeps every typed digit, in every separator the field takes", () => {
  const failures = [];
  const forms = [
    (lat, lon) => `${lat}, ${lon}`,
    (lat, lon) => `${lat},${lon}`,
    (lat, lon) => `${lat} ${lon}`,
    (lat, lon) => `${lat}; ${lon}`,
    (lat, lon) => `${lat}\t${lon}`,
  ];
  for (const point of points(300)) {
    const digits = integer(13);
    const latitude = point.latitude.toFixed(digits);
    const longitude = point.longitude.toFixed(digits);
    // "43,180" is one number with a decimal comma, not a pair (by design).
    for (const form of digits === 0 ? forms.filter((_, index) => index !== 1) : forms) {
      const text = form(latitude, longitude);
      const reading = readPointText(text);
      if (reading.status !== "valid") {
        failures.push(`${JSON.stringify(text)}: ${reading.status}`);
      } else if (Number(reading.latitude) !== Number(latitude) || Number(reading.longitude) !== Number(longitude)) {
        failures.push(`${JSON.stringify(text)}: read as ${reading.latitude}, ${reading.longitude}`);
      }
    }
  }
  assert.equal(failures.length, 0, `${failures.length} failures:\n${failures.slice(0, 15).join("\n")}`);
});

test("typed DMS and DDM text reads back within half a step (and a tenth) of the angle it was written from", () => {
  const failures = [];
  for (const point of points(300)) {
    const digits = integer(10);
    for (const [format, perDegree] of [[formatDms, 3600], [formatDdm, 60]]) {
      const text = `${format(point.latitude, "latitude", digits)} ${format(point.longitude, "longitude", digits)}`;
      const reading = readPointText(text);
      // Half a step of the text, a tenth of one for the degrees the field writes, and round-off.
      const half = (0.6 / 10 ** digits / perDegree) + ROUND_OFF;
      if (reading.status !== "valid") {
        failures.push(`${text}: ${reading.status}`);
        continue;
      }
      const latitudeGap = Math.abs(Number(reading.latitude) - point.latitude);
      const longitudeGap = Math.abs(point.latitude) === 90 ? 0 : angularGap(Number(reading.longitude), point.longitude);
      if (!(latitudeGap <= half && longitudeGap <= half)) failures.push(`${text}: read as ${reading.latitude}, ${reading.longitude}`);
    }
  }
  assert.equal(failures.length, 0, `${failures.length} failures:\n${failures.slice(0, 15).join("\n")}`);
});
