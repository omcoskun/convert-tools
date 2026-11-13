// Lets node:test import the demo's .jsx files. JSX is compiled with Babel's
// React preset (automatic runtime), as webpack does, without preset-env.
//
// Import this module statically, then import .jsx files dynamically: static
// imports are all loaded before any of them runs, so a static .jsx import
// would be loaded before these hooks exist.
//
// module.registerHooks (in-thread, synchronous) replaces module.register,
// which Node 26 deprecates (DEP0205).

import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";

if (typeof nodeModule.registerHooks !== "function") {
  throw new Error(`The render tests need module.registerHooks (Node 22.15 or later); this is Node ${process.version}.`);
}

nodeModule.registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith("file:") || !url.endsWith(".jsx")) return nextLoad(url, context);
    const filename = fileURLToPath(url);
    const { code } = transformSync(readFileSync(filename, "utf8"), {
      filename,
      babelrc: false,
      configFile: false,
      sourceMaps: "inline",
      presets: [["@babel/preset-react", { runtime: "automatic" }]],
    });
    return { format: "module", source: code, shortCircuit: true };
  },
});
