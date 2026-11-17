// DMS and DDM text against GeographicLib DMS::Encode
// (contracts/test-vectors/display-formats.csv): every digit count the
// position tool offers, random angles and edge cases of rounding and carry.
// GeographicLib writes components with ':' (dmssep); this library writes
// 39°56'00.11400"N and 39°56.0019000'N, compared here in the ':' form.
import test from "node:test";
import assert from "node:assert/strict";
import { formatDdm, formatDms } from "@convert-tools/core";
import { readVectors } from "./support/vectors.mjs";

const colonForm = {
  dms: (text) => text.replace("°", ":").replace("'", ":").replace('"', ""),
  ddm: (text) => text.replace("°", ":").replace("'", ""),
};

test("DMS and DDM text matches GeographicLib DMS::Encode on every row", () => {
  const rows = readVectors("display-formats.csv");
  assert.ok(rows.length > 5000, `${rows.length} rows`);
  const failures = [];
  for (const row of rows) {
    const format = row.format === "dms" ? formatDms : formatDdm;
    const text = colonForm[row.format](format(Number(row.value), row.axis, Number(row.digits)));
    if (text !== row.expected) failures.push(`${row.id}: ${row.value} gives ${text}, GeographicLib ${row.expected}`);
  }
  assert.equal(failures.length, 0, `${failures.length} rows differ:\n${failures.slice(0, 20).join("\n")}`);
});
