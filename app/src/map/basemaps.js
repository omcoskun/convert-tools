// The basemaps of config.json (map.basemaps) as the map draws them, and the
// colours that depend on them. Pure: tested in test/basemaps.test.mjs.
//
// A basemap is a vector style URL, optionally with a dark variant (the
// standard map follows the interface theme, as Apple Maps does) or a raster
// imagery layer drawn under the style's boundaries and place names
// (satellite). Its tone says what the lines, grids and scale bar drawn over
// it must contrast with: "light", "dark" or "imagery".

/** @typedef {{ text: string, href: string }} Credit */
/**
 * @typedef {{
 *   id: string,
 *   style: string,
 *   darkStyle?: string,
 *   raster?: { tiles: string, tileSize?: number, maxzoom?: number, fallback?: { tiles: string, tileSize?: number, maxzoom?: number } },
 *   night?: { lights: string, zoom: number },
 *   continents?: Continent[],
 *   attribution: Credit[],
 * }} Basemap
 *   night: the live night side drawn over the imagery (night-layer.js), its
 *   city lights from the `lights` tile template at `zoom`. continents: where
 *   the continent names go.
 */
/** @typedef {{ id: string, latitude: number, longitude: number }} Continent */

/** The basemap with `id`, else the first one. */
export function findBasemap(basemaps, id) {
  return basemaps.find((basemap) => basemap.id === id) ?? basemaps[0];
}

/**
 * What to load for a basemap in a theme.
 * @param {Basemap} basemap
 * @param {"light" | "dark"} mode the interface theme
 * @returns {{
 *   key: string,
 *   url: string,
 *   tone: "light" | "dark" | "imagery",
 *   palette: "positron" | "dark" | "none",
 *   keepRaster: boolean,
 *   raster: Basemap["raster"] | null,
 *   night: Basemap["night"] | null,
 *   continents: Continent[] | null,
 * }}
 *   key changes exactly when the map must load another style. A basemap with
 *   a dark variant is the app's own quiet map: it takes the house colours
 *   (palette) and no relief. Others keep their own look and relief.
 */
export function basemapSource(basemap, mode) {
  if (basemap.raster) {
    return {
      key: basemap.id,
      url: basemap.style,
      tone: "imagery",
      palette: "none",
      keepRaster: false,
      raster: basemap.raster,
      night: basemap.night ?? null,
      continents: basemap.continents ?? null,
    };
  }
  if (!basemap.darkStyle) {
    return { key: basemap.id, url: basemap.style, tone: "light", palette: "none", keepRaster: true, raster: null, night: null, continents: null };
  }
  const dark = mode === "dark";
  return {
    key: `${basemap.id}:${mode === "dark" ? "dark" : "light"}`,
    url: dark ? basemap.darkStyle : basemap.style,
    tone: dark ? "dark" : "light",
    palette: dark ? "dark" : "positron",
    keepRaster: false,
    raster: null,
    night: null,
    continents: null,
  };
}

/**
 * Colours of what the app draws over a basemap of a tone: the measured lines
 * (their casing, the plain non-gradient line and text on it, which is also
 * the ink pin), the latitude/longitude grid and the MGRS zones with their
 * labels.
 */
export const TONE_COLORS = Object.freeze({
  light: Object.freeze({
    casing: "#ffffff",
    line: "#16191c",
    grid: "rgba(24, 33, 47, 0.34)",
    gridMajor: "rgba(24, 33, 47, 0.5)",
    label: "#2a3646",
    halo: "rgba(255, 255, 255, 0.92)",
    zone: "rgba(109, 40, 217, 0.62)",
    zoneLabel: "#5b21b6",
    onLine: "#ffffff",
  }),
  dark: Object.freeze({
    casing: "#0b0f14",
    line: "#e7ecf2",
    grid: "rgba(231, 236, 242, 0.24)",
    gridMajor: "rgba(231, 236, 242, 0.42)",
    label: "#d5dde7",
    halo: "rgba(10, 14, 20, 0.88)",
    zone: "rgba(196, 181, 253, 0.6)",
    zoneLabel: "#ddd6fe",
    onLine: "#11161c",
  }),
  imagery: Object.freeze({
    casing: "#ffffff",
    line: "#16191c",
    grid: "rgba(255, 255, 255, 0.5)",
    gridMajor: "rgba(255, 255, 255, 0.62)",
    label: "#ffffff",
    halo: "rgba(0, 0, 0, 0.72)",
    zone: "rgba(253, 224, 71, 0.8)",
    zoneLabel: "#fef08a",
    onLine: "#ffffff",
  }),
});

