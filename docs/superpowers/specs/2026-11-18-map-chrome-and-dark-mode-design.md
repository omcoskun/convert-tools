# Map chrome, layers and dark mode

## Intent

The owner asked for a senior UI/UX pass on the workspace map: remove what is not
needed, make the map faster, add the features people expect from a map, an
Apple Maps style dynamic scale bar, a quieter attribution, quality extra layers,
and a dark mode for the whole site. How it is built was left to Claude.

Success: the map reads as one calm, coherent surface in light and dark; the
controls are fewer and clearer; layers and grids are useful for a coordinate
tool; panning, rotating and zooming are measurably cheaper; nothing the tools
do today (picking, fits, polar and date-line drawing, offline fallback) breaks.

Anti-goals: a cluttered control panel, a dark mode that leaves light islands,
any new dependency, any data sent to a third party other than map tiles.

## Constraints (unchanged unless stated)

- React 18 JSX, Webpack 5, Babel 7, MUI 5 behind `src/ui/index.js`; no new
  dependency; every visible string in `lang.json` (tr, en); settings in
  `config.json`; server-rendered tests must not touch `window` during render.
- Trigonometry only in presentation modules listed in `boundaries.test.mjs`
  (now also the new grid and scale modules). Geodesy comes from the core.
- **Changed by the owner:** the first design excluded raster and satellite
  sources. This pass adds a satellite basemap and keeps Liberty's relief
  raster. The CSP `connect-src` is built from every origin in `config.map`.

## Approaches considered

1. **Restyle MapLibre's own controls with CSS.** Least code, but the native
   scale control cannot fade, segment or switch units, and the native
   attribution renders remote HTML. Rejected.
2. **Own React chrome over MapLibre, basemap catalogue in config (chosen).**
   Scale bar, attribution, layer panel, compass, context menu and location
   are small components driven by map events through refs, not per-frame
   React state. Basemaps and their attributions are data in `config.json`.
3. **A basemap/controls plugin package.** Violates the no-dependency rule.

## Design

### Theme and dark mode

- `theme.js` keeps the token names but holds two palettes (`PALETTES.light`,
  `PALETTES.dark`). `COLORS.*` become `var(--ct-*)` references, so every
  `sx` switches with no re-render logic; MUI gets a theme per mode whose
  CssBaseline writes the variables on `:root` with `color-scheme`.
- Surfaces that are dark in light mode (result HUD, readout, tooltips) use a
  `panel` token, which stays dark in dark mode; selected/pressed states use
  `selected`/`onSelected` (ink on light, near-white on dark).
- Accent A/B stay the same hues; their soft and text variants have dark
  values. WCAG AA contrast is tested for both palettes.
- Preference: system (default), light, dark; a compact menu button in the top
  bar; stored in `localStorage` (guarded); applied to `<html data-theme>`
  before first paint from `index.jsx` to avoid a flash.

### Basemaps and overlays

Catalogue in `config.map`:

| id | light UI | dark UI |
|---|---|---|
| standard | OpenFreeMap positron (tuned) | OpenFreeMap dark (tuned) |
| detailed | OpenFreeMap liberty (relief, 3D buildings) | same |
| satellite | EOX Sentinel-2 cloudless 2017 (CC BY 4.0) + label/boundary layers of the vector style, recoloured for imagery | same |

Each entry carries its attribution as structured `{ text, href }` items; the
app never renders HTML from a remote style. "Standard" follows the UI theme
(Apple-like) so there is no separate dark map type. Lines, casing and the
polar overlay take their colours from the basemap tone (light/dark).

Overlays, both off by default:
- Latitude/longitude graticule whose interval follows the zoom (30° … 1′),
  regenerated for the visible area on `moveend`, labelled along the lines
  (40°K / 40°N) where the style has glyphs.
- MGRS grid zone designators: 6° × 8° cells from 80°S to 84°N with the
  Norway (31V/32V) and Svalbard (31X–37X) exceptions, labelled `35T`. A test
  checks every label against the core's `encodeMgrs` at the cell centre.

### Controls (one right-hand column)

`[layers] [3D]` · `[+] [−]` · compass (only while rotated or tilted) ·
`[fit] [my location] [enlarge]`. Removed: the "whole world" button (the zoom
floor already shows the world) and the always-visible compass; the 2D|3D pair
becomes one pressed/unpressed 3D button.

- **Layer panel:** popover with three illustrated cards (radio group), the two
  overlay switches and "always show scale". Choices are remembered locally.
- **Scale bar:** Apple style: alternating segments, `0 · mid · end unit`
  labels with a halo matched to the basemap tone. Appears while zooming and
  fades about 1.5 s after; hover/focus keep it; "always show" pins it. Click
  cycles metric → nautical → imperial. Length from the core's
  `inverseGeodesic` across the padded centre; nice numbers 1-2-5.
- **Attribution:** an ⓘ in the bottom-right corner, shown expanded for 5 s
  after a basemap loads (OSMF guidelines allow fading and collapsing), then
  collapsed; click/Enter expands, Esc or outside click collapses.
- **Context menu:** right-click (or long-press) shows the point in decimal
  degrees and MGRS, each copied with one click; closes on map movement.
- **My location:** toggle; `watchPosition` while on; blue dot plus a
  geodesic accuracy circle (core `directGeodesic`); flies there on the first
  fix; errors as a short notice; the dot never blocks picking.
- Cursor readout keeps its corner, restyled as a pill.

### 2D behaviour and the stale tests

The committed 2D design (world repeats sideways, Mercator edge kept at the
map edge) stays. Three uncommitted tests (`constrainFlatCenter`,
`sceneBounds(..., { wrap: false })`) predate that commit, contradict its
committed tests and were left out of it; they are removed (patch kept in the
scratchpad) rather than implemented as dead code.

### Performance

Measured before and after with a scripted rotate/pan/zoom in the dev build:
- compass angle and map-centre CSS variables written through refs, not React
  state or per-frame style writes;
- polar overlay does no DOM work when it has nothing to draw;
- navigation updates suppressed while a fit probes cameras;
- star backdrop: local glows instead of full-canvas gradient fills, redraw
  only on a real size change;
- MapLibre: `pixelRatio` capped at 2, `validateStyle: false`,
  `refreshExpiredTiles: false`; `preconnect` to the tile origins when the
  map chunk is prefetched.

## Left to the builder

Exact dark palette values (within the AA tests), card illustrations, label
fonts per style, graticule density thresholds, and which perf items survive
measurement.

## Verification

Unit tests for every pure helper (palettes, scale numbers, graticule, MGRS
zones, basemap catalogue/CSP, satellite style transform); full app and core
tests, ESLint, production build; browser checks of light/dark, each basemap,
overlays, scale, attribution, context menu, 2D/3D, phone layout and the
offline fallback.
