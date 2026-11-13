// Paths and file helpers shared by the demo tests.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REPO_ROOT = path.resolve(APP_ROOT, "..");
export const SRC = path.join(APP_ROOT, "src");
export const PUBLIC = path.join(APP_ROOT, "public");

/** Reads a JSON file; relative paths are resolved against app/. */
export function readJson(file) {
  return JSON.parse(readFileSync(path.resolve(APP_ROOT, file), "utf8"));
}

/** Reads a CSV file of contracts/test-vectors (no quoting) into objects. */
export function readVectors(name) {
  const source = readFileSync(path.join(REPO_ROOT, "contracts/test-vectors", name), "utf8").trim();
  const [header, ...lines] = source.split(/\r?\n/).map((line) => line.split(","));
  return lines.map((cells) => Object.fromEntries(header.map((column, index) => [column, cells[index]])));
}

/** The row with the given id of a contract vector file. */
export function vector(name, id) {
  const row = readVectors(name).find((candidate) => candidate.id === id);
  if (row == null) throw new Error(`${name}: no row ${id}`);
  return row;
}

// Dependencies, build output and local tooling (.claude may hold other
// worktrees of this repository).
const SKIPPED_DIRECTORIES = new Set(["node_modules", "build", "dist", "target", ".git", ".claude"]);

/** Every file below a directory (dependencies and build output skipped), as absolute paths. */
export function listFiles(directory) {
  if (!existsSync(directory)) return [];
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(full));
    else found.push(full);
  }
  return found.sort();
}

/** The demo's JavaScript and JSX sources with their text, keyed by path relative to src/. */
export function sourceFiles() {
  return listFiles(SRC)
    .filter((file) => /\.jsx?$/.test(file))
    .map((file) => ({ file, name: path.relative(SRC, file), text: readFileSync(file, "utf8") }));
}
