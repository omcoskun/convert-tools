// Runs a GeographicLib command-line solver (GeodSolve, Geod3Solve) once over
// all rows. These solvers print one output line per input line; a row they
// cannot solve gets a line starting with "ERROR" and makes the exit status
// non-zero although every other row is fine.
import { spawnSync } from "node:child_process";

/**
 * @param {string} binary path of the solver
 * @param {string[]} args its arguments
 * @param {string} input one row per line, each ending in "\n"
 * @param {number} rowCount number of rows in `input`
 * @returns {{ lines: string[], errorRows: Set<number> }} `lines[i]` is the
 *   output of row i; `errorRows` holds the 0-based indices of the rows whose
 *   output starts with "ERROR"
 * @throws {Error} if the solver cannot be started, is killed by a signal,
 *   exits with a non-zero status without any "ERROR" line, or prints a number
 *   of lines other than `rowCount`
 */
export function runReference(binary, args, input, rowCount) {
  const label = `${binary} ${args.join(" ")}`;
  const result = spawnSync(binary, args, { input, maxBuffer: 1 << 30, encoding: "utf8" });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  const lines = result.stdout.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const errorRows = new Set();
  lines.forEach((line, index) => {
    if (line.startsWith("ERROR")) errorRows.add(index);
  });
  if (result.signal !== null || (result.status !== 0 && errorRows.size === 0)) {
    const first = `${result.stderr}\n${result.stdout}`.split("\n").find((line) => line.trim() !== "") ?? "";
    throw new Error(`${label}: exit ${result.status}, signal ${result.signal}: ${first.trim()}`);
  }
  if (lines.length !== rowCount) throw new Error(`${label}: ${lines.length} lines for ${rowCount} rows`);
  return { lines, errorRows };
}
