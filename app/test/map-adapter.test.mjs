// Pure helpers between the workspace tools and MapLibre: display limits,
// antimeridian handling, picking precision, fit padding around the floating
// widgets and the basemap style rules. Scene bounds and lines are in
// scene.test.mjs.

import assert from "node:assert/strict";
import test from "node:test";
import { sampleGeodesicPath } from "@convert-tools/core";
import {
  GLOBE_MAX_ZOOM,
  LINE_WIDTHS,
  MAP_PROJECTION,
  MERCATOR_LATITUDE_LIMIT,
  constrainView,
  coordinateFromLngLat,
  decimalsForResolution,
  displayLatitude,
  fallbackStyle,
  fitPadding,
  formatPickedCoordinate,
  gradientColor,
  guardFilter,
  lineWidthAt,
  markerLatitude,
  routeMidpoint,
  screenRuns,
  tuneBasemapStyle,
  calmLabels,
  unwrapPath,
  wrapLongitude,
} from "../src/map/map-adapter.js";
import { sceneBounds, sceneFeatures } from "../src/map/scene.js";

test("the map is a globe that turns flat (Web Mercator) when zoomed in", () => {
  // MapLibre's globe preset: a sphere up to zoom 11, Web Mercator from 12.
  // Zoomed out there are no copies of the world, so A, B and the tag of a
  // line never end up on different copies, and the poles are on the map.
  assert.deepEqual(MAP_PROJECTION, { type: "globe" });
  assert.ok(Object.isFrozen(MAP_PROJECTION));
});

test("pins and tags sit on their real latitude; only the exact pole is moved in by a hair", () => {
  // Web Mercator (zoom 12 and more) has no y for ±90°; 1e-6° is 11 cm.
  assert.equal(markerLatitude(89.9), 89.9);
  assert.equal(markerLatitude(-85.2), -85.2);
  assert.equal(markerLatitude(90), 89.999999);
  assert.equal(markerLatitude(-90), -89.999999);
  // Bounds for a fit still stop at the Mercator edge.
  assert.equal(displayLatitude(-90), -MERCATOR_LATITUDE_LIMIT);
  assert.equal(displayLatitude(84), 84);
});

test("a route across the antimeridian stays one short line", () => {
  const path = sampleGeodesicPath({ latitude: "10", longitude: "179.9" }, { latitude: "10", longitude: "-179.9" });
  const coordinates = unwrapPath(path.points);
  for (let index = 1; index < coordinates.length; index += 1) {
    assert.ok(Math.abs(coordinates[index][0] - coordinates[index - 1][0]) < 1, `step ${index}`);
  }
  const scene = { pins: [], lines: [{ id: "route", points: path.points }], picking: null, fitRequest: 0 };
  const [[west], [east]] = sceneBounds(scene);
  assert.ok(east - west < 1, "bounds span 0.2°, not the whole world");
  assert.ok(east > 180, "B is unwrapped past 180°");
  assert.equal(sceneFeatures(scene).features[0].geometry.type, "LineString");
  assert.ok(Math.abs(routeMidpoint(path.points)[0] - 180) < 1e-6);
});

test("the tag sits on the middle of the line, also where that is near a pole", () => {
  // The owner's route passes 89.54°N; its middle (by length) is at 85.7°N,
  // beyond the Mercator edge, which the globe shows where it is.
  const path = sampleGeodesicPath(
    { latitude: "36.36341", longitude: "115.56606" },
    { latitude: "44.902554", longitude: "-65.212542" },
  );
  const [longitude, latitude] = routeMidpoint(path.points);
  assert.ok(Math.abs(latitude - 85.7313) < 1e-3, `latitude ${latitude}`);
  assert.ok(Math.abs(longitude - 121.2497) < 1e-3, `longitude ${longitude}`);
  // An even number of points: halfway between the two middle ones.
  assert.deepEqual(
    routeMidpoint([
      { latitude: 89, longitude: 0 },
      { latitude: 80, longitude: 10 },
      { latitude: 70, longitude: 20 },
      { latitude: 60, longitude: 30 },
    ]),
    [15, 75],
  );
});