export const SATELLITE_SOURCE = "convert-satellite";
const SATELLITE_LAYER = "convert-satellite";
export const SATELLITE_FALLBACK_SOURCE = "convert-satellite-fallback";
const SATELLITE_FALLBACK_LAYER = "convert-satellite-fallback";

// Kept from the vector style over imagery: boundaries and the names of
// places and waters, recoloured to read on photographs.
const OVERLAY_SOURCE_LAYERS = new Set(["boundary", "place", "water_name"]);

// The live night side (night-layer.js): a canvas source drawn right above
// the imagery, fading out as the map zooms in so measuring zooms stay day.
export const NIGHT_SOURCE = "convert-night";
export const NIGHT_LAYER = "convert-night";
export const NIGHT_OPACITY = Object.freeze(["interpolate", ["linear"], ["zoom"], 3, 1, 6, 0]);

// Continent names over the whole-world view, as Apple Maps writes them:
// spaced capitals that give way to the country names as the map zooms in.
export const CONTINENT_SOURCE = "convert-continents";
export const CONTINENT_LAYER = "convert-continents";
const EMPTY_COLLECTION = Object.freeze({ type: "FeatureCollection", features: Object.freeze([]) });

// Ocean and sea names in blue, as on Apple's satellite map.
const WATER_LABEL_COLOR = "#8fd0ff";

/**
 * The continent name points: each continent with a name, its label in
 * capitals of the app's language ("KUZEY AMERİKA", not the browser
 * locale's "KUZEY AMERIKA"), so the layer uses no text-transform.
 * @param {Continent[]} continents
 * @param {Record<string, string>} names by continent id
 * @param {string} language the app language
 */
export function continentFeatures(continents, names, language) {
  const locale = language === "tr" ? "tr-TR" : "en-US";
  return {
    type: "FeatureCollection",
    features: (continents ?? [])
      .filter(({ id }) => typeof names?.[id] === "string" && names[id] !== "")
      .map(({ id, latitude, longitude }) => ({
        type: "Feature",
        properties: { id, label: names[id].toLocaleUpperCase(locale) },
        geometry: { type: "Point", coordinates: [longitude, latitude] },
      })),
  };
}

/** The id of the layer right above the satellite imagery: the night layer goes under it. */
export function firstLayerAboveImagery(layers) {
  const index = (layers ?? []).findIndex((layer) => layer.id === SATELLITE_LAYER);
  return index < 0 ? undefined : layers[index + 1]?.id;
}

/** The style's bold font for the continent names, else its first font. */
function boldFont(layers) {
  let found = null;
  for (const layer of layers) {
    const font = layer.type === "symbol" ? layer.layout?.["text-font"] : undefined;
    if (!Array.isArray(font) || font.length === 0) continue;
    if (/bold/i.test(font[0])) return font;
    found ??= font;
  }
  return found ?? ["Noto Sans Bold"];
}

/**
 * The satellite style: `vectorStyle` (a fetched OpenMapTiles style) reduced to
 * its boundary lines and place and water names, recoloured for imagery, over
 * a raster source of `raster`. Glyphs, sprite and the vector source stay.
 * @param {object} vectorStyle
 * @param {NonNullable<Basemap["raster"]>} raster
 * @param {{ continents?: object }} [options] continents: the continent name
 *   points (continentFeatures), drawn above every other label
 */
