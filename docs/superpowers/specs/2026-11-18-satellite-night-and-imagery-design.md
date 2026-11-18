# Satellite map: live night side, labels and sharper imagery

## Intent

The owner showed Apple Maps' satellite globe (iPhone, 23:39 Turkey time):
the half of the Earth in darkness is dark blue with yellow city lights, the
sunlit half is normal imagery, continent names are spaced capitals
("KUZEY AMERİKA", "AVRUPA") and ocean names are blue ("Kuzey Atlas
Okyanusu"). They want the app's satellite map to look like that, and to be
as sharp up close as MarineTraffic's satellite map.

Decided with the owner (2026-11-18):

- The night side is the **live day/night line** from the sun's real
  position, as Apple draws it, not a night look tied to the dark theme.
- **Nothing paid and no payment details.** Free sources only; an account
  is fine if it needs no card and cannot bill.
- The site is **non-commercial**, so non-commercial licences are allowed.
- Night layer approach **A** (below): the browser draws the night image.

Success: zoomed out on the satellite map, the night side matches the real
time and shows city lights with a soft twilight band; continent and ocean
names read like Apple's; zoomed in to a street, imagery is sharp where
MapTiler has it, and the map never shows white or broken tiles when it
does not.

## Findings that shaped this

- MarineTraffic draws Mapbox raster tiles (Leaflet + `api.mapbox.com`
  styles, checked in its network requests). Mapbox needs a card; Esri's
  keyless endpoint is outside its terms for a public site. Both are out.
- The current imagery, EOX Sentinel-2 cloudless 2016, is 10 m per pixel:
  no setting makes it sharper beyond about zoom 14.
- EOX 2024 and 2025 mosaics are served keyless at
  `tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/...`, licensed
  CC BY-NC-SA 4.0 (non-commercial, attribution). Checked: real imagery on
  every continent at zoom 6 and zoom 12 (the 2017 layer once showed white
  land outside Europe, commit b11b3fa; 2025 does not).
- MapTiler's free plan needs no card, stops at its quota instead of
  billing, includes its global high-resolution satellite map, is limited
  to non-commercial use, and requires the MapTiler logo (linking to
  maptiler.com) on screen plus text attribution. Third-party sources give
  its quota as about 100,000 requests a month (not confirmed on
  MapTiler's own page).
- NASA GIBS serves `VIIRS_Black_Marble` (2016, public domain) as EPSG:3857
  PNG tiles to level 8 with `Access-Control-Allow-Origin: *` (checked), so
  the browser may draw them into a canvas.
- The positron style used under satellite has no continent label layer
  (its `label_other` excludes `continent`). Its water labels already use
  `Noto Sans Italic` with letter spacing 0.2; today the satellite style
  only recolours them to `#cfe4ff` (near white).
- MapLibre's `text-transform: uppercase` calls `toLocaleUpperCase()` with
  the browser's locale, not the app language, so "Amerika" becomes
  "AMERIKA" (dotless I) in an English browser even when the app is
  Turkish.

## Goals

1. Live night side on the **satellite** basemap at world and continent
   zooms, in globe (3D) and flat (2D) views, with NASA city lights and a
   soft twilight band; gone by city zoom.
2. Continent names in spaced capitals and blue italic ocean and sea names
   on the satellite basemap, in the app language (TR/EN).
3. EOX 2025 imagery replaces EOX 2016 for every zoom it covers.
4. *(Deferred, see Scope below.)* MapTiler satellite imagery at close
   zooms when a key is configured, falling back silently to EOX when there
   is no key, a wrong key, or the monthly quota is used up.

## Scope (owner, 2026-11-19)

Build and publish goals 1–3 now: the night side, the labels and EOX 2025.
MapTiler (goal 4, the detail imagery, key, logo and section 5 below) is
deferred; the owner will look at it later. Nothing in this pass may depend
on a MapTiler key.

## Non-goals

- Night on the standard or detailed basemaps.
- Choosing the time (no time slider); it is always "now" on the device.
- A night look tied to the dark theme.
- Changing the star backdrop, atmosphere or 3D terrain.
- Fixing the browser-locale uppercase of country names that already exists
  on all basemaps (noted above; separate work if wanted).

## Anti-goals (fail even if it works)

- Any paid service, payment details, or a service that can bill.
- The MapTiler key committed to the repository.
- The night layer darkening imagery at measuring zooms, or covering the
  measured lines, pins, labels, picking crosshair or grids.
- A "basemap partly unavailable" notice because MapTiler's quota ran out
  or there is no key.
- Per-frame JavaScript work while panning, rotating or zooming.

## Constraints

- React 18 JSX, Webpack 5, Babel 7, MapLibre GL JS 6.16, MUI behind
  `src/ui/index.js`; **no new dependency**.
- Every visible string in `lang.json` (tr, en); map settings in
  `public/config.json`.
- The production CSP is built from the origins in `config.map`
  (`mapOrigins` in `webpack.config.js`); every new tile origin must be in
  `config.json` so it lands in `img-src`/`connect-src`.
- Trigonometry only in presentation modules listed in
  `app/test/boundaries.test.mjs`. The sun-position and Mercator-row maths
  are presentation maths (decoration, not geodesy): add the new module to
  that list with a comment saying so.
- Pure helpers are tested with `node --test` and must not touch `window`
  or `document` at import time.

## Approaches (night layer)

- **A. Browser-drawn night image (chosen).** A canvas holds one Web
  Mercator world image: a dark veil plus NASA lights, cut to the night
  side by the sun's position with a soft twilight edge. It is redrawn every
  few minutes and drawn by MapLibre as an ordinary raster layer over the
  imagery. Works the same in globe and flat views, loads about 64 small
  NASA tiles once, keeps the sun maths pure and testable. Costs: lights
  soften past country zoom (where the layer has faded out anyway); on the
  globe the polar caps beyond ±85.05° are not darkened.
- **B. Custom WebGL shader layer.** Per-pixel exact terminator and sharp
  lights, but MapLibre's custom-layer API for the globe is complex and
  changes between versions; much harder to test and maintain. Rejected.
- **C. Dark polygon plus glowing city dots.** Simplest, but the lights
  would be dots from a city list, not the real light pattern Apple shows.
  Rejected.

## Design

### 1. Sun and night mask (pure module, e.g. `src/map/night.js`)

- `subsolarPoint(date)` → `{ latitude, longitude }` of the point where the
  sun is overhead, from a low-precision solar formula (NOAA / Astronomical
  Almanac; error well under 0.5°, plenty for a twilight band).
- `sunElevation(latitude, longitude, subsolar)` → degrees above the
  horizon (spherical Earth, no refraction).
- `nightAlpha(elevation)` → 0 in full day, 1 in full night, smooth in
  between. Day must be fully clear at elevation ≥ 0°; full night by −12°
  at the latest. The exact curve is the builder's.
- `mercatorRowLatitude(row, rows)` → latitude of a canvas row of a Web
  Mercator world square (±85.0511°).
- `nightMask(date, size)` → a `size × size` array of alphas (row-major),
  built from the functions above.

### 2. Night image and layer (browser module, e.g. `src/map/night-layer.js`)

- **Lights:** NASA GIBS `VIIRS_Black_Marble`, EPSG:3857, level 3 (8 × 8
  tiles of 256 px = a 2048 px world), loaded with `crossOrigin =
  "anonymous"` the first time the satellite basemap is shown, kept in
  memory for the page's life. The GIBS template goes in `config.json`
  (e.g. `map.night.lights`) so its origin is already in the CSP (GIBS is
  already there for the fallback).
- **Composite** on a 2048 × 2048 canvas: a dark navy veil, then the lights
  in a warm tint added on top ("lighter" or "screen"), then cut by the
  night mask so day pixels are fully transparent. The mask is computed
  small (about 256 × 256) and scaled up with image smoothing, so a redraw
  costs milliseconds.
- **Redraw:** when the layer first appears, every 5 minutes while the
  satellite basemap is shown and the page is visible, and on returning to
  a visible page. Never per frame.
- **MapLibre:** a `canvas` source covering the Mercator world square
  (±180°, ±85.0511°), not animated; after a redraw the new pixels are
  pushed once (the mechanism is the builder's) and the map repaints.
- **Layer** `convert-night` (raster), above the EOX and MapTiler rasters
  and below the kept boundary and label layers; the app's own lines, pins
  and grids are added above the style and stay on top. `satelliteStyle`
  stays pure (it runs in Node tests, where no canvas exists): either it
  names the slot and the browser module adds the source and layer after
  each style load with `beforeId`, or the canvas is passed in; the
  builder chooses. Either way the layer must come back after every basemap,
  theme or language switch, as the app's other layers do.
- **Credit:** the satellite credits add NASA's Black Marble (GIBS) next to
  the existing Blue Marble credit. `raster-opacity` interpolates on zoom: full up to about zoom 3,
  zero by zoom 6 at the latest. `raster-fade-duration: 0`.
- **Failures:** a lights tile that fails leaves its square as veil only;
  if the canvas source cannot be created, the map is unchanged. Night
  tiles never count towards the basemap's tile-health samples.
- **First build step (spike):** confirm that MapLibre 6.16 draws a canvas
  source on the globe projection and in Mercator, and that updating it
  works. If the globe does not draw it, use an `image` source with a
  `blob:` URL regenerated on each redraw (`updateImage`); the CSP already
  allows `blob:` and `data:` images.

### 3. Labels (satellite style only)

- **Continents:** a GeoJSON source of 7 points (North America, South
  America, Europe, Africa, Asia, Oceania, Antarctica); positions in
  `config.json` (`map.continents`, Apple-like placements; builder's call),
  names in `lang.json`. The app uppercases them itself with
  `toLocaleUpperCase(language)` ("KUZEY AMERİKA" in Turkish, "NORTH
  AMERICA" in English) and sets `text-transform: none`, so the result does
  not depend on the browser locale. Spaced capitals (letter spacing about
  0.3 em), near-white with a dark halo, a font from the style's glyphs.
  Shown at zoom 0 to about 3, fading out before country labels take over.
  Switching the language updates them, like the existing localized
  labels.
- **Oceans and seas:** the kept `water_name` layers get a clear blue text
  colour that reads on dark imagery and on the night veil (Apple-like light
  blue, roughly `#8fd0ff`), a dark blue-black halo, the existing italic
  font and spacing; oceans may be a little larger than seas. Exact values
  are the builder's.
- Standard and detailed basemaps keep their current labels.

### 4. Imagery

- **EOX 2025 for all zooms it has.** `raster.tiles` becomes
  `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg`
  (maxzoom 14, overzoomed beyond). The NASA Blue Marble fallback stays.
  Credit: "Sentinel-2 cloudless 2025 by EOX IT Services GmbH (contains
  modified Copernicus Sentinel data 2025), CC BY-NC-SA 4.0" linking to
  `https://s2maps.eu`. README and `config.test.mjs` follow.
- **MapTiler detail imagery** as a third raster source (e.g.
  `raster.detail`), drawn above EOX from zoom 13 (`minzoom: 13`), so EOX
  shows underneath wherever MapTiler is missing, loading or refused.
  Template in `config.json` without the key:
  `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg`; the
  builder confirms tile size and maxzoom from MapTiler's TileJSON once a
  key exists.
- **Key:** read at build time from the environment variable
  `MAPTILER_KEY` and embedded with `DefinePlugin` (as `IWC` is). Empty or
  unset means no detail source at all: local development, tests and CI
  need no key. `.github/workflows/pages.yml` passes
  `secrets.MAPTILER_KEY` to the build step. The key is visible in the
  published site (normal for a browser key); the owner restricts it to
  `omcoskun.github.io` and `localhost` in MapTiler's dashboard.
- **Quota, bad key, outage:** errors and loads from the detail source are
  left out of the tile-health samples, so they never raise the "partial"
  notice. After repeated detail failures in one session the app may stop
  requesting the detail source until reload (builder's call).
- **MapTiler credit:** while the detail source is in use (satellite
  basemap, key present, zoom ≥ 13) the map shows the MapTiler logo,
  self-hosted (CSP `img-src 'self'`), small in a corner, linking to
  `https://www.maptiler.com`, and the credits add "© MapTiler" as
  MapTiler's attribution guide asks. Placement must not collide with the
  scale bar, readout or attribution button.

### 5. Owner's part

Create a free MapTiler account (no card), create an API key restricted to
`omcoskun.github.io` and `localhost`, and add it as the repository secret
`MAPTILER_KEY` (or hand it to Claude to set with `gh secret set`). The
night side, labels and EOX 2025 do not wait for this.

## Left to the builder

Exact colours, twilight curve and fade zooms within the limits above;
continent positions; the canvas update mechanism; the logo asset and its
exact placement; whether to stop detail requests after repeated failures.

## Verification

- Unit tests: subsolar point at known instants (equinox and solstices
  against NOAA values, within 0.5°), `nightAlpha` monotonic and clamped,
  Mercator row ↔ latitude, `nightMask` day/night at chosen points;
  `satelliteStyle` output (layer order: background, fallback, EOX, detail,
  night, kept layers; detail only with a key; water label paint; continent
  layer); continent names uppercased per language (Turkish İ); credits;
  CSP origins include `api.maptiler.com`; boundaries test lists the new
  module; tile-health ignores detail and night sources.
- Existing app and core tests, ESLint and the production build pass.
- Browser (dev and production build): satellite at world zoom shows the
  night side matching a reference day/night map at the same instant;
  lights visible; fades out by zoom 6; globe and flat views; light and
  dark themes; TR and EN labels (İ in Turkish); with a key, sharp imagery
  at zoom 16+ in Istanbul and the MapTiler logo shown; without a key and
  with a wrong key, EOX only and no "partial" notice; no console or CSP
  errors; panning and rotating no slower than before (no per-frame work).