test("lines are 3 to 5 px wide on a 6 to 10 px casing, growing from zoom 1 to 12", () => {
  assert.deepEqual(LINE_WIDTHS, { line: [3, 5], casing: [6, 10] });
  assert.equal(lineWidthAt(0, LINE_WIDTHS.line), 3);
  assert.equal(lineWidthAt(1, LINE_WIDTHS.line), 3);
  assert.equal(lineWidthAt(6.5, LINE_WIDTHS.casing), 8);
  assert.equal(lineWidthAt(12, LINE_WIDTHS.line), 5);
  assert.equal(lineWidthAt(18, LINE_WIDTHS.casing), 10);
});

test("a stretch over a pole is drawn on screen in runs of the vertices on the visible side of the globe", () => {
  // MapLibre's GeoJSON tiles stop at ±85.05°, so the stretch beyond is drawn
  // over the map from screen points: the copy of it nearest the centre,
  // broken where it passes behind the globe.
  const coordinates = [
    [350, 86],
    [355, 88],
    [360, 89],
    [365, 88],
  ];
  const project = ([longitude, latitude]) => [longitude * 2, -latitude];
  const visible = ([longitude]) => longitude !== -5;
  assert.deepEqual(screenRuns(coordinates, { centerLongitude: -10, project, visible }), [
    [
      [0, -89],
      [10, -88],
    ],
  ]);
  // Near the centre already: not moved; all visible: one run.
  assert.deepEqual(screenRuns(coordinates.slice(0, 2), { centerLongitude: 300, project, visible: () => true }), [
    [
      [700, -86],
      [710, -88],
    ],
  ]);
  assert.deepEqual(screenRuns([], { centerLongitude: 0, project, visible }), []);
});

test("the line colour runs from A's to B's colour", () => {
  assert.equal(gradientColor(0), "rgb(36, 80, 224)");
  assert.equal(gradientColor(1), "rgb(226, 73, 44)");
  assert.equal(gradientColor(0.5), "rgb(131, 77, 134)");
});

test("fewer than two points draw no route", () => {
  const scene = (points) => ({ pins: [], lines: [{ id: "route", points }], picking: null, fitRequest: 0 });
  assert.deepEqual(sceneFeatures(scene(null)).features, []);
  assert.deepEqual(sceneFeatures(scene([{ latitude: 1, longitude: 2 }])).features, []);
  assert.equal(sceneBounds(scene([])), null);
  assert.equal(routeMidpoint([{ latitude: 1, longitude: 2 }]), null);
});

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

test("the map's centre may reach the Mercator edge, so a fit can bring edge pins below the top bar", () => {
  const range = { minZoom: 0, maxZoom: 20 };
  assert.deepEqual(constrainView({ lng: 45, lat: 84 }, 3, range), { longitude: 45, latitude: 84, zoom: 3 });
  // Longitude is free; zoom stays in range.
  assert.deepEqual(constrainView({ lng: 190, lat: 60 }, 25, range), { longitude: 190, latitude: 60, zoom: 20 });
  // Zoomed in (Web Mercator from zoom 12) the centre stops at the edge.
  assert.deepEqual(constrainView({ lng: 10, lat: 89 }, 14, range, 14), {
    longitude: 10,
    latitude: MERCATOR_LATITUDE_LIMIT,
    zoom: 14,
  });
});