export function satelliteStyle(vectorStyle, raster, { continents } = {}) {
  if (!vectorStyle || !Array.isArray(vectorStyle.layers)) return vectorStyle;
  const kept = vectorStyle.layers
    .filter((layer) => OVERLAY_SOURCE_LAYERS.has(layer["source-layer"]) && (layer.type === "symbol" || layer.type === "line"))
    .map((layer) => {
      if (layer.type === "line") {
        return { ...layer, paint: { ...layer.paint, "line-color": "rgba(255, 255, 255, 0.55)" } };
      }
      const water = layer["source-layer"] === "water_name";
      return {
        ...layer,
        paint: {
          ...layer.paint,
          "text-color": water ? WATER_LABEL_COLOR : "#ffffff",
          "text-halo-color": water ? "rgba(0, 16, 36, 0.78)" : "rgba(0, 0, 0, 0.72)",
          "text-halo-width": 1.3,
          "text-halo-blur": 0.4,
        },
      };
    });
  const rasterSource = ({ tiles, tileSize, maxzoom }, defaultMaxzoom) => ({
    type: "raster",
    tiles: [tiles],
    tileSize: tileSize ?? 256,
    maxzoom: maxzoom ?? defaultMaxzoom,
  });
  const sources = Object.fromEntries(Object.entries(vectorStyle.sources ?? {}).filter(([, source]) => source?.type !== "raster"));
  return {
    ...vectorStyle,
    sources: {
      ...sources,
      // A coarse, public-domain mosaic drawn under the sharp imagery: wherever
      // a sharp tile is missing or still loading, the map shows this one
      // (stretched) instead of an empty background.
      ...(raster.fallback ? { [SATELLITE_FALLBACK_SOURCE]: rasterSource(raster.fallback, 8) } : {}),
      [SATELLITE_SOURCE]: rasterSource(raster, 14),
      [CONTINENT_SOURCE]: { type: "geojson", data: continents ?? EMPTY_COLLECTION },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#0b1622" } },
      ...(raster.fallback ? [{ id: SATELLITE_FALLBACK_LAYER, type: "raster", source: SATELLITE_FALLBACK_SOURCE, paint: { "raster-fade-duration": 0 } }] : []),
      { id: SATELLITE_LAYER, type: "raster", source: SATELLITE_SOURCE, paint: { "raster-fade-duration": 150, "raster-contrast": 0.06, "raster-saturation": 0.08 } },
      ...kept,
      // Last, so its names win label collisions over country names.
      {
        id: CONTINENT_LAYER,
        type: "symbol",
        source: CONTINENT_SOURCE,
        maxzoom: 3.5,
        layout: {
          "text-field": ["get", "label"],
          "text-font": boldFont(kept),
          "text-size": ["interpolate", ["linear"], ["zoom"], 0, 12, 3, 16],
          "text-transform": "none",
          "text-letter-spacing": 0.3,
          "text-max-width": 8,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#f4f7fb",
          "text-halo-color": "rgba(0, 0, 0, 0.6)",
          "text-halo-width": 1.2,
          "text-halo-blur": 0.4,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 2.8, 1, 3.5, 0],
        },
      },
    ],
  };
}

// How the map judges its tiles. Every tile load and failure of the last
// TILE_WINDOW_MS is a sample; the basemap is "partial" only when failures are
// numerous (at least TILE_MIN_FAILURES) and a real share (TILE_FAILURE_RATIO)
// of the samples. Cancelled requests (zooming away from a tile) never count.
export const TILE_WINDOW_MS = 10000;
export const TILE_MIN_FAILURES = 3;
export const TILE_FAILURE_RATIO = 0.25;

/**
 * The tile sample a MapLibre event stands for: `{ ok: true }` for a loaded
 * tile, `{ ok: false }` for a failed request, else null (including aborts).
 * @param {{ type?: string, dataType?: string, tile?: { state?: string }, error?: { name?: string } }} event
 */
export function tileSample(event) {
  if (!event) return null;
  if (event.type === "error") {
    const name = event.error?.name;
    return name === "AbortError" || name === "CancelledError" ? null : { ok: false };
  }
  if (event.type === "data" && event.dataType === "source" && event.tile?.state === "loaded") return { ok: true };
  return null;
}

/** The samples still inside the window ending at `now`. */
export function pruneTileSamples(samples, now, windowMs = TILE_WINDOW_MS) {
  return samples.filter((sample) => now - sample.at <= windowMs);
}

/** Whether the samples in the window show a failing basemap. */
export function tilesFailing(samples, now, { windowMs = TILE_WINDOW_MS, minFailures = TILE_MIN_FAILURES, ratio = TILE_FAILURE_RATIO } = {}) {
  const recent = pruneTileSamples(samples, now, windowMs);
  const failures = recent.filter((sample) => !sample.ok).length;
  return failures >= minFailures && failures / recent.length >= ratio;
}
