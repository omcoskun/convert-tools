// Plain helpers for the CRS tool (spec 8.3). Every coordinate value comes
// from transformCrs in @convert-tools/core; this file maps the source and
// target selects to EPSG codes and back, and writes the result for display
// and as the library call.

import { SUPPORTED_CRS, coordinateResults, normalizeEpsg, transformCrs } from "@convert-tools/core";
import { attempt } from "../../lib/attempt.js";
import { CRS_KINDS } from "../../lib/crs-kinds.js";
import { degreesText } from "../../lib/number-text.js";

export { CRS_KINDS, SUPPORTED_CRS };


export const UTM_ZONES = Object.freeze(Array.from({ length: 60 }, (_, index) => index + 1));

/**
 * The EPSG code a select names: codeOf("utmNorth", 36) is "EPSG:32636";
 * "custom" is the typed text, trimmed (transformCrs normalizes it).
 * @param {string} kind a CRS_KINDS id
 * @param {number | string} [zone] 1 … 60, for UTM
 * @param {string} [customText]
 */
export function codeOf(kind, zone, customText = "") {
  const entry = CRS_KINDS.find((item) => item.id === kind);
  if (entry == null || entry.id === "custom") return String(customText ?? "").trim();
  if (entry.base != null) return `EPSG:${entry.base + Number(zone)}`;
  return entry.code;
}

/**
 * The select that shows a code: kindOf("EPSG:32736") is { kind: "utmSouth",
 * zone: 36 }; a code the core does not define is "custom".
 * @param {string} code
 * @returns {{ kind: string, zone: number | null }}
 */
export function kindOf(code) {
  const normalized = attempt(() => normalizeEpsg(code));
  if (!normalized.ok) return { kind: "custom", zone: null };
  const fixed = CRS_KINDS.find((item) => item.code === normalized.value);
  if (fixed) return { kind: fixed.id, zone: null };
  const number = Number(normalized.value.slice("EPSG:".length));
  const family = CRS_KINDS.find((item) => item.base != null && number > item.base && number <= item.base + 60);
  return family ? { kind: family.id, zone: number - family.base } : { kind: "custom", zone: null };
}

/**
 * What X and Y of a code are: "geographic" (X = longitude, Y = latitude),
 * "projected" (easting and northing in metres), or null for a code the core
 * does not define.
 */
export function axesOf(code) {
  const normalized = attempt(() => normalizeEpsg(code));
  if (!normalized.ok) return null;
  return normalized.value === "EPSG:4326" ? "geographic" : "projected";
}

/**
 * @param {{ source: string, target: string, x: string, y: string }} request
 * @returns {{ ok: true, value: import("@convert-tools/core").CrsTransformResult } | { ok: false, code: string }}
 */
export function runTransform(request) {
  return attempt(() => transformCrs(request.source, request.target, request.x, request.y));
}

/**
 * The WGS 84 position of X/Y in a system, for the map's pin.
 * @returns {{ latitude: number, longitude: number } | null} null when the
 *   input cannot be transformed
 */
export function geographicOf(code, x, y) {
  const result = attempt(() => transformCrs(code, "EPSG:4326", x, y));
  return result.ok ? { latitude: result.value.y, longitude: result.value.x } : null;
}

/**
 * A map position written as X/Y text of a system (a map click or a pin
 * drag). Geographic X/Y keep the click's own digits.
 * @param {string} code
 * @param {{ latitude: string, longitude: string }} coordinate
 * @returns {{ ok: true, value: { x: string, y: string } } | { ok: false, code: string }}
 *   the core's code when the position is outside the system's domain
 *   (OUTSIDE_UTM_DOMAIN, OUTSIDE_CRS_DOMAIN, OUTSIDE_UPS_DOMAIN, …)
 */
export function fromGeographic(code, coordinate) {
  return attempt(() => {
    const result = transformCrs("EPSG:4326", code, coordinate.longitude, coordinate.latitude);
    if (axesOf(code) === "geographic") return { x: coordinate.longitude, y: coordinate.latitude };
    return { x: result.formattedX, y: result.formattedY };
  });
}

/**
 * A map click in the source system: X and Y become the position, or, when
 * it is outside the source system's domain, the request is returned
 * unchanged with the core's code (Review Focus 5).
 * @returns {{ request: object, failure: string | null }}
 */
export function pickRequest(request, coordinate) {
  const placed = fromGeographic(request.source, coordinate);
  if (!placed.ok) return { request, failure: placed.code };
  return { request: { ...request, x: placed.value.x, y: placed.value.y }, failure: null };
}

/**
 * The request with another source system and the same position: X and Y
 * are written again in the new system, so the pin stays where it was.
 * Without a position (X or Y empty or unreadable) or outside the new
 * system's domain X and Y stay as typed, and failure is the core's code.
 * @param {{ source: string, target: string, x: string, y: string }} request
 * @param {string} sourceCode
 * @returns {{ request: object, failure: string | null }}
 */
export function withSource(request, sourceCode) {
  const next = { ...request, source: sourceCode };
  const filled = String(request.x).trim() !== "" && String(request.y).trim() !== "";
  const position = filled ? geographicOf(request.source, request.x, request.y) : null;
  if (position == null) return { request: next, failure: null };
  return pickRequest(next, { latitude: degreesText(position.latitude), longitude: degreesText(position.longitude) });
}

/**
 * The UTM zone of a position (from the core's UTM/UPS reference), for a
 * UTM select that opens on the zone the point is in; null at the poles (UPS).
 */
export function zoneOf(point) {
  const result = attempt(() => coordinateResults(point, 0).utmUps);
  const match = result.ok ? result.value.match(/^(\d+)[NS]/) : null;
  return match ? Number(match[1]) : null;
}

/**
 * A result as "X, Y" for the result widget: metres to the millimetre,
 * degrees to 8 decimals. Like a coordinate pair, it keeps the decimal point
 * in every language.
 */
export function resultPair(result) {
  const decimals = axesOf(result.target) === "geographic" ? 8 : 3;
  const fixed = (value) => {
    const rounded = value.toFixed(decimals);
    return Number(rounded) === 0 ? rounded.replace("-", "") : rounded;
  };
  return `${fixed(result.x)}, ${fixed(result.y)}`;
}

// A plain decimal stays a number literal; anything else is passed as the typed text.
const numberLiteral = (value) => {
  const source = String(value ?? "").trim();
  return /^-?\d+(\.\d+)?$/.test(source) ? source : JSON.stringify(source);
};

/** The exact call that produced the result, e.g. transformCrs("EPSG:4326", "EPSG:3857", 32.859742, 39.933365). */
export function crsSnippet(request) {
  const code = (value) => JSON.stringify(String(value ?? "").trim());
  return `transformCrs(${code(request.source)}, ${code(request.target)}, ${numberLiteral(request.x)}, ${numberLiteral(request.y)})`;
}
