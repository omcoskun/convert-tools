// Error codes are part of the contract: the same invalid input must fail with
// the same code in JavaScript and Java. Both cores read
// contracts/error-codes.json and contracts/error-cases.csv.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ConvertToolsError,
  ERROR_CODES,
  convertLength,
  convertUnits,
  directGeodesic,
  encodeGeoref,
  encodeMgrs,
  fromDecimalDegrees,
  fromDms,
  fromGars,
  fromGeoref,
  fromMgrs,
  fromUtmUps,
  inverseGeodesic,
  transformCrs,
} from "@convert-tools/core";
import * as geodesy from "@convert-tools/core/geodesy";
import * as units from "@convert-tools/core/units";
import { readCsv } from "./support/vectors.mjs";

const CONTRACTS = new URL("../../../contracts/", import.meta.url);

const OPERATIONS = {
  "decimal-degrees": ({ a, b }) => fromDecimalDegrees(a, b),
  dms: ({ a, b }) => fromDms(a, b),
  "utm-ups": ({ a, b, c, d }) => fromUtmUps(a, b, c, d),
  mgrs: ({ a }) => fromMgrs(a),
  "mgrs-encode": ({ a, b, c }) => encodeMgrs(Number(a), Number(b), Number(c)),
  gars: ({ a }) => fromGars(a),
  georef: ({ a }) => fromGeoref(a),
  "georef-encode": ({ a, b, c }) => encodeGeoref(b, a, Number(c)),
  crs: ({ a, b, c, d }) => transformCrs(a, b, c, d),
  length: ({ a, b, c }) => convertLength(a, b, c),
  units: ({ a, b, c, d }) => convertUnits(a, b, c, d),
  "geodesic-inverse": ({ a, b, c, d }) =>
    inverseGeodesic(
      { latitude: Number(a), longitude: Number(b) },
      { latitude: Number(c), longitude: Number(d) },
    ),
  "geodesic-direct": ({ a, b, c, d }) =>
    directGeodesic({ latitude: Number(a), longitude: Number(b) }, Number(c), Number(d)),
};

test("hata kodu listesi sözleşme dosyasıyla aynıdır", () => {
  const contract = JSON.parse(readFileSync(new URL("error-codes.json", CONTRACTS), "utf8"));
  assert.deepEqual([...ERROR_CODES], contract.codes.map((entry) => entry.code));
  // Every entry point exports the same class.
  assert.equal(geodesy.ConvertToolsError, ConvertToolsError);
  assert.equal(units.ConvertToolsError, ConvertToolsError);
});

test("bilinmeyen kodla hata oluşturulamaz", () => {
  assert.throws(() => new ConvertToolsError("NOT_A_CODE", "x"), TypeError);
  const error = new ConvertToolsError("INVALID_MGRS", "x");
  assert.ok(error instanceof Error);
  assert.equal(error.name, "ConvertToolsError");
  assert.equal(error.code, "INVALID_MGRS");
});

test("geçersiz girdiler sözleşmedeki kodla reddedilir", () => {
  const rows = readCsv(new URL("error-cases.csv", CONTRACTS), [
    "id", "operation", "a", "b", "c", "d", "expected_code",
  ]);
  const failures = [];
  for (const row of rows) {
    const operation = OPERATIONS[row.operation];
    assert.ok(operation, `${row.id}: unknown operation ${row.operation}`);
    assert.ok(ERROR_CODES.includes(row.expected_code), `${row.id}: unknown code`);
    try {
      operation(row);
      failures.push(`${row.id}: no error`);
    } catch (error) {
      if (!(error instanceof ConvertToolsError)) {
        failures.push(`${row.id}: ${error?.constructor?.name} ${error?.message}`);
      } else if (error.code !== row.expected_code) {
        failures.push(`${row.id}: ${error.code} != ${row.expected_code} (${error.message})`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});
