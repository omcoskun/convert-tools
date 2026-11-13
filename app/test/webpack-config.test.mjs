// webpack.config.js: the IWC variant, relative URLs and the production CSP.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import config, {
  BROWSER_TARGETS,
  CONTENT_SECURITY_POLICY,
  IWC_VALUES,
  resolveIwc,
} from "../webpack.config.js";
import { APP_ROOT, readJson } from "./support/files.mjs";

/** Builds the config with IWC set to value (undefined: unset), then restores the environment. */
function configWith(value, mode) {
  const saved = process.env.IWC;
  if (value === undefined) delete process.env.IWC;
  else process.env.IWC = value;
  try {
    return config({}, { mode });
  } finally {
    if (saved === undefined) delete process.env.IWC;
    else process.env.IWC = saved;
  }
}

const plugin = (built, name) => built.plugins.find((candidate) => candidate.constructor.name === name);

test("resolveIwc accepts hap and hwf, and treats unset or empty as no variant", () => {
  assert.deepEqual(IWC_VALUES, ["hap", "hwf"]);
  assert.equal(resolveIwc(undefined), null);
  assert.equal(resolveIwc(""), null);
  assert.equal(resolveIwc("hap"), "hap");
  assert.equal(resolveIwc("hwf"), "hwf");
});

test("resolveIwc stops the build on any other value instead of guessing", () => {
  for (const value of ["HAP", "hap ", "xyz", "0"]) {
    assert.throws(() => resolveIwc(value), {
      message: `IWC must be one of hap, hwf (got ${JSON.stringify(value)}).`,
    });
  }
  assert.throws(() => configWith("other", "production"), /IWC must be one of/);
});

test("IWC is embedded as process.env.IWC, null when unset", () => {
  for (const [value, expected] of [
    ["hap", '"hap"'],
    ["hwf", '"hwf"'],
    [undefined, "null"],
    ["", "null"],
  ]) {
    const definitions = plugin(configWith(value, "production"), "DefinePlugin").definitions;
    assert.deepEqual(definitions, { "process.env.IWC": expected }, String(value));
  }
});

test("output uses relative URLs and app/build; the dev server listens on 3008", () => {
  const production = configWith(undefined, "production");
  assert.equal(production.mode, "production");
  assert.equal(production.output.publicPath, "");
  assert.equal(production.output.path, path.join(APP_ROOT, "build"));
  assert.match(production.output.filename, /\[contenthash/);
  assert.equal(production.devtool, false);
  const development = configWith(undefined, "development");
  assert.equal(development.mode, "development");
  assert.equal(development.devServer.port, 3008);
  assert.equal(development.devServer.host, "localhost");
});

test("production pages carry the Content-Security-Policy meta tag, development pages do not", () => {
  const meta = plugin(configWith(undefined, "production"), "HtmlWebpackPlugin").userOptions.meta;
  assert.deepEqual(meta["Content-Security-Policy"], {
    "http-equiv": "Content-Security-Policy",
    content: CONTENT_SECURITY_POLICY,
  });
  assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'(;|$)/);
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-eval/);
  // Images: the app itself, inline data URIs and the satellite imagery host only.
  const imageryOrigin = new URL(readJson("public/config.json").map.imagery.exportUrl).origin;
  assert.match(CONTENT_SECURITY_POLICY, new RegExp(`img-src 'self' data: ${imageryOrigin}(;|$)`));
  assert.deepEqual(plugin(configWith(undefined, "development"), "HtmlWebpackPlugin").userOptions.meta, {});
});

test("Babel compiles only src/ for the MUI v5 browser baseline", () => {
  const [rule] = configWith(undefined, "production").module.rules;
  assert.equal(rule.include, path.join(APP_ROOT, "src"));
  const { options } = rule.use;
  assert.equal(options.configFile, false);
  assert.equal(options.babelrc, false);
  assert.deepEqual(options.presets[0], ["@babel/preset-env", { targets: BROWSER_TARGETS, bugfixes: true }]);
  assert.deepEqual(options.presets[1], ["@babel/preset-react", { runtime: "automatic", development: false }]);
  assert.deepEqual(BROWSER_TARGETS, { chrome: "90", edge: "91", firefox: "78", safari: "14", ios: "12.5" });
});
