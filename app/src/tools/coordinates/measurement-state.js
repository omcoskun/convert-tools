// State of the distance tool: the four form fields plus which point a click
// on the map places. Map picks, marker drags and typing all go through this
// reducer, so the form and the map can never disagree.

import { EMPTY_POINTS, endpointFromText, swapEndpoints } from "./distance.js";

/** @param {Partial<typeof EMPTY_POINTS>} values */
export function createMeasurementState(values = EMPTY_POINTS) {
  return {
    values: { ...EMPTY_POINTS, ...values },
    // null | "start" | "end": the point the next map click places.
    activeTarget: null,
    // true while "pick on the map" places A and then continues with B.
    sequence: false,
    // Incremented only by explicit requests (examples, Enter, the fit
    // button), so typing never moves the map.
    fitRequest: 0,
  };
}

const isCoordinate = (coordinate) =>
  coordinate != null &&
  typeof coordinate.latitude === "string" &&
  typeof coordinate.longitude === "string" &&
  endpointFromText(coordinate.latitude, coordinate.longitude) !== null;

function withEndpoint(values, target, coordinate) {
  return { ...values, [`${target}Latitude`]: coordinate.latitude, [`${target}Longitude`]: coordinate.longitude };
}

const idle = { activeTarget: null, sequence: false };

export function measurementReducer(state, action) {
  switch (action.type) {
    case "startPicking":
      return { ...state, activeTarget: "start", sequence: true };
    case "arm":
      // Pressing the armed point's button again disarms it.
      if (state.activeTarget === action.target && !state.sequence) return { ...state, ...idle };
      return { ...state, activeTarget: action.target, sequence: false };
    case "cancel":
      return state.activeTarget ? { ...state, ...idle } : state;
    case "pick": {
      const target = state.activeTarget;
      if (!target || !isCoordinate(action.coordinate)) return state;
      const continueWithEnd = state.sequence && target === "start";
      return {
        ...state,
        values: withEndpoint(state.values, target, action.coordinate),
        activeTarget: continueWithEnd ? "end" : null,
        sequence: continueWithEnd,
      };
    }
    case "move":
      if (!isCoordinate(action.coordinate)) return state;
      return { ...state, values: withEndpoint(state.values, action.target, action.coordinate) };
    case "edit":
      return { ...state, ...idle, values: { ...state.values, [action.key]: action.value } };
    case "swap":
      return { ...state, values: swapEndpoints(state.values) };
    case "clear":
      return { ...state, ...idle, values: { ...EMPTY_POINTS } };
    case "example":
      return { ...state, ...idle, values: { ...EMPTY_POINTS, ...action.values }, fitRequest: state.fitRequest + 1 };
    case "fit":
      return { ...state, fitRequest: state.fitRequest + 1 };
    default:
      return state;
  }
}
