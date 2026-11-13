// Builds the CommonJS copy of the ESM sources into dist/cjs with Babel's
// module transform only: no syntax is downlevelled, so BigInt literals and
// other ES2020 features stay as written.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformFileAsync } from "@babel/core";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "src");
const target = path.join(root, "dist", "cjs");

function* javascriptFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* javascriptFiles(full);
    else if (entry.name.endsWith(".js")) yield full;
  }
}

rmSync(target, { recursive: true, force: true });
let count = 0;
for (const file of javascriptFiles(source)) {
  const result = await transformFileAsync(file, {
    babelrc: false,
    configFile: false,
    sourceType: "module",
    plugins: [["@babel/plugin-transform-modules-commonjs", { strict: true }]],
  });
  const output = path.join(target, path.relative(source, file));
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${result.code}\n`);
  count += 1;
}
// The package is "type": "module"; this marks dist/cjs as CommonJS.
writeFileSync(path.join(target, "package.json"), `${JSON.stringify({ type: "commonjs" })}\n`);
console.log(`dist/cjs: ${count} files`);
