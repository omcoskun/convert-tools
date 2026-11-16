// The reference page's tables (src/tools/reference/reference.js). Expected
// values come from the definitions (WGS 84, the international foot) and the
// error-code contract, not from this code's own output.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ERROR_CODES, SUPPORTED_CRS } from "@convert-tools/core";
import { accuracyRows, crsRows, errorRows, unitRows, wgs84Rows } from "../src/tools/reference/reference.js";
import { REPO_ROOT, readJson } from "./support/files.mjs";

const lang = readJson("public/lang.json");
const config = readJson("public/config.json");

test("every one of the 23 error codes has its meaning, in every language", () => {
  for (const language of Object.keys(lang)) {
    const rows = errorRows(lang[language].errors);
    assert.equal(rows.length, 23);
    assert.deepEqual(
      rows.map((row) => row.code),
      [...ERROR_CODES],
    );
    for (const row of rows) assert.notEqual(row.text.trim(), "", `${language} ${row.code}`);
  }
});

test("units carry their exact metre factor as a decimal", () => {
  const rows = unitRows();
  assert.deepEqual(
    rows.find((row) => row.id === "foot"),
    { id: "foot", label: rows.find((row) => row.id === "foot").label, symbol: "ft", metres: "0.3048" },
  );
  assert.equal(rows.find((row) => row.id === "nautical-mile").metres, "1852");
  assert.equal(rows.find((row) => row.id === "mile").metres, "1609.344");
  assert.equal(rows.length, 9);
});

test("every supported CRS is listed with a known kind", () => {
  const rows = crsRows();
  assert.equal(rows.length, SUPPORTED_CRS.length);
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["geographic", "webMercator", "utmNorth", "utmSouth", "upsNorth", "upsSouth"],
  );
});

test("WGS 84: a = 6378137 m, 1/f = 298.257223563", () => {
  const rows = Object.fromEntries(wgs84Rows().map((row) => [row.id, row.value]));
  assert.equal(rows.a, "6378137");
  assert.equal(rows.inverseFlattening, "298.257223563");
  assert.equal(rows.utmScale, "0.9996");
  assert.equal(rows.upsScale, "0.994");
});

test("the accuracy table has the six rows of the README, verbatim, with a decimal point in English", () => {
  const { accuracy } = config.reference;
  assert.equal(accuracy.length, 6);
  const readme = readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
  for (const row of accuracy) {
    assert.ok(readme.includes(`| ${row.reference} | ${row.difference} |`), row.id);
  }
  assert.deepEqual(
    accuracy.map((row) => row.difference),
    ["4,8 nm", "0 / 3,2 nm", "3,3 nm", "15 nm", "11,2 nm / 10,0 nm", "0 / 1,4e-14°"],
  );
  assert.equal(accuracyRows(accuracy, "tr")[4].difference, "11,2 nm / 10,0 nm");
  assert.equal(accuracyRows(accuracy, "en")[4].difference, "11.2 nm / 10.0 nm");
  assert.equal(accuracyRows(accuracy, "en")[5].difference, "0 / 1.4e-14°");
});

test("a plain decimal is grouped for the language with every fraction digit", async () => {
  const { groupedDecimal } = await import("../src/lib/locale-decimal.js");
  assert.equal(groupedDecimal("6378137", "tr"), "6.378.137");
  assert.equal(groupedDecimal("6378137", "en"), "6,378,137");
  assert.equal(groupedDecimal("0.3048", "tr"), "0,3048");
  assert.equal(groupedDecimal("298.257223563", "en"), "298.257223563");
  assert.equal(groupedDecimal("-1234.5", "en"), "−1,234.5");
});
