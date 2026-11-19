// Pasting coordinate pairs: what counts as a pair, which number is the
// latitude, and what must stay a normal paste into one field.

import assert from "node:assert/strict";
import test from "node:test";
import { fromDms } from "@omcoskun/convert-tools";
import { formatPairForCopy, parseCoordinatePaste, parseNumberPair } from "../src/lib/coordinate-paste.js";

const point = (latitude, longitude) => ({ latitude, longitude });
const one = (text) => parseCoordinatePaste(text)?.points;

test("a Google Maps pair keeps every pasted digit", () => {
  const result = parseCoordinatePaste("41.73987943886398, 34.01769942871567");
  assert.deepEqual(result, {
    points: [point("41.73987943886398", "34.01769942871567")],
    swapped: false,
    format: "decimal",
  });
  // Digits beyond float precision are not rounded away.
  assert.deepEqual(one("41.739879438863981234, 34.0"), [point("41.739879438863981234", "34.0")]);
});

test("comma, semicolon, tab, newline and whitespace separate the pair", () => {
  const expected = [point("41.7399", "34.0177")];
  for (const text of [
    "41.7399,34.0177",
    "41.7399 , 34.0177",
    "41.7399;34.0177",
    "41.7399\t34.0177",
    "41.7399\n34.0177",
    "41.7399\r\n34.0177",
    "41.7399   34.0177",
    "  41.7399, 34.0177  ",
    "(41.7399, 34.0177)",
    "[41.7399, 34.0177]",
    "{ 41.7399 34.0177 }",
  ]) {
    assert.deepEqual(one(text), expected, JSON.stringify(text));
  }
});

test("signs: hyphen, Unicode minus and plus", () => {
  assert.deepEqual(one("-33.8688, 151.2093"), [point("-33.8688", "151.2093")]);
  assert.deepEqual(one("−33.8688, −70.6693"), [point("-33.8688", "-70.6693")]);
  assert.deepEqual(one("+41.7, -.5"), [point("41.7", "-0.5")]);
});

test("hemisphere letters decide the axis, before or after the number, also in Turkish", () => {
  const north = [point("41.7399", "34.0177")];
  for (const text of [
    "41.7399 N, 34.0177 E",
    "41.7399N 34.0177E",
    "41.7399° N, 34.0177° E",
    "N 41.7399 E 34.0177",
    "N41.7399, E34.0177",
    "34.0177 E, 41.7399 N",
    "E 34.0177 N 41.7399",
    "41.7399 K, 34.0177 D",
    "34.0177 D 41.7399 K",
    "41.7399 N, 34.0177",
  ]) {
    assert.deepEqual(one(text), north, text);
  }
  assert.deepEqual(one("33.8688 S, 70.6693 W"), [point("-33.8688", "-70.6693")]);
  assert.deepEqual(one("33,8688 G 70,6693 B"), [point("-33.8688", "-70.6693")]);
  // A letter wins over the order, even when the order alone would fit.
  assert.deepEqual(one("10 E, 20 N"), [point("20", "10")]);
});

test("conflicting letters or a sign next to a letter are not a pair", () => {
  for (const text of ["41.7 N, 34.0 N", "41.7 E 34.0 W", "-41.7 S, 34.0 E", "-41.7 N 34 E", "41.7 X 34.0"]) {
    assert.equal(parseCoordinatePaste(text), null, text);
  }
});

test("decimal commas only where they cannot be separators", () => {
  assert.deepEqual(one("41,7399; 34,0177"), [point("41.7399", "34.0177")]);
  assert.deepEqual(one("41,7399 34,0177"), [point("41.7399", "34.0177")]);
  assert.deepEqual(one("41,7399\t-34,0177"), [point("41.7399", "-34.0177")]);
  assert.deepEqual(one("41,7399 N 34,0177 E"), [point("41.7399", "34.0177")]);
  // Commas with points are separators; a comma before a space is one too.
  assert.deepEqual(one("41.7,34"), [point("41.7", "34")]);
  assert.deepEqual(one("41, 34"), [point("41", "34")]);
  // Ambiguous: one number with a decimal comma, or commas in both roles.
  for (const text of ["41,34", "41,7399,34,0177", "41,7399, 34,0177", "41,7399"]) {
    assert.equal(parseCoordinatePaste(text), null, text);
  }
});

test("DMS and DDM pairs are converted by the core to decimal degrees", () => {
  const google = `41°44'23.6"N 34°01'03.7"E`;
  const expected = fromDms(`41°44'23.6"N`, `34°01'03.7"E`);
  const result = parseCoordinatePaste(google);
  assert.equal(result.format, "dms");
  assert.equal(result.swapped, false);
  const [{ latitude, longitude }] = result.points;
  assert.equal(latitude, "41.7398888889");
  assert.equal(longitude, "34.0176944444");
  assert.ok(Math.abs(Number(latitude) - expected.latitude) < 1e-10);
  assert.ok(Math.abs(Number(longitude) - expected.longitude) < 1e-10);
  for (const text of [
    `41°44'23.6"N, 34°01'03.7"E`,
    `34°01'03.7"E 41°44'23.6"N`,
    `N 41°44'23.6" E 34°01'03.7"`,
    `41° 44' 23.6" N 34° 01' 03.7" E`,
    `41°44′23.6″K 34°01′03.7″D`,
    `41°44'23.6" 34°01'03.7"`,
    `41°44'23,6" 34°01'03,7"`,
    `41°44'23.6"; 34°01'03.7"`,
    `41°44’23.6”N 34°01’03.7”E`,
    `41°44'23.6"N\n34°01'03.7"E`,
  ]) {
    assert.deepEqual(one(text), [point("41.7398888889", "34.0176944444")], text);
  }
  assert.deepEqual(one(`33°52'07.7"S 151°12'33.5"E`)[0].latitude.startsWith("-33.86880"), true);
  assert.deepEqual(one(`41°44.393'N 34°1.062'E`), [point("41.7398833333", "34.0177")]);
  assert.deepEqual(one(`41°30'N 34°0'E`), [point("41.5", "34")]);
});