test("on the globe the centre goes past the Mercator edge, up to the pole", () => {
  // MapLibre's globe is a sphere up to zoom 11: there the centre may be over
  // a pole, so polar pins can be centred and zoomed in on.
  assert.equal(GLOBE_MAX_ZOOM, 11);
  const range = { minZoom: -2, maxZoom: 20 };
  assert.deepEqual(constrainView({ lng: 190, lat: 89 }, 5, range), { longitude: 190, latitude: 89, zoom: 5 });
  assert.deepEqual(constrainView({ lng: -10, lat: -88 }, -3, range), { longitude: -10, latitude: -88, zoom: -2 });
  assert.deepEqual(constrainView({ lng: 0, lat: 90 }, 11, range), { longitude: 0, latitude: 89.999999, zoom: 11 });
  // Zooming in over a pole stops at the globe's last zoom (Mercator cannot
  // show it) instead of jumping the centre back to the edge.
  assert.deepEqual(constrainView({ lng: 10, lat: 89 }, 14, range, 11), { longitude: 10, latitude: 89, zoom: 11 });
  assert.deepEqual(constrainView({ lng: 10, lat: -89.5 }, 12, range, 10.5), { longitude: 10, latitude: -89.5, zoom: 11 });
});

test("fits keep the scene clear of the floating widgets", () => {
  const base = { top: 108, right: 76, bottom: 32, left: 32 };
  // 1440 x 900: input widget 16 px from the edge, result widget 20 px above the bottom.
  const stage = rect(0, 0, 1440, 900);
  const input = rect(16, 68, 374, 560);
  const result = rect(340, 900 - 20 - 128, 760, 128);
  assert.deepEqual(fitPadding(stage, { input, result }, base), {
    top: 108,
    right: 76,
    // Half a pin (PIN_SHAPE.width / 2) beside the widget, so B's pin clears it.
    left: 374 + 32 + 15,
    bottom: 128 + 32,
  });
  // A control column wider than the base right padding (the phone's two
  // columns) pushes the scene clear of it, half a pin included.
  const controls = rect(375 - 12 - 108, 112, 108, 230);
  assert.equal(fitPadding(rect(0, 0, 375, 480), { input: null, result: null, controls }, base).right, 108 + 12 + 8 + 15);
  // The desktop's single 44 px column, 16 px from the edge.
  assert.equal(fitPadding(stage, { input, result, controls: rect(1440 - 16 - 44, 68, 44, 300) }, base).right, 16 + 44 + 8 + 15);
  // A column narrower than the base right padding keeps the base.
  assert.equal(fitPadding(stage, { input, result, controls: rect(1440 - 8 - 20, 68, 20, 300) }, base).right, 76);
  // Hidden widgets (no size) and widgets below the map (the phone sheet) leave the base.
  const phone = rect(0, 0, 375, 480);
  assert.deepEqual(fitPadding(phone, { input: rect(0, 466, 375, 340), result: rect(0, 0, 0, 0) }, base), base);
  assert.deepEqual(fitPadding(stage, { input: null, result: null }, base), base);
  // On a small map the paddings shrink and leave at least 64 px for the scene.
  const small = fitPadding(rect(0, 0, 400, 300), { input: rect(16, 68, 320, 200), result: rect(24, 130, 352, 150) }, base);
  assert.ok(small.left + small.right <= 400 - 64 && small.left + small.right > 400 - 70, JSON.stringify(small));
  assert.ok(small.top + small.bottom <= 300 - 64 && small.top + small.bottom > 300 - 70, JSON.stringify(small));
  assert.ok(small.left > small.right, "the input widget side keeps the larger share");
});

test("picked coordinates resolve one pixel with 5 to 8 decimals", () => {
  assert.equal(decimalsForResolution(0.7), 5, "whole world");
  assert.equal(decimalsForResolution(1e-5), 5);
  assert.equal(decimalsForResolution(3e-6), 6);
  assert.equal(decimalsForResolution(2e-7), 7);
  assert.equal(decimalsForResolution(5e-9), 8, "never more than 8");
  assert.deepEqual(coordinateFromLngLat({ lng: 392.5, lat: 39.123456789 }, 6), { latitude: "39.123457", longitude: "32.500000" });
  assert.deepEqual(coordinateFromLngLat({ lng: -0.000001, lat: 95 }, 5), { latitude: "90.00000", longitude: "0.00000" });
  assert.equal(formatPickedCoordinate(-0.0000001, 5), "0.00000");
});

