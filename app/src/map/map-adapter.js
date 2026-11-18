// Pure helpers between the workspace tools and MapLibre. Nothing here needs
// WebGL or a DOM, so the display limits, line geometry, fit padding and
// basemap style rules are unit tested (test/map-adapter.test.mjs). What a
// tool draws is described by a scene (scene.js).

import { flatLatitude } from "./map-view.js";

// The map is a globe (MapLibre's globe projection: a sphere up to zoom 11,
// Web Mercator from zoom 12), as zoomed-out Google Maps and Mapbox maps are:
// no copies of the world side by side, and the poles are on the map.
export const MAP_PROJECTION = Object.freeze({ type: "globe" });

// Web Mercator ends at ±85.0511°, and so do MapLibre's GeoJSON tiles at every
// zoom, on the globe too: a line's stretch beyond is drawn over the map from
// screen points (screenRuns), and fits stop at the edge.
export const MERCATOR_LATITUDE_LIMIT = 85.0511287798066;

// Same as COLORS.a, COLORS.b and COLORS.ink in theme.js (kept here so this
// module has no dependency on the component library). A line with a
// gradient runs from a to b; other lines are ink.
export const LINE_COLORS = Object.freeze({ a: "#2450e0", b: "#e2492c", ink: "#16191c" });

/**
 * Widths in px of the lines and their white casing, growing linearly from
 * LINE_WIDTH_ZOOMS[0] to [1] (MapLibre's line-width and the stretches drawn
 * over the pole alike).
 */
export const LINE_WIDTHS = Object.freeze({ line: Object.freeze([3, 5]), casing: Object.freeze([6, 10]) });
export const LINE_WIDTH_ZOOMS = Object.freeze([1, 12]);

/**
 * A width of LINE_WIDTHS at a zoom, as MapLibre's linear interpolate gives it.
 * @param {number} zoom
 * @param {readonly [number, number]} widths [at LINE_WIDTH_ZOOMS[0], at [1]]
 */
export function lineWidthAt(zoom, [low, high]) {
  const [from, to] = LINE_WIDTH_ZOOMS;
  const t = Math.min(1, Math.max(0, (zoom - from) / (to - from)));
  return low + (high - low) * t;
}

/**
 * The colour of a gradient line at `t` (0 at A, 1 at B): LINE_COLORS.a and
 * LINE_COLORS.b mixed per RGB channel, as MapLibre's line-gradient does.
 * @param {number} t
 * @returns {string} "rgb(r, g, b)"
 */
