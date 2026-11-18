// Server-renders the demo with react-dom/server and checks the visible text.
// Numbers expected here come from definitions (1 NM = 1852 m) or from the
// GeographicLib contract vectors and GeoConvert, not from the demo itself.

import assert from "node:assert/strict";
import test from "node:test";
import "./support/jsx-loader.mjs";
import * as core from "@convert-tools/core";
import { ERROR_CODES, directGeodesic, measureGeodesicPolyline } from "@convert-tools/core";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { readJson, vector } from "./support/files.mjs";
import { element, markup, visibleText } from "./support/html.mjs";
import { fill } from "../src/context.js";

const { default: App } = await import("../src/App.jsx");
const { TOOLS } = await import("../src/tools/index.js");

const config = readJson("public/config.json");
const lang = readJson("public/lang.json");

/** A plain decimal ("350091.704") grouped the Turkish way ("350.091,704"), for expected texts. */
function turkish(decimal) {
  const [integer, fraction] = decimal.split(".");
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction ? `,${fraction}` : ""}`;
}

/** config.json with the measure tool opening on the example with this id. */
function measureOpeningWith(id) {
  const examples = [...config.measure.examples].sort((first, second) => (second.id === id) - (first.id === id));
  return { ...config, measure: { ...config.measure, examples } };
}

function renderTool(initialTool, { language = "tr", configuration = config } = {}) {
  const html = renderToString(
    createElement(App, { config: configuration, lang, initialTool, initialLanguage: language }),
  );
  return { html, text: visibleText(html) };
}

test("the app opens on the measure tool", () => {
  const html = renderToString(createElement(App, { config, lang }));
  assert.ok(visibleText(html).includes(lang.tr.text.distanceTitle));
  const current = html.match(/<a\b[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/)[0];
  assert.equal(visibleText(current), lang.tr.text.navMeasure);
});

test("the old #distance address opens the measure tool", () => {
  const { text } = renderTool("distance");
  assert.ok(text.includes(lang.tr.text.distanceTitle), text);
  assert.ok(!text.includes(lang.tr.text.unitTitle));
});

test("the length tool renders in Turkish with exact example results", () => {
  const { text } = renderTool("length");
  assert.ok(text.includes(lang.tr.text.unitTitle), "title");
  assert.ok(text.includes("Uzunluk Çevirici"));
  // International nautical mile, foot and mile are defined exactly.
  assert.ok(text.includes("1 NM → 1852 m"), text);
  assert.ok(text.includes("1 ft → 0.3048 m"));
  assert.ok(text.includes("1 mi → 1.609344 km"));
  assert.ok(text.includes("1852 m"), "default conversion 1 NM -> m");
  assert.ok(text.includes(lang.tr.text.exact));
  // The all-units table: 1 NM in the eight other units, each copyable.
  assert.ok(text.includes(lang.tr.text.allUnits));
  assert.ok(text.includes("6.076,115485564304461942257218 ft"), text);
  assert.ok(text.includes('convertUnits("1", "length", "nautical-mile", "metre", 24)'));
});

test("the length tool shows the exact fraction of a decimal that does not terminate", () => {
  // The page opens on the first example: here 1 ft -> mi.
  const examples = [...config.length.examples].sort(
    (first, second) => (second.from === "foot" && second.to === "mile") - (first.from === "foot" && first.to === "mile"),
  );
  const configuration = { ...config, length: { ...config.length, examples } };
  for (const language of ["tr", "en"]) {
    const { text } = renderTool("length", { language, configuration });
    assert.ok(text.includes(`${lang[language].text.exactFraction}: 1/5280 mi`), text);
    assert.ok(text.includes(fill(lang[language].text.rounded, { digits: 24 })), language);
    assert.ok(text.includes("0.000189393939393939393939") || text.includes("0,000189393939393939393939"), language);
  }
});

test("the reference page lists the accuracy table, WGS 84, the systems, the units and every error code", () => {
  for (const language of ["tr", "en"]) {
    const { text } = renderTool("reference", { language });
    const words = lang[language].text;
    assert.ok(text.includes(words.referenceTitle), language);
    for (const key of ["referenceAccuracy", "referenceWgs84", "supportedSystems", "referenceUnits", "referenceErrors"]) {
      assert.ok(text.includes(words[key]), `${language} ${key}`);
    }
    // Numbers are grouped for the language (spec 7); reference.test.mjs pins the plain copied values.
    assert.ok(text.includes(language === "tr" ? "6.378.137" : "6,378,137"), `${language} WGS 84 a`);
    assert.ok(text.includes(language === "tr" ? "298,257223563" : "298.257223563"), `${language} WGS 84 1/f`);
    assert.ok(text.includes(language === "tr" ? "0,3048" : "0.3048"), `${language} foot in metres`);
    assert.ok(!text.includes(language === "tr" ? "0.3048" : "0,3048"), `${language} foot not in the other language's style`);
    // Every error code of the core with its meaning in the language.
    for (const code of ERROR_CODES) {
      assert.ok(text.includes(code), `${language} ${code}`);
      assert.ok(text.includes(lang[language].errors[code]), `${language} ${code} text`);
    }
    assert.ok(text.includes("EPSG:32601–EPSG:32660"));
    assert.ok(text.includes(words.accuracyFormula));
    assert.ok(text.includes(language === "tr" ? "11,2 nm / 10,0 nm" : "11.2 nm / 10.0 nm"), language);
  }
});

