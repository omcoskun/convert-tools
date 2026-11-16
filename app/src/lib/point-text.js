// What typed text means in a one-field point ("enlem, boylam"), a number
// field, or a paste of several points. Pure text handling on top of the
// paste parser (coordinate-paste.js): the digits stay as typed, nothing
// throws, and an order is never guessed for typed text.

import { parseCoordinatePaste, readCoordinatePair } from "./coordinate-paste.js";

// Everything a latitude/longitude pair can be written with: digits, signs,
// decimal points and commas, separators, degree/minute/second marks,
// hemisphere letters (English and Turkish) and brackets.
const COORDINATE_CHARACTERS = /^[\s\d+\-−﹣－.,;°'′’"″“”NSEWKGDB()[\]{}]*$/;
const HEMISPHERE_LETTERS = /[NSEWKGDB]/g;
const LONGITUDE_LETTER = /[EWDB]/;
const ANGLE_MARKS = /['′’"″“”]|°\s*\d/;
const NUMBERS = /\d+(?:[.,]\d+)?|[.,]\d+/g;
// Lines read from one paste; a route keeps far fewer.
const MAX_PASTE_LINES = 1000;

/**
 * True for text that holds at most one coordinate so far: what someone types
 * on the way to a pair ("39.9", "39.9,", "N 39", 41°44').
 */
function oneCoordinateSoFar(source) {
  const letters = source.match(HEMISPHERE_LETTERS) ?? [];
  if (letters.length > 1) return false;
  if (ANGLE_MARKS.test(source)) return (source.match(/°/g) ?? []).length <= 1;
  const numbers = source.match(NUMBERS) ?? [];
  if (numbers.length > 1) return false;
  // Only a sign, a point or a letter so far.
  if (numbers.length === 0) return true;
  const limit = letters.length === 1 && LONGITUDE_LETTER.test(letters[0]) ? 180 : 90;
  return Math.abs(Number(numbers[0].replace(",", "."))) <= limit;
}

/**
 * Reads the text of a point field: one latitude, longitude pair in any
 * notation the paste parser accepts (decimal, DMS/DDM, hemisphere letters
 * before or after, either order when letters say which is which).
 * @param {string} text
 * @returns {{
 *   status: "empty" | "incomplete" | "invalid" | "valid",
 *   latitude?: string,
 *   longitude?: string,
 *   swapped?: boolean,
 * }} valid: latitude and longitude as decimal text with the typed digits
 *   (DMS converted by the core); swapped: the text gives the longitude first
 *   (hemisphere letters said so). incomplete: one coordinate so far.
 *   Without letters a typed pair is latitude first: "91, 10" is invalid, not
 *   read as longitude, latitude.
 */
export function readPointText(text) {
  const source = String(text ?? "").trim();
  if (source === "") return { status: "empty" };
  if (source.length > 200 || !COORDINATE_CHARACTERS.test(source)) return { status: "invalid" };
  const pair = readCoordinatePair(source);
  if (pair != null) {
    // Only valid as longitude, latitude: for typed text that is more likely a typo than a choice.
    if (pair.guessed) return { status: "invalid" };
    return { status: "valid", latitude: pair.latitude, longitude: pair.longitude, swapped: pair.longitudeFirst };
  }
  return { status: oneCoordinateSoFar(source) ? "incomplete" : "invalid" };
}

/**
 * Reads the text of a number field (an azimuth, a distance, an axis): one
 * plain decimal, with a point or a comma.
 * @param {string} text
 * @returns {{ status: "empty" | "incomplete" | "invalid" | "valid", value?: string }}
 *   value is the number as plain decimal text ("12,5" -> "12.5", "4." -> "4").
 */
export function readNumberText(text) {
  const source = String(text ?? "")
    .trim()
    .replace(/[−﹣－]/g, "-")
    .replace(",", ".");
  if (source === "") return { status: "empty" };
  if (/^[+-]?\.?$/.test(source)) return { status: "incomplete" };
  const match = /^([+-]?)(\d+\.?\d*|\.\d+)$/.exec(source);
  if (match == null) return { status: "invalid" };
  let digits = match[2];
  if (digits.endsWith(".")) digits = digits.slice(0, -1);
  if (digits.startsWith(".")) digits = `0${digits}`;
  return { status: "valid", value: `${match[1] === "-" ? "-" : ""}${digits}` };
}

/**
 * Reads the points of a paste: one pair, two pairs (two lines or four
 * numbers, as parseCoordinatePaste), or one or two pairs on every line of a
 * longer list. Anything else is null, a normal paste.
 * @param {string} pasted
 * @returns {null | { points: { latitude: string, longitude: string }[], swapped: boolean }}
 *   swapped: some pair was only valid as longitude, latitude and was read so.
 */
export function parsePointList(pasted) {
  if (typeof pasted !== "string") return null;
  const lines = pasted.split(/\r?\n|\r/).filter((line) => line.trim() !== "");
  if (lines.length === 0 || lines.length > MAX_PASTE_LINES) return null;
  if (lines.length <= 2) {
    const parsed = parseCoordinatePaste(pasted);
    return parsed && { points: parsed.points, swapped: parsed.swapped };
  }
  const points = [];
  let swapped = false;
  for (const line of lines) {
    const parsed = parseCoordinatePaste(line);
    if (parsed == null) return null;
    points.push(...parsed.points);
    swapped = swapped || parsed.swapped;
  }
  return { points, swapped };
}
