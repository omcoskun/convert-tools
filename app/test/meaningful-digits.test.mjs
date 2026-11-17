// How many digits of a value with a known uncertainty mean something
// (lib/meaningful-digits.js). Expected texts are written out by hand.

import assert from "node:assert/strict";
import test from "node:test";
import { boundText, meaningfulDecimals, roundedDecimal } from "../src/lib/meaningful-digits.js";

test("a digit is shown while the uncertainty is at most half a unit of it", () => {
  assert.equal(meaningfulDecimals(1e-11, 4), 4);
  assert.equal(meaningfulDecimals(5e-5, 4), 4, "exactly half a unit of the fourth decimal");
  assert.equal(meaningfulDecimals(5.1e-5, 4), 3);
  assert.equal(meaningfulDecimals(0.0069, 4), 1);
  assert.equal(meaningfulDecimals(0.5, 4), 0);
  // Coarser than whole units: -1 rounds to tens, -3 to thousands.
  assert.equal(meaningfulDecimals(0.6, 4), -1);
  assert.equal(meaningfulDecimals(180, 4), -3);
  assert.equal(meaningfulDecimals(9800, 3), -5);
});

test("without an uncertainty every allowed decimal is shown", () => {
  for (const uncertainty of [undefined, null, 0, Number.NaN]) assert.equal(meaningfulDecimals(uncertainty, 3), 3);
  assert.equal(meaningfulDecimals(Number.POSITIVE_INFINITY, 3) < -300, true, "ends even for an infinite uncertainty");
});

test("a value rounded to decimals is plain text, to tens and thousands too", () => {
  assert.equal(roundedDecimal(291.18406101, 4), "291.1841");
  assert.equal(roundedDecimal(291.18406101, 1), "291.2");
  assert.equal(roundedDecimal(291.18406101, 0), "291");
  assert.equal(roundedDecimal(-0.00001, 2), "0.00", "no -0");
  assert.equal(roundedDecimal(1780547.7, -3), "1781000");
  assert.equal(roundedDecimal(-1780547.7, -3), "-1781000");
  assert.equal(roundedDecimal(-123.4, -3), "0", "no -0");
});

test("a bound is rounded up to two significant digits, at most the given decimals", () => {
  assert.deepEqual(boundText(0.41, 1), { text: "0.5", decimals: 1 });
  assert.deepEqual(boundText(23.6, 1), { text: "24", decimals: 0 });
  assert.deepEqual(boundText(0.0069, 8), { text: "0.0069", decimals: 4 });
  assert.deepEqual(boundText(180, 8), { text: "180", decimals: -1 });
  assert.deepEqual(boundText(9.8e9, 1), { text: "9800000000", decimals: -8 });
});
