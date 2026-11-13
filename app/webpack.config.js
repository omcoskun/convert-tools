// Demo build: React 18 + JSX through Babel 7, bundled by Webpack 5.
//
//   npm run dev     -> webpack-dev-server on http://localhost:3008
//   npm run build   -> app/build/ (static files, relative URLs)
//
// IWC is the team's build variant ("hap" or "hwf"). It is embedded with
// DefinePlugin as process.env.IWC. What differs between the two variants is
// not known yet, so nothing in the demo branches on it.

import path from "node:path";
import { fileURLToPath } from "node:url";
import CopyWebpackPlugin from "copy-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import webpack from "webpack";

const root = path.dirname(fileURLToPath(import.meta.url));

export const IWC_VALUES = Object.freeze(["hap", "hwf"]);

/**
 * Reads the IWC build variant. Unset or empty means "no variant" (null); any
 * other value than hap or hwf stops the build instead of being guessed at.
 * @param {string | undefined} value
 * @returns {"hap" | "hwf" | null}
 */
export function resolveIwc(value) {
  if (value == null || value === "") return null;
  if (!IWC_VALUES.includes(value)) {
    throw new Error(`IWC must be one of ${IWC_VALUES.join(", ")} (got ${JSON.stringify(value)}).`);
  }
  return value;
}

// Browsers supported by @mui/material v5; the core itself needs Chrome 67,
// Firefox 68 and Safari 14, which these already cover.
export const BROWSER_TARGETS = Object.freeze({
  chrome: "90",
  edge: "91",
  firefox: "78",
  safari: "14",
  ios: "12.5",
});

// Served as a <meta> tag in production builds (GitHub Pages cannot set
// headers). Emotion injects <style> elements, hence 'unsafe-inline' for
// styles only. Images may also come from the satellite imagery host
// (map.imagery.exportUrl in public/config.json).
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://server.arcgisonline.com",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export default function config(env, argv) {
  const production = argv.mode === "production";
  const iwc = resolveIwc(process.env.IWC);

  return {
    mode: production ? "production" : "development",
    context: root,
    entry: "./src/index.jsx",
    output: {
      path: path.join(root, "build"),
      filename: production ? "assets/[name].[contenthash:8].js" : "assets/[name].js",
      // Relative URLs so the same build works at / and under a sub-path
      // such as GitHub Pages' /convert-tools/.
      publicPath: "",
      clean: true,
    },
    devtool: production ? false : "eval-cheap-module-source-map",
    resolve: {
      extensions: [".js", ".jsx"],
    },
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          include: path.join(root, "src"),
          use: {
            loader: "babel-loader",
            options: {
              babelrc: false,
              configFile: false,
              presets: [
                ["@babel/preset-env", { targets: BROWSER_TARGETS, bugfixes: true }],
                ["@babel/preset-react", { runtime: "automatic", development: !production }],
              ],
            },
          },
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        "process.env.IWC": JSON.stringify(iwc),
      }),
      new HtmlWebpackPlugin({
        template: "./src/index.html",
        meta: production
          ? {
              "Content-Security-Policy": {
                "http-equiv": "Content-Security-Policy",
                content: CONTENT_SECURITY_POLICY,
              },
            }
          : {},
      }),
      new CopyWebpackPlugin({
        patterns: [{ from: "public", to: "." }],
      }),
    ],
    performance: {
      // map-data/world-boundaries.geojson is ~1.7 MB and fetched only on the
      // distance tab, so the default size hints would only warn about it.
      hints: false,
    },
    devServer: {
      port: 3008,
      host: "localhost",
      static: false,
      client: { overlay: true },
    },
  };
}