test("the triaxial page shows its ellipsoid, its three modes and the first example's distance", () => {
  for (const language of ["tr", "en"]) {
    const { html, text } = renderTool("triaxial", { language });
    const words = lang[language].text;
    assert.ok(text.includes(words.triaxialTitle), language);
    for (const key of ["triaxialInverse", "triaxialDirect", "triaxialCartesian"]) {
      assert.ok(text.includes(words[key]), `${language} ${key}`);
    }
    assert.match(html, /<input[^>]*id="triaxial-a"[^>]*value="6378172"/);
    // Inverse (40, 30) -> (41, 29) on the Earth triaxial ellipsoid: 139498.877691.
    assert.ok(text.includes(language === "tr" ? "139.498,877691" : "139,498.877691"), text);
    assert.ok(text.includes("inverseTriaxialGeodesic({ beta: 40, omega: 30 }, { beta: 41, omega: 29 }"));
  }
});

test("the language switch shows every language and the English text renders", () => {
  const { text } = renderTool("length", { language: "en" });
  assert.ok(text.includes("Length Converter"));
  assert.ok(text.includes(lang.en.text.unitSubtitle));
  assert.ok(!text.includes("Uzunluk Çevirici"));
  for (const code of config.languages) assert.ok(text.includes(code.toUpperCase()), code);
});

test("the navigation offers every tool directly, in order, with the open one marked", () => {
  for (const language of config.languages) {
    const { html } = renderTool("crs", { language });
    const nav = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)[0];
    assert.match(nav, new RegExp(`^<nav[^>]*aria-label="${lang[language].text.navigation}"`));
    const links = [...nav.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
    const keys = ["navMeasure", "navPositions", "navCrs", "navLength", "navTriaxial", "navReference"];
    assert.equal(links.length, keys.length);
    keys.forEach((key, index) => {
      // Each link carries its tool's name, visible or for screen readers.
      assert.equal(visibleText(links[index]), lang[language].text[key], key);
    });
    assert.deepEqual(
      links.map((link) => link.match(/href="([^"]*)"/)[1]),
      ["#measure", "#positions", "#crs", "#length", "#triaxial", "#reference"],
    );
    assert.equal(html.match(/aria-current="page"/g).length, 1);
    assert.match(links[2], /aria-current="page"/);
  }
});

