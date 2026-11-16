import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runReference } from "../lib/reference-runner.mjs";

const fixture = fileURLToPath(new URL("./fixtures/fake-solve.mjs", import.meta.url));

function run(mode, input, rowCount) {
  process.env.FAKE_MODE = mode;
  return runReference(process.execPath, [fixture], input, rowCount);
}

test("reference runner returns lines and no error rows on success", () => {
  const result = run("ok", "a\nb\nc\n", 3);
  assert.deepEqual(result.lines, ["1 2 3", "1 2 3", "1 2 3"]);
  assert.equal(result.errorRows.size, 0);
});

test("reference runner keeps going past per-row ERROR lines", () => {
  const result = run("row-errors", "a\nb\nc\n", 3);
  assert.deepEqual([...result.errorRows], [1]);
  assert.equal(result.lines.length, 3);
  assert.equal(result.lines[0], "1 2 3");
});

test("reference runner reports exit status and stderr", () => {
  assert.throws(() => run("exit-no-errors", "a\n", 1), /exit 1, signal null: boom/);
});

test("reference runner rejects a short output", () => {
  assert.throws(() => run("short", "a\nb\n", 2), /1 lines for 2 rows/);
});

test("reference runner flags every row when every row fails", () => {
  const result = run("all-errors", "a\nb\n", 2);
  assert.equal(result.errorRows.size, 2);
});

test("reference runner reports a solver killed by a signal", () => {
  assert.throws(() => run("signal", "a\n", 1), /signal SIGKILL/);
});

test("reference runner reports a binary that cannot be started", () => {
  assert.throws(() => runReference("/nonexistent/solver", [], "a\n", 1), /\/nonexistent\/solver/);
});
