// The scene: what a workspace tool asks the map to draw, as plain data. The
// tool builds it from its state (useMapScene in shell/workspace-context.js)
// and the one map of the workspace (MapStage) draws it, so a tool never
// touches MapLibre. Pure: no React, no MapLibre, no DOM.

import { MERCATOR_LATITUDE_LIMIT, displayLatitude, unwrapPath, wrapLongitude } from "./map-adapter.js";

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
 * Where a pin is drawn: Web Mercator ends at ±85.0511°, so a point beyond is
 * drawn on that edge (clamped), and edge says which one; there the pin's tip
 * is not the real location, so it is drawn differently. Its coordinates for
 * any calculation are the pin's own and never change.
 * @param {{ latitude: number, longitude: number }} pin
 * @returns {{ longitude: number, latitude: number, clamped: boolean, edge: "north" | "south" | null }}
 */
export function pinDisplay(pin) {
  let edge = null;
  if (pin.latitude > MERCATOR_LATITUDE_LIMIT) edge = "north";
  else if (pin.latitude < -MERCATOR_LATITUDE_LIMIT) edge = "south";
  return {
    longitude: pin.longitude,
    latitude: displayLatitude(pin.latitude),
    clamped: edge !== null,
    edge,
  };
}

/**
 * Class list of a pin's marker element. MapLibre's own classes on the
 * element are kept (maplibregl-marker positions it absolutely; without it
 * each pin is pushed down by the pins before it), and so is is-dragging,
 * which the drag handlers set.
 * @param {string[]} current the element's classes now
 * @param {{ latitude: number, longitude: number, tone: string, hollow?: boolean, draggable?: boolean }} pin
 * @returns {string}
 */
export function pinClassName(current, pin) {
  const { edge } = pinDisplay(pin);
  return [
    ...current.filter((name) => name.startsWith("maplibregl-")),
    "map-pin",
    `tone-${pin.tone}`,
    pin.hollow ? "is-hollow" : "",
    edge ? `is-clamped edge-${edge}` : "",
    pin.draggable ? "is-draggable" : "",
    current.includes("is-dragging") ? "is-dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The lines as GeoJSON for one MapLibre source: one LineString per line with
 * at least two points, each unwrapped across the antimeridian on its own
 * (longitudes may pass ±180°) and with latitudes clamped for display.
 * properties: { id, gradient }.
 * @param {Pick<MapScene, "lines">} scene
 */
export function sceneFeatures(scene) {
  const features = [];
  for (const line of scene.lines) {
    const coordinates = unwrapPath(line.points);
    if (coordinates.length < 2) continue;
    features.push({
      type: "Feature",
      properties: { id: line.id, gradient: line.gradient === true },
      geometry: { type: "LineString", coordinates },
    });
  }
  return { type: "FeatureCollection", features };
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
 * [[west, south], [east, north]] around every pin and line as drawn, or null
 * for an empty scene. A scene across the antimeridian gets an east beyond
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
  for (const pin of scene.pins) {
    const { longitude, latitude } = pinDisplay(pin);
    add(longitude, latitude);
  }
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
