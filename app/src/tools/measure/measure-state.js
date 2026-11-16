// State of the measure tool (spec 8.1): the mode, the point fields as typed
// text, the direct mode's azimuth and distance, the model, and what the next
// map click places. Map picks, pin drags, typing and pastes all go through
// this reducer, so the fields and the map never disagree.
//
// The points are shared by the modes: A is the first point and B the last
// in every mode, and the route's other points sit between them. So two
// points and the route show the same points, and the direct mode starts at A.

import { WGS84 } from "@convert-tools/core";
import { formatPairForCopy } from "../../lib/coordinate-paste.js";
import { degreesText } from "../../lib/number-text.js";
import { readPointText } from "../../lib/point-text.js";
import { MEASURE_MODES, lengthText, pointText } from "./measure.js";

const DIRECT_FIELDS = new Set(["azimuth", "distance", "distanceUnit"]);
const CUSTOM_FIELDS = new Set(["a", "inverseFlattening"]);

/**
 * @param {{ example?: object, routeMaxPoints?: number }} [initial]
 *   example: one of config.measure.examples, which sets the mode and its
 *   fields; routeMaxPoints: config.measure.route.maxPoints
 */
export function createMeasureState({ example, routeMaxPoints = 50 } = {}) {
  const state = {
    mode: "inverse",
    // Point fields as typed: A, the route's points between, B.
    a: "",
    middle: [],
    b: "",
    // Direct mode: the azimuth in degrees and the distance in distanceUnit.
    azimuth: "",
    distance: "",
    distanceUnit: "kilometre",
    // Unit of the measured distance in the result widget.
    unit: "kilometre",
    // An id of config.measure.models; custom holds the custom model's text.
    model: "wgs84",
    custom: { a: String(WGS84.a), inverseFlattening: degreesText(1 / WGS84.f) },
    routeMaxPoints,
    // Row (of modePoints) whose pick button was pressed, or null.
    armed: null,
    // Esc stopped picking the next empty point until picking is asked for again.
    paused: false,
    // Route: map clicks append points ("Haritadan ekle").
    adding: false,
    // Incremented only by explicit requests (examples, Enter, a mode switch,
    // a handed-over point), so typing never moves the map.
    fitRequest: 0,
    // The last paste of points while they are still shown, so it is
    // announced once: { index, count, swapped, truncated, dropped }.
    lastPaste: null,
  };
  return example ? withExample(state, example) : state;
}

/**
 * The point fields of the open mode, as typed: two points [A, B], direct
 * [A], route [A, …, B].
 * @returns {string[]}
 */
export function modePoints(state) {
  if (state.mode === "direct") return [state.a];
  if (state.mode === "route") return [state.a, ...state.middle, state.b];
  return [state.a, state.b];
}

/** The state with the open mode's point fields replaced. */
function withPoints(state, rows) {
  if (state.mode === "direct") return { ...state, a: rows[0] };
  if (state.mode === "route") return { ...state, a: rows[0], middle: rows.slice(1, -1), b: rows[rows.length - 1] };
  return { ...state, a: rows[0], b: rows[1] };
}

/**
 * What the next map click places: the row whose pick button is pressed,
 * else the first empty row, else (route, "Haritadan ekle" on, below the cap)
 * a new row at the end. null: a click does nothing.
 * @returns {null | { index: number, append: boolean }}
 */
export function pickTarget(state) {
  const rows = modePoints(state);
  if (state.armed != null && state.armed < rows.length) return { index: state.armed, append: false };
  if (state.paused) return null;
  const empty = rows.findIndex((row) => row.trim() === "");
  if (empty >= 0) return { index: empty, append: false };
  if (state.mode === "route" && state.adding && rows.length < state.routeMaxPoints) {
    return { index: rows.length, append: true };
  }
  return null;
}

const isRow = (index, rows) => Number.isInteger(index) && index >= 0 && index < rows.length;

