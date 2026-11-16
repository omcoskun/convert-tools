#!/usr/bin/env node
// Test double for GeodSolve and Geod3Solve. It reads rows from stdin and
// behaves as the environment variable FAKE_MODE says:
//   ok              "1 2 3" for every row, exit 0
//   row-errors      "ERROR: Bad inputs" for the second row, exit 1
//   all-errors      "ERROR: Bad inputs" for every row, exit 1
//   short           one output line too few, exit 0
//   exit-no-errors  "boom" on stderr, no output, exit 1
//   signal          kills itself with SIGKILL
import { readFileSync } from "node:fs";

const mode = process.env.FAKE_MODE;
const rows = readFileSync(0, "utf8").split("\n").filter((line) => line !== "");
if (mode === "signal") process.kill(process.pid, "SIGKILL");
if (mode === "exit-no-errors") {
  process.stderr.write("boom\n");
  process.exitCode = 1;
} else {
  const lines = rows.map((_, index) =>
    mode === "all-errors" || (mode === "row-errors" && index === 1) ? "ERROR: Bad inputs" : "1 2 3",
  );
  if (mode === "short") lines.pop();
  process.stdout.write(lines.map((line) => `${line}\n`).join(""));
  if (mode === "row-errors" || mode === "all-errors") process.exitCode = 1;
}
