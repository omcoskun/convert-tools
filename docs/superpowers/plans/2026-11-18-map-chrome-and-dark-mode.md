# Map chrome, layers and dark mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A calmer, faster workspace map with a basemap/overlay catalogue, Apple-style scale and attribution, expected map features, and a site-wide dark mode.

**Architecture:** Tokens become CSS variables fed by two palettes; MUI gets one theme per mode. Map chrome is small React components driven by MapLibre events through refs. Basemaps, their attributions and every tile origin live in `config.map`; the CSP is derived from them.

**Tech Stack:** React 18 JSX, MUI 5 (via `src/ui/index.js`), MapLibre GL JS 6.16, `@convert-tools/core`, node:test.

**Spec:** `docs/superpowers/specs/2026-11-18-map-chrome-and-dark-mode-design.md`

**Execution:** native, in this session (owner said "start"; Pro-plan agent budget).

## Global Constraints

- No new dependency; MUI only through `src/ui/index.js`; `maplibre-gl` only via `src/map/maplibre.js`.
- Every visible string in `public/lang.json` for `tr` and `en`; no unused keys.
- Trigonometry only in modules whitelisted in `test/boundaries.test.mjs`.
- No `window`/`document` access during render or module load; storage access wrapped in try/catch.
- Browser floor Chrome 90 / Safari 14: no CSS that breaks there without a plain fallback.
- WCAG AA 4.5:1 text, 3:1 focus rings, in both palettes.
- Do not commit (owner has not asked).

## Review Focus

- Storage blocked (private mode): theme, basemap and overlay choices fall back to defaults without throwing — `prefs.test.mjs`.
- Remote basemap fails while dark/satellite is selected: offline grid in the active tone, retry reloads the selected basemap — browser check.
- Switching basemap or theme while a scene is drawn: line layers, gradient pieces and pins survive the style swap — browser check plus `installLineLayers` on every `style.load`.
- Scale at extreme zoom/latitude (world view, poles, z20): finite nice numbers, never NaN — `scale.test.mjs`.
- Right-click on space around the globe: no menu — `lngLatOnMap` guard reused.

---

### Task 1: Resolve the stale 2D tests

**Files:** Modify `app/test/map-view.test.mjs`, `app/test/scene.test.mjs`

- [ ] Save `git diff app/test` to the scratchpad as `stale-2d-tests.patch`.
- [ ] Remove the three uncommitted tests (they contradict the committed `constrainView` 2D test).
- [ ] Run `npm test --workspace @convert-tools/app` → 0 failures.

### Task 2: Palettes, CSS variables and the theme switch

**Files:**
- Modify: `app/src/theme.js`, `app/src/App.jsx`, `app/src/index.jsx`, `app/src/shell/TopBar.jsx`, components with surface colours (`ResultHud`, `Readout`, `Segmented`, `Chips`, `CopyButton`, `PointField`, `WorkspaceLayout`, `MapStage`)
- Create: `app/src/lib/prefs.js`, `app/src/shell/ThemeMenu.jsx`
- Test: `app/test/kit.test.mjs`, `app/test/prefs.test.mjs`

**Interfaces:**
- Produces: `PALETTES: { light, dark }` (hex/rgba strings, same keys); `COLORS[key] === "var(--ct-<key>)"`; new keys `panel`, `selected`, `onSelected`; `ACCENT_HEX = { a, b, ink }` for places that need literal colours (SVG data URLs); `createAppTheme(mode: "light"|"dark")`; `readPref(key, fallback)`, `writePref(key, value)` (namespaced `convert-tools:`); `resolveTheme(pref, systemDark) -> "light"|"dark"`.

- [ ] Test: contrast loop runs over both palettes (same pairs as today plus `onSelected` on `selected`, `onInk` on `panel`); both palettes have identical keys; `COLORS` values are `var(--ct-…)`.
- [ ] Test: `readPref` returns fallback when storage throws; `resolveTheme("system", true) === "dark"`.
- [ ] Implement; CssBaseline override writes `:root { --ct-*: …; color-scheme }`; `index.jsx` sets `data-theme` and background before render.
- [ ] `ThemeMenu`: icon button in the top bar opening a 3-item radio menu (system/light/dark), Esc and outside click close it.
- [ ] Run app tests → pass.

### Task 3: Basemap catalogue, CSP, satellite style, overlays

