// The scene: what a workspace tool asks the map to draw, as plain data. The
// tool builds it from its state (useMapScene in shell/workspace-context.js)
// and the one map of the workspace (MapStage) draws it, so a tool never
// touches MapLibre. Pure: no React, no MapLibre, no DOM.

import {
  LINE_COLORS,
  displayLatitude,
  gradientColor,
  linePieces,
  markerLatitude,
  routeMidpoint,
  unwrapPath,
  wrapLongitude,
} from "./map-adapter.js";

/**
 * A point on the map: a round pin with a short label above it.
 * @typedef {{
 *   id: string,
 *   label: string,
 *   tone: "a" | "b" | "ink",
 *   hollow?: boolean,
 *   draggable?: boolean,
 *   latitude: number,
 *   longitude: number,
 *   title?: string,
 * }} ScenePin
 *   id is stable while the pin exists (the map moves it instead of creating
 *   a new one); label is the text on its tag ("A", "B", "3"); tone its
 *   colour (a cobalt, b vermilion, ink); hollow draws a ring, for a computed
 *   point; draggable lets the user move it (MapStage reports onPinMove);
 *   title is its accessible name and tooltip ("Başlangıç A").
 */

/**
 * A line through sampled points, drawn in one piece even across ±180°.
 * @typedef {{
 *   id: string,
 *   points: ReadonlyArray<{ latitude: number, longitude: number }>,
 *   gradient?: boolean,
 *   tag?: string,
 * }} SceneLine
 *   gradient runs the colour from A (cobalt) at the first point to B
 *   (vermilion) at the last, otherwise the line is ink; tag is a short text
 *   ("350,09 km") shown on a pill at the line's midpoint.
 */

/**
 * Everything a workspace tool shows on the map.
 * @typedef {{
 *   pins: ScenePin[],
 *   lines: SceneLine[],
 *   picking: null | { label: string, tone: "a" | "b" | "ink" },
 *   fitRequest: number,
 * }} MapScene
 *   picking, while set, means the next click (or Enter on the focused map)
 *   places something: the map shows a crosshair in tone and a hint pill with
 *   label (a sentence such as "Haritada B noktasına tıklayın"), and reports
 *   the click as onPick; Esc reports onCancelPick. fitRequest asks the map to
 *   fit the scene each time it changes; the value a tool starts with is not
 *   a request (opening a tool keeps the view), except that the first scene
 *   also sets the view the map is created with.
 */

/** @type {Readonly<MapScene>} */
export const EMPTY_SCENE = Object.freeze({ pins: Object.freeze([]), lines: Object.freeze([]), picking: null, fitRequest: 0 });

/**
 * Class list of a pin's marker element. MapLibre's own classes on the
 * element are kept (maplibregl-marker positions it absolutely; without it
 * each pin is pushed down by the pins before it), and so is is-dragging,
 * which the drag handlers set.
 * @param {string[]} current the element's classes now
 * @param {{ tone: string, hollow?: boolean, draggable?: boolean }} pin
 * @returns {string}
 */
