// Plain helpers for the position tool (Konum, spec 8.2). Every coordinate
// value comes from @omcoskun/convert-tools; this file only picks the parser,
// applies the output options and formats the resolution metadata the core
// returns for display.

import {
  coordinateResults,
  decodeMgrs,
  encodeGeoref,
  formatDdm,
  formatDms,
  fromDdm,
  fromDecimalDegrees,
  fromDms,
  fromGars,
  fromGeoref,
  fromMgrs,
  fromUtmUps,
} from "@omcoskun/convert-tools";
import { attempt } from "../../lib/attempt.js";
import { plainNumber } from "../../lib/number-text.js";
import { readPointText } from "../../lib/point-text.js";

export const INPUT_FORMATS = Object.freeze([
  { id: "dd", label: "DD" },
  { id: "dms", label: "DMS" },
  { id: "ddm", label: "DDM" },
  { id: "mgrs", label: "MGRS" },
  { id: "utm", label: "UTM / UPS" },
  { id: "gars", label: "GARS" },
  { id: "georef", label: "GEOREF" },
]);

/** Keys of coordinateResults() in display order. */
export const OUTPUT_FORMATS = Object.freeze([
  { key: "dd", label: "DD" },
  { key: "dms", label: "DMS" },
  { key: "ddm", label: "DDM" },
  { key: "mgrs", label: "MGRS" },
  { key: "utmUps", label: "UTM / UPS" },
  { key: "gars", label: "GARS" },
  { key: "georef", label: "GEOREF" },
]);

/** Parses the form values of one input format with the matching core reader. */
export function readPoint(format, values) {
  switch (format) {
    case "dd":
      return fromDecimalDegrees(values.ddLat, values.ddLon);
    case "dms":
      return fromDms(values.dmsLat, values.dmsLon);
    case "ddm":
      return fromDdm(values.ddmLat, values.ddmLon);
    case "mgrs":
      return fromMgrs(values.mgrs);
    case "utm":
      return fromUtmUps(values.zone, values.hemisphere, values.easting, values.northing);
    case "gars":
      return fromGars(values.gars);
    case "georef":
      return fromGeoref(values.georef);
    default:
      throw new Error(`Unknown input format ${format}.`);
  }
}

/** The output options a position starts with: coordinateResults' own digits. */
export const DEFAULT_OUTPUT_OPTIONS = Object.freeze({
  mgrsPrecision: 5,
  georefPrecision: 4,
  dmsDigits: 5,
  ddmDigits: 7,
  mgrsCorner: false,
});

/** Digits the core accepts: GEOREF 0 … 5 per axis, DMS seconds and DDM minutes 0 … 9. */
export const GEOREF_PRECISIONS = Object.freeze([0, 1, 2, 3, 4, 5]);
export const ANGLE_DIGITS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

/**
 * readPoint with the options of the input: an MGRS square is read at its
 * centre (fromMgrs) or, with mgrsCorner, at its south-west corner
 * (decodeMgrs(value, false)); the source then says sourceCorner: true.
 * @throws {import("@omcoskun/convert-tools").ConvertToolsError} as readPoint
 */
export function readPointWithOptions(format, values, { mgrsCorner = false } = {}) {
  if (format !== "mgrs" || !mgrsCorner) return readPoint(format, values);
  const decoded = decodeMgrs(values.mgrs, false);
  return {
    latitude: decoded.latitude,
    longitude: decoded.longitude,
    sourceKind: "cell",
    sourceCellMetres: decoded.cellMetres,
    sourceCorner: true,
  };
}

// The form fields of each format; with all of them empty there is nothing to read yet.
const FIELDS = {
  dms: ["dmsLat", "dmsLon"],
  ddm: ["ddmLat", "ddmLon"],
  mgrs: ["mgrs"],
  utm: ["easting", "northing"],
  gars: ["gars"],
  georef: ["georef"],
};

/**
 * Reads the form of one input format without throwing. DD is one point
 * field (values.dd, "enlem, boylam", read by readPointText).
 * @returns {{ status: "empty" | "incomplete" | "invalid" }
 *   | { status: "error", code: string }
 *   | { status: "valid", source: object, reading?: object }}
 *   invalid: DD text that is not a point; error: a core reader rejected
 *   the fields, with its ConvertToolsError code.
 */
