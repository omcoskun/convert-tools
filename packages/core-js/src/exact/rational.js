import { ConvertToolsError } from "../errors.js";

const TEN = 10n;
const MAX_DECIMAL_EXPONENT = 1000;
const MAX_OUTPUT_DIGITS = 60;
const MAX_INPUT_DIGITS = 4096;
const MAX_RATIONAL_DIGITS = 8192;
const INTEGER_PATTERN = /^[+-]?\d+$/;
const NORMALIZED_RATIONALS = new WeakSet();

function absolute(value) {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left, right) {
  let a = absolute(left);
  let b = absolute(right);

  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

function assertBigIntDigits(value, maximum, label) {
  const digitCount = absolute(value).toString().length;
  if (digitCount > maximum) {
    throw new ConvertToolsError("INPUT_LIMIT_EXCEEDED", `${label} must contain at most ${maximum} digits.`);
  }
}

export function normalizeRational(numerator, denominator = 1n) {
  if (denominator === 0n) {
    throw new ConvertToolsError("DIVISION_BY_ZERO", "Division by zero is not allowed.");
  }
  assertBigIntDigits(numerator, MAX_RATIONAL_DIGITS, "Rational numerator");
  assertBigIntDigits(denominator, MAX_RATIONAL_DIGITS, "Rational denominator");

  let normalizedNumerator = numerator;
  let normalizedDenominator = denominator;
  if (normalizedDenominator < 0n) {
    normalizedNumerator = -normalizedNumerator;
    normalizedDenominator = -normalizedDenominator;
  }

  if (normalizedNumerator === 0n) {
    const zero = Object.freeze({ n: 0n, d: 1n });
    NORMALIZED_RATIONALS.add(zero);
    return zero;
  }

  const divisor = greatestCommonDivisor(
    normalizedNumerator,
    normalizedDenominator,
  );
  const rational = Object.freeze({
    n: normalizedNumerator / divisor,
    d: normalizedDenominator / divisor,
  });
  NORMALIZED_RATIONALS.add(rational);
  return rational;
}

function powerOfTen(exponent, maximum = MAX_RATIONAL_DIGITS) {
  if (
    !Number.isInteger(exponent) ||
    exponent < 0 ||
    exponent > maximum
  ) {
    throw new ConvertToolsError("INPUT_LIMIT_EXCEEDED",
      `Power-of-ten exponent must be between 0 and ${maximum}.`,
    );
  }

  return TEN ** BigInt(exponent);
}

/**
 * Parses an exact decimal ("1852", "-0.25", "3e-4") or a safe integer.
 * @param {string | number | bigint} input
 * @returns {import("../types.js").Rational}
 * @throws {import("../errors.js").ConvertToolsError} INVALID_NUMBER,
 *   INPUT_LIMIT_EXCEEDED
 */
export function parseDecimal(input) {
  if (typeof input === "number" && !Number.isSafeInteger(input)) {
    throw new ConvertToolsError("INVALID_NUMBER",
      "Number inputs must be safe integers. Use a decimal string for non-integer or high-precision values.",
    );
  }
  if (
    typeof input !== "string" &&
    typeof input !== "bigint" &&
    typeof input !== "number"
  ) {
    throw new ConvertToolsError("INVALID_NUMBER", "Decimal values must be provided as strings or safe integers.");
  }

  const source = String(input).trim().replace(/\s+/g, "");
  if (source.length > MAX_INPUT_DIGITS + 16) {
    throw new ConvertToolsError("INPUT_LIMIT_EXCEEDED",
      `Decimal values must contain at most ${MAX_INPUT_DIGITS} digits.`,
    );
  }
  const match = source.match(
    /^([+-]?)(?:(\d+)(?:[.,](\d*))?|[.,](\d+))(?:[eE]([+-]?\d+))?$/,
  );

  if (!match) {
    throw new ConvertToolsError("INVALID_NUMBER", "Enter a valid decimal number, for example 1852 or 3e-4.");
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const sourceIntegerPart = match[2] == null ? "" : match[2];
  const fractionPart = match[3] != null ? match[3] : match[4] != null ? match[4] : "";
  const exponent = Number(match[5] == null ? "0" : match[5]);

  if (
    !Number.isInteger(exponent) ||
    Math.abs(exponent) > MAX_DECIMAL_EXPONENT
  ) {
    throw new ConvertToolsError("INPUT_LIMIT_EXCEEDED",
      `Exponent must be between -${MAX_DECIMAL_EXPONENT} and ${MAX_DECIMAL_EXPONENT}.`,
    );
  }

  const rawDigits = `${sourceIntegerPart}${fractionPart}`;
  if (rawDigits.length > MAX_INPUT_DIGITS) {
    throw new ConvertToolsError("INPUT_LIMIT_EXCEEDED",
      `Decimal values must contain at most ${MAX_INPUT_DIGITS} digits.`,
    );
  }
  const digits = rawDigits.replace(/^0+(?=\d)/, "");
  let numerator = sign * BigInt(digits || "0");
  let denominator = powerOfTen(fractionPart.length);

  if (exponent > 0) {
    numerator *= powerOfTen(exponent);
  } else if (exponent < 0) {
    denominator *= powerOfTen(-exponent);
  }

  return normalizeRational(numerator, denominator);
}

function integerComponent(value) {
  let result;
  if (typeof value === "bigint") {
    result = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new ConvertToolsError("INVALID_NUMBER",
        "Rational number components must be safe integers. Use integer strings for high-precision values.",
      );
    }
    result = BigInt(value);
  } else if (typeof value === "string") {
    const source = value.trim();
    const digitCount = source[0] === "+" || source[0] === "-"
      ? source.length - 1
      : source.length;
    if (digitCount > MAX_INPUT_DIGITS) {
      throw new ConvertToolsError("INPUT_LIMIT_EXCEEDED",
        `Rational components must contain at most ${MAX_INPUT_DIGITS} digits.`,
      );
    }
    if (!INTEGER_PATTERN.test(source)) {
      throw new ConvertToolsError("INVALID_NUMBER",
        "Rational components must be integer strings or BigInts.",
      );
    }
    result = BigInt(source);
  } else {
    throw new ConvertToolsError("INVALID_NUMBER", "Rational components must be integer strings or BigInts.");
  }

  assertBigIntDigits(result, MAX_INPUT_DIGITS, "Rational components");
  return result;
}

/**
 * @param {import("../types.js").RationalInput} value
 * @returns {import("../types.js").Rational}
 * @throws {import("../errors.js").ConvertToolsError} INVALID_NUMBER,
 *   INPUT_LIMIT_EXCEEDED, DIVISION_BY_ZERO
 */
export function toRational(value) {
  if (
    value &&
    typeof value === "object" &&
    NORMALIZED_RATIONALS.has(value)
  ) {
    return value;
  }
  if (typeof value === "string") {
    return parseDecimal(value);
  }
  if (Array.isArray(value) && value.length === 2) {
    return normalizeRational(
      integerComponent(value[0]),
      integerComponent(value[1]),
    );
  }
  if (typeof value === "bigint") {
    return normalizeRational(BigInt(value), 1n);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new ConvertToolsError("INVALID_NUMBER",
        "Number inputs must be safe integers. Use a decimal string for non-integer or high-precision values.",
      );
    }
    return normalizeRational(BigInt(value), 1n);
  }
  if (value && typeof value === "object") {
    if ("n" in value && "d" in value) {
      return normalizeRational(
        integerComponent(value.n),
        integerComponent(value.d),
      );
    }
    if ("numerator" in value && "denominator" in value) {
      return normalizeRational(
        integerComponent(value.numerator),
        integerComponent(value.denominator),
      );
    }
  }

  throw new ConvertToolsError("INVALID_NUMBER",
    "Rational values must be decimal strings, safe integers, Rational objects, JSON rational objects, or [n, d] pairs.",
  );
}