test("the position tool floats its two widgets and shows Ankara's position and grid references", () => {
  for (const language of ["tr", "en"]) {
    const { html, text } = renderTool("positions", { language });
    assert.ok(text.includes(lang[language].text.positionTitle));
    assert.equal(html.match(/data-widget="input"/g)?.length, 1, `${language} input widget`);
    assert.equal(html.match(/data-widget="result"/g)?.length, 1, `${language} result widget`);
    // DD is one point field holding the configured position.
    assert.match(html, /<input[^>]*id="position-point"[^>]*value="39.933365, 32.859742"/);
    const hud = element(html, 'data-widget="result"');
    assert.ok(visibleText(hud).includes("39.933365, 32.859742"), "DD");
    // echo "39.933365 32.859742" | GeoConvert -m -p 0 -> 36SVK8801520370, in a cell of its own.
    assert.match(hud, /<dd[^>]*>36 S VK 88015 20370<\/dd>/);
    // echo "39.933365 32.859742" | GeoConvert -u -p 9 -> 36n 488015.987782238 4420370.843637543
    assert.ok(visibleText(hud).includes("36N 488015.988 E 4420370.844 N"), "UTM");
    for (const key of ["handoffMeasureA", "handoffMeasureB", "handoffCrs"]) assert.ok(text.includes(lang[language].text[key]), key);
  }
  const { text } = renderTool("positions");
  assert.ok(text.includes(vector("gars.csv", "ankara-p2").expected_code), "GARS");
  assert.ok(text.includes(vector("georef.csv", "ankara-p4").expected_code), "GEOREF");
  assert.ok(text.includes(lang.tr.text.pointSource));
  assert.ok(text.includes(lang.tr.text.outputOptions) && text.includes(lang.tr.text.libraryCall));
});

test("the CRS tool floats its two widgets and shows EPSG:4326 -> EPSG:3857 from the contract vector", () => {
  const row = vector("coordinate-projections.csv", "crs-mercator-ankara");
  const { html, text } = renderTool("crs");
  assert.ok(text.includes(lang.tr.text.crsTitle));
  assert.equal(html.match(/data-widget="input"/g)?.length, 1, "input widget");
  assert.equal(html.match(/data-widget="result"/g)?.length, 1, "result widget");
  const hud = visibleText(element(html, 'data-widget="result"'));
  assert.ok(hud.includes(`${Number(row.expected_x).toFixed(3)}, ${Number(row.expected_y).toFixed(3)}`), hud);
  assert.ok(hud.includes("3657929.747"), hud);
  assert.ok(hud.includes("EPSG:4326") && hud.includes("EPSG:3857"), hud);
  assert.ok(text.includes(lang.tr.text.handoffPositions), "Konumda aç");
  // The drawer: full X and Y, the axis order, the supported systems, the call.
  assert.ok(text.includes(Number(row.expected_x).toFixed(8)), text);
  assert.ok(text.includes(lang.tr.text.axisNote) && text.includes("EPSG:32601–EPSG:32660"));
  assert.ok(text.includes('transformCrs("EPSG:4326", "EPSG:3857", 32.859742, 39.933365)'), text);
});

test("the measure tool measures Ankara -> Istanbul and offers picking on the map", () => {
  const row = vector("geodesic-wgs84.csv", "ankara-istanbul");
  const { html, text } = renderTool("measure");
  assert.ok(text.includes(lang.tr.text.distanceTitle));
  // Exact value to 1 mm, above the 0.1 mm tolerance of the vector, grouped the Turkish way.
  assert.ok(text.includes(`${turkish(Number(row.distanceMetres).toFixed(3))} m`), text);
  // The readout groups digits the Turkish way: 350,123 km.
  const kilometres = (Number(row.distanceMetres) / 1000).toFixed(3).replace(".", ",");
  assert.ok(text.includes(`${kilometres} km`), text);
  // One field per point, "enlem, boylam", holding the example's text.
  assert.match(html, /<input[^>]*id="measure-point-0"[^>]*value="39.933365, 32.859742"/);
  assert.match(html, /<input[^>]*id="measure-point-1"[^>]*value="41.008238, 28.978359"/);
  // Each point's pick button: its name starts with the visible words (WCAG 2.5.3),
  // then names the point; the full sentence is its tooltip.
  for (const [letter, label] of [["A", lang.tr.text.startPoint], ["B", lang.tr.text.endPoint]]) {
    assert.ok(html.includes(`title="${lang.tr.text.pickPointLabel.replace("{point}", letter)}"`), `pick ${letter}`);
    const button = html.match(new RegExp(`<button[^>]*title="${lang.tr.text.pickPointLabel.replace("{point}", letter)}"[^>]*>[\\s\\S]*?</button>`))[0];
    assert.ok(!/aria-label=/.test(button.match(/^<button[^>]*>/)[0]), `pick ${letter} named by its content`);
    assert.ok(button.includes(lang.tr.text.repickPoint) && button.includes(`, ${label}`), button);
  }
  for (const key of ["mapLayers", "map3D", "mapZoomIn", "mapZoomOut", "mapFit", "mapMyLocation", "mapExpand"]) {
    assert.ok(html.includes(`aria-label="${lang.tr.text[key]}"`), key);
  }
  assert.ok(text.includes(lang.tr.text.swapPoints) && text.includes(lang.tr.text.clearPoints));
  // MapLibre starts in an effect, which server rendering does not run.
  assert.ok(text.includes(lang.tr.text.mapLoading));
  assert.doesNotMatch(html, /arcgis|<svg[^>]*role="img"/i);
});