/** A coordinate of the map, a paste or another tool: text in range, latitude first. */
const isCoordinate = (coordinate) =>
  coordinate != null &&
  typeof coordinate.latitude === "string" &&
  typeof coordinate.longitude === "string" &&
  readPointText(formatPairForCopy(coordinate.latitude, coordinate.longitude)).status === "valid";

const asText = (coordinate) => formatPairForCopy(coordinate.latitude, coordinate.longitude);

function withExample(state, example) {
  const mode = MEASURE_MODES.includes(example.mode) ? example.mode : "inverse";
  const points = (example.points ?? []).map(String);
  const next = { ...state, mode, armed: null, paused: false, lastPaste: null, fitRequest: state.fitRequest + 1 };
  if (mode === "direct") {
    return {
      ...next,
      a: points[0] ?? "",
      middle: [],
      b: "",
      azimuth: String(example.azimuth ?? ""),
      distance: String(example.distance ?? ""),
      distanceUnit: example.unit ?? state.distanceUnit,
    };
  }
  const rows = points.length >= 2 ? points : [points[0] ?? "", ""];
  return { ...next, a: rows[0], middle: rows.slice(1, -1), b: rows[rows.length - 1] };
}

/**
 * Carries the work over to another mode (spec 8.1): two points to direct
 * fills the azimuth and distance from the result; direct to two points or to
 * a route makes the computed point B (the route's last point). result is the
 * open mode's run value or null.
 */
function switchMode(state, mode, result) {
  if (!MEASURE_MODES.includes(mode) || mode === state.mode) return state;
  const next = { ...state, mode, armed: null, paused: false, fitRequest: state.fitRequest + 1 };
  if (state.mode === "inverse" && mode === "direct" && result?.inverse?.azimuthDefined) {
    next.azimuth = degreesText(result.inverse.initialBearingDegrees);
    next.distanceUnit = state.unit;
    next.distance = lengthText(result.inverse.distanceMetres, state.unit);
  }
  // Direct to two points or to a route: the computed point becomes B (the route's last point).
  if (state.mode === "direct" && result?.direct) {
    next.b = pointText(result.direct.latitude, result.direct.longitude);
  }
  return next;
}

/**
 * A paste of one or more points into row index. Two points: one or more
 * pairs fill A and B. Direct: the first pair fills A. Route: the pairs fill
 * the row and the empty rows after it, the rest is inserted after them, and
 * the route keeps at most routeMaxPoints rows.
 */
function paste(state, { index, points, swapped }) {
  const rows = modePoints(state);
  if (!Array.isArray(points) || points.length === 0 || !points.every(isCoordinate) || !isRow(index, rows)) return state;
  const texts = points.map(asText);
  let next;
  let used;
  if (state.mode === "route") {
    let end = index + 1;
    while (end < rows.length && rows[end].trim() === "" && end - index < texts.length) end += 1;
    const kept = rows.length - (end - index);
    used = Math.min(texts.length, state.routeMaxPoints - kept);
    const merged = [...rows.slice(0, index), ...texts.slice(0, used), ...rows.slice(end)];
    next = withPoints(state, merged.length >= 2 ? merged : [...merged, ""]);
  } else if (state.mode === "inverse" && texts.length >= 2) {
    used = 2;
    next = { ...state, a: texts[0], b: texts[1] };
  } else {
    used = 1;
    const copy = [...rows];
    copy[index] = texts[0];
    next = withPoints(state, copy);
  }
  return {
    ...next,
    armed: null,
    lastPaste: { index, count: used, swapped: swapped === true, truncated: used < texts.length, dropped: texts.length - used },
  };
}

