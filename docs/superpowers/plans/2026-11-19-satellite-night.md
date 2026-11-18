# Satellite night side, labels and EOX 2025 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The satellite basemap shows the live night side with NASA city lights at world zooms, Apple-like continent and ocean labels, and EOX 2025 imagery; then the site is published.

**Architecture:** Pure sun maths (`night.js`) produce a night mask; a browser module (`night-layer.js`) composites NASA Black Marble tiles through that mask on a 2048 px Web Mercator canvas and hands it to MapLibre as a `canvas` source under the labels, redrawn every 5 minutes. Continent labels and the blue water labels are part of the pure `satelliteStyle` transform; names come from `lang.json`, positions and the lights template from `config.json`.

**Tech Stack:** React 18 JSX, MapLibre GL JS 6.16, Webpack 5, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-18-satellite-night-and-imagery-design.md` (goals 1–3; MapTiler deferred by the owner on 2026-11-19).

## Global Constraints

- No new dependency. Every visible string in `lang.json` (tr, en), read as `text.<key>` literally.
- Tile URLs only in `config.json` (boundaries test forbids `https://…{z}` in `src/`).
- Trigonometry only in modules listed in `boundaries.test.mjs` `presentationMath`; add `map/night.js`.
- Pure modules must not touch `window`/`document` at import.
- Night layer: day fully clear at sun elevation ≥ 0°, full night by −12° at the latest; gone by zoom 6; never per-frame work.
- Imagery credit: "Sentinel-2 cloudless 2025 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2025), CC BY-NC-SA 4.0" → `https://s2maps.eu`; add a NASA Black Marble (GIBS) credit.

## Review Focus

1. Language switch TR↔EN while on satellite: continent names change without a style reload, Turkish keeps "İ" in an English-locale browser (pinned in Task 2 test).
2. Switching satellite → standard → satellite, and theme changes: night layer comes back once, no duplicate source error, no leftover timer (Task 3 browser check).
3. A NASA lights tile failing or GIBS down: night side still darkens (veil) and no "partial basemap" notice (Task 3 browser check with the lights host blocked).
4. 2D (Mercator) and 3D (globe) both draw the night layer; at zoom ≥ 6 it is invisible (Task 3).
5. A tab left in the background for an hour: on return the terminator jumps to now (visibilitychange redraw, Task 3).

---

### Task 1: Sun maths

**Files:**
- Create: `app/src/map/night.js`
- Test: `app/test/night.test.mjs`
- Modify: `app/test/boundaries.test.mjs` (add `path.join("map", "night.js")` to `presentationMath`, comment: sun position is decorative presentation maths, not geodesy)

**Interfaces — Produces:**
- `MERCATOR_LIMIT = 85.0511287798066`
- `subsolarPoint(date: Date): { latitude: number, longitude: number }` — NOAA low-precision solar position (declination and equation of time from the Julian century).
- `sunElevation(latitude: number, longitude: number, subsolar): number` — degrees, spherical.
- `nightAlpha(elevation: number): number` — 0 for elevation ≥ 0, 1 for ≤ −10, smoothstep between.
- `mercatorRowLatitude(row: number, rows: number): number` — latitude of the centre of `row` of a Web Mercator world square.
- `nightMask(date: Date, size: number): Float32Array` — row-major `size × size`; column `c` is longitude `−180 + (c + 0.5)·360/size`.

- [ ] **Step 1: Write the failing tests** in `app/test/night.test.mjs`:
  - March equinox `2024-03-20T03:06Z`: `|latitude| < 0.3`.
  - June solstice `2024-06-20T20:51Z`: latitude within 0.3 of 23.44; December solstice `2024-12-21T09:20Z`: within 0.3 of −23.44.
  - Longitude at 12:00 UTC follows the equation of time: `2024-11-03T12:00Z` → ≈ −4.1 (±0.5); `2024-02-11T12:00Z` → ≈ +3.55 (±0.5); and 15° west per hour (`13:00Z` ≈ 12:00Z − 15).
  - `sunElevation` is 90 at the subsolar point, −90 at its antipode, |·| < 1e-9 at 90° of arc away.
  - `nightAlpha(5) === 0`, `nightAlpha(0) === 0`, `nightAlpha(-10) === 1`, `nightAlpha(-40) === 1`, non-decreasing as elevation falls from 10 to −20 in 0.5 steps.
  - `mercatorRowLatitude(0, 512)` between 85 and 85.0512; `f(r) === -f(511 - r)` (1e-9); `f(255.5 - 0.5, 512)` ≈ 0 (|·| < 0.4).
  - `nightMask(new Date("2024-03-20T12:00Z"), 64)`: equator row, column at lon ≈ 0 is 0; column at lon ≈ 180 is 1; all values in [0, 1].