test("measurement prioritizes distance while retaining copyable azimuths in details", () => {
  for (const language of ["tr", "en"]) {
    const { html } = renderTool("measure", { language });
    const main = visibleText(element(html, 'class="hud-main"'));
    const details = element(html, 'class="hud-drawer ');
    assert.ok(main.includes(language === "tr" ? "350,092" : "350.092"));
    for (const key of ["initialAzimuth", "finalAzimuth"]) {
      const label = lang[language].text[key];
      assert.ok(!main.includes(label), `${key} is secondary`);
      assert.ok(visibleText(details).includes(label), `${key} remains available`);
      assert.ok(details.includes(`aria-label="${lang[language].text.copy} ${label}"`), `${key} stays copyable`);
    }
  }
});

test("a core error is shown with its localized message and its code", () => {
  const broken = {
    ...config,
    crs: { ...config.crs, initial: { ...config.crs.initial, source: "EPSG:9999" } },
    // DD is a point field (its own message); a core reader reports a code.
    position: {
      ...config.position,
      initial: { ...config.position.initial, format: "mgrs", values: { ...config.position.initial.values, mgrs: "36S VK 88015 2037" } },
    },
  };
  const crs = renderTool("crs", { configuration: broken }).text;
  assert.ok(crs.includes(`${lang.tr.text.crsInvalid} ${lang.tr.errors.UNSUPPORTED_CRS} (UNSUPPORTED_CRS)`), crs);
  const position = renderTool("positions", { configuration: broken, language: "en" }).text;
  assert.ok(position.includes(`${lang.en.errors.INVALID_MGRS} (INVALID_MGRS)`), position);
});

test("coordinate fields say that a latitude, longitude pair can be pasted", () => {
  const distance = renderTool("measure");
  assert.ok(distance.text.includes(lang.tr.text.pasteHintPoints), "measure");
  for (const letter of ["A", "B"]) {
    const label = lang.tr.text.copyPoint.replace("{point}", letter);
    assert.ok(distance.html.includes(`aria-label="${label.replace(/"/g, "&quot;")}"`), `copy ${letter}`);
  }
  assert.ok(renderTool("positions").text.includes(lang.tr.text.pasteHint), "positions");
  const crs = renderTool("crs", { language: "en" });
  // EPSG:4326: x is the longitude, y the latitude, and a pasted pair is read that way.
  assert.ok(crs.text.includes(lang.en.text.pasteHint), "crs");
  assert.ok(crs.text.includes(`X · ${lang.en.text.longitude}`) && crs.text.includes(`Y · ${lang.en.text.latitude}`));
});

