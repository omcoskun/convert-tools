// The length tool's calculations (spec 8.4). Every value comes from
// @convert-tools/core: the categories of UNIT_CATEGORIES, one conversion
// with convertUnits, every unit with convertToAll, and the exact call that
// produced the result. Pure: no React, no DOM.

import { UNIT_CATEGORIES, convertToAll, convertUnits, getCategory } from "@convert-tools/core";
import { attempt } from "../../lib/attempt.js";

/** The unit categories of the core, in its order (today only "length"). */
export function categories() {
  return UNIT_CATEGORIES;
}

/**
 * One category of the core by id (getCategory), so the page reads a
 * category's units and defaults the same way the core does.
 * @param {string} id
 */
export function categoryOf(id) {
  const category = getCategory(id);
  if (category == null) throw new TypeError(`No unit category ${JSON.stringify(id)}`);
  return category;
}

/**
 * True while a number is still being typed: a sign, a point, a trailing
 * decimal point or an unfinished exponent ("-", "1.", "2e-"). Such text is
 * not shown as an error.
 * @param {string} input
 */
export function isPartialNumber(input) {
  const text = String(input ?? "").trim();
  return /^[+-]?[.,]?$/.test(text) || /^[+-]?\d+[.,]$/.test(text) || /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)[eE][+-]?$/.test(text);
}

/**
 * Fraction digits as typed: a whole number of digits, or NaN so the core
 * reports INVALID_PRECISION.
 * @param {string | number} value
 */
function readPrecision(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  return /^\d{1,3}$/.test(text) ? Number(text) : Number.NaN;
}

/**
 * The typed value as the core reads it: trimmed, a decimal comma
 * ("1,5", as Turkish writes it) read as a point.
 * @param {string} input
 */
export function readValue(input) {
  return String(input ?? "")
    .trim()
    .replace(/^([+-]?\d*),(\d+)$/, "$1.$2");
}

/**
 * One conversion. exactInput, when set, is the exact rational carried over
 * by a swap ({ numerator, denominator }); it wins over the typed input so
 * display rounding never feeds back into the next conversion.
 * @param {{ categoryId: string, input: string, exactInput?: object | null, fromId: string, toId: string, precision: number | string }} request
 * @returns {{ ok: true, value: object } | { ok: false, code: string }}
 */
export function runConversion({ categoryId, input, exactInput = null, fromId, toId, precision }) {
  return attempt(() => convertUnits(exactInput ?? readValue(input), categoryId, fromId, toId, readPrecision(precision)));
}

/**
 * The value in every other unit of the category.
 * @param {{ categoryId: string, input: string, exactInput?: object | null, fromId: string, precision: number | string }} request
 * @returns {{ ok: true, value: object[] } | { ok: false, code: string }}
 */
export function runAll({ categoryId, input, exactInput = null, fromId, precision }) {
  return attempt(() => convertToAll(exactInput ?? readValue(input), categoryId, fromId, readPrecision(precision)));
}

/**
 * The exact result as a fraction ("1/5280") when its decimal does not
 * terminate, else null (the decimal says it all).
 * @param {{ terminatingDecimal: boolean, exactValue: { numerator: string, denominator: string } }} conversion
 * @returns {string | null}
 */
export function exactFraction(conversion) {
  if (conversion.terminatingDecimal) return null;
  const { numerator, denominator } = conversion.exactValue;
  return `${numerator}/${denominator}`;
}

/** Digits after the decimal point of a plain decimal string ("0.25" -> 2). */
export function fractionDigits(value) {
  const point = value.indexOf(".");
  return point < 0 ? 0 : value.length - point - 1;
}

/**
 * The exact @convert-tools/core call that produced the result.
 * @param {{ categoryId: string, input: string, exactInput?: object | null, fromId: string, toId: string, precision: number | string }} request
 */
export function lengthSnippet({ categoryId, input, exactInput = null, fromId, toId, precision }) {
  const value =
    exactInput != null
      ? `{ numerator: ${JSON.stringify(exactInput.numerator)}, denominator: ${JSON.stringify(exactInput.denominator)} }`
      : JSON.stringify(readValue(input));
  const digits = readPrecision(precision);
  return `convertUnits(${value}, ${JSON.stringify(categoryId)}, ${JSON.stringify(fromId)}, ${JSON.stringify(toId)}, ${Number.isNaN(digits) ? JSON.stringify(String(precision)) : digits})`;
}