test("wrapLongitude keeps ±180 and wraps other turns", () => {
  assert.equal(wrapLongitude(180), 180);
  assert.equal(wrapLongitude(-180), -180);
  assert.equal(wrapLongitude(190), -170);
  assert.equal(wrapLongitude(540), 180);
  assert.ok(Number.isNaN(wrapLongitude(Number.NaN)));
});

test("the basemap keeps no raster source, so no imagery is ever requested", () => {
  const style = {
    version: 8,
    sources: {
      openmaptiles: { type: "vector", url: "https://tiles.example/planet" },
      ne2_shaded: { type: "raster", tiles: ["https://tiles.example/ne2sr/{z}/{x}/{y}.png"] },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#fff" } },
      { id: "ne2_shaded", type: "raster", source: "ne2_shaded" },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#000" } },
      { id: "label_city", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": "{name}" } },
    ],
  };
  const tuned = tuneBasemapStyle(style, "tr");
  assert.deepEqual(Object.keys(tuned.sources), ["openmaptiles"]);
  assert.deepEqual(tuned.layers.map((layer) => layer.id), ["background", "water", "label_city"]);
  assert.equal(tuned.layers[1].paint["fill-color"], "#bcd4e6");
  assert.deepEqual(tuned.layers[2].layout["text-field"][1], ["get", "name:tr"]);
  assert.deepEqual(tuneBasemapStyle(style, "en").layers[2].layout["text-field"][1], ["get", "name:en"]);
  assert.equal(style.layers.length, 4, "the input style is not changed");
  assert.deepEqual(tuned.projection, MAP_PROJECTION, "the basemap is drawn on the globe");
});

test("the offline fallback style makes no requests", () => {
  const style = fallbackStyle();
  assert.equal(style.version, 8);
  assert.doesNotMatch(JSON.stringify(style), /https?:/);
  assert.ok(Object.values(style.sources).every((source) => source.type === "geojson"));
  assert.deepEqual(style.projection, MAP_PROJECTION);
});

test("number comparisons in basemap filters read a missing property as failing, without a warning", () => {
  const filter = ["all", ["<=", ["get", "ref_length"], 6], [">", ["get", "rank"], 2], ["==", ["get", "class"], "motorway"]];
  assert.deepEqual(guardFilter(filter), [
    "all",
    ["<=", ["coalesce", ["get", "ref_length"], 1e9], 6],
    [">", ["coalesce", ["get", "rank"], -1e9], 2],
    ["==", ["get", "class"], "motorway"],
  ]);
  assert.equal(guardFilter("x"), "x");
  const tuned = tuneBasemapStyle({ sources: {}, layers: [{ id: "shield", type: "symbol", filter }] }, "tr");
  assert.deepEqual(tuned.layers[0].filter, guardFilter(filter));
});

test("2D clamps polar centers to the Mercator edge even at world zoom", () => {
  const range = { minZoom: -1, maxZoom: 20 };
  assert.equal(constrainView({ lng: 12, lat: 90 }, 0, range, 0, "2d").latitude, MERCATOR_LATITUDE_LIMIT);
  assert.equal(constrainView({ lng: 12, lat: -90 }, 16, range, 0, "2d").zoom, 16);
});

test("2D keeps the Mercator edge at the edge of the map, so nothing beyond it shows", () => {
  const range = { minZoom: -2, maxZoom: 20 };
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
  // Zoom 2: the world is 2048 px tall; the centre is drawn 128 + 256 px below the top.
  const viewport = { height: 768, padding: { top: 128, bottom: 128, left: 256, right: 0 } };
  const north = constrainView({ lng: 400, lat: 90 }, 2, range, 2, "2d", viewport);
  assert.equal(north.longitude, 400);
  near(north.latitude, 74.01954331150228);
  near(constrainView({ lng: 0, lat: -90 }, 2, range, 2, "2d", viewport).latitude, -74.01954331150228);
  assert.deepEqual(constrainView({ lng: 28, lat: 41 }, 6, range, 6, "2d", viewport), { longitude: 28, latitude: 41, zoom: 6 });
  // A world as tall as the map has one centre: 100 + (1024 - 400) / 2 px below its top.
  const fitted = { height: 1024, padding: { top: 100, bottom: 300, left: 0, right: 0 } };
  near(constrainView({ lng: 0, lat: 0 }, 1, range, 1, "2d", fitted).latitude, 33.13755119234614);
  near(constrainView({ lng: 0, lat: 80 }, 1, range, 1, "2d", fitted).latitude, 33.13755119234614);
  // A world shorter than the map (below the zoom floor) stays centred.
  near(constrainView({ lng: 0, lat: 60 }, 0, range, 0, "2d", { height: 1024 }).latitude, 0);
});

const fakeLabel = (id, sourceLayer, layout = {}, paint = {}) => ({
  id,
  type: "symbol",
  source: "openmaptiles",
  "source-layer": sourceLayer,
  layout: { "text-field": "{name}", "text-font": ["Noto Sans Bold"], "text-transform": "uppercase", "icon-image": "circle", ...layout },
  paint: { "text-color": "#000", ...paint },
});
const calmStyle = () => ({
  sources: { openmaptiles: { type: "vector" } },
  layers: [
    fakeLabel("label_country_1", "place"),
    fakeLabel("label_city", "place"),
    fakeLabel("label_village", "place"),
    fakeLabel("water_name_point_label", "water_name", { "text-font": ["Noto Sans Italic"] }),
  ],
});

test("calm labels: minimum zooms grow from country to village", () => {
  const [country, city, village] = tuneBasemapStyle(calmStyle(), "tr").layers;
  assert.equal(country.minzoom, 1.5);
  assert.equal(city.minzoom, 5.5);
  assert.equal(village.minzoom, 11);
});

test("calm labels: cities are mixed case, regular and without dots; countries keep small caps", () => {
  const [country, city] = tuneBasemapStyle(calmStyle(), "tr").layers;
  assert.equal(city.layout["text-transform"], "none");
  assert.equal(country.layout["text-transform"], "uppercase");
  assert.deepEqual(city.layout["text-font"], ["Noto Sans Regular"]);
  assert.equal(city.layout["icon-image"], undefined);
  assert.equal(city.layout["text-size"][0], "interpolate");
});

test("calm labels: colours follow the palette and none leaves them alone", () => {
  assert.equal(tuneBasemapStyle(calmStyle(), "en", { palette: "positron" }).layers[1].paint["text-color"], "#5f6670");
  const dark = tuneBasemapStyle(calmStyle(), "en", { palette: "dark" }).layers;
  assert.equal(dark[1].paint["text-color"], "#aab3be");
  assert.equal(dark[1].paint["text-halo-color"], "#1c222a");
  assert.equal(dark[3].paint["text-color"], "#5d7a99");
  const none = tuneBasemapStyle(calmStyle(), "en", { palette: "none" }).layers;
  assert.equal(none[1].paint["text-color"], "#000");
  assert.equal(none[1].layout["text-transform"], "none");
  assert.equal(none[1].minzoom, 5.5);
});

test("calm labels keep the localized text field and ignore other layers", () => {
  const tuned = tuneBasemapStyle(calmStyle(), "tr").layers;
  assert.deepEqual(tuned[1].layout["text-field"][1], ["get", "name:tr"]);
  assert.deepEqual(tuned[3].layout["text-field"][1], ["get", "name:tr"]);
  const fill = { id: "water", type: "fill", "source-layer": "water" };
  assert.equal(calmLabels(fill), fill);
});