test("the measure tool floats one input widget and one result widget on the map", () => {
  // 350091.704 m (GeodSolve, contracts/test-vectors/geodesic-wgs84.csv) is 350.092 km.
  for (const [language, kilometres] of [
    ["tr", "350,092"],
    ["en", "350.092"],
  ]) {
    const { html } = renderTool("measure", { language });
    assert.equal(html.match(/data-widget="input"/g)?.length, 1, `${language} input widget`);
    assert.equal(html.match(/data-widget="result"/g)?.length, 1, `${language} result widget`);
    const result = visibleText(element(html, 'data-widget="result"'));
    assert.ok(result.includes(kilometres) && result.includes("km"), result);
    assert.ok(!visibleText(element(html, 'data-widget="input"')).includes(kilometres), "the distance is a result");
    // The docked side panel of the earlier layout is gone.
    assert.doesNotMatch(html, /id="measure-panel"/);
  }
});

test("the phone sheet of the workspace can be resized with its handle, with the keyboard too", () => {
  const { html } = renderTool("measure");
  assert.match(html, /role="separator"[^>]*aria-orientation="horizontal"/);
  assert.ok(html.includes(`aria-label="${lang.tr.text.resizePanel}"`));
  assert.match(html, /aria-orientation="horizontal"[^>]*tabindex="0"/);
  assert.doesNotMatch(html, /aria-orientation="vertical"/, "no resizable side panel");
});

test("the distance details compare the ellipsoidal result with a sphere", () => {
  const row = vector("geodesic-wgs84.csv", "ankara-istanbul");
  // The radius is pinned here, so config.json may be tuned without this test.
  const configuration = { ...config, measure: { ...config.measure, comparisonSphereRadiusMetres: 6371008.8 } };
  const { text } = renderTool("measure", { configuration });
  assert.ok(text.includes(lang.tr.text.sphericalComparison), text);
  // Haversine with R = 6371008.8 m (IUGG mean radius) gives 349365.585 m,
  // 726.119 m or 0.207 % less than the WGS 84 vector.
  assert.ok(Math.abs(Number(row.distanceMetres) - 349365.585 - 726.119) < 0.001);
  assert.ok(text.includes(`${lang.tr.text.sphereDistance} 349,366 km`), text);
  assert.ok(text.includes("−726,1 m (%−0,207)"), text);
  assert.ok(text.includes(lang.tr.text.sphereComparisonNote.replace("{radius}", "6.371.008,8")));
  const english = renderTool("measure", { language: "en", configuration }).text;
  assert.ok(english.includes("−726.1 m (−0.207 %)"), english);
  // Without a usable radius there is simply no comparison.
  const without = { ...config, measure: { ...config.measure, comparisonSphereRadiusMetres: undefined } };
  const plain = renderTool("measure", { configuration: without }).text;
  assert.ok(!plain.includes(lang.tr.text.sphericalComparison));
  assert.ok(plain.includes(`${turkish(Number(row.distanceMetres).toFixed(3))} m`), "the measurement stands");
});