export function readPosition(format, values, options = {}) {
  let fields = values;
  if (format === "dd") {
    const reading = readPointText(values.dd);
    if (reading.status !== "valid") return { status: reading.status };
    fields = { ddLat: reading.latitude, ddLon: reading.longitude };
  } else if ((FIELDS[format] ?? []).every((key) => String(values[key] ?? "").trim() === "")) {
    return { status: "empty" };
  }
  const read = attempt(() => readPointWithOptions(format, fields, options));
  return read.ok ? { status: "valid", source: read.value } : { status: "error", code: read.code };
}

/**
 * The fields of a format filled from the outputs of the current position,
 * so switching the input format keeps the position (in the new format's
 * own resolution).
 * @param {string} format the format switched to
 * @param {object} outputs formatOutputs of the current position
 * @param {Record<string, string>} values the form values
 * @param {{ latitude: string, longitude: string }} point the position as DD text (handoffPoint)
 */
export function valuesFrom(format, outputs, values, point) {
  const split = (pair) => pair.split(/\s{2,}/);
  switch (format) {
    case "dd":
      return { ...values, dd: `${point.latitude}, ${point.longitude}` };
    case "dms": {
      const [dmsLat, dmsLon] = split(outputs.dms);
      return { ...values, dmsLat, dmsLon };
    }
    case "ddm": {
      const [ddmLat, ddmLon] = split(outputs.ddm);
      return { ...values, ddmLat, ddmLon };
    }
    case "utm": {
      // "36N  488015.988 E  4420370.844 N" or "UPS N  2000000.000 E  1444542.609 N"
      const match = outputs.utmUps.match(/^(?:(\d+)|UPS )([NS])\s+(\S+) E\s+(\S+) N$/);
      if (match == null) return values;
      return { ...values, zone: match[1] ?? "0", hemisphere: match[2], easting: match[3], northing: match[4] };
    }
    case "mgrs":
    case "gars":
    case "georef":
      return { ...values, [format]: outputs[format] };
    default:
      return values;
  }
}

/** The form values with the DD point field ("lat, lon") made from ddLat and ddLon. */
export function withPointText(values) {
  if (values.dd != null || values.ddLat == null) return values;
  return { ...values, dd: `${values.ddLat}, ${values.ddLon}` };
}

// A step of 10^-digits, written without exponentiation.
const step = (digits) => Number(`1e-${digits}`);

/**
 * Every output of a position with the output options: coordinateResults at
 * the MGRS precision, with DMS, DDM and GEOREF written again at their
 * digits (formatDms, formatDdm, encodeGeoref), and the resolution entries
 * to match.
 * @param {{ latitude: number, longitude: number }} source
 * @param {{ mgrsPrecision?: number, georefPrecision?: number, dmsDigits?: number, ddmDigits?: number }} options
 * @returns {object} the keys of coordinateResults
 * @throws {import("@omcoskun/convert-tools").ConvertToolsError} INVALID_PRECISION, …
 */
export function formatOutputs(source, options = {}) {
  const { mgrsPrecision, georefPrecision, dmsDigits, ddmDigits } = { ...DEFAULT_OUTPUT_OPTIONS, ...options };
  const base = coordinateResults(source, mgrsPrecision);
  const { latitude, longitude } = base;
  const georefCell = georefPrecision === 0 ? 1 : Number(`1e${2 - georefPrecision}`) / 60;
  const dmsStep = step(dmsDigits) / 3600;
  const ddmStep = step(ddmDigits) / 60;
  return {
    ...base,
    dms: `${formatDms(latitude, "latitude", dmsDigits)}  ${formatDms(longitude, "longitude", dmsDigits)}`,
    ddm: `${formatDdm(latitude, "latitude", ddmDigits)}  ${formatDdm(longitude, "longitude", ddmDigits)}`,
    georef: encodeGeoref(longitude, latitude, georefPrecision),
    resolution: {
      ...base.resolution,
      dms: { kind: "angular-rounding", stepDegrees: dmsStep, maximumErrorDegrees: dmsStep / 2 },
      ddm: { kind: "angular-rounding", stepDegrees: ddmStep, maximumErrorDegrees: ddmStep / 2 },
      georef: { ...base.resolution.georef, cellDegrees: georefCell, maximumCenterOffsetDegreesPerAxis: georefCell / 2 },
    },
  };
}

const quoted = (value) => JSON.stringify(String(value ?? "").trim());

/**
 * The core calls that produce the outputs, one per line: the reader of the
 * input format, coordinateResults at the MGRS precision, then the calls of
 * every option that differs from coordinateResults' own digits.
 */