/**
 * @param {import("../types.js").RationalInput} value
 * @returns {import("../types.js").JsonRational}
 */
export function rationalToJson(value) {
  const rational = toRational(value);
  return Object.freeze({
    numerator: rational.n.toString(),
    denominator: rational.d.toString(),
  });
}

export function addRational(left, right) {
  return normalizeRational(
    left.n * right.d + right.n * left.d,
    left.d * right.d,
  );
}

export function subtractRational(left, right) {
  return normalizeRational(
    left.n * right.d - right.n * left.d,
    left.d * right.d,
  );
}

export function multiplyRational(left, right) {
  return normalizeRational(left.n * right.n, left.d * right.d);
}

export function divideRational(left, right) {
  if (right.n === 0n) {
    throw new ConvertToolsError("DIVISION_BY_ZERO", "Division by zero is not allowed.");
  }
  return normalizeRational(left.n * right.d, left.d * right.n);
}

export function exactFractionDigits(value) {
  let denominator = value.d;
  let twos = 0;
  let fives = 0;
  while (denominator % 2n === 0n) {
    denominator /= 2n;
    twos += 1;
  }
  while (denominator % 5n === 0n) {
    denominator /= 5n;
    fives += 1;
  }
  return denominator === 1n ? Math.max(twos, fives) : null;
}

export function hasTerminatingDecimal(value) {
  return exactFractionDigits(value) !== null;
}

/**
 * Decimal text rounded HALF_UP to at most `maximumFractionDigits` digits.
 * @param {import("../types.js").RationalInput} value
 * @param {number} [maximumFractionDigits=24]
 * @returns {string}
 */
export function formatRational(value, maximumFractionDigits = 24) {
  if (
    !Number.isInteger(maximumFractionDigits) ||
    maximumFractionDigits < 0 ||
    maximumFractionDigits > MAX_OUTPUT_DIGITS
  ) {
    throw new ConvertToolsError("INVALID_PRECISION",
      `Maximum fraction digits must be an integer between 0 and ${MAX_OUTPUT_DIGITS}.`,
    );
  }

  const rational = toRational(value);
  const digits = maximumFractionDigits;
  const negative = rational.n < 0n;
  const numerator = absolute(rational.n);
  const scale = powerOfTen(digits);
  const rounded =
    (numerator * scale * 2n + rational.d) / (rational.d * 2n);
  let output = rounded.toString().padStart(digits + 1, "0");

  if (digits > 0) {
    const split = output.length - digits;
    output = `${output.slice(0, split)}.${output.slice(split)}`;
    output = output.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  }

  if (negative && output !== "0") {
    output = `-${output}`;
  }
  return output;
}
