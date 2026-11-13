import {
  addRational,
  divideRational,
  exactFractionDigits,
  formatRational,
  multiplyRational,
  rationalToJson,
  subtractRational,
  toRational,
} from "../exact/rational.js";
import { getCategory, getUnit } from "./registry.js";
import { ConvertToolsError } from "../errors.js";

const ROUNDING_MODE = "HALF_UP";

/**
 * Exact conversion between two units of one category.
 * @param {import("../types.js").RationalInput} input
 * @param {string} categoryId
 * @param {string} fromId
 * @param {string} toId
 * @param {number} [precision=24] fraction digits of the display `value`
 * @returns {import("../types.js").UnitConversion}
 * @throws {import("../errors.js").ConvertToolsError} UNKNOWN_UNIT_CATEGORY,
 *   UNKNOWN_UNIT, INVALID_NUMBER, INPUT_LIMIT_EXCEEDED, INVALID_PRECISION
 */
export function convertUnits(
  input,
  categoryId,
  fromId,
  toId,
  precision = 24,
) {
  const category = getCategory(categoryId);
  if (!category) {
    throw new ConvertToolsError("UNKNOWN_UNIT_CATEGORY", `Unknown unit category: ${categoryId}.`);
  }

  const from = getUnit(category, fromId);
  const to = getUnit(category, toId);
  if (!from || !to) {
    throw new ConvertToolsError("UNKNOWN_UNIT", `Unknown unit in category ${categoryId}.`);
  }

  const source = toRational(input);
  const base = addRational(
    multiplyRational(source, from.scale),
    from.offset,
  );
  const result = divideRational(
    subtractRational(base, to.offset),
    to.scale,
  );
  const factor = divideRational(from.scale, to.scale);
  const requiredFractionDigits = exactFractionDigits(result);
  const value = formatRational(result, precision);
  const formattedFactor = formatRational(factor, precision);
  const exactDecimal =
    requiredFractionDigits !== null &&
    requiredFractionDigits <= precision;

  return {
    rational: result,
    value,
    exactValue: rationalToJson(result),
    exactMetres: categoryId === "length" ? rationalToJson(base) : null,
    exactFactor: rationalToJson(factor),
    exactDecimal,
    rounded: !exactDecimal,
    terminatingDecimal: requiredFractionDigits !== null,
    requiredFractionDigits,
    precision,
    roundingMode: ROUNDING_MODE,
    factor: formattedFactor,
    from,
    to,
  };
}

/**
 * Exact length conversion, e.g. `convertLength("1", "nautical-mile", "metre")`.
 * @param {import("../types.js").RationalInput} input
 * @param {string} fromId
 * @param {string} toId
 * @param {number} [precision=24]
 * @returns {import("../types.js").UnitConversion}
 */
export function convertLength(input, fromId, toId, precision = 24) {
  return convertUnits(input, "length", fromId, toId, precision);
}

/**
 * Converts `input` to every other unit of the category.
 * @param {import("../types.js").RationalInput} input
 * @param {string} categoryId
 * @param {string} fromId
 * @param {number} [precision=18]
 * @returns {readonly import("../types.js").UnitConversion[]}
 */
export function convertToAll(input, categoryId, fromId, precision = 18) {
  const category = getCategory(categoryId);
  if (!category) {
    throw new ConvertToolsError("UNKNOWN_UNIT_CATEGORY", `Unknown unit category: ${categoryId}.`);
  }

  return category.units
    .filter((unit) => unit.id !== fromId)
    .map((unit) => ({
      ...unit,
      ...convertUnits(input, categoryId, fromId, unit.id, precision),
    }));
}
