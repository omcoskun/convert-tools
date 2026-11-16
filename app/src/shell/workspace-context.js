// How a workspace tool talks to the workspace around it (WorkspaceLayout):
// it publishes the scene the one map draws and reads the workspace state.
// The tool renders exactly one InputWidget and one ResultHud, as siblings;
// the layout places them.

import { createContext, useCallback, useContext, useEffect, useRef } from "react";

/**
 * Stable for the life of the layout: publishing the scene and the widgets'
 * nodes never re-renders the tool. Internal to the shell.
 * @type {import("react").Context<null | {
 *   publish(owner: object, scene: import("../map/scene.js").MapScene): void,
 *   setHandlers(owner: object, handlers: MapSceneHandlers): void,
 *   withdraw(owner: object): void,
 *   registerWidget(kind: "input" | "result", node: HTMLElement | null): void,
 * }>}
 */
export const WorkspaceApiContext = createContext(null);

/** @type {import("react").Context<null | { expanded: boolean, mapStatus: MapStatus }>} */
export const WorkspaceContext = createContext(null);

/**
 * @typedef {"loading" | "ready" | "error" | "unsupported"} MapStatus
 *   unsupported: the browser has no WebGL 2; the tools still work.
 */

/**
 * @typedef {{
 *   onPick?: (coordinate: { latitude: string, longitude: string }) => void,
 *   onPinMove?: (id: string, coordinate: { latitude: string, longitude: string }) => void,
 *   onCancelPick?: () => void,
 * }} MapSceneHandlers
 *   coordinate: a map position as form text, rounded to what one screen
 *   pixel resolves at the current zoom (5 to 8 decimals), the longitude
 *   wrapped into ±180°. onPick: a click, or Enter on the focused map, while
 *   the scene is picking. onPinMove: a draggable pin is being dragged (once
 *   per frame and at the drop). onCancelPick: Esc or the hint's cancel
 *   button while picking.
 */

function useWorkspaceApi() {
  const api = useContext(WorkspaceApiContext);
  if (api == null) throw new Error("A workspace tool must be rendered inside WorkspaceLayout.");
  return api;
}

/**
 * Shows the tool's scene on the workspace map until the tool unmounts. Pass
 * a memoized scene: the map updates whatever changed (pins by id, the lines,
 * picking, a new fitRequest). The handlers are read when the event happens,
 * so they need no memoizing.
 * @param {import("../map/scene.js").MapScene} scene
 * @param {MapSceneHandlers} handlers
 */
export function useMapScene(scene, handlers) {
  const api = useWorkspaceApi();
  const ownerRef = useRef(null);
  if (ownerRef.current === null) ownerRef.current = {};
  const owner = ownerRef.current;
  useEffect(() => {
    api.setHandlers(owner, handlers);
  });
  useEffect(() => {
    api.publish(owner, scene);
  }, [api, owner, scene]);
  useEffect(() => () => api.withdraw(owner), [api, owner]);
}

/**
 * The workspace as a tool or widget sees it.
 * @returns {{ expanded: boolean, mapStatus: MapStatus }} expanded: the map is
 *   enlarged and the widgets are tucked away (the result shows one compact
 *   line); mapStatus: whether the map is loading, ready, failed or
 *   unsupported.
 */
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (value == null) throw new Error("A workspace tool must be rendered inside WorkspaceLayout.");
  return value;
}

/** A ref callback that tells the layout where a widget is (fit padding, the input widget's height). */
export function useWidgetRef(kind) {
  const api = useWorkspaceApi();
  return useCallback((node) => api.registerWidget(kind, node), [api, kind]);
}
