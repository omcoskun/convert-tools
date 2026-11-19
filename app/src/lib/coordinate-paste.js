// Reads coordinate pairs out of pasted text, so a point copied from a web map
// ("41.73987943886398, 34.01769942871567", latitude first) fills both fields
// at once. Pure text handling: decimal values keep the pasted digits (no
// float round trip), and DMS/DDM text is converted by @omcoskun/convert-tools.
//
// Anything that is not clearly a pair yields null, and the caller lets the
// paste through as a normal paste into the one field.

import { fromDms } from "@omcoskun/convert-tools";

// Hemisphere letters, English and Turkish (Kuzey, Güney, Doğu, Batı). Upper
// case only: lower-case d, m and s are unit letters in some DMS notations.
const HEMISPHERES = {
  N: { axis: "latitude", negative: false, english: "N" },
  S: { axis: "latitude", negative: true, english: "S" },
  K: { axis: "latitude", negative: false, english: "N" },
  G: { axis: "latitude", negative: true, english: "S" },
  E: { axis: "longitude", negative: false, english: "E" },
  W: { axis: "longitude", negative: true, english: "W" },
  D: { axis: "longitude", negative: false, english: "E" },
  B: { axis: "longitude", negative: true, english: "W" },
};
const LETTERS = Object.keys(HEMISPHERES).join("");
const NUMBER = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)`;
// One decimal coordinate: hemisphere letter after the number (41.7 N) or
// before it (N 41.7), an optional degree sign, and a separator or the end.
const TRAILING_TOKEN = new RegExp(String.raw`(${NUMBER})\s*°?\s*([${LETTERS}])?(?:\s+|$)`, "y");
const LEADING_TOKEN = new RegExp(String.raw`(?:([${LETTERS}])\s*)?(${NUMBER})\s*°?(?:\s+|$)`, "y");
// Minute or second marks, or a degree sign followed by more digits.
const ANGLE_MARKS = /['′’"″]|°\s*\d/;
// Decimals the DMS conversion is written with: 1e-10° is about 0.01 mm,
// more when the text has finer seconds or minutes (see decimalsFor), up to
// the 15 a double holds.
const DMS_DECIMALS = 10;
const MOST_DECIMALS = 15;

/** Unicode minus signs become "-", typographic double quotes a second mark. */
function normalizeSigns(input) {
  return input.replace(/[−﹣－]/g, "-").replace(/[“”]/g, '"');
}

/** The text without one level of surrounding brackets or parentheses. */
function unwrap(input) {
  const trimmed = input.trim();
  const match = /^[([{]\s*([\s\S]*?)\s*[)\]}]$/.exec(trimmed);
  return match ? match[1] : trimmed;
}

/**
 * The line with every separator turned into a space and decimal commas into
 * points, or null when commas cannot be read without guessing.
 *   "41.7, 34.0"    commas are separators (the numbers use points)
 *   "41,7; 34,0"    "41,7 34,0"    commas are decimal commas
 *   "41,7,34,0"     "41,34"        ambiguous: null
 */
function separateDecimal(line) {
  let input = line;
  const hasPoint = /\d\.\d|(^|[^\d])\.\d/.test(input);
  const commas = input.match(/,/g) || [];
  if (commas.length > 0 && !hasPoint) {
    const decimalCommas = input.match(/\d,\d/g) || [];
    const otherSeparator = /[;\t]|\d\s+[+-]?[\d.]|[^\d,\s]\s+|\s+[^\d,\s]/.test(input);
    if (decimalCommas.length === commas.length) {
      // Every comma sits between digits: they are decimal commas only if
      // something else separates the numbers.
      if (!otherSeparator) return null;
      input = input.replace(/(\d),(\d)/g, "$1.$2");
    } else if (decimalCommas.length > 0) {
      // "41,7, 34,0": commas both inside and between numbers.
      return null;
    }
  }
  return input.replace(/[,;\t]/g, " ").trim();
}

/** Decimal tokens of one line: [{ number, letter }] or null. */
function decimalTokens(line) {
  const input = separateDecimal(line);
  if (input == null || input === "") return null;
  // The letter goes after the number unless the text starts with one.
  const leading = new RegExp(`^[${LETTERS}]`).test(input);
  const pattern = leading ? LEADING_TOKEN : TRAILING_TOKEN;
  const tokens = [];
  pattern.lastIndex = 0;
  while (pattern.lastIndex < input.length) {
    const start = pattern.lastIndex;
    const match = pattern.exec(input);
    if (match == null || pattern.lastIndex === start) return null;
    const [number, letter] = leading ? [match[2], match[1]] : [match[1], match[2]];
    tokens.push({ number, letter: letter || null });
  }
  return tokens;
}

/** "+41.70" -> "41.70", ".5" -> "0.5", "-.5" -> "-0.5"; digits otherwise kept. */
function tidyNumber(number) {
  const unsigned = number.replace(/^[+-]/, "");
  const sign = number.startsWith("-") ? "-" : "";
  return sign + (unsigned.startsWith(".") ? `0${unsigned}` : unsigned);
}

const inRange = (value, limit) => Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;

/**
 * Assigns two decimal tokens to latitude and longitude. A hemisphere letter
 * decides the axis regardless of order; without letters the order is
 * latitude, longitude, unless only the other order is valid.
 */
function decimalPair(first, second) {
  const tokens = [first, second];
  const signed = tokens.map((token) => {
    if (token.letter == null) return { axis: null, value: tidyNumber(token.number) };
    const hemisphere = HEMISPHERES[token.letter];
    // "-41.7 S" or "-41.7 N": the sign and the letter disagree or repeat.
    if (token.number.startsWith("-")) return null;
    const digits = tidyNumber(token.number);
    return { axis: hemisphere.axis, value: hemisphere.negative ? `-${digits}` : digits };
  });
  if (signed.includes(null)) return null;
  const [a, b] = signed;
  let latitude;
  let longitude;
  let swapped = false;
  let longitudeFirst = false;
  if (a.axis != null || b.axis != null) {
    if (a.axis != null && b.axis != null && a.axis === b.axis) return null;
    const firstIsLatitude = a.axis === "latitude" || b.axis === "longitude";
    [latitude, longitude] = firstIsLatitude ? [a.value, b.value] : [b.value, a.value];
    longitudeFirst = !firstIsLatitude;
  } else if (inRange(a.value, 90) && inRange(b.value, 180)) {
    [latitude, longitude] = [a.value, b.value];
  } else {
    // "34.0177, 141.7399" can only be latitude, longitude; "141.7399, 34.0177"
    // only longitude, latitude. That order is taken and reported as swapped.
    [latitude, longitude] = [b.value, a.value];
    swapped = true;
    longitudeFirst = true;
  }
  if (!inRange(latitude, 90) || !inRange(longitude, 180)) return null;
  return { latitude, longitude, swapped, longitudeFirst };
}

/**
 * Decimals for the degrees of one DMS/DDM angle text: 10, or enough that
 * writing them stays within a tenth of the typed step (f decimals of
 * seconds, a step of 2.8e-(f+4)°: f + 5; of minutes, 1.7e-(f+2)°: f + 3).
 */
function decimalsFor(angle) {
  const numbers = angle.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const fraction = (numbers[numbers.length - 1] ?? "").split(/[.,]/)[1] ?? "";
  const extra = { 2: 3, 3: 5 }[numbers.length] ?? 0;
  return Math.min(MOST_DECIMALS, Math.max(DMS_DECIMALS, fraction.length + extra));
}

/** Decimal degrees of a core result as plain text without trailing zeros. */
function degreesText(value, decimals = DMS_DECIMALS) {
  return value
    .toFixed(decimals)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "")
    .replace(/^-0$/, "0");
}

/** The two angles of a DMS/DDM line, each with its hemisphere letter if any. */
function dmsParts(line) {
  const letter = `[${LETTERS}]`;
  const trailing = new RegExp(`[^${LETTERS}]+${letter}`, "g");
  const leading = new RegExp(`${letter}[^${LETTERS}]+`, "g");
  const clean = (part) => part.replace(/^[\s,;]+|[\s,;]+$/g, "");
  const letters = line.match(new RegExp(letter, "g")) || [];
  if (letters.length === 2) {
    const parts = new RegExp(`^${letter}`).test(line) ? line.match(leading) : line.match(trailing);
    if (parts == null || parts.length !== 2 || parts.join("").length !== line.length) return null;
    return parts.map(clean);
  }
  if (letters.length !== 0) return null;
  // Without letters: a semicolon or tab, a space after the last mark of an
  // angle (seconds, or minutes when there are no seconds), or a single comma
  // separates the two angles. (No look-behind: older Safari versions cannot
  // parse it; a line holds no newline, so one marks the split.)
  const lastMark = /["″]/.test(line) ? /(["″])\s+(?=[+-]?\d)/g : /(['′’])\s+(?=[+-]?\d)/g;
  const afterMark = line.replace(lastMark, "$1\n");
  for (const [input, separator] of [[line, /[;\t]/], [afterMark, /\n/], [line, /,/]]) {
    const parts = input.split(separator);
    if (parts.length === 2) return parts.map(clean);
  }
  return null;
}

/** Converts a DMS/DDM pair with the core: { latitude, longitude, swapped } or null. */
function dmsPair(line) {
  const parts = dmsParts(line);
  if (parts == null || parts.some((part) => part === "")) return null;
  const toEnglish = (part) => part.replace(new RegExp(`[${LETTERS}]`), (found) => HEMISPHERES[found].english);
  const [first, second] = parts.map(toEnglish);
  const axisOf = (part) => {
    const found = /[NSEW]/.exec(part);
    return found ? HEMISPHERES[found[0]].axis : null;
  };
  const firstAxis = axisOf(first);
  const secondAxis = axisOf(second);
  if (firstAxis != null && firstAxis === secondAxis) return null;
  const lettersReversed = firstAxis === "longitude" || secondAxis === "latitude";
  const ordered = lettersReversed ? [second, first] : [first, second];
  const attempts = [{ parts: ordered, swapped: false, longitudeFirst: lettersReversed }];
  // Unlettered angles may only be valid the other way round, as with decimals.
  if (firstAxis == null && secondAxis == null) attempts.push({ parts: [second, first], swapped: true, longitudeFirst: true });
  for (const { parts: [latitude, longitude], swapped, longitudeFirst } of attempts) {
    try {
      const point = fromDms(latitude, longitude);
      return {
        latitude: degreesText(point.latitude, decimalsFor(latitude)),
        longitude: degreesText(point.longitude, decimalsFor(longitude)),
        swapped,
        longitudeFirst,
      };
    } catch {
      // Not a valid angle pair in this order; try the next or give up.
    }
  }
  return null;
}

/** All pairs on one line: one pair, two pairs (four decimals) or null. */
function linePairs(line) {
  if (ANGLE_MARKS.test(line)) {
    const pair = dmsPair(line);
    return pair ? [{ ...pair, format: "dms" }] : null;
  }
  const tokens = decimalTokens(line);
  if (tokens == null || (tokens.length !== 2 && tokens.length !== 4)) return null;
  const pairs = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const pair = decimalPair(tokens[index], tokens[index + 1]);
    if (pair == null) return null;
    pairs.push({ ...pair, format: "decimal" });
  }
  return pairs;
}

/**
 * Reads one or two latitude/longitude pairs from pasted text.
 *
 * Accepted: "41.7399, 34.0177", "41.7399;34.0177", tab, newline or space
 * separated values, surrounding brackets, "-" or "−" signs, hemisphere
 * letters before or after the number (N/S/E/W and Turkish K/G/D/B), decimal
 * commas where unambiguous ("41,7399; 34,0177", "41,7399 34,0177") and
 * DMS/DDM pairs such as 41°44'23.6"N 34°01'03.7"E. Two lines with a pair
 * each, or four numbers, give two pairs.
 *
 * @param {string} input
 * @returns {null | {
 *   points: { latitude: string, longitude: string }[],
 *   swapped: boolean,
 *   format: "decimal" | "dms",
 * }} null when the text is not clearly one or two pairs
 */
export function parseCoordinatePaste(input) {
  if (typeof input !== "string") return null;
  const source = normalizeSigns(input).trim();
  if (source === "" || source.length > 200) return null;
  const lines = source
    .split(/\r?\n|\r/)
    .map((line) => unwrap(line))
    .filter((line) => line !== "");
  let pairs = null;
  if (lines.length === 1) {
    pairs = linePairs(lines[0]);
  } else if (lines.length === 2) {
    const [first, second] = lines.map(linePairs);
    if (first?.length === 1 && second?.length === 1) pairs = [first[0], second[0]];
    // A latitude on one line and a longitude on the next.
    else pairs = linePairs(`${lines[0]}\t${lines[1]}`);
  }
  if (pairs == null) return null;
  return {
    points: pairs.map(({ latitude, longitude }) => ({ latitude, longitude })),
    swapped: pairs.some((pair) => pair.swapped),
    format: pairs.some((pair) => pair.format === "dms") ? "dms" : "decimal",
  };
}

/**
 * The one latitude/longitude pair a line of typed text holds, and how it was
 * written. The same notations as parseCoordinatePaste, on a single line.
 * @param {string} input
 * @returns {null | {
 *   latitude: string,
 *   longitude: string,
 *   longitudeFirst: boolean,
 *   guessed: boolean,
 * }} null when the line is not exactly one pair. longitudeFirst: the text
 *   gives the longitude first (hemisphere letters say so, or the order was
 *   guessed); guessed: there are no hemisphere letters and the numbers are
 *   only valid as longitude, latitude.
 */
export function readCoordinatePair(input) {
  if (typeof input !== "string") return null;
  const source = unwrap(normalizeSigns(input).trim());
  if (source === "" || source.length > 200 || /[\r\n]/.test(source)) return null;
  const pairs = linePairs(source);
  if (pairs == null || pairs.length !== 1) return null;
  const [{ latitude, longitude, swapped, longitudeFirst }] = pairs;
  return { latitude, longitude, longitudeFirst, guessed: swapped };
}

/**
 * Reads two plain numbers in the order given ("488015.988, 4420370.844"),
 * for grid coordinates where there is no latitude or longitude to check.
 * @param {string} input
 * @returns {null | { first: string, second: string }}
 */
export function parseNumberPair(input) {
  if (typeof input !== "string") return null;
  const source = unwrap(normalizeSigns(input).trim().replace(/\r?\n|\r/g, "\t"));
  if (source === "" || source.length > 200 || ANGLE_MARKS.test(source)) return null;
  const tokens = decimalTokens(source);
  if (tokens == null || tokens.length !== 2 || tokens.some((token) => token.letter != null)) return null;
  return { first: tidyNumber(tokens[0].number), second: tidyNumber(tokens[1].number) };
}

/** The plain text of a paste event ("" when the clipboard is not readable). */
export function pastedText(event) {
  const data = event.clipboardData;
  if (data == null) return "";
  return data.getData("text/plain") || data.getData("text") || "";
}

/** Text of a point to paste into a web map: "latitude, longitude". */
export function formatPairForCopy(latitude, longitude) {
  return `${String(latitude).trim()}, ${String(longitude).trim()}`;
}