export function pinClassName(current, pin) {
  return [
    ...current.filter((name) => name.startsWith("maplibregl-")),
    "map-pin",
    `tone-${pin.tone}`,
    pin.hollow ? "is-hollow" : "",
    pin.draggable ? "is-draggable" : "",
    current.includes("is-dragging") ? "is-dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The lines as GeoJSON for one MapLibre source: of each line with at least
 * two points, the pieces within the Web Mercator edge (linePieces), unwrapped
 * across the antimeridian on their own (longitudes may pass ±180°). One
 * LineString per piece; properties: { id, gradient, part (the piece's index
 * in its line), from, to (where the piece starts and ends along the line, 0
 * at A, 1 at B) }. The stretches beyond the edge are polarStretches.
 * @param {Pick<MapScene, "lines">} scene
 */
export function sceneFeatures(scene) {
  const features = [];
  for (const line of scene.lines) {
    const gradient = line.gradient === true;
    linePieces(line.points).forEach((piece, part) => {
      if (piece.beyond) return;
      const properties = { id: line.id, gradient, part, from: piece.from, to: piece.to };
      features.push({ type: "Feature", properties, geometry: { type: "LineString", coordinates: piece.coordinates } });
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * The stretches of the lines beyond ±85.0511° (over a pole), which MapLibre's
 * tiles cannot hold: drawn over the map on their real path (screenRuns),
 * solid like the rest of the line. colors: the line's colour where the
 * stretch starts and ends (the A -> B gradient's, or ink twice).
 * @param {Pick<MapScene, "lines">} scene
 * @returns {{ id: string, coordinates: [number, number][], from: number, to: number, colors: [string, string] }[]}
 */
export function polarStretches(scene) {
  const stretches = [];
  for (const line of scene.lines) {
    for (const piece of linePieces(line.points)) {
      if (!piece.beyond) continue;
      const colors = line.gradient === true ? [gradientColor(piece.from), gradientColor(piece.to)] : [LINE_COLORS.ink, LINE_COLORS.ink];
      stretches.push({ id: line.id, coordinates: piece.coordinates, from: piece.from, to: piece.to, colors });
    }
  }
  return stretches;
}

/**
 * The copy of a longitude (n × 360° east or west) that lies within
 * [west, east] of sceneBounds, so a pin sits at the end of its line as drawn
 * rather than on another copy of the world; the copy nearest the middle of
 * the span when none lies within it.
 * @param {number} longitude
 * @param {[[number, number], [number, number]]} bounds from sceneBounds
 * @returns {number}
 */
export function longitudeWithin(longitude, bounds) {
  const [[west], [east]] = bounds;
  const middle = (west + east) / 2;
  let value = longitude + Math.round((middle - longitude) / 360) * 360;
  const tolerance = 1e-9;
  if (value < west - tolerance && value + 360 <= east + tolerance) value += 360;
  else if (value > east + tolerance && value - 360 >= west - tolerance) value -= 360;
  return value;
}

/**
 * West and east of the shortest stretch of longitude that holds every value:
 * across ±180° when that is shorter, then east is beyond 180 (179.9 to
 * 180.1 rather than -179.9 to 179.9).
 * @param {number[]} longitudes
 */
function longitudeSpan(longitudes) {
  const sorted = longitudes.map(wrapLongitude).sort((first, second) => first - second);
  const last = sorted.length - 1;
  // The largest gap between neighbours is what the bounds leave out; the gap
  // across ±180° is the default, so ordinary bounds stay in -180..180.
  let gap = sorted[0] + 360 - sorted[last];
  let after = -1;
  for (let index = 0; index < last; index += 1) {
    const step = sorted[index + 1] - sorted[index];
    if (step > gap) {
      gap = step;
      after = index;
    }
  }
  return after < 0 ? [sorted[0], sorted[last]] : [sorted[after + 1], sorted[after] + 360];
}

/**
 * [[west, south], [east, north]] around every pin and line, latitudes within
 * the Web Mercator edge (MapLibre fits no further), or null for an empty
 * scene. A scene across the antimeridian gets an east beyond
 * 180°, which MapLibre fits as one short span.
 * @param {MapScene} scene
 * @returns {[[number, number], [number, number]] | null}
 */
export function sceneBounds(scene) {
  const longitudes = [];
  let south = Infinity;
  let north = -Infinity;
  const add = (longitude, latitude) => {
    longitudes.push(longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  };
  for (const pin of scene.pins) add(pin.longitude, displayLatitude(pin.latitude));
  for (const line of scene.lines) {
    for (const [longitude, latitude] of unwrapPath(line.points)) add(longitude, latitude);
  }
  if (longitudes.length === 0) return null;
  const [west, east] = longitudeSpan(longitudes);
  return [
    [west, south],
    [east, north],
  ];
}

// Fit targets near a pole are tried again every FIT_TARGET_STEP degrees
// nearer the equator, down to FIT_TARGET_LATITUDE.
const FIT_TARGET_LATITUDE = 60;
const FIT_TARGET_STEP = 5;

/**
 * Where a fit may centre the view, best guess first: the middle of the
 * scene's first drawn line (on the globe the middle of a long line shows
 * both its ends; the middle of its bounds may be on the far side of the
 * globe from both), else the middle of the scene's points; at their real
 * latitude (markerLatitude), past ±85.05° too, where the globe's centre may
 * go (constrainView). A target beyond ±60° is followed by the same
 * longitude every 5° nearer the equator down to ±60°: MapLibre's globe
 * grows as 1 / cos(latitude) of the centre, so from nearer a pole it may not
 * zoom out far enough to show a long line, on a phone. [] for an empty scene.
 * @param {MapScene} scene
 * @returns {[number, number][]} [longitude, latitude] each
 */
export function fitTargets(scene) {
  let target = null;
  for (const line of scene.lines) {
    const middle = routeMidpoint(line.points);
    if (middle) {
      target = [middle[0], markerLatitude(middle[1])];
      break;
    }
  }
  if (!target) {
    const bounds = sceneBounds(scene);
    if (!bounds) return [];
    const [[west], [east]] = bounds;
    const latitudes = scenePoints(scene, bounds).map(([, latitude]) => latitude);
    target = [(west + east) / 2, (Math.min(...latitudes) + Math.max(...latitudes)) / 2];
  }
  const [longitude, latitude] = target;
  const targets = [target];
  const side = Math.sign(latitude);
  const steps = Math.floor(Math.abs(latitude) / FIT_TARGET_STEP);
  for (let step = steps; step * FIT_TARGET_STEP >= FIT_TARGET_LATITUDE; step -= 1) {
    const next = side * step * FIT_TARGET_STEP;
    // A step closer than half a step to the target adds nothing.
    if (Math.abs(latitude - next) >= FIT_TARGET_STEP / 2) targets.push([longitude, next]);
  }
  return targets;
}

/**
 * Every point a fit must show: the pins, on the copy of the world their line
 * is drawn on (longitudeWithin), and the vertices of the drawn lines,
 * unwrapped; all at their own latitudes (markerLatitude).
 * @param {MapScene} scene
 * @param {[[number, number], [number, number]] | null} bounds from sceneBounds
 * @returns {[number, number][]}
 */
export function scenePoints(scene, bounds) {
  const points = scene.pins.map((pin) => [
    bounds ? longitudeWithin(pin.longitude, bounds) : pin.longitude,
    markerLatitude(pin.latitude),
  ]);
  for (const line of scene.lines) {
    for (const piece of linePieces(line.points)) {
      for (const [longitude, latitude] of piece.coordinates) points.push([longitude, markerLatitude(latitude)]);
    }
  }
  return points;
}
