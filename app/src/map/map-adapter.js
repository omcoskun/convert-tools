// Pure helpers between the workspace tools and MapLibre. Nothing here needs
// WebGL or a DOM, so the display limits, line geometry, fit padding and
// basemap style rules are unit tested (test/map-adapter.test.mjs). What a
// tool draws is described by a scene (scene.js).

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
 * Longitude is free; zoom stays in range.
 * @param {{ lng: number, lat: number }} center
 * @param {number} zoom the zoom asked for
 * @param {{ minZoom: number, maxZoom: number }} range
 * @param {number} [currentZoom] the map's zoom now (the zoom asked for if omitted)
 * @param {"2d" | "3d"} [mode] flat views always stop at the Mercator edge
 * @returns {{ longitude: number, latitude: number, zoom: number }}
 */
export function constrainView(center, zoom, { minZoom, maxZoom }, currentZoom = zoom, mode = "3d") {
  const ranged = Math.min(maxZoom, Math.max(minZoom, zoom));
  if (mode === "2d") return { longitude: center.lng, latitude: displayLatitude(center.lat), zoom: ranged };
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

/**
 * Padding for fitting a scene into the part of the map the floating widgets
 * leave free (spec 6.2): left = input widget width + 32 px (the widget sits
 * 16 px from the edge), bottom = result widget height + 32 px (it sits
 * 20 px above the bottom). A widget without a size (hidden) or not inside
 * the map (the phone sheet below it) leaves the base padding. Paddings that
 * would leave less than 64 px of map shrink in proportion.
 * @typedef {{ left: number, top: number, right: number, bottom: number, width: number, height: number }} Rect
 *   a client rect (DOMRect)
 * @param {Rect} stage the map
 * @param {{ input?: Rect | null, result?: Rect | null }} widgets the input and result widgets
 * @param {{ top: number, right: number, bottom: number, left: number }} base padding in px without widgets
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
export function fitPadding(stage, { input, result }, base) {
  let { top, right, bottom, left } = base;
  if (showsOver(input, stage)) left = Math.max(left, Math.round(input.right - stage.left + 16));
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
const PAINT_OVERRIDES = {
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

/**
 * The basemap style as the app draws it: on the globe (MAP_PROJECTION), no
 * raster sources (no imagery or shaded relief is ever requested), the house
 * colours and labels in the interface language.
 */
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

export function tuneBasemapStyle(style, language) {
  if (!style || !Array.isArray(style.layers)) return style;
  const sources = Object.fromEntries(
    Object.entries(style.sources ?? {}).filter(([, source]) => source?.type !== "raster"),
  );
  const layers = style.layers
    .filter((layer) => layer.type !== "raster" && (layer.source === undefined || layer.source in sources))
    .map((layer) => {
      const paint = PAINT_OVERRIDES[layer.id];
      let next = paint ? { ...layer, paint: { ...layer.paint, ...paint } } : layer;
      if (Array.isArray(next.filter)) next = { ...next, filter: guardFilter(next.filter) };
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

export function fallbackStyle() {
  return {
    version: 8,
    name: "convert-offline-graticule",
    projection: MAP_PROJECTION,
    sources: { "convert-graticule": { type: "geojson", data: graticule(30) } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#eceae3" } },
      {
        id: "convert-graticule",
        type: "line",
        source: "convert-graticule",
        paint: {
          "line-color": ["match", ["get", "kind"], "major", "#a8a293", "#c9c3b5"],
          "line-width": ["match", ["get", "kind"], "major", 1.2, 0.7],
        },
      },
    ],
  };
}