test("each measure mode names its result and its model in the result widget", () => {
  const label = (key, language = "tr") => `${lang[language].text[key]} · ${lang[language].text.modelWgs84}`;
  const inverse = visibleText(element(renderTool("measure").html, 'data-widget="result"'));
  assert.ok(inverse.includes(label("distanceEllipsoidal")), inverse);
  const direct = visibleText(element(renderTool("measure", { configuration: measureOpeningWith("ankara-east-30000-km") }).html, 'data-widget="result"'));
  assert.ok(direct.includes(label("directLabel")), direct);
  const route = renderTool("measure", { configuration: measureOpeningWith("ankara-istanbul-izmir"), language: "en" });
  const routeResult = visibleText(element(route.html, 'data-widget="result"'));
  assert.ok(routeResult.includes(label("routeLabel", "en")), routeResult);
  // The mode switch at the top of the input widget has the open mode checked.
  const input = element(route.html, 'data-widget="input"');
  const selectedMode = input.match(/<button[^>]*role="radio" aria-checked="true"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(selectedMode, "one mode is selected");
  assert.equal(visibleText(selectedMode), lang.en.text.modeRoute);
});

test("the direct mode shows the end point it computed, the line as travelled", () => {
  const example = config.measure.examples.find(({ id }) => id === "ankara-east-30000-km");
  const [latitude, longitude] = example.points[0].split(", ");
  const end = directGeodesic({ latitude, longitude }, example.azimuth, Number(example.distance) * 1000);
  const { html } = renderTool("measure", { configuration: measureOpeningWith(example.id) });
  const result = visibleText(element(html, 'data-widget="result"'));
  // Six decimals shown; the copy button copies the full precision.
  assert.ok(result.includes(`${end.latitude.toFixed(6)}, ${end.longitude.toFixed(6)}`), result);
  assert.ok(result.includes(lang.tr.text.finalAzimuth) && result.includes("MGRS"), result);
  const details = element(html, 'class="hud-drawer ');
  assert.ok(details.includes('aria-label="Kopyala MGRS"'), "destination grid reference remains copyable in details on every screen");
  // A, the azimuth and the distance are inputs; B is computed (a hollow pin, not a field).
  const input = element(html, 'data-widget="input"');
  assert.match(input, /id="measure-point-0"/);
  assert.doesNotMatch(input, /id="measure-point-1"/);
  assert.match(input, /<input[^>]*id="measure-azimuth"[^>]*value="90"/);
  assert.match(input, /<input[^>]*id="measure-distance"[^>]*value="30000"/);
});

test("fields that take negative values keep the minus key on phone keyboards", () => {
  const inputTag = (html, id) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
  // Azimuths and X/Y (west, south, projected) are often negative; distances never are.
  const { html: direct } = renderTool("measure", { configuration: measureOpeningWith("ankara-east-30000-km") });
  assert.match(inputTag(direct, "measure-azimuth"), /inputmode="text"/i);
  assert.match(inputTag(direct, "measure-distance"), /inputmode="decimal"/i);
  const { html: crs } = renderTool("crs");
  assert.match(inputTag(crs, "crs-x"), /inputmode="text"/i);
  assert.match(inputTag(crs, "crs-y"), /inputmode="text"/i);
});

test("the route mode counts 2 segments for three points and lists them", () => {
  const points = config.measure.examples.find(({ id }) => id === "ankara-istanbul-izmir").points.map((text) => {
    const [latitude, longitude] = text.split(", ");
    return { latitude, longitude };
  });
  const { html, text } = renderTool("measure", { configuration: measureOpeningWith("ankara-istanbul-izmir") });
  const result = visibleText(element(html, 'data-widget="result"'));
  assert.ok(result.includes(`${lang.tr.text.routeSegments} 2`), result);
  assert.ok(result.includes(`${lang.tr.text.routePoints} 3`), result);
  // 677359.732 m (checked against the core when the plan was written) is 677,360 km.
  assert.ok(Math.abs(measureGeodesicPolyline(points).distanceMetres - 677359.732) < 0.001);
  assert.ok(result.includes("677,360 km"), result);
  for (const index of [0, 1, 2]) assert.match(html, new RegExp(`id="measure-point-${index}"`));
  assert.ok(text.includes("1 → 2") && text.includes("2 → 3"), "one row per segment");
  assert.ok(text.includes(lang.tr.text.segmentsTitle));
});

// GeodTest row 474500 (near-vertex block): the core reports an azimuth
// uncertainty of 0.006898° (1e-7 m / m12, m12 = 8.3e-4 m).
const NEAR_VERTEX_POINTS = ["56.796245515064, 0", "-56.796245515064519948, 179.668926360912281556"];

/** config.json with the measure tool opening on an example of its own. */
function measureOpeningOn(example) {
  return { ...config, measure: { ...config.measure, examples: [example, ...config.measure.examples] } };
}

test("nearly antipodal points: azimuths and area show only meaningful digits, and a notice says why", () => {
  const { inverseGeodesic } = core;
  const [start, end] = NEAR_VERTEX_POINTS.map((text) => {
    const [latitude, longitude] = text.split(", ");
    return { latitude, longitude };
  });
  const inverse = inverseGeodesic(start, end);
  assert.ok(Math.abs(inverse.bearingUncertaintyDegrees - 0.006898) < 1e-6, String(inverse.bearingUncertaintyDegrees));
  for (const language of ["tr", "en"]) {
    const { html, text } = renderTool("measure", {
      language,
      configuration: measureOpeningOn({ id: "near-vertex", mode: "inverse", points: NEAR_VERTEX_POINTS }),
    });
    const result = visibleText(element(html, 'data-widget="result"'));
    // 90.0049028° and 89.9950972° to the one decimal 0.0069° leaves (the
    // no-break space after ≈ reads as a space here).
    const decimal = language === "tr" ? "," : ".";
    assert.ok(result.includes(`≈ 90${decimal}0°`), result);
    assert.ok(!result.includes(`90${decimal}0049`), result);
    assert.ok(text.includes(fill(lang[language].text.imprecisePath, { degrees: `0${decimal}0069` })), language);
    assert.ok(text.includes("±"), "S12 in m² with its uncertainty");
  }
});

test("a route with a nearly antipodal segment cuts that segment's azimuths and says so", () => {
  const { html, text } = renderTool("measure", {
    configuration: measureOpeningOn({ id: "near-vertex-route", mode: "route", points: [...NEAR_VERTEX_POINTS, "0, 0"] }),
  });
  assert.ok(text.includes(fill(lang.tr.text.impreciseRoute, { degrees: "0,0069" })), text);
  assert.ok(visibleText(html).includes(`${lang.tr.text.initialAzimuth} ≈ 90,0°`), "segment 1 → 2");
});

test("an ordinary line keeps four decimals of its azimuths and no notice", () => {
  const { html, text } = renderTool("measure");
  const result = visibleText(element(html, 'data-widget="result"'));
  assert.ok(result.includes("291,1841°"), result);
  assert.ok(!text.includes("≈"), "nothing is cut");
  for (const key of ["imprecisePath", "impreciseRoute"]) {
    assert.ok(!text.includes(lang.tr.text[key].split("{")[0]), key);
  }
});

// A fixed-seed generator for the random-input render tests below.
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number as the Turkish interface writes it: grouped, decimal comma, real minus sign. */
function turkishNumber(fixedText) {
  const negative = fixedText.startsWith("-") && Number(fixedText) !== 0;
  return `${negative ? "−" : ""}${turkish(fixedText.replace("-", ""))}`;
}

test("for random points the measure tool shows the core's distance and azimuths, rounded", () => {
  const random = seeded(0x5ca1ab1e);
  const coordinate = (limit) => (random() * 2 - 1) * limit;
  for (let index = 0; index < 12; index += 1) {
    const start = { latitude: coordinate(90).toFixed(6), longitude: coordinate(180).toFixed(6) };
    const end = { latitude: coordinate(90).toFixed(6), longitude: coordinate(180).toFixed(6) };
    const inverse = core.inverseGeodesic(start, end);
    const example = { id: `random-${index}`, mode: "inverse", points: [`${start.latitude}, ${start.longitude}`, `${end.latitude}, ${end.longitude}`] };
    const result = visibleText(element(renderTool("measure", { configuration: measureOpeningOn(example) }).html, 'data-widget="result"'));
    const kilometres = core.convertLength(String(inverse.distanceMetres), "metre", "kilometre", 3).value;
    assert.ok(result.includes(`${turkishNumber(Number(kilometres).toFixed(3))} km`), `${example.points}: ${result}`);
    if (inverse.bearingUncertaintyDegrees <= 5e-5) {
      for (const degrees of [inverse.initialBearingDegrees, inverse.finalBearingDegrees]) {
        assert.ok(result.includes(`${turkishNumber(degrees.toFixed(4))}°`), `${example.points}: ${degrees} in ${result}`);
      }
    }
  }
});

test("for random points the position tool shows the core's DMS, DDM, UTM/UPS and MGRS text", () => {
  const random = seeded(0xc0ffee);
  for (let index = 0; index < 12; index += 1) {
    const latitude = ((random() * 2 - 1) * 90).toFixed(7);
    const longitude = ((random() * 2 - 1) * 180).toFixed(7);
    const position = { ...config.position, initial: { ...config.position.initial, format: "dd", values: { ...config.position.initial.values, ddLat: latitude, ddLon: longitude } } };
    const { html } = renderTool("positions", { configuration: { ...config, position } });
    const hud = visibleText(element(html, 'data-widget="result"'));
    const outputs = core.coordinateResults({ latitude, longitude });
    const words = (text) => text.replace(/\s+/g, " ");
    for (const key of ["dms", "ddm", "utmUps"]) assert.ok(hud.includes(words(outputs[key])), `${latitude}, ${longitude} ${key}: ${outputs[key]} in ${hud}`);
    assert.ok(hud.replace(/\s/g, "").includes(outputs.mgrs.replace(/\s/g, "")), `${latitude}, ${longitude} MGRS ${outputs.mgrs}`);
  }
});

test("the details end with the exact library call", () => {
  const { text } = renderTool("measure");
  assert.ok(text.includes(lang.tr.text.libraryCall));
  assert.ok(text.includes("inverseGeodesic({ latitude: 39.933365, longitude: 32.859742 }, { latitude: 41.008238, longitude: 28.978359 })"), text);
});

test("a half-typed or invalid point shows no result as current and says why in the user's language", () => {
  const opening = (points) => {
    const [first, ...others] = config.measure.examples;
    return { ...config, measure: { ...config.measure, examples: [{ ...first, points }, ...others] } };
  };
  for (const [points, key] of [
    [["39.9", "41.008238, 28.978359"], "pointIncomplete"],
    [["91, 10", "41.008238, 28.978359"], "coordinateInvalid"],
  ]) {
    for (const language of ["tr", "en"]) {
      const { html } = renderTool("measure", { configuration: opening(points), language });
      const result = visibleText(element(html, 'data-widget="result"'));
      assert.ok(result.includes(lang[language].text[key]), result);
      // A distance would read like "350,092 km" (3 decimals); the unit switch alone is no value.
      assert.doesNotMatch(result, /\d[.,]\d{3} km/, "no distance is shown");
      // The field says it too, under the point.
      assert.ok(visibleText(element(html, 'data-widget="input"')).includes(lang[language].text[key]), key);
    }
  }
});

test("every tool renders in every language without undefined, NaN or [object Object]", () => {
  for (const { id } of TOOLS) {
    for (const language of config.languages) {
      const { html, text: shown } = renderTool(id, { language });
      // Words written in lang.json are meant ("headings are undefined"); a leaked value is not.
      const authored = Object.values(lang[language].text).filter((value) => /undefined|NaN/.test(value));
      const text = authored.reduce((rest, value) => rest.split(value).join(" "), shown);
      for (const bad of ["undefined", "NaN", "[object Object]"]) {
        assert.ok(!text.includes(bad), `${id} ${language}: "${bad}" in the visible text`);
        // Accessible names, titles and values must not carry it either.
        assert.ok(!new RegExp(`="[^"]*${bad.replace(/[[\]]/g, "\\$&")}[^"]*"`).test(markup(html)), `${id} ${language}: "${bad}" in an attribute`);
      }
    }
  }
});

test("the result widget's actions hand the value on, in the bar and again in the phone sheet", () => {
  for (const language of config.languages) {
    const words = lang[language].text;
    const positions = element(renderTool("positions", { language }).html, 'data-widget="result"');
    const bar = element(positions, 'class="hud-actions"');
    const sheet = element(positions, 'class="hud-actions-sheet"');
    const expected = [words.handoffMeasureA, words.handoffMeasureB, words.handoffCrs];
    for (const part of [bar, sheet]) {
      const buttons = [...part.matchAll(/<button\b[^>]*type="button"[^>]*>[\s\S]*?<\/button>/g)].map((match) => visibleText(match[0]));
      assert.deepEqual(buttons, expected, language);
    }
    const crs = element(renderTool("crs", { language }).html, 'data-widget="result"');
    assert.ok(visibleText(element(crs, 'class="hud-actions"')).includes(words.handoffPositions), `${language} CRS -> Konum`);
  }
});