export function gradientColor(t) {
  const channels = (hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const from = channels(LINE_COLORS.a);
  const to = channels(LINE_COLORS.b);
  const mixed = from.map((value, index) => Math.round(value + (to[index] - value) * t));
  return `rgb(${mixed.join(", ")})`;
}

/** Latitude the "whole world" view looks at: the globe, tilted a little to the inhabited north. */
export const WORLD_VIEW_LATITUDE = 20;

/** Longitude in [-180, 180]; 180 stays 180. */
export function wrapLongitude(longitude) {
  if (!Number.isFinite(longitude)) return Number.NaN;
  if (longitude >= -180 && longitude <= 180) return longitude;
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && longitude > 0 ? 180 : wrapped;
}

/** Latitude for fitting a view: Web Mercator bounds stop at ±85.0511°. */
export function displayLatitude(latitude) {
  return Math.max(-MERCATOR_LATITUDE_LIMIT, Math.min(MERCATOR_LATITUDE_LIMIT, latitude));
}

/**
 * The last zoom of MapLibre's globe (MAP_PROJECTION): a sphere up to 11,
 * blending into Web Mercator, which ends at ±85.05°, by 12.
 */
export const GLOBE_MAX_ZOOM = 11;

/**
 * The view constraint of the workspace map (MapLibre's transformConstrain).
 * On the globe (zoom up to GLOBE_MAX_ZOOM) the centre may be anywhere, up to
 * the pole (markerLatitude), so polar pins and lines can be centred and
 * zoomed in on; there are no tiles past ±85.05°, and MapLibre fills that cap
 * evenly in the colour of its edge. Zooming in further over the cap stops at
 * GLOBE_MAX_ZOOM (Web Mercator cannot show it) rather than jumping the centre
 * back to the edge. Zoomed in on the flat map the centre may go up to the
 * edge; MapLibre's own constraint would keep the edge at the top or bottom of
 * the viewport, where the glass top bar hides what is drawn near it.
 * The flat (2D) map, given its viewport, keeps the Mercator edge at or beyond
 * the top and bottom of the whole map (under the widgets too), so the space
 * behind it never shows (flatLatitude).
 * Longitude is free; zoom stays in range.
 * @param {{ lng: number, lat: number }} center
 * @param {number} zoom the zoom asked for
 * @param {{ minZoom: number, maxZoom: number }} range
 * @param {number} [currentZoom] the map's zoom now (the zoom asked for if omitted)
 * @param {"2d" | "3d"} [mode] flat views always stop at the Mercator edge
 * @param {{ height: number, padding?: { top?: number, bottom?: number } } | null} [viewport]
 *   the map's height and camera padding in px, for the flat map
 * @returns {{ longitude: number, latitude: number, zoom: number }}
 */
export function constrainView(center, zoom, { minZoom, maxZoom }, currentZoom = zoom, mode = "3d", viewport = null) {
  const ranged = Math.min(maxZoom, Math.max(minZoom, zoom));
  if (mode === "2d") {
    const latitude = viewport ? flatLatitude(displayLatitude(center.lat), ranged, viewport) : displayLatitude(center.lat);
    return { longitude: center.lng, latitude, zoom: ranged };
  }
  const latitude = markerLatitude(center.lat);
  if (Math.abs(latitude) <= MERCATOR_LATITUDE_LIMIT || ranged <= GLOBE_MAX_ZOOM) {
    return { longitude: center.lng, latitude, zoom: ranged };
  }
  if (currentZoom <= GLOBE_MAX_ZOOM) return { longitude: center.lng, latitude, zoom: GLOBE_MAX_ZOOM };
  return { longitude: center.lng, latitude: displayLatitude(latitude), zoom: ranged };
}

/**
 * A map pin's element in px (MapStage draws it): the head with the label at
 * the top, a needle down to the tip dot, whose centre is the coordinate,
 * `dot / 2` above the element's bottom edge.
 */
export const PIN_SHAPE = Object.freeze({ width: 30, height: 50, head: 26, dot: 10 });

// A pin or tag on ±90° exactly has no Web Mercator y (zoom 12 and more).
const MARKER_LATITUDE_LIMIT = 89.999999;

/** Latitude a pin or tag is drawn at: its own, the exact poles moved in by 11 cm. */
export function markerLatitude(latitude) {
  return Math.max(-MARKER_LATITUDE_LIMIT, Math.min(MARKER_LATITUDE_LIMIT, latitude));
}

/**
 * [longitude, latitude] of each point with continuous longitudes
 * (consecutive steps never jump by more than 180°), so MapLibre draws an
 * antimeridian crossing as one short line instead of one across the world.
 * @param {{ latitude: number, longitude: number }[] | null} points
 * @returns {[number, number][]}
 */
function unwrapLongitudes(points) {
  const coordinates = [];
  for (const point of points ?? []) {
    let longitude = point.longitude;
    const previous = coordinates.at(-1);
    if (previous) {
      while (longitude - previous[0] > 180) longitude -= 360;
      while (longitude - previous[0] < -180) longitude += 360;
    }
    coordinates.push([longitude, point.latitude]);
  }
  return coordinates;
}

/**
 * Map coordinates of sampled geodesic vertices with continuous longitudes
 * (unwrapLongitudes) and latitudes within the Mercator edge, for bounds.
 * @param {{ latitude: number, longitude: number }[] | null} points
 * @returns {[number, number][]}
 */
export function unwrapPath(points) {
  return unwrapLongitudes(points).map(([longitude, latitude]) => [longitude, displayLatitude(latitude)]);
}

/**
 * A line cut where it crosses the Web Mercator edge (±85.0511°), as pieces of
 * unwrapped map coordinates. A shown piece lies within the edge and MapLibre
 * draws it; a piece `beyond` keeps the line's real latitudes and is drawn
 * over the map (MapLibre's tiles would clamp it onto the edge). `from` and
 * `to` give where a piece starts and ends along the whole line, 0 at the
 * first point and 1 at the last (the sampled vertices are equally spaced
 * along it). Neighbouring pieces share the crossing point, interpolated
 * linearly between the vertices on either side. Zero-length pieces (a line
 * that only touches the edge) are left out.
 * @param {{ latitude: number, longitude: number }[] | null} points
 * @returns {{ beyond: boolean, coordinates: [number, number][], from: number, to: number }[]}
 */
export function linePieces(points) {
  const unwrapped = unwrapLongitudes(points);
  if (unwrapped.length < 2) return [];
  const last = unwrapped.length - 1;
  const isBeyond = ([, latitude]) => Math.abs(latitude) > MERCATOR_LATITUDE_LIMIT;
  const pieces = [];
  let piece = { beyond: isBeyond(unwrapped[0]), coordinates: [unwrapped[0]], from: 0, to: 1 };
  for (let index = 1; index <= last; index += 1) {
    const before = unwrapped[index - 1];
    const vertex = unwrapped[index];
    const beyond = isBeyond(vertex);
    if (beyond !== piece.beyond) {
      const edge = Math.sign(piece.beyond ? before[1] : vertex[1]) * MERCATOR_LATITUDE_LIMIT;
      const fraction = (edge - before[1]) / (vertex[1] - before[1]);
      const crossing = [before[0] + fraction * (vertex[0] - before[0]), edge];
      const at = (index - 1 + fraction) / last;
      piece.coordinates.push(crossing);
      piece.to = at;
      pieces.push(piece);
      piece = { beyond, coordinates: [crossing], from: at, to: 1 };
    }
    piece.coordinates.push(vertex);
  }
  pieces.push(piece);
  const hasLength = ({ coordinates }) =>
    coordinates.some(([longitude, latitude]) => longitude !== coordinates[0][0] || latitude !== coordinates[0][1]);
  const kept = pieces.filter(hasLength);
  return kept.length > 0 ? kept : pieces.slice(0, 1);
}

/**
 * Screen polylines of a stretch beyond the Mercator edge: its copy nearest
 * the map's centre (n × 360° east or west), projected vertex by vertex and
 * broken where it passes behind the globe. Runs of fewer than two visible
 * vertices are left out.
 * @param {[number, number][]} coordinates unwrapped [longitude, latitude]
 * @param {{
 *   centerLongitude: number,
 *   project: (lngLat: [number, number]) => [number, number],
 *   visible: (lngLat: [number, number]) => boolean,
 * }} view
 * @returns {[number, number][][]}
 */
export function screenRuns(coordinates, { centerLongitude, project, visible }) {
  if (coordinates.length === 0) return [];
  const longitudes = coordinates.map(([longitude]) => longitude);
  const middle = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
  const shift = Math.round((centerLongitude - middle) / 360) * 360;
  const runs = [];
  let run = [];
  const close = () => {
    if (run.length >= 2) runs.push(run);
    run = [];
  };
  for (const [longitude, latitude] of coordinates) {
    const lngLat = [longitude + shift, latitude];
    if (visible(lngLat)) run.push(project(lngLat));
    else close();
  }
  close();
  return runs;
}

export function isSinglePoint(bounds) {
  return bounds[1][0] - bounds[0][0] < 1e-9 && bounds[1][1] - bounds[0][1] < 1e-9;
}

/**
 * Where a drawn line's tag sits: the middle of the line (sampled vertices are
 * equally spaced along it), at its real latitude, also near a pole.
 * @returns {[number, number] | null} [longitude, latitude]
 */
export function routeMidpoint(points) {
  const coordinates = unwrapLongitudes(points);
  if (coordinates.length < 2) return null;
  const middle = (coordinates.length - 1) / 2;
  const lower = coordinates[Math.floor(middle)];
  const upper = coordinates[Math.ceil(middle)];
  return [(lower[0] + upper[0]) / 2, (lower[1] + upper[1]) / 2];
}

/**
 * Decimal places for a coordinate picked on the map: enough to resolve one
 * screen pixel, never fewer than 5 (about 1 m) and never more than 8 (about
 * 1 mm).
 * @param {number} degreesPerPixel
 */
export function decimalsForResolution(degreesPerPixel) {
  let decimals = 5;
  for (const step of [1e-5, 1e-6, 1e-7]) {
    if (step <= degreesPerPixel) return decimals;
    decimals += 1;
  }
  return decimals;
}

/** Fixed decimals without a "-0.00000". */
export function formatPickedCoordinate(value, decimals) {
  const text = value.toFixed(decimals);
  return Number(text) === 0 ? (0).toFixed(decimals) : text;
}

/** A map position as form strings; the longitude is wrapped into ±180°. */
export function coordinateFromLngLat({ lng, lat }, decimals) {
  return {
    latitude: formatPickedCoordinate(Math.max(-90, Math.min(90, lat)), decimals),
    longitude: formatPickedCoordinate(wrapLongitude(lng), decimals),
  };
}

// A fit leaves at least this much of the map for the scene, however large
// the widgets are on a small window.
const MIN_FIT_SPAN = 64;

function shrinkPair(start, end, span) {
  const room = span - MIN_FIT_SPAN;
  if (start + end <= room) return [start, end];
  const scale = Math.max(0, room) / (start + end);
  return [Math.floor(start * scale), Math.floor(end * scale)];
}

// A widget floats over the map when it lies inside it; the phone sheet
// reaches below the map and only overlaps its lower edge.
const showsOver = (widget, stage) =>
  widget != null &&
  widget.width > 0 &&
  widget.height > 0 &&
  widget.top >= stage.top &&
  widget.bottom <= stage.bottom &&
  widget.left >= stage.left &&
  widget.right <= stage.right;

// A pin is drawn centred on its point, so half of it reaches past the padding;
// the gaps beside the widgets and the control column make room for it.
const PIN_HALF = PIN_SHAPE.width / 2;

/**
 * Padding for fitting a scene into the part of the map the floating widgets
 * leave free (spec 6.2): left = input widget width + 32 px (the widget sits
 * 16 px from the edge) + half a pin, right = control column width + 24 px +
 * half a pin, bottom = result widget height + 32 px (it sits 20 px above the
 * bottom). A widget without a size (hidden) or not inside the map (the phone
 * sheet below it) leaves the base padding. Paddings that would leave less
 * than 64 px of map shrink in proportion.
 * @typedef {{ left: number, top: number, right: number, bottom: number, width: number, height: number }} Rect
 *   a client rect (DOMRect)
 * @param {Rect} stage the map
 * @param {{ input?: Rect | null, result?: Rect | null, controls?: Rect | null }} widgets the input and
 *   result widgets and the map's control column
 * @param {{ top: number, right: number, bottom: number, left: number }} base padding in px without widgets
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
export function fitPadding(stage, { input, result, controls }, base) {
  let { top, right, bottom, left } = base;
  if (showsOver(input, stage)) left = Math.max(left, Math.round(input.right - stage.left + 16 + PIN_HALF));
  if (showsOver(controls, stage)) right = Math.max(right, Math.round(stage.right - controls.left + 8 + PIN_HALF));
  if (showsOver(result, stage)) bottom = Math.max(bottom, Math.round(stage.bottom - result.top + 12));
  [left, right] = shrinkPair(left, right, stage.width);
  [top, bottom] = shrinkPair(top, bottom, stage.height);
  return { top, right, bottom, left };
}

// ---------------------------------------------------------------------------
// Basemap style
// ---------------------------------------------------------------------------

// Positron is light and label-rich. These overrides give water, vegetation and
// major roads clearer contrast while keeping the basemap quieter than the
// cobalt/vermilion lines. Unknown layer ids are ignored, so another
// (self-hosted) style loads unchanged.
const POSITRON_OVERRIDES = {
  background: { "background-color": "#f3f1eb" },
  water: { "fill-color": "#bcd4e6" },
  waterway: { "line-color": "#a6c4dc" },
  park: { "fill-color": "#dde8d3" },
  landcover_wood: { "fill-color": "#d2e1c6" },
  landuse_residential: { "fill-color": "#ebe7de" },
  building: { "fill-color": "#e6e1d6", "fill-outline-color": "#d6cfc1" },
  highway_major_casing: { "line-color": "#d3cbbb" },
  highway_motorway_casing: { "line-color": "#ddbf8a" },
  highway_motorway_inner: {
    "line-color": ["interpolate", ["linear"], ["zoom"], 5.8, "hsla(39, 70%, 78%, 0.6)", 6, "#f9e2b5"],
  },
  highway_motorway_subtle: { "line-color": "hsla(39, 60%, 70%, 0.55)" },
  highway_motorway_bridge_casing: { "line-color": "#ddbf8a" },
  highway_motorway_bridge_inner: { "line-color": "#f9e2b5" },
  boundary_2: { "line-color": "#9a948a" },
  boundary_3: { "line-color": "#b3ada2" },
  water_name_point_label: { "text-color": "#3a6590" },
  water_name_line_label: { "text-color": "#3a6590" },
  waterway_line_label: { "text-color": "#4f7799" },
};

// OpenFreeMap's dark style draws land and water in nearly the same black.
// A blue-grey night palette: darker water than land, roads a step lighter,
// readable names, warm motorways kept subtle.
const PLACE_DARK = { "text-color": "#b9c2ce", "text-halo-color": "rgba(14, 18, 23, 0.85)", "text-halo-width": 1.2 };
const DARK_OVERRIDES = {
  background: { "background-color": "#1c222a" },
  water: { "fill-color": "#0e1824" },
  waterway: { "line-color": "#132233" },
  landuse_park: { "fill-color": "#1d2924" },
  landcover_wood: { "fill-color": "#1f2a26" },
  landuse_residential: { "fill-color": "#262d36" },
  building: { "fill-color": "#262d37", "fill-outline-color": "#303843" },
  highway_minor: { "line-color": "#2b323c" },
  highway_major_casing: { "line-color": "rgba(72, 81, 94, 0.8)" },
  highway_major_inner: { "line-color": "#353d48" },
  highway_major_subtle: { "line-color": "#323a45" },
  highway_motorway_casing: { "line-color": "rgba(98, 88, 66, 0.85)" },
  highway_motorway_inner: { "line-color": ["interpolate", ["linear"], ["zoom"], 5.8, "hsla(38, 28%, 55%, 0.35)", 6, "#4d4637"] },
  highway_motorway_subtle: { "line-color": "#3b372d" },
  boundary_state: { "line-color": "hsl(215, 10%, 33%)" },
  "boundary_country_z0-4": { "line-color": "hsl(215, 12%, 44%)" },
  "boundary_country_z5-": { "line-color": "hsl(215, 12%, 44%)" },
  water_name: { "text-color": "#7193b8", "text-halo-color": "rgba(14, 18, 23, 0.8)" },
  highway_name_other: { "text-color": "#8a95a3", "text-halo-color": "rgba(14, 18, 23, 0.9)" },
  highway_name_motorway: { "text-color": "#9aa4b1" },
  place_other: PLACE_DARK,
  place_suburb: PLACE_DARK,
  place_village: PLACE_DARK,
  place_town: PLACE_DARK,
  place_city: { ...PLACE_DARK, "text-color": "#d3dae3" },
  place_city_large: { ...PLACE_DARK, "text-color": "#dfe5ec" },
  place_state: { ...PLACE_DARK, "text-color": "#8f9aa8" },
  place_country_other: { ...PLACE_DARK, "text-color": "#a7b1bd" },
  place_country_minor: { ...PLACE_DARK, "text-color": "#a7b1bd" },
  place_country_major: { ...PLACE_DARK, "text-color": "#b9c2ce" },
};

/** Paint overrides per basemap palette; "none" leaves a style's colours. */
export const PALETTE_OVERRIDES = Object.freeze({ positron: POSITRON_OVERRIDES, dark: DARK_OVERRIDES, none: {} });

const LOCALIZED_SOURCE_LAYERS = new Set(["place", "water_name", "aerodrome_label"]);

/** Label expression: the place name in the interface language where the data has it. */
export function localizedNameExpression(language) {
  return language === "tr"
    ? ["coalesce", ["get", "name:tr"], ["get", "name:latin"], ["get", "name"]]
    : ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
}

export function isLocalizedLabelLayer(layer) {
  return (
    layer?.type === "symbol" &&
    LOCALIZED_SOURCE_LAYERS.has(layer["source-layer"]) &&
    Boolean(layer.layout?.["text-field"])
  );
}

// A missing property compares as false: MapLibre does that too, but logs a
// warning for every feature ("Expected value to be of type number, but found
// null"). Comparing a stand-in that fails the test keeps the result and the
// console quiet.
const COMPARISON_STAND_IN = { "<": 1e9, "<=": 1e9, ">": -1e9, ">=": -1e9 };

/**
 * A filter expression with every ["get", key] that a number comparison reads
 * wrapped in a coalesce whose stand-in fails the comparison.
 * @param {unknown} expression
 * @returns {unknown}
 */
export function guardFilter(expression) {
  if (!Array.isArray(expression)) return expression;
  const [operator, ...operands] = expression;
  const standIn = COMPARISON_STAND_IN[operator];
  return [
    operator,
    ...operands.map((operand) =>
      standIn !== undefined && Array.isArray(operand) && operand[0] === "get" && operand.length === 2 && typeof operand[1] === "string"
        ? ["coalesce", operand, standIn]
        : guardFilter(operand),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Calm labels: place names after the Apple Maps habit. Few, small, quiet names
// when zoomed out, more appearing as you zoom in; mixed case, regular weight,
// soft grey with a halo in the map's own background colour.
// ---------------------------------------------------------------------------

const zoomSize = (...stops) => ["interpolate", ["linear"], ["zoom"], ...stops.flat()];

// kind: [minzoom, text-size, letter-spacing, light colour, dark colour]
const CALM_PLACE = {
  country: [1.5, zoomSize([1, 8], [5, 10], [8, 12]), 0.1, "#7b818a", "#8d96a2"],
  state: [5, zoomSize([5, 9.5], [8, 11.5]), 0.06, "#8a9099", "#7d8793"],
  cityLarge: [3.5, zoomSize([3.5, 9.5], [7, 11.5], [11, 14]), 0.01, "#5f6670", "#aab3be"],
  city: [5.5, zoomSize([5.5, 10], [8, 11.5], [12, 14]), 0.01, "#5f6670", "#aab3be"],
  town: [8, zoomSize([8, 10], [12, 12]), 0.01, "#6e757e", "#97a1ad"],
  village: [11, zoomSize([11, 9.5], [14, 11.5]), 0.01, "#8a9099", "#8790 9c".replace(" ", "")],
  small: [12.5, zoomSize([12.5, 9], [15, 10.5]), 0.02, "#8a9099", "#7d8793"],
};
const CALM_BACKGROUND = { positron: "#f3f1eb", dark: "#1c222a" };
const CALM_WATER = { positron: ["#7f9db8", "rgba(188, 212, 230, 0.9)"], dark: ["#5d7a99", "rgba(14, 24, 36, 0.9)"] };

function placeKind(id) {
  if (/country/.test(id)) return "country";
  if (/state/.test(id)) return "state";
  if (/city_(large|capital)/.test(id)) return "cityLarge";
  if (/city/.test(id)) return "city";
  if (/town/.test(id)) return "town";
  if (/village/.test(id)) return "village";
  return "small"; // suburb, hamlet, neighbourhood, "other"
}

const regularFont = (fonts) =>
  Array.isArray(fonts) ? fonts.map((font) => (/Bold|Semibold/.test(font) ? font.replace(/\s*(Semi)?[Bb]old/, " Regular") : font)) : fonts;

/**
 * Quiet down a label layer. Only symbol layers of the place, water_name and
 * transportation_name source layers change; palette "none" keeps its colours.
 */
export function calmLabels(layer, palette = "positron") {
  if (layer?.type !== "symbol") return layer;
  const source = layer["source-layer"];
  const dark = palette === "dark";
  const coloured = palette === "positron" || palette === "dark";
  const layout = { ...layer.layout };
  const paint = { ...layer.paint };
  if (source === "place") {
    const [minzoom, size, spacing, light, night] = CALM_PLACE[placeKind(layer.id)];
    const isCountry = placeKind(layer.id) === "country";
    layout["text-size"] = size;
    layout["text-transform"] = isCountry ? "uppercase" : "none";
    layout["text-letter-spacing"] = spacing;
    layout["text-font"] = regularFont(layout["text-font"]);
    delete layout["icon-image"];
    layout["text-anchor"] = "center";
    layout["text-offset"] = [0, 0];
    if (layout["text-justify"]) layout["text-justify"] = "center";
    if (coloured) {
      paint["text-color"] = dark ? night : light;
      paint["text-halo-color"] = CALM_BACKGROUND[palette];
      paint["text-halo-width"] = 1.3;
      paint["text-halo-blur"] = 0.5;
    }
    return { ...layer, minzoom: Math.max(layer.minzoom ?? 0, minzoom), layout, paint };
  }
  if (source === "water_name") {
    layout["text-size"] = layout["text-size"] === undefined || typeof layout["text-size"] === "number"
      ? 11
      : zoomSize([0, 9], [8, 12]);
    layout["text-transform"] = "none";
    layout["text-letter-spacing"] = 0.08;
    if (coloured) {
      [paint["text-color"], paint["text-halo-color"]] = CALM_WATER[palette];
      paint["text-halo-width"] = 1.2;
    }
    return { ...layer, layout, paint };
  }
  if (source === "transportation_name" && !layout["icon-image"]) {
    layout["text-transform"] = "none";
    if (coloured) {
      paint["text-color"] = dark ? "#7d8793" : "#8a9099";
      paint["text-halo-color"] = CALM_BACKGROUND[palette];
      paint["text-halo-width"] = 1.2;
    }
    return { ...layer, layout, paint };
  }
  return layer;
}

/**
 * The basemap style as the app draws it: on the globe (MAP_PROJECTION), the
 * house colours of its palette and labels in the interface language. Raster
 * sources (Natural Earth relief in some styles) are dropped unless
 * `keepRaster`; the satellite basemap adds its own imagery (basemaps.js).
 * @param {object} style a fetched style
 * @param {string} language
 * @param {{ palette?: keyof typeof PALETTE_OVERRIDES, keepRaster?: boolean }} [options]
 */
export function tuneBasemapStyle(style, language, { palette = "positron", keepRaster = false } = {}) {
  if (!style || !Array.isArray(style.layers)) return style;
  const overrides = PALETTE_OVERRIDES[palette] ?? {};
  const sources = Object.fromEntries(
    Object.entries(style.sources ?? {}).filter(([, source]) => keepRaster || source?.type !== "raster"),
  );
  const layers = style.layers
    .filter((layer) => layer.type !== "raster" && (layer.source === undefined || layer.source in sources))
    .map((layer) => {
      const paint = overrides[layer.id];
      let next = paint ? { ...layer, paint: { ...layer.paint, ...paint } } : layer;
      if (Array.isArray(next.filter)) next = { ...next, filter: guardFilter(next.filter) };
      next = calmLabels(next, palette);
      if (isLocalizedLabelLayer(next)) {
        next = { ...next, layout: { ...next.layout, "text-field": localizedNameExpression(language) } };
      }
      return next;
    });
  return { ...style, projection: MAP_PROJECTION, sources, layers };
}

// ---------------------------------------------------------------------------
// Offline fallback: shown when the remote basemap cannot be loaded. It makes
// no requests, so the tools and picking keep working.
// ---------------------------------------------------------------------------

function graticule(step) {
  const features = [];
  for (let longitude = -180; longitude <= 180; longitude += step) {
    features.push({
      type: "Feature",
      properties: { kind: longitude === 0 ? "major" : "minor" },
      geometry: {
        type: "LineString",
        coordinates: [
          [longitude, -MERCATOR_LATITUDE_LIMIT],
          [longitude, MERCATOR_LATITUDE_LIMIT],
        ],
      },
    });
  }
  for (let latitude = -75; latitude <= 75; latitude += step / 2) {
    const coordinates = [];
    for (let longitude = -180; longitude <= 180; longitude += 10) coordinates.push([longitude, latitude]);
    features.push({
      type: "Feature",
      properties: { kind: latitude === 0 ? "major" : "minor" },
      geometry: { type: "LineString", coordinates },
    });
  }
  return { type: "FeatureCollection", features };
}

const FALLBACK_COLORS = Object.freeze({
  light: { background: "#eceae3", major: "#a8a293", minor: "#c9c3b5" },
  dark: { background: "#1c222a", major: "#4b5563", minor: "#323a45" },
});

/** The offline grid, in the colours of the interface theme. */
export function fallbackStyle(mode = "light") {
  const colors = FALLBACK_COLORS[mode] ?? FALLBACK_COLORS.light;
  return {
    version: 8,
    name: "convert-offline-graticule",
    projection: MAP_PROJECTION,
    sources: { "convert-graticule": { type: "geojson", data: graticule(30) } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": colors.background } },
      {
        id: "convert-graticule",
        type: "line",
        source: "convert-graticule",
        paint: {
          "line-color": ["match", ["get", "kind"], "major", colors.major, colors.minor],
          "line-width": ["match", ["get", "kind"], "major", 1.2, 0.7],
        },
      },
    ],
  };
}