export function positionSnippet(format, values, options = {}) {
  const { mgrsPrecision, georefPrecision, dmsDigits, ddmDigits, mgrsCorner } = { ...DEFAULT_OUTPUT_OPTIONS, ...options };
  let reader;
  if (format === "dd") {
    const reading = readPointText(values.dd ?? `${values.ddLat}, ${values.ddLon}`);
    reader = `fromDecimalDegrees(${quoted(reading.latitude)}, ${quoted(reading.longitude)})`;
  } else if (format === "mgrs") {
    reader = mgrsCorner ? `decodeMgrs(${quoted(values.mgrs)}, false)` : `fromMgrs(${quoted(values.mgrs)})`;
  } else if (format === "utm") {
    reader = `fromUtmUps(${[values.zone, values.hemisphere, values.easting, values.northing].map(quoted).join(", ")})`;
  } else {
    const name = { dms: "fromDms", ddm: "fromDdm", gars: "fromGars", georef: "fromGeoref" }[format];
    reader = `${name}(${(FIELDS[format] ?? []).map((key) => quoted(values[key])).join(", ")})`;
  }
  const lines = [`const point = ${reader};`, `coordinateResults(point, ${mgrsPrecision});`];
  if (georefPrecision !== DEFAULT_OUTPUT_OPTIONS.georefPrecision) {
    lines.push(`encodeGeoref(point.longitude, point.latitude, ${georefPrecision});`);
  }
  if (dmsDigits !== DEFAULT_OUTPUT_OPTIONS.dmsDigits) {
    lines.push(`formatDms(point.latitude, "latitude", ${dmsDigits});`, `formatDms(point.longitude, "longitude", ${dmsDigits});`);
  }
  if (ddmDigits !== DEFAULT_OUTPUT_OPTIONS.ddmDigits) {
    lines.push(`formatDdm(point.latitude, "latitude", ${ddmDigits});`, `formatDdm(point.longitude, "longitude", ${ddmDigits});`);
  }
  return lines.join("\n");
}

/**
 * The position as a handoff point (shell/handoff.js): the typed DD text
 * when the input is DD, else the decoded degrees in full.
 * @returns {{ latitude: string, longitude: string }}
 */
export function handoffPoint(format, values, source) {
  if (format === "dd") {
    const reading = readPointText(values.dd);
    if (reading.status === "valid") return { latitude: reading.latitude, longitude: reading.longitude };
  }
  return { latitude: plainNumber(source.latitude), longitude: plainNumber(source.longitude) };
}

/** Fixed-point text without trailing zeros, for resolution notes. */
export function compactNumber(value, maximumDigits = 12) {
  return Number(value)
    .toFixed(maximumDigits)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

const ANGLE_UNITS = {
  dms: { perDegree: 3600, symbol: "″" },
  ddm: { perDegree: 60, symbol: "′" },
};

/**
 * Text for the resolution metadata of one output, e.g. "1 m hücre" or
 * "±0.0005 m çıktı yuvarlaması, eksen başına". Degrees are shown in the
 * output's own sub-unit (seconds for DMS, minutes for DDM and cells).
 */
export function resolutionLabel(key, resolution, text) {
  if (!resolution) return "";
  switch (resolution.kind) {
    case "grid-cell":
      return `${compactNumber(resolution.cellMetres)} m ${text.resolutionCell}`;
    case "angular-cell":
      return `${compactNumber(resolution.cellDegrees * 60)}′ ${text.resolutionCell}`;
    case "grid-rounding":
      return `±${compactNumber(resolution.maximumErrorMetresPerAxis)} m ${text.resolutionMaximum}, ${text.resolutionPerAxis}`;
    case "angular-rounding": {
      const unit = ANGLE_UNITS[key] || { perDegree: 1, symbol: "°" };
      return `±${compactNumber(resolution.maximumErrorDegrees * unit.perDegree)}${unit.symbol} ${text.resolutionMaximum}`;
    }
    default:
      return "";
  }
}

/** Says whether the outputs describe the input point, its cell centre or the MGRS square's corner. */
export function sourceNote(source, text) {
  if (source.sourceKind === "point") return text.pointSource;
  const size =
    source.sourceCellMetres != null
      ? `${compactNumber(source.sourceCellMetres)} m`
      : `${compactNumber(source.sourceCellDegrees * 60, 3)}′`;
  return `${source.sourceCorner ? text.cornerSource : text.cellSource} ${size}`;
}
