import { LENGTH } from "./catalog/index.js";

export const UNIT_CATEGORIES = Object.freeze([LENGTH]);

const CATEGORIES_BY_ID = new Map(
  UNIT_CATEGORIES.map((category) => [category.id, category]),
);

/**
 * @param {string} categoryId e.g. "length"
 * @returns {import("../types.js").UnitCategory | undefined}
 */
export function getCategory(categoryId) {
  return CATEGORIES_BY_ID.get(categoryId);
}

/**
 * @param {import("../types.js").UnitCategory | undefined} category
 * @param {string} unitId
 * @returns {import("../types.js").UnitDefinition | undefined}
 */
export function getUnit(category, unitId) {
  return category == null ? undefined : category.units.find((unit) => unit.id === unitId);
}
