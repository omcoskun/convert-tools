// The map's basemaps, grids and scale bar: pure helpers of src/map.

import assert from "node:assert/strict";
import test from "node:test";
import { encodeMgrs } from "@omcoskun/convert-tools";
import { readJson } from "./support/files.mjs";
import {
  CONTINENT_LAYER,
  CONTINENT_SOURCE,
  SATELLITE_FALLBACK_SOURCE,
  SATELLITE_SOURCE,
  TONE_COLORS,
  basemapSource,
  continentFeatures,
  findBasemap,
  firstLayerAboveImagery,
  pruneTileSamples,
  satelliteStyle,
  tileSample,
  tilesFailing,
} from "../src/map/basemaps.js";
import { GRATICULE_INTERVALS, graticuleCovers, graticuleFeatures, graticuleInterval, graticuleLabel } from "../src/map/graticule.js";
import { PALETTE_OVERRIDES, tuneBasemapStyle } from "../src/map/map-adapter.js";
import { mgrsZoneCells, mgrsZoneFeatures } from "../src/map/mgrs-zones.js";
import { niceScale, roundDown125 } from "../src/map/scale.js";

const { basemaps } = readJson("public/config.json").map;

test("the standard basemap follows the theme; the others keep one look", () => {
  const standard = findBasemap(basemaps, "standard");
  assert.deepEqual(basemapSource(standard, "light"), { key: "standard:light", url: standard.style, tone: "light", palette: "positron", keepRaster: false, raster: null, night: null, continents: null });
  assert.deepEqual(basemapSource(standard, "dark"), { key: "standard:dark", url: standard.darkStyle, tone: "dark", palette: "dark", keepRaster: false, raster: null, night: null, continents: null });
  const detailed = findBasemap(basemaps, "detailed");
  assert.equal(basemapSource(detailed, "dark").url, detailed.style);
  assert.equal(basemapSource(detailed, "dark").tone, "light");
  assert.equal(basemapSource(detailed, "light").keepRaster, true, "Liberty keeps its relief");
  assert.equal(basemapSource(detailed, "light").palette, "none");
  const satellite = basemapSource(findBasemap(basemaps, "satellite"), "dark");
  assert.equal(satellite.tone, "imagery");
  assert.equal(satellite.key, "satellite");
  assert.equal(satellite.night, findBasemap(basemaps, "satellite").night);
  assert.equal(satellite.continents, findBasemap(basemaps, "satellite").continents);
  assert.equal(basemapSource(detailed, "light").night, null);
  assert.equal(findBasemap(basemaps, "nope").id, "standard");
  for (const tone of ["light", "dark", "imagery"]) {
    assert.deepEqual(Object.keys(TONE_COLORS[tone]).sort(), ["casing", "grid", "gridMajor", "halo", "label", "line", "onLine", "zone", "zoneLabel"]);
  }
});

