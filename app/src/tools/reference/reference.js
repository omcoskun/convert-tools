// The reference page's tables (spec 8.6). Every value comes from
// @omcoskun/convert-tools (WGS84, SUPPORTED_CRS, the unit definitions,
// ERROR_CODES) or from config.json (the accuracy figures of the root
// README). Pure: no React, no DOM.

import { ERROR_CODES, SUPPORTED_CRS, UNIT_CATEGORIES, WGS84, formatRational } from "@omcoskun/convert-tools";
import { CRS_KINDS } from "../../lib/crs-kinds.js";
import { plainNumber } from "../../lib/number-text.js";

/** The page's sections, in order; id is the anchor of the in-page index. */
export const REFERENCE_SECTIONS = Object.freeze(["accuracy", "wgs84", "crs", "units", "errors"]);

/**
 * The WGS 84 constants of the core.
 * @returns {{ id: string, symbol: string, value: string, unit?: string }[]}
 *   value is a plain decimal (copied as it is, grouped for display)
 *   id names the row's label (a, b, f, inverseFlattening, utmScale, upsScale)
 */
export function wgs84Rows() {
  return [
    { id: "a", symbol: "a", value: plainNumber(WGS84.a), unit: "m" },
    { id: "b", symbol: "b", value: plainNumber(WGS84.b), unit: "m" },
    { id: "f", symbol: "f", value: plainNumber(WGS84.f) },
    { id: "inverseFlattening", symbol: "1/f", value: (1 / WGS84.f).toFixed(9) },
    { id: "utmScale", symbol: "k₀", value: plainNumber(WGS84.utmScale) },
    { id: "upsScale", symbol: "k₀", value: plainNumber(WGS84.upsScale) },
  ];
}

/**
 * The coordinate systems transformCrs accepts, each with its kind (a
 * CRS_KINDS id, lib/crs-kinds.js).
 * @returns {{ code: string, kind: string | null }[]}
 */
export function crsRows() {
  return SUPPORTED_CRS.map((code) => {
    const kind = CRS_KINDS.find(
      (entry) => entry.code === code || (entry.base != null && code.startsWith(`EPSG:${entry.base + 1}`)),
    );
    return { code, kind: kind ? kind.id : null };
  });
}

/**
 * Every length unit with its exact length in metres, as a decimal (every
 * factor of the catalogue terminates).
 * @returns {{ id: string, label: string, symbol: string, metres: string }[]}
 */
export function unitRows() {
  const length = UNIT_CATEGORIES.find((category) => category.id === "length");
  return length.units.map((unit) => ({
    id: unit.id,
    label: unit.label,
    symbol: unit.symbol,
    metres: formatRational(unit.scale, 60),
  }));
}

/**
 * Every error code of the core with its meaning in the interface language.
 * @param {Record<string, string>} errors the errors group of lang.json
 * @returns {{ code: string, text: string }[]}
 */
export function errorRows(errors) {
  return ERROR_CODES.map((code) => ({ code, text: errors[code] ?? "" }));
}

/**
 * The accuracy rows of config.json for display. The figures are copied
 * verbatim from the root README, which writes them the Turkish way
 * ("4,8 nm"); other languages get a decimal point.
 * @param {{ id: string, reference: string, difference: string }[]} accuracy
 * @param {string} language
 */
export function accuracyRows(accuracy, language) {
  return accuracy.map((row) => ({
    ...row,
    difference: language === "tr" ? row.difference : row.difference.replace(/(\d),(\d)/g, "$1.$2"),
  }));
}