- [ ] **Step 2:** `cd app && node --test test/night.test.mjs` → FAIL (module missing).
- [ ] **Step 3:** Implement `app/src/map/night.js`.
- [ ] **Step 4:** `cd app && node --test test/night.test.mjs test/boundaries.test.mjs` → PASS.
- [ ] **Step 5:** Commit `Compute the sun's position and the night mask for the satellite map`.

### Task 2: Satellite style — EOX 2025, labels, night slot

**Files:**
- Modify: `app/public/config.json` (satellite basemap), `app/public/lang.json` (7 keys × tr/en), `app/src/map/basemaps.js`, `README.md` (satellite paragraph)
- Test: `app/test/map-overlays.test.mjs`, `app/test/config.test.mjs`, `app/test/webpack-config.test.mjs` (origins unchanged — confirm)

**Interfaces — Produces (basemaps.js):**
- `NIGHT_SOURCE = "convert-night"`, `NIGHT_LAYER = "convert-night"`, `NIGHT_OPACITY = ["interpolate", ["linear"], ["zoom"], 3, 1, 6, 0]`
- `CONTINENT_SOURCE = "convert-continents"`, `CONTINENT_LAYER = "convert-continents"`
- `continentFeatures(continents: {id, latitude, longitude}[], names: Record<string, string>, language: string): GeoJSON.FeatureCollection` — Point features, `properties.label = names[id].toLocaleUpperCase(language === "tr" ? "tr-TR" : "en-US")`; ids without a name are skipped.
- `satelliteStyle(vectorStyle, raster, { continents } = {})` — as today, plus: kept `water_name` layers get `text-color: "#8fd0ff"`, `text-halo-color: "rgba(0, 16, 36, 0.78)"`, `text-halo-width: 1.3`; a `geojson` source `CONTINENT_SOURCE` (data `continents` or an empty collection) and a symbol layer `CONTINENT_LAYER` last in the list (`maxzoom: 3.5`, `text-field: ["get", "label"]`, `text-transform: "none"`, `text-letter-spacing: 0.3`, `text-size` about 13→16, `text-color: "#f4f7fb"`, dark halo, font from the style's bold glyphs).
- `firstLayerAboveImagery(layers: {id}[]): string | undefined` — id of the layer right after the `convert-satellite` raster.
- `basemapSource()` for a raster basemap also returns `night: basemap.night ?? null`, `continents: basemap.continents ?? null` (others: `null`).
- Config (satellite): `raster.tiles` → `…/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg`; `"night": { "lights": "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png", "zoom": 3 }`; `"continents"`: northAmerica (50, −102), southAmerica (−14, −59), europe (52, 18), africa (6, 20), asia (46, 92), oceania (−24, 134), antarctica (−80, 30).
- lang keys `mapContinentNorthAmerica … mapContinentAntarctica`: tr Kuzey Amerika, Güney Amerika, Avrupa, Afrika, Asya, Okyanusya, Antarktika; en North America, South America, Europe, Africa, Asia, Oceania, Antarctica.

- [ ] **Step 1: Write the failing tests:**
  - `continentFeatures` gives "KUZEY AMERİKA" for tr and "NORTH AMERICA" for en; skips an id with no name; coordinates are `[longitude, latitude]`.
  - `satelliteStyle(VECTOR_STYLE, raster, { continents })`: layer ids end with `CONTINENT_LAYER`; `water_name` paint has `#8fd0ff`; `style.sources[CONTINENT_SOURCE].data === continents`; without the option the source holds an empty collection.
  - `firstLayerAboveImagery(style.layers)` is `"boundary_2"` for the existing fixture (with and without fallback).
  - `basemapSource(satellite)` carries `night` and `continents`; standard has `night: null`.
  - config: satellite tiles match `s2cloudless-2025_3857`; credit text has `2025` and `CC BY-NC-SA 4.0`; a credit mentions `Black Marble`; `night.lights` is a GIBS `VIIRS_Black_Marble` template with `{z}/{y}/{x}`; 7 continents with numeric coordinates; keep the "no arcgis" check, drop the old "no 2018–2029 layer" check.
- [ ] **Step 2:** `cd app && node --test test/map-overlays.test.mjs test/config.test.mjs` → FAIL.
- [ ] **Step 3:** Implement config, lang, basemaps.js; update README's satellite paragraph (EOX 2025, CC BY-NC-SA 4.0, non-commercial; night side; labels).
- [ ] **Step 4:** `npm run test:app` → PASS (lang tests fail until Task 3 reads the keys; if so, do Step 5 after Task 3).
- [ ] **Step 5:** Commit `Use EOX 2025 imagery and Apple-like continent and ocean labels on the satellite map`.

### Task 3: Night layer in the map

**Files:**
- Create: `app/src/map/night-layer.js` (browser only)
- Modify: `app/src/map/useMapStage.js` (style.load, language effect, cleanup, transformStyle), `app/src/map/MapStage.jsx` (`labels.continents`)

**Interfaces:**
- Consumes: `nightMask`, `MERCATOR_LIMIT` (Task 1); `NIGHT_SOURCE`, `NIGHT_LAYER`, `NIGHT_OPACITY`, `firstLayerAboveImagery`, `continentFeatures`, `CONTINENT_SOURCE`, `basemapSource().night/continents` (Task 2).
- Produces: `createNightLayer({ lights: string, zoom: number }): { attach(map, beforeId?: string): void, detach(): void }`.
  - `attach`: adds the `canvas` source (`coordinates` ±180 × ±MERCATOR_LIMIT, `animate: false`, a detached 2048 × 2048 canvas) and the raster layer (`raster-opacity: NIGHT_OPACITY`, `raster-fade-duration: 0`) before `beforeId` unless present; first call starts loading the 4^zoom lights tiles (`crossOrigin = "anonymous"`) into an offscreen canvas; draws now, every 5 minutes, on lights loaded, and on `visibilitychange` to visible. Redraw = veil `rgba(3, 8, 20, 0.9)` fill, lights over it, `destination-in` with the 256 px mask scaled up; then `source.play(); source.pause()` to upload once.
  - `detach`: stops the timer and the visibility listener (the style switch already removed source and layer).
- useMapStage: `transformStyle` passes `{ continents: continentFeatures(current.continents ?? [], labels.continents ?? {}, language) }`; on `style.load`, `current.night && remote` → `nightRef.current ??= createNightLayer(current.night)` then `attach(map, firstLayerAboveImagery(map.getStyle().layers))`, else `nightRef.current?.detach()`; the language effect also `setData`s `CONTINENT_SOURCE`; unmount calls `detach()`. Night and continent sources never reach tile-health samples (check `event.sourceId` in `recordTileSample` if they do).

- [ ] **Step 1:** Implement `night-layer.js` and the wiring.
- [ ] **Step 2: First check (spike gate):** `preview_start app-dev`, switch to satellite, zoom out: the night side is drawn in 3D (globe) and 2D. If the globe does not draw a canvas source, switch to an `image` source fed by `canvas.toBlob` → `URL.createObjectURL` and `updateImage` (CSP allows `blob:`).
- [ ] **Step 3: Browser checks** — terminator matches the time (Europe dark at ~23:00 TR), lights visible, gone by zoom 6; Review Focus 1–5; no console errors.
- [ ] **Step 4:** `npm run test:app && npm run lint` → PASS.
- [ ] **Step 5:** Commit `Draw the live night side with city lights on the satellite map`.

### Task 4: Ship

- [ ] **Step 1:** `npm test && npm run lint && npm run build` → all pass.
- [ ] **Step 2:** `preview_start app-build-static`: production build under its CSP shows night, labels, EOX 2025; no CSP errors.
- [ ] **Step 3:** Commit spec and plan; fast-forward `main`, `git push origin main`.
- [ ] **Step 4:** Watch the Pages run (`gh run watch`), then open `https://omcoskun.github.io/convert-tools/` and check satellite night, labels, imagery.