test("a DMS or DDM pair finer than 10 decimals of a degree keeps its digits", () => {
  // 1e-7" is 2.8e-11°, 1e-8' is 1.7e-10°: written with 10 decimals of a
  // degree (up to 5e-11° off) these would lose typed digits.
  for (const [latitudeText, longitudeText, step] of [
    [`55°46'37.6882879"N`, `025°24'09.6083781"W`, 1e-7 / 3600],
    [`49°42.31694544'N`, `102°00.00000250'W`, 1e-8 / 60],
    [`12°24'48.006929634"N`, `138°06'27.335517257"W`, 1e-9 / 3600],
  ]) {
    const exact = fromDms(latitudeText, longitudeText);
    const [{ latitude, longitude }] = parseCoordinatePaste(`${latitudeText} ${longitudeText}`).points;
    assert.ok(Math.abs(Number(latitude) - exact.latitude) <= step / 10, `${latitudeText}: ${latitude}`);
    assert.ok(Math.abs(Number(longitude) - exact.longitude) <= step / 10, `${longitudeText}: ${longitude}`);
  }
});

test("one DMS angle or a broken pair is not a pair", () => {
  for (const text of [`41°44'23.6"N`, `41° 44' 23.6"`, `41°44'23.6"N 34°01'03.7"N`, `41°74'23.6"N 34°01'03.7"E`]) {
    assert.equal(parseCoordinatePaste(text), null, text);
  }
});

test("a pair only valid as longitude, latitude is read that way and reported", () => {
  assert.deepEqual(parseCoordinatePaste("141.7399, 34.0177"), {
    points: [point("34.0177", "141.7399")],
    swapped: true,
    format: "decimal",
  });
  assert.equal(parseCoordinatePaste("-120.5, 45").swapped, true);
  assert.deepEqual(one("-120.5, 45"), [point("45", "-120.5")]);
  // Valid both ways: Google's order, latitude first, no swap.
  assert.deepEqual(parseCoordinatePaste("34.0177, 41.7399").swapped, false);
  // Valid neither way: a normal paste.
  assert.equal(parseCoordinatePaste("120, 100"), null);
  assert.equal(parseCoordinatePaste("41.7, 200"), null);
  assert.equal(parseCoordinatePaste("95, 95"), null);
  // Unlettered DMS follows the same rule.
  const dms = parseCoordinatePaste(`141°10'00" 34°00'00"`);
  assert.equal(dms.swapped, true);
  assert.deepEqual(dms.points, [point("34", "141.1666666667")]);
});

test("two pairs: two lines or four numbers", () => {
  const two = [point("39.933365", "32.859742"), point("41.008238", "28.978359")];
  assert.deepEqual(one("39.933365, 32.859742\n41.008238, 28.978359"), two);
  assert.deepEqual(one("39.933365, 32.859742\r\n\r\n41.008238, 28.978359\n"), two);
  assert.deepEqual(one("39.933365 32.859742 41.008238 28.978359"), two);
  assert.deepEqual(one("39.933365\t32.859742\t41.008238\t28.978359"), two);
  assert.deepEqual(one(`39°56'00.1"N 32°51'35.1"E\n41°00'29.7"N 28°58'42.1"E`).length, 2);
  // Three numbers, three lines or a broken second pair are not pairs.
  for (const text of ["1 2 3", "1, 2\n3, 4\n5, 6", "39.9, 32.8\n41.0, 228.9", "1 2 3 4 5 6"]) {
    assert.equal(parseCoordinatePaste(text), null, text);
  }
});

test("a single number or other text stays a normal paste", () => {
  for (const text of [
    "",
    "   ",
    "41.73987943886398",
    "-34.0177",
    "1e5",
    "1E5 2",
    "abc",
    "41.7 abc",
    "Ankara",
    "36S VK 88015 20370",
    "https://www.google.com/maps/@41.7398794,34.0176994,15z",
    "41.7399, 34.0177, 120",
    null,
    undefined,
  ]) {
    assert.equal(parseCoordinatePaste(text), null, String(text));
  }
});

test("parseNumberPair reads two grid numbers in order without range checks", () => {
  assert.deepEqual(parseNumberPair("488015.988, 4420370.844"), { first: "488015.988", second: "4420370.844" });
  assert.deepEqual(parseNumberPair("3657926.37\t4856147.88"), { first: "3657926.37", second: "4856147.88" });
  assert.deepEqual(parseNumberPair("488015,988; 4420370,844"), { first: "488015.988", second: "4420370.844" });
  assert.deepEqual(parseNumberPair("−1.5\n2"), { first: "-1.5", second: "2" });
  for (const text of ["488015.988", "1 2 3", "41.7 N 34.0 E", `41°44'23.6"N 34°01'03.7"E`, "41,34", "x"]) {
    assert.equal(parseNumberPair(text), null, text);
  }
});

test("formatPairForCopy writes latitude, longitude as typed", () => {
  assert.equal(formatPairForCopy(" 41.73987943886398 ", "34.01769942871567"), "41.73987943886398, 34.01769942871567");
  assert.deepEqual(one(formatPairForCopy("41.73987943886398", "34.01769942871567")), [
    point("41.73987943886398", "34.01769942871567"),
  ]);
});
