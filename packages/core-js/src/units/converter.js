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

export function convertLength(input, fromId, toId, precision = 24) {
  return convertUnits(input, "length", fromId, toId, precision);
}

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
