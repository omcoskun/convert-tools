// Numbers as text for copying and for coordinate pairs. Pure: no React, no DOM.

/**
 * A number as copied: every digit JavaScript keeps, never an exponent
 * (1e-7 is written 0.0000001), no "-0".
 * @param {number} value
 */
export function plainNumber(value) {
  if (Object.is(value, -0) || value === 0) return "0";
  const text = String(value);
  return /e/i.test(text) ? value.toFixed(20).replace(/\.?0+$/, "") : text;
}

/**
 * A pair for display: "first, second" with fixed decimals and a decimal
 * point in every language (a comma separates the two), without "-0".
 * @param {number} first
 * @param {number} second
 * @param {number} decimals
 */
export function fixedPair(first, second, decimals) {
  const fixed = (value) => {
    const rounded = value.toFixed(decimals);
    return Number(rounded) === 0 ? rounded.replace("-", "") : rounded;
  };
  return `${fixed(first)}, ${fixed(second)}`;
}

/**
 * Degrees as field and handoff text: at most 9 decimals (1e-9° is about
 * 0.1 mm), no trailing zeros, no "-0", and none of the last-digit noise of a
 * transformation round trip: degreesText(17.133999999999972) is "17.134".
 * @param {number} degrees
 */
export function degreesText(degrees) {
  const text = degrees.toFixed(9).replace(/\.?0+$/, "");
  return Number(text) === 0 ? "0" : text;
}