**Files:**
- Modify: `app/public/config.json`, `app/webpack.config.js`, `app/src/map/map-adapter.js`
- Create: `app/src/map/basemaps.js`, `app/src/map/graticule.js`, `app/src/map/mgrs-zones.js`
- Test: `app/test/config.test.mjs`, `app/test/webpack-config.test.mjs`, `app/test/basemaps.test.mjs`, `app/test/graticule.test.mjs`, `app/test/mgrs-zones.test.mjs`, `app/test/boundaries.test.mjs`

**Interfaces:**
- `config.map = { basemaps: [{ id, style?, darkStyle?, raster?: { tiles, maxzoom, tileSize }, labels?, attribution: [{ text, href }] }], defaultBasemap }`.
- `MAP_ORIGINS` (webpack) = sorted unique origins of every URL in `config.map`.
- `basemapStyle(entry, theme) -> { url, tone: "light"|"dark", kind }`; `satelliteStyle(vectorStyle, raster, language) -> style` keeps only boundary lines and place/water labels, recoloured for imagery, under-laid by the raster.
- `graticuleInterval(zoom) -> degrees`; `graticuleFeatures(bounds, interval, language) -> FeatureCollection` (lines with `label`).
- `mgrsZoneCells() -> [{ zone, band, west, south, east, north }]`; `mgrsZoneFeatures() -> FeatureCollection` (outline lines + label points).

- [ ] Tests: CSP `connect-src 'self'` + exactly `MAP_ORIGINS`; config URLs all https; satellite attribution names EOX and CC BY 4.0; `satelliteStyle` has the raster first and no fill layers; graticule interval shrinks with zoom from 30° to 1′ and labels read `40°K`/`40°N`; MGRS has 1197 cells (60×20 − 3 missing X + exceptions), 32V spans 3–12°E, 31X 0–9°E, no 32X/34X/36X, and `encodeMgrs` at every cell centre starts with its label.
- [ ] Implement; whitelist `graticule.js` and `scale.js` for presentation math.
- [ ] Run app tests → pass.

### Task 4: Map chrome

**Files:**
- Modify: `app/src/map/MapStage.jsx`, `app/src/map/useMapStage.js`, `app/src/components/Icon.jsx`, `app/public/lang.json`
- Create: `app/src/map/scale.js`, `app/src/map/ScaleBar.jsx`, `app/src/map/Attribution.jsx`, `app/src/map/LayerPanel.jsx`, `app/src/map/Compass.jsx`
- Test: `app/test/scale.test.mjs`, `app/test/render.test.mjs` (server render of the new parts)

**Interfaces:**
- `niceScale(metresPerPixel, maxPx, unit: "metric"|"nautical"|"imperial") -> { widthPx, end, mid, unitLabel }`.
- `useMapStage` returns also `basemap`, `setBasemap`, `overlays`, `setOverlay`, `tone`, `mapRef`-backed `subscribe(event, fn)` for chrome components.

- [ ] Test `niceScale`: 1-2-5 ends, width ≤ maxPx, metres below 1 km, NM and mi/ft, finite for 1e-3 … 1e6 m/px.
- [ ] Implement controls column, compass (ref-driven), scale bar (fade, unit cycle, always-show), attribution ⓘ (5 s expanded), layer panel; remove world button; lang keys.
- [ ] Run app tests → pass.

### Task 5: Context menu and my location

**Files:** Create `app/src/map/ContextMenu.jsx`, `app/src/map/location.js`; modify `useMapStage.js`, `MapStage.jsx`, `lang.json`. Test `app/test/location.test.mjs`.

- `accuracyRing(point, metres, steps = 64) -> [lng, lat][]` (closed ring via core `directGeodesic`).
- [ ] Test ring closes, all vertices at `metres` per `inverseGeodesic` (±1 mm).
- [ ] Implement; menu rows DD and MGRS (formatted with spaces) copy via `lib/clipboard.js`.

### Task 6: Performance

- [ ] Baseline: dev-only probe measuring frame times for 3 s rotate, pan and zoom.
- [ ] Apply spec items; keep only measured wins; remove the probe.

### Task 7: Verify

- [ ] `npm test`, `npm run lint`, `npm run build` from the repo root.
- [ ] Browser: light/dark, three basemaps, overlays, scale, attribution, context menu, location error path, 2D/3D, phone width, offline fallback.
- [ ] README map section updated.
