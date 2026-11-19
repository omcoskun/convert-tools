// The length tool's helpers (src/tools/length/length.js). Expected values
// come from the unit definitions (1 ft = 0.3048 m, 1 mi = 5280 ft,
// 1 NM = 1852 m), not from this code's own output.

import assert from "node:assert/strict";
import test from "node:test";
import { UNIT_CATEGORIES, getCategory } from "@omcoskun/convert-tools";
import {
  categories,
  exactFraction,
  lengthSnippet,
  readValue,
  runAll,
  runConversion,
} from "../src/tools/length/length.js";

const base = { categoryId: "length", input: "1", exactInput: null, precision: 24 };

test("categories are the core's UNIT_CATEGORIES", () => {
  assert.equal(categories(), UNIT_CATEGORIES);
});

test("1 ft -> mi rounds at 8 digits and its exact fraction is 1/5280", () => {
  const result = runConversion({ ...base, fromId: "foot", toId: "mile", precision: 8 });
  assert.equal(result.ok, true);
  assert.equal(result.value.value, "0.00018939");
  assert.equal(exactFraction(result.value), "1/5280");
});

test("1 NM -> m is exactly 1852, with no fraction", () => {
  const result = runConversion({ ...base, fromId: "nautical-mile", toId: "metre" });
  assert.equal(result.value.value, "1852");
  assert.equal(exactFraction(result.value), null);
});

test("1 NM in every other unit: 8 rows, 6076.115486 ft at 6 digits", () => {
  const result = runAll({ ...base, fromId: "nautical-mile", precision: 6 });
  assert.equal(result.ok, true);
  assert.equal(result.value.length, 8);
  assert.equal(result.value.find((row) => row.symbol === "ft").value, "6076.115486");
});

test("precision 61 and a non-number precision fail with INVALID_PRECISION", () => {
  for (const precision of [61, "61", "", "2.5", "x"]) {
    const result = runConversion({ ...base, fromId: "foot", toId: "metre", precision });
    assert.deepEqual(result, { ok: false, code: "INVALID_PRECISION" }, JSON.stringify(precision));
  }
  assert.equal(runConversion({ ...base, fromId: "foot", toId: "metre", precision: "60" }).ok, true);
  assert.equal(runConversion({ ...base, fromId: "foot", toId: "metre", precision: 0 }).ok, true);
});

test("an exponent and a decimal comma are read; half-typed or empty text gives a code, not an exception", () => {
  assert.equal(runConversion({ ...base, input: "3e-4", fromId: "metre", toId: "millimetre" }).value.value, "0.3");
  assert.equal(readValue(" 1,5 "), "1.5");
  assert.equal(runConversion({ ...base, input: "1,5", fromId: "metre", toId: "millimetre" }).value.value, "1500");
  for (const input of ["", "-", "1e", "abc", "1.2.3"]) {
    const result = runConversion({ ...base, input, fromId: "metre", toId: "millimetre" });
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.equal(typeof result.code, "string");
    assert.equal(runAll({ ...base, input, fromId: "metre" }).ok, false, JSON.stringify(input));
  }
});

test("a swapped exact value is used instead of the typed text", () => {
  const exactInput = { numerator: "1", denominator: "5280" };
  const result = runConversion({ ...base, input: "0.00018939", exactInput, fromId: "mile", toId: "foot" });
  assert.equal(result.value.value, "1");
});

test("the library call is the call that ran", () => {
  assert.equal(
    lengthSnippet({ ...base, fromId: "foot", toId: "mile", precision: 8 }),
    'convertUnits("1", "length", "foot", "mile", 8)',
  );
  assert.equal(
    lengthSnippet({ ...base, exactInput: { numerator: "1", denominator: "5280" }, fromId: "mile", toId: "foot" }),
    'convertUnits({ numerator: "1", denominator: "5280" }, "length", "mile", "foot", 24)',
  );
});

test("a number still being typed is not an error yet; the category comes from the core's getCategory", async () => {
  const { categoryOf, isPartialNumber } = await import("../src/tools/length/length.js");
  for (const partial of ["", " ", "-", "+", ".", ",", "-.", "12.", "12,", "1e", "1e-", "2.5E+", ".5e"]) {
    assert.equal(isPartialNumber(partial), true, JSON.stringify(partial));
  }
  for (const other of ["1", "1.5", "1,5", "-0.5", "1e5", "abc", "1..", "1e5e", "--1"]) {
    assert.equal(isPartialNumber(other), false, JSON.stringify(other));
  }
  assert.equal(categoryOf("length"), getCategory("length"));
  assert.throws(() => categoryOf("mass"), TypeError);
});
