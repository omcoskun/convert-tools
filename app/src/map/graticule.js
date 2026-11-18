// The latitude/longitude grid drawn over the map (an overlay of the layer
// panel). Its interval follows the zoom, so lines stay roughly 110 px or
// more apart, from 30° on the whole globe to 1′ in a street. Lines are made
// for the area around the view and remade when the view leaves it or the
// interval changes (useMapStage). Pure: tested in test/graticule.test.mjs.

// Web Mercator ends here; parallels beyond would have no tiles to sit on.
const EDGE_LATITUDE = 85;

/** Intervals in degrees, coarse to fine: 30°, 15°, 10°, 5°, 2°, 1°, 30′, 15′, 10′, 5′, 2′, 1′. */
export const GRATICULE_INTERVALS = Object.freeze([30, 15, 10, 5, 2, 1, 1 / 2, 1 / 4, 1 / 6, 1 / 12, 1 / 30, 1 / 60]);

// Web Mercator draws 512 · 2^zoom px around the world; this many px a degree at zoom 0.
const PX_PER_DEGREE_AT_ZOOM_0 = 512 / 360;
const MIN_SPACING_PX = 110;

/**
 * The finest interval whose lines are at least MIN_SPACING_PX apart at
 * `zoom` (the coarsest when none are).
 * @param {number} zoom
 */
export function graticuleInterval(zoom) {
  let pxPerDegree = PX_PER_DEGREE_AT_ZOOM_0;
  // 2^zoom without Math.pow: halve or double towards the zoom, then scale the rest linearly.
  let level = 0;
  while (level + 1 <= zoom) {
    pxPerDegree *= 2;
    level += 1;
  }
  while (level > zoom) {
    pxPerDegree /= 2;
    level -= 1;
  }
  pxPerDegree *= 1 + (zoom - level);
  let chosen = GRATICULE_INTERVALS[0];
  for (const interval of GRATICULE_INTERVALS) {
    if (interval * pxPerDegree >= MIN_SPACING_PX) chosen = interval;
  }
  return chosen;
}

const HEMISPHERES = Object.freeze({
  tr: { north: "K", south: "G", east: "D", west: "B" },
  en: { north: "N", south: "S", east: "E", west: "W" },
});

/**
 * A grid line's label: whole degrees, or degrees and minutes for the finer
 * intervals, with the hemisphere letter of the language (40°K, 30°30′D).
 * The equator and the prime meridian read 0°, the antimeridian 180°.
 * @param {number} value degrees, a multiple of the interval
 * @param {"latitude" | "longitude"} axis
 * @param {string} language
 */
export function graticuleLabel(value, axis, language) {
  const letters = HEMISPHERES[language] ?? HEMISPHERES.en;
  let wrapped = value;
  if (axis === "longitude") wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  const totalMinutes = Math.round(Math.abs(wrapped) * 60);
  if (axis === "longitude" && totalMinutes === 180 * 60) return "180°";
  const degrees = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const text = minutes === 0 ? `${degrees}°` : `${degrees}°${String(minutes).padStart(2, "0")}′`;
  if (totalMinutes === 0) return "0°";
  const letter = axis === "latitude" ? (wrapped > 0 ? letters.north : letters.south) : wrapped > 0 ? letters.east : letters.west;
  return `${text}${letter}`;
}

// The most lines of one direction a grid may have; a finer one is coarsened.
const MAX_LINES = 160;

/**
 * Grid lines around a view, as GeoJSON LineStrings with { axis, label, major }
 * properties. Coarse intervals (5° and up) cover the whole world; finer
 * ones the view's bounds grown by half their size on each side. Lines get a
 * vertex every 2° or less, so they follow the globe's curve.
 * @param {[[number, number], [number, number]]} bounds [[west, south], [east, north]]; west may be below -180 and east above 180
 * @param {number} interval degrees (GRATICULE_INTERVALS)
 * @param {string} language
 * @returns {{ type: "FeatureCollection", features: object[], extent: [[number, number], [number, number]], interval: number, requested: number }}
 *   extent: the area the lines cover, to tell when the view leaves it;
 *   interval: the one drawn, requested: the one asked for.
 */
export function graticuleFeatures(bounds, requested, language) {
  let interval = requested;
  let [[west, south], [east, north]] = bounds;
  if (interval >= 5 || east - west >= 360) {
    [west, east, south, north] = [-180, 180, -EDGE_LATITUDE, EDGE_LATITUDE];
  } else {
    const width = east - west;
    const height = north - south;
    west -= width / 2 + interval;
    east += width / 2 + interval;
    south = Math.max(-EDGE_LATITUDE, south - height / 2 - interval);
    north = Math.min(EDGE_LATITUDE, north + height / 2 + interval);
  }
  while ((east - west) / interval > MAX_LINES || (north - south) / interval > MAX_LINES) {
    const position = GRATICULE_INTERVALS.indexOf(interval);
    if (position <= 0) break;
    interval = GRATICULE_INTERVALS[position - 1];
  }
  const step = Math.min(2, interval);
  const index = (value) => Math.round(value / interval);
  const features = [];
  const firstLongitude = Math.ceil(west / interval - 1e-9);
  const lastLongitude = Math.floor(east / interval + 1e-9);
  for (let k = firstLongitude; k <= lastLongitude; k += 1) {
    const longitude = k * interval;
    const coordinates = [];
    for (let latitude = south; latitude < north; latitude += step) coordinates.push([longitude, latitude]);
    coordinates.push([longitude, north]);
    features.push({
      type: "Feature",
      properties: { axis: "longitude", label: graticuleLabel(longitude, "longitude", language), major: index(longitude) % 2 === 0 || longitude === 0 },
      geometry: { type: "LineString", coordinates },
    });
  }
  const firstLatitude = Math.ceil(south / interval - 1e-9);
  const lastLatitude = Math.floor(north / interval + 1e-9);
  for (let k = firstLatitude; k <= lastLatitude; k += 1) {
    const latitude = k * interval;
    const coordinates = [];
    for (let longitude = west; longitude < east; longitude += step) coordinates.push([longitude, latitude]);
    coordinates.push([east, latitude]);
    features.push({
      type: "Feature",
      properties: { axis: "latitude", label: graticuleLabel(latitude, "latitude", language), major: index(latitude) % 2 === 0 || latitude === 0 },
      geometry: { type: "LineString", coordinates },
    });
  }
  return { type: "FeatureCollection", features, extent: [[west, south], [east, north]], interval, requested };
}

/**
 * Whether a grid made by graticuleFeatures still serves a view of `bounds`
 * that asks for the interval `wanted`.
 */
export function graticuleCovers(grid, bounds, wanted) {
  if (!grid || grid.requested !== wanted) return false;
  const [[west, south], [east, north]] = grid.extent;
  const [[viewWest, viewSouth], [viewEast, viewNorth]] = bounds;
  const longitudes = east - west >= 360 || (viewWest >= west && viewEast <= east);
  const latitudes = (south <= -EDGE_LATITUDE || viewSouth >= south) && (north >= EDGE_LATITUDE || viewNorth <= north);
  return longitudes && latitudes;
}