function reduce(state, action) {
  switch (action.type) {
    case "mode":
      return switchMode(state, action.mode, action.result ?? null);
    case "edit": {
      const rows = modePoints(state);
      if (!isRow(action.index, rows)) return state;
      const copy = [...rows];
      copy[action.index] = String(action.text ?? "");
      return { ...withPoints(state, copy), armed: null };
    }
    case "direct":
      return DIRECT_FIELDS.has(action.field) ? { ...state, [action.field]: String(action.value ?? "") } : state;
    case "unit":
      return { ...state, unit: action.unit };
    case "model":
      return { ...state, model: action.model };
    case "custom":
      return CUSTOM_FIELDS.has(action.field) ? { ...state, custom: { ...state.custom, [action.field]: String(action.value ?? "") } } : state;
    case "pick": {
      const target = pickTarget(state);
      if (target == null || !isCoordinate(action.coordinate)) return state;
      const rows = [...modePoints(state)];
      if (target.append) rows.push(asText(action.coordinate));
      else rows[target.index] = asText(action.coordinate);
      return { ...withPoints(state, rows), armed: null };
    }
    case "move": {
      const rows = modePoints(state);
      if (!isRow(action.index, rows) || !isCoordinate(action.coordinate)) return state;
      const copy = [...rows];
      copy[action.index] = asText(action.coordinate);
      return withPoints(state, copy);
    }
    case "arm": {
      if (!isRow(action.index, modePoints(state))) return state;
      const target = pickTarget(state);
      // Pressing the button of the point being picked stops picking.
      if (target != null && !target.append && target.index === action.index) return { ...state, armed: null, paused: true };
      return { ...state, armed: action.index, paused: false };
    }
    case "startPicking":
      return { ...state, armed: null, paused: false };
    case "cancel":
      if (pickTarget(state) == null) return state;
      return { ...state, armed: null, paused: true, adding: false };
    case "adding": {
      const adding = action.on ?? !state.adding;
      return { ...state, adding, armed: null, paused: adding ? false : state.paused };
    }
    case "add": {
      const rows = modePoints(state);
      if (state.mode !== "route" || rows.length >= state.routeMaxPoints) return state;
      return withPoints(state, [...rows, ""]);
    }
    case "remove": {
      const rows = modePoints(state);
      if (state.mode !== "route" || rows.length <= 2 || !isRow(action.index, rows)) return state;
      return { ...withPoints(state, rows.filter((_, index) => index !== action.index)), armed: null };
    }
    case "reverse": {
      // Two points: A ↔ B; route: every point. A and B are the route's ends,
      // so the route's other points are reversed with them.
      if (state.mode === "direct") return state;
      const rows = [state.a, ...state.middle, state.b].reverse();
      return { ...state, a: rows[0], middle: rows.slice(1, -1), b: rows[rows.length - 1], armed: null };
    }
    case "clear": {
      const next = { ...state, a: "", middle: [], b: "", armed: null, paused: false };
      return state.mode === "direct" ? { ...next, azimuth: "", distance: "" } : next;
    }
    case "paste":
      return paste(state, action);
    case "example":
      return action.example ? withExample(state, action.example) : state;
    case "receive": {
      // A point handed over by another tool: slot "end" is B, which is an
      // input only in two points or the route.
      if (!isCoordinate(action.coordinate)) return state;
      const next = { ...state, armed: null, fitRequest: state.fitRequest + 1 };
      if (action.slot === "end") return { ...next, b: asText(action.coordinate), mode: state.mode === "direct" ? "inverse" : state.mode };
      return { ...next, a: asText(action.coordinate) };
    }
    case "fit":
      return { ...state, fitRequest: state.fitRequest + 1 };
    default:
      return state;
  }
}

const samePoints = (first, second) =>
  first.mode === second.mode && first.a === second.a && first.b === second.b && first.middle === second.middle;

/** The reducer of the measure tool; see the actions in reduce. */
export function measureReducer(state, action) {
  const next = reduce(state, action);
  // A paste notice stays while its points are shown; the next change of the points clears it.
  if (action.type !== "paste" && next.lastPaste != null && !samePoints(state, next)) return { ...next, lastPaste: null };
  return next;
}
