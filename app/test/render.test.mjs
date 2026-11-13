// Server-renders the demo with react-dom/server and checks the visible text.
// Numbers expected here come from definitions (1 NM = 1852 m) or from the
// GeographicLib contract vectors and GeoConvert, not from the demo itself.

import assert from "node:assert/strict";
import test from "node:test";
import "./support/jsx-loader.mjs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { readJson, vector } from "./support/files.mjs";

const { default: App } = await import("../src/App.jsx");
const { default: CoordinateTool } = await import("../src/tools/coordinates/CoordinateTool.jsx");
const { ConfigContext, LanguageContext } = await import("../src/context.js");

const config = readJson("public/config.json");
const lang = readJson("public/lang.json");

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'", "#39": "'", nbsp: " " };

/** The text of rendered HTML with entities decoded and whitespace collapsed. */
function visibleText(html) {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x27|#39|amp|lt|gt|quot|nbsp);/g, (match, name) => ENTITIES[name])
    .replace(/\s+/g, " ")
    .trim();
}

function renderApp(props) {
  return visibleText(renderToString(createElement(App, { config, lang, ...props })));
}

function renderCoordinates(initialMode, { language = "tr", configuration = config } = {}) {
  const active = { language, ...lang[language] };
  const html = renderToString(
    createElement(
      ConfigContext.Provider,
      { value: configuration },
      createElement(LanguageContext.Provider, { value: active }, createElement(CoordinateTool, { initialMode })),
    ),
  );
  return { html, text: visibleText(html) };
}

test("the length tool renders in Turkish with exact example results", () => {
  const text = renderApp();
  assert.ok(text.includes(lang.tr.text.unitTitle), "title");
  assert.ok(text.includes("Uzunluk Çevirici"));
  // International nautical mile, foot and mile are defined exactly.
  assert.ok(text.includes("1 NM → 1852 m"), text);
  assert.ok(text.includes("1 ft → 0.3048 m"));
  assert.ok(text.includes("1 mi → 1.609344 km"));
  assert.ok(text.includes("1852 m"), "default conversion 1 NM -> m");
  assert.ok(text.includes(lang.tr.text.exact));
});

test("the language switch shows every language and the English text renders", () => {
  const text = renderApp({ initialLanguage: "en" });
  assert.ok(text.includes("Length Converter"));
  assert.ok(text.includes(lang.en.text.unitSubtitle));
  assert.ok(!text.includes("Uzunluk Çevirici"));
  for (const code of config.languages) assert.ok(text.includes(code.toUpperCase()), code);
});

test("the coordinate tool opens on position formats with Ankara's outputs", () => {
  const text = renderApp({ initialTool: "coordinates" });
  assert.ok(text.includes("Koordinat Çevirici"));
  // echo "39.933365 32.859742" | GeoConvert -m -p 0 -> 36SVK8801520370
  assert.ok(text.includes("36 S VK 88015 20370"), "MGRS");
  // echo "39.933365 32.859742" | GeoConvert -u -p 9 -> 36n 488015.987782238 4420370.843637543
  assert.ok(text.includes("36N 488015.988 E 4420370.844 N"), "UTM");
  assert.ok(text.includes(vector("gars.csv", "ankara-p2").expected_code), "GARS");
  assert.ok(text.includes(vector("georef.csv", "ankara-p4").expected_code), "GEOREF");
  assert.ok(text.includes(lang.tr.text.pointSource));
});

test("the CRS mode shows EPSG:4326 -> EPSG:3857 from the contract vector", () => {
  const row = vector("coordinate-projections.csv", "crs-mercator-ankara");
  const { text } = renderCoordinates("crs");
  assert.ok(text.includes("EPSG:4326 → EPSG:3857"));
  assert.ok(text.includes(`X ${Number(row.expected_x).toFixed(8)}`), text);
  assert.ok(text.includes(`Y ${Number(row.expected_y).toFixed(8)}`));
});

test("the distance mode shows Ankara -> Istanbul and draws the route", () => {
  const row = vector("geodesic-wgs84.csv", "ankara-istanbul");
  const { html, text } = renderCoordinates("distance");
  assert.ok(text.includes(`${Number(row.distanceMetres).toFixed(3)} m`), text);
  assert.match(html, /<svg[^>]*role="img"/);
  assert.match(html, /<path d="M32\.859742 -39\.933365L/);
  // Map files are fetched in an effect, which server rendering does not run.
  assert.ok(text.includes(lang.tr.text.mapLoading));
});

test("a core error is shown with its localized message and its code", () => {
  const broken = {
    ...config,
    crs: { ...config.crs, initial: { ...config.crs.initial, source: "EPSG:9999" } },
    position: {
      ...config.position,
      initial: { ...config.position.initial, values: { ...config.position.initial.values, ddLat: "abc" } },
    },
  };
  const crs = renderCoordinates("crs", { configuration: broken }).text;
  assert.ok(crs.includes(`${lang.tr.text.crsInvalid} ${lang.tr.errors.UNSUPPORTED_CRS} (UNSUPPORTED_CRS)`), crs);
  const position = renderCoordinates("formats", { configuration: broken, language: "en" }).text;
  assert.ok(position.includes(`${lang.en.errors.INVALID_NUMBER} (INVALID_NUMBER)`), position);
});
