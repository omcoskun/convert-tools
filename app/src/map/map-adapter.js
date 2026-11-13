// Pure helpers between the distance tool and MapLibre. Nothing here needs
// WebGL or a DOM, so the display limits, route geometry and basemap style
// rules are unit tested (test/map-adapter.test.mjs).

// Web Mercator cannot show latitudes beyond ±85.0511°. Points there are drawn
// on the display edge; the coordinates used for the calculation never change.
export const MERCATOR_LATITUDE_LIMIT = 85.0511287798066;

// Same as COLORS.a and COLORS.b in theme.js (kept here so this module has no
// dependency on the component library).
export const ROUTE_COLORS = Object.freeze({ start: "#2450e0", end: "#e2492c" });

/** West-south and east-north corners of the "whole world" view. */
export const WORLD_BOUNDS = Object.freeze([
  [-170, -58],
  [170, 78],
]);

/** Longitude in [-180, 180]; 180 stays 180. */
export function wrapLongitude(longitude) {
  if (!Number.isFinite(longitude)) return Number.NaN;
  if (longitude >= -180 && longitude <= 180) return longitude;
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && longitude > 0 ? 180 : wrapped;
}

export function displayLatitude(latitude) {
  return Math.max(-MERCATOR_LATITUDE_LIMIT, Math.min(MERCATOR_LATITUDE_LIMIT, latitude));
}

/** True for a point the Web Mercator map can only show on its edge. */
export function isBeyondDisplay(point) {
  return point != null && Math.abs(point.latitude) > MERCATOR_LATITUDE_LIMIT;
}

/**
 * Map coordinates of sampled geodesic vertices with continuous longitudes
 * (consecutive steps never jump by more than 180°), so MapLibre draws an
 * antimeridian crossing as one short line instead of one across the world.
 * Latitudes are clamped for display only.
 * @param {{ latitude: number, longitude: number }[] | null} points
 * @returns {[number, number][]}
 */
export function unwrapPath(points) {
  const coordinates = [];
  let previous = null;
  for (const point of points ?? []) {
    let longitude = point.longitude;
    if (previous !== null) {
      while (longitude - previous > 180) longitude -= 360;
      while (longitude - previous < -180) longitude += 360;
    }
    coordinates.push([longitude, displayLatitude(point.latitude)]);
    previous = longitude;
  }
  return coordinates;
}

const EMPTY_COLLECTION = Object.freeze({ type: "FeatureCollection", features: Object.freeze([]) });

export function routeFeatureCollection(points) {
  const coordinates = unwrapPath(points);
  if (coordinates.length < 2) return EMPTY_COLLECTION;
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }],
  };
}

/** [[west, south], [east, north]] in the same unwrapped space as the route, or null. */
export function routeBounds(points) {
  const coordinates = unwrapPath(points);
  if (coordinates.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  return [
    [west, south],
    [east, north],
  ];
}

export function isSinglePoint(bounds) {
  return bounds[1][0] - bounds[0][0] < 1e-9 && bounds[1][1] - bounds[0][1] < 1e-9;
}

/** Middle of the drawn route (sampled vertices are equally spaced along it). */
export function routeMidpoint(points) {
  const coordinates = unwrapPath(points);
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

export function markerPosition(point) {
  return [point.longitude, displayLatitude(point.latitude)];
}

// ---------------------------------------------------------------------------
// Basemap style
// ---------------------------------------------------------------------------

// Positron is light and label-rich. These overrides give water, vegetation and
// major roads clearer contrast while keeping the basemap quieter than the
// cobalt/vermilion measurement. Unknown layer ids are ignored, so another
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
 * The basemap style as the app draws it: no raster sources (no imagery or
 * shaded relief is ever requested), the house colours and labels in the
 * interface language.
 */
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
      if (isLocalizedLabelLayer(next)) {
        next = { ...next, layout: { ...next.layout, "text-field": localizedNameExpression(language) } };
      }
      return next;
    });
  return { ...style, sources, layers };
}

// ---------------------------------------------------------------------------
// Offline fallback: shown when the remote basemap cannot be loaded. It makes
// no requests, so measuring and picking keep working.
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
