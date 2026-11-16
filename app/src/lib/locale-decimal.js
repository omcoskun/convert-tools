// Numbers for reading: digits grouped the way the interface language writes
// them (spec section 7), from plain decimal text so no float round trip
// changes a digit. Copied values stay plain; only the display is grouped.

/**
 * A plain decimal string grouped for reading, without going through floats:
 * "1234567.5" -> "1.234.567,50" (tr) or "1,234,567.50" (en) for 2 decimals.
 * A minus becomes a real minus sign (−).
 * @param {string} value
 * @param {number} decimals
 * @param {string} language
 */
export function localeDecimal(value, decimals, language) {
  const negative = value.startsWith("-");
  const [integer, fraction = ""] = value.replace("-", "").split(".");
  const turkish = language === "tr";
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, turkish ? "." : ",");
  const digits = decimals > 0 ? fraction.padEnd(decimals, "0").slice(0, decimals) : "";
  return `${negative ? "−" : ""}${grouped}${digits ? (turkish ? "," : ".") + digits : ""}`;
}

/**
 * A number rounded to fixed decimals and grouped for the language, without
 * a "−0" for a value that rounds to zero.
 * @param {number} value
 * @param {number} decimals
 * @param {string} language
 */
export function fixedDecimal(value, decimals, language) {
  const fixed = value.toFixed(decimals);
  return localeDecimal(Number(fixed) === 0 ? fixed.replace("-", "") : fixed, decimals, language);
}

/**
 * A signed number for display: "+0.207", "−726.1" (a real minus sign).
 * @param {number} value
 * @param {number} decimals
 * @param {string} language
 */
export function signedDecimal(value, decimals, language) {
  const fixed = value.toFixed(decimals);
  const zero = Number(fixed) === 0;
  const shown = localeDecimal(zero ? fixed.replace("-", "") : fixed, decimals, language);
  return zero || shown.startsWith("−") ? shown : `+${shown}`;
}

/**
 * A plain decimal string grouped for the language with every one of its
 * fraction digits: "6378137" -> "6.378.137" (tr), "0.3048" -> "0,3048" (tr).
 * @param {string} value
 * @param {string} language
 */
export function groupedDecimal(value, language) {
  const point = value.indexOf(".");
  return localeDecimal(value, point < 0 ? 0 : value.length - point - 1, language);
}
