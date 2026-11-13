import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const VECTOR_DIRECTORY = new URL(
  "../../../../contracts/test-vectors/",
  import.meta.url,
);

/**
 * Reads a contract CSV file into objects keyed by the header names.
 * Cells stay as strings; callers convert what they need.
 */
export function readVectors(name, expectedHeader) {
  return readCsv(new URL(name, VECTOR_DIRECTORY), expectedHeader, name);
}

/** Reads any contract CSV (no quoting; cells never contain commas). */
export function readCsv(url, expectedHeader, name = String(url)) {
  const source = readFileSync(url, "utf8").trim();
  const [headerLine, ...lines] = source.split(/\r?\n/);
  const header = headerLine.split(",");
  if (expectedHeader) assert.deepEqual(header, expectedHeader, name);
  return lines.map((line, index) => {
    const cells = line.split(",");
    assert.equal(cells.length, header.length, `${name} row ${index + 2}`);
    return Object.fromEntries(header.map((column, i) => [column, cells[i]]));
  });
}

const METRES_PER_DEGREE = (6378137 * Math.PI) / 180;

/** Signed longitude difference in (-180, 180]. */
export function longitudeDelta(first, second) {
  const delta = (((first - second) % 360) + 540) % 360 - 180;
  return delta === -180 ? 180 : delta;
}

/**
 * Horizontal distance between two nearby points in metres, using a local
 * spherical scale. Good to about 1% of the error itself, which is all a
 * tolerance check needs. At a pole the longitude term vanishes.
 */
export function groundErrorMetres(latitude, longitude, expectedLatitude, expectedLongitude) {
  const cosine = Math.cos((expectedLatitude * Math.PI) / 180);
  return Math.hypot(
    (latitude - expectedLatitude) * METRES_PER_DEGREE,
    longitudeDelta(longitude, expectedLongitude) * METRES_PER_DEGREE * Math.max(0, cosine),
  );
}

export function angularDifference(actual, expected) {
  return Math.abs(longitudeDelta(actual, expected));
}

/** Tracks the largest error seen for a named quantity. */
export class MaxError {
  constructor(label, unit) {
    this.label = label;
    this.unit = unit;
    this.value = 0;
    this.where = "";
    this.count = 0;
  }

  add(value, where) {
    this.count += 1;
    if (value > this.value) {
      this.value = value;
      this.where = where;
    }
  }

  report(t) {
    t.diagnostic(
      `${this.label}: max ${this.value.toExponential(3)} ${this.unit} over ${this.count} rows${this.where ? ` (${this.where})` : ""}`,
    );
  }
}
