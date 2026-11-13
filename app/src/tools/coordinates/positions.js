// Plain helpers for the position-format tool. Every coordinate value comes
// from @convert-tools/core; this file only picks the parser and formats the
// resolution metadata the core returns for display.

import {
  fromDdm,
  fromDecimalDegrees,
  fromDms,
  fromGars,
  fromGeoref,
  fromMgrs,
  fromUtmUps,
} from "@convert-tools/core";

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

/** Says whether the outputs describe the input point or its cell centre. */
export function sourceNote(source, text) {
  if (source.sourceKind === "point") return text.pointSource;
  const size =
    source.sourceCellMetres != null
      ? `${compactNumber(source.sourceCellMetres)} m`
      : `${compactNumber(source.sourceCellDegrees * 60, 3)}′`;
  return `${text.cellSource} ${size}`;
}
