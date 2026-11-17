// How many digits of a value mean something, given how far it may be from
// the exact value (an uncertainty the core reports). Decimals may be
// negative: -1 rounds to tens, -3 to thousands. Pure: no React, no DOM; powers
// of ten are built by multiplication (app code does no Math.pow or Math.log).

/** 10^n for an integer n >= 0: exact up to 10^22. */
function tenTo(n) {
  let power = 1;
  for (let index = 0; index < n; index += 1) power *= 10;
  return power;
}

/** One unit of the last of `decimals` decimals: 0.01 for 2, 100 for -2. */
function unitOf(decimals) {
  return decimals >= 0 ? 1 / tenTo(decimals) : tenTo(-decimals);
}

/**
 * The most decimals, at most `most`, whose last digit means something: half a
 * unit of it is at least the uncertainty. Without an uncertainty (undefined,
 * null, 0, NaN) all `most`.
 * @param {number | null | undefined} uncertainty
 * @param {number} most
 */
export function meaningfulDecimals(uncertainty, most) {
  if (!(uncertainty > 0)) return most;
  let decimals = most;
  while (unitOf(decimals) / 2 < uncertainty) decimals -= 1;
  return decimals;
}

/**
 * A value rounded to `decimals` (negative: to tens, hundreds, ...), as plain
 * decimal text without "-0": roundedDecimal(1780547.7, -3) is "1781000".
 * @param {number} value
 * @param {number} decimals
 */
export function roundedDecimal(value, decimals) {
  let digits;
  if (decimals >= 0) {
    digits = value.toFixed(decimals);
  } else {
    const step = tenTo(-decimals);
    digits = `${value < 0 ? "-" : ""}${Math.round(Math.abs(value) / step) * step}`;
  }
  return Number(digits) === 0 ? digits.replace("-", "") : digits;
}

/**
 * A bound for display: rounded up to two significant digits, with at most
 * `most` decimals (round-off of a millionth of a unit is not rounded up).
 * boundText(23.6, 1) is { text: "24", decimals: 0 }.
 * @param {number} bound positive
 * @param {number} most
 * @returns {{ text: string, decimals: number }} decimals as in roundedDecimal
 */
export function boundText(bound, most) {
  let decimals = most;
  while (unitOf(decimals) * 100 <= bound) decimals -= 1;
  const unit = unitOf(decimals);
  const units = Math.ceil(bound / unit - 1e-6);
  const digits = decimals >= 0 ? (units / tenTo(decimals)).toFixed(decimals) : String(units * unit);
  return { text: digits, decimals };
}