const VECTOR_STYLE = {
  version: 8,
  glyphs: "https://tiles.example/fonts/{fontstack}/{range}.pbf",
  sources: { openmaptiles: { type: "vector", url: "https://tiles.example/planet" }, ne2_shaded: { type: "raster", tiles: ["https://tiles.example/{z}/{x}/{y}.png"] } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#fff" } },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#00f" } },
    { id: "highway", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: {} },
    { id: "boundary_2", type: "line", source: "openmaptiles", "source-layer": "boundary", paint: { "line-color": "#999" } },
    { id: "water_name", type: "symbol", source: "openmaptiles", "source-layer": "water_name", layout: { "text-field": "{name}" }, paint: {} },
    { id: "label_city", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": "{name}" }, paint: { "text-color": "#000" } },
  ],
};

test("the satellite style puts imagery under the vector style's boundaries and names only", () => {
  const raster = { tiles: "https://imagery.example/{z}/{y}/{x}.jpg", tileSize: 256, maxzoom: 14 };
  const style = satelliteStyle(VECTOR_STYLE, raster);
  assert.deepEqual(style.layers.map((layer) => layer.id), ["background", SATELLITE_SOURCE, "boundary_2", "water_name", "label_city", CONTINENT_LAYER]);
  assert.deepEqual(style.sources[SATELLITE_SOURCE], { type: "raster", tiles: [raster.tiles], tileSize: 256, maxzoom: 14 });
  assert.equal(style.sources.ne2_shaded, undefined);
  assert.equal(style.glyphs, VECTOR_STYLE.glyphs);
  assert.equal(style.layers.find((layer) => layer.id === "label_city").paint["text-color"], "#ffffff");
  assert.equal(VECTOR_STYLE.layers.length, 6, "the fetched style is not changed");
});

test("the satellite style draws ocean and sea names in blue and continent names on top", () => {
  const raster = { tiles: "https://imagery.example/{z}/{y}/{x}.jpg", maxzoom: 14 };
  const continents = continentFeatures([{ id: "europe", latitude: 52, longitude: 18 }], { europe: "Avrupa" }, "tr");
  const style = satelliteStyle(VECTOR_STYLE, raster, { continents });
  assert.equal(style.layers.at(-1).id, CONTINENT_LAYER);
  assert.equal(style.sources[CONTINENT_SOURCE].data, continents);
  const continentLayer = style.layers.at(-1);
  assert.equal(continentLayer.layout["text-transform"], "none");
  assert.deepEqual(continentLayer.layout["text-field"], ["get", "label"]);
  assert.ok(continentLayer.layout["text-letter-spacing"] >= 0.2);
  assert.ok(continentLayer.maxzoom <= 4);
  const water = style.layers.find((layer) => layer.id === "water_name");
  assert.equal(water.paint["text-color"], "#8fd0ff");
  assert.equal(style.layers.find((layer) => layer.id === "label_city").paint["text-color"], "#ffffff");
  const plain = satelliteStyle(VECTOR_STYLE, raster);
  assert.deepEqual(plain.sources[CONTINENT_SOURCE].data, { type: "FeatureCollection", features: [] });
});

test("continent names are uppercased in the app's language, not the browser's", () => {
  const points = [
    { id: "northAmerica", latitude: 50, longitude: -102 },
    { id: "asia", latitude: 46, longitude: 92 },
    { id: "unnamed", latitude: 0, longitude: 0 },
  ];
  const names = { northAmerica: "Kuzey Amerika", asia: "Asya" };
  const turkish = continentFeatures(points, names, "tr");
  assert.equal(turkish.type, "FeatureCollection");
  assert.deepEqual(turkish.features.map((feature) => feature.properties.label), ["KUZEY AMERİKA", "ASYA"]);
  assert.deepEqual(turkish.features[0].geometry, { type: "Point", coordinates: [-102, 50] });
  const english = continentFeatures(points, { northAmerica: "North America" }, "en");
  assert.deepEqual(english.features.map((feature) => feature.properties.label), ["NORTH AMERICA"]);
});

test("the night layer goes right above the imagery, under boundaries and names", () => {
  const raster = { tiles: "https://imagery.example/{z}/{y}/{x}.jpg", maxzoom: 14 };
  assert.equal(firstLayerAboveImagery(satelliteStyle(VECTOR_STYLE, raster).layers), "boundary_2");
  const withFallback = satelliteStyle(VECTOR_STYLE, { ...raster, fallback: { tiles: "https://coarse.example/{z}/{y}/{x}.jpeg" } });
  assert.equal(firstLayerAboveImagery(withFallback.layers), "boundary_2");
  assert.equal(firstLayerAboveImagery(VECTOR_STYLE.layers), undefined);
});

test("styles keep their relief raster on request and take their palette's colours", () => {
  const kept = tuneBasemapStyle(VECTOR_STYLE, "tr", { palette: "none", keepRaster: true });
  assert.ok(kept.sources.ne2_shaded);
  assert.equal(kept.layers[1].paint["fill-color"], "#00f");
  const dark = tuneBasemapStyle(VECTOR_STYLE, "tr", { palette: "dark" });
  assert.equal(dark.layers[0].paint["background-color"], PALETTE_OVERRIDES.dark.background["background-color"]);
  assert.equal(dark.layers[1].paint["fill-color"], PALETTE_OVERRIDES.dark.water["fill-color"]);
  assert.equal(dark.sources.ne2_shaded, undefined);
});

test("the grid interval narrows as the map zooms in, from 30° to 1′", () => {
  assert.equal(graticuleInterval(0), 30);
  assert.equal(graticuleInterval(1.5), 30);
  assert.equal(graticuleInterval(3), 10);
  assert.equal(graticuleInterval(6), 2);
  assert.equal(graticuleInterval(10), 1 / 12);
  assert.equal(graticuleInterval(18), 1 / 60);
  let previous = Infinity;
  for (let zoom = -2; zoom <= 20; zoom += 0.25) {
    const interval = graticuleInterval(zoom);
    assert.ok(GRATICULE_INTERVALS.includes(interval));
    assert.ok(interval <= previous, `zoom ${zoom}`);
    previous = interval;
  }
});

test("grid labels name the hemisphere in the interface language", () => {
  assert.equal(graticuleLabel(40, "latitude", "tr"), "40°K");
  assert.equal(graticuleLabel(-30, "latitude", "tr"), "30°G");
  assert.equal(graticuleLabel(30.5, "longitude", "tr"), "30°30′D");
  assert.equal(graticuleLabel(-75, "longitude", "tr"), "75°B");
  assert.equal(graticuleLabel(40, "latitude", "en"), "40°N");
  assert.equal(graticuleLabel(-75, "longitude", "en"), "75°W");
  assert.equal(graticuleLabel(0, "latitude", "en"), "0°");
  assert.equal(graticuleLabel(180, "longitude", "en"), "180°");
  assert.equal(graticuleLabel(190, "longitude", "en"), "170°W");
  assert.equal(graticuleLabel(41 + 1 / 60, "latitude", "en"), "41°01′N");
});

test("coarse grids cover the world; fine grids the view and a margin, and say when to remake them", () => {
  const world = graticuleFeatures([[20, 30], [40, 45]], 10, "tr");
  const meridians = world.features.filter((feature) => feature.properties.axis === "longitude");
  assert.equal(meridians.length, 37);
  const parallels = world.features.filter((feature) => feature.properties.axis === "latitude");
  assert.deepEqual(parallels.map((feature) => feature.geometry.coordinates[0][1]), [-80, -70, -60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, 70, 80]);
  for (const feature of world.features) {
    const coordinates = feature.geometry.coordinates;
    for (let index = 1; index < coordinates.length; index += 1) {
      const step = Math.abs(coordinates[index][0] - coordinates[index - 1][0]) + Math.abs(coordinates[index][1] - coordinates[index - 1][1]);
      assert.ok(step <= 2 + 1e-9);
    }
  }
  const view = [[28.9, 40.9], [29.1, 41.1]];
  const fine = graticuleFeatures(view, 1 / 12, "en");
  assert.ok(fine.features.length > 0 && fine.features.length < 40);
  assert.ok(graticuleCovers(fine, view, 1 / 12));
  assert.ok(!graticuleCovers(fine, view, 1 / 6), "another interval");
  assert.ok(!graticuleCovers(fine, [[29.5, 40.9], [29.7, 41.1]], 1 / 12), "the view left the lines");
  assert.ok(graticuleCovers(world, [[150, -60], [200, 10]], 10));
  // A very wide view at a fine interval is coarsened rather than drawn with thousands of lines.
  const wide = graticuleFeatures([[-60, -50], [60, 50]], 1 / 60, "en");
  assert.ok(wide.interval > 1 / 60 && wide.requested === 1 / 60);
  assert.ok(wide.features.length <= 2 * 161);
});

test("MGRS grid zones: 1197 cells with the Norway and Svalbard exceptions", () => {
  const cells = mgrsZoneCells();
  assert.equal(cells.length, 60 * 20 - 3);
  const cell = (label) => cells.find((item) => item.label === label);
  assert.deepEqual([cell("32V").west, cell("32V").east], [3, 12]);
  assert.deepEqual([cell("31V").west, cell("31V").east], [0, 3]);
  assert.deepEqual([cell("31X").west, cell("31X").east, cell("31X").north], [0, 9, 84]);
  assert.deepEqual([cell("37X").west, cell("37X").east], [33, 42]);
  for (const missing of ["32X", "34X", "36X"]) assert.equal(cell(missing), undefined);
  assert.deepEqual([cell("1C").west, cell("1C").south], [-180, -80]);
  const features = mgrsZoneFeatures().features;
  assert.equal(features.filter((feature) => feature.properties.kind === "label").length, cells.length);
});

test("every grid zone's centre is in that zone by the core's MGRS", () => {
  for (const { label, west, south, east, north } of mgrsZoneCells()) {
    const code = encodeMgrs((south + north) / 2, (west + east) / 2, 0);
    assert.equal(code.slice(0, 3).replace(/^0/, ""), label.padStart(3, "0").replace(/^0/, ""), `${label}: ${code}`);
  }
});

test("the scale bar shows the longest 1-2-5 length that fits, in the chosen units", () => {
  assert.equal(roundDown125(7.3), 5);
  assert.equal(roundDown125(19), 10);
  assert.equal(roundDown125(0.034), 0.02);
  assert.equal(roundDown125(2), 2);
  const metric = niceScale(250, 120, "metric");
  assert.deepEqual({ ...metric, widthPx: Math.round(metric.widthPx) }, { widthPx: 80, end: 20, mid: 10, unit: "km" });
  assert.deepEqual(niceScale(2, 120, "metric").unit, "m");
  assert.equal(niceScale(2, 120, "metric").end, 200);
  assert.equal(niceScale(250, 120, "nautical").unit, "NM");
  assert.equal(niceScale(250, 120, "nautical").end, 10);
  assert.equal(niceScale(0.5, 120, "nautical").unit, "m");
  assert.equal(niceScale(250, 120, "imperial").unit, "mi");
  assert.equal(niceScale(1, 120, "imperial").unit, "ft");
  for (let metresPerPixel = 1e-3; metresPerPixel < 1e6; metresPerPixel *= 1.7) {
    for (const unit of ["metric", "nautical", "imperial"]) {
      const scale = niceScale(metresPerPixel, 120, unit);
      assert.ok(Number.isFinite(scale.widthPx) && scale.widthPx > 12 && scale.widthPx <= 120 + 1e-9, `${metresPerPixel} ${unit} ${scale.widthPx}`);
    }
  }
  assert.equal(niceScale(Number.NaN, 120, "metric"), null);
  assert.equal(niceScale(0, 120, "metric"), null);
  assert.equal(niceScale(Infinity, 120, "metric"), null);
});

test("a fallback imagery source sits under the sharp imagery", () => {
  const raster = { tiles: "https://imagery.example/{z}/{y}/{x}.jpg", maxzoom: 14, fallback: { tiles: "https://coarse.example/{z}/{y}/{x}.jpeg", maxzoom: 8 } };
  const style = satelliteStyle(VECTOR_STYLE, raster);
  assert.deepEqual(style.layers.map((layer) => layer.id).slice(0, 3), ["background", "convert-satellite-fallback", SATELLITE_SOURCE]);
  assert.deepEqual(style.sources[SATELLITE_FALLBACK_SOURCE], { type: "raster", tiles: [raster.fallback.tiles], tileSize: 256, maxzoom: 8 });
});

test("tile events become samples; cancelled requests are ignored", () => {
  assert.deepEqual(tileSample({ type: "data", dataType: "source", tile: { state: "loaded" } }), { ok: true });
  assert.equal(tileSample({ type: "data", dataType: "source", tile: { state: "loading" } }), null);
  assert.equal(tileSample({ type: "data", dataType: "style" }), null);
  assert.deepEqual(tileSample({ type: "error", error: new Error("Not Found") }), { ok: false });
  const abort = new Error("aborted");
  abort.name = "AbortError";
  assert.equal(tileSample({ type: "error", error: abort }), null);
  assert.equal(tileSample(undefined), null);
});

test("the basemap is partial only when a real share of recent tiles failed", () => {
  const at = (t, ok) => ({ at: t, ok });
  const many = [...Array.from({ length: 40 }, (_, i) => at(1000 + i, true)), at(1100, false), at(1101, false), at(1102, false)];
  assert.equal(tilesFailing(many, 2000), false, "3 failures among 43 tiles is noise");
  const bad = [...Array.from({ length: 6 }, (_, i) => at(1000 + i, true)), at(1100, false), at(1101, false), at(1102, false)];
  assert.equal(tilesFailing(bad, 2000), true, "3 of 9 failed");
  assert.equal(tilesFailing([at(1000, false), at(1001, false)], 2000), false, "fewer than 3 failures");
  assert.equal(tilesFailing(bad, 20000), false, "old samples expire");
  assert.deepEqual(pruneTileSamples(bad, 11050).length, 3);
  assert.equal(tilesFailing([], 0), false);
});
