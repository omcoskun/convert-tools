// One tool hands a point to another: "Ölçümde A yap" in the position tool
// sends the position to the measure tool and opens it. The receiving tool
// takes the point when it mounts, and while mounted (the workspace tool stays
// mounted, hidden, behind a page tool) when it is told a point arrived.
// App.jsx provides the store.

import { createContext, useContext, useEffect } from "react";

/**
 * @typedef {{ latitude: string, longitude: string, slot?: "start" | "end" }} HandoffPoint
 *   latitude and longitude as typed text (the receiver puts them in its
 *   fields); slot names the receiver's point, "start" when left out.
 */

/**
 * A store of points waiting for a tool, one per tool id.
 * @param {(toolId: string) => void} [onSend] called after a point is stored;
 *   the app opens the tool there
 * @returns {{
 *   send(toolId: string, point: HandoffPoint): void,
 *   consume(toolId: string): HandoffPoint | null,
 *   subscribe(toolId: string, listener: () => void): () => void,
 * }}
 *   send stores a copy of the point (replacing one not yet taken), tells the
 *   tool's listeners and opens the tool; consume returns the point for that
 *   tool once, then null; subscribe returns the function that unsubscribes.
 */
export function createHandoffStore(onSend) {
  const waiting = new Map();
  const listeners = new Map();
  return Object.freeze({
    send(toolId, point) {
      waiting.set(toolId, { ...point });
      for (const listener of [...(listeners.get(toolId) ?? [])]) listener();
      onSend?.(toolId);
    },
    subscribe(toolId, listener) {
      if (!listeners.has(toolId)) listeners.set(toolId, new Set());
      listeners.get(toolId).add(listener);
      return () => listeners.get(toolId).delete(listener);
    },
    consume(toolId) {
      if (!waiting.has(toolId)) return null;
      const point = waiting.get(toolId);
      waiting.delete(toolId);
      return point;
    },
  });
}

/** The app's handoff store (createHandoffStore); App.jsx provides it. */
export const HandoffContext = createContext(null);

/**
 * @returns {ReturnType<typeof createHandoffStore>} send(toolId, point) opens
 *   the tool with the point waiting for it; consume(toolId) takes it, once.
 *   A receiving tool uses useHandoffReceiver.
 */
export function useHandoff() {
  const value = useContext(HandoffContext);
  if (value == null) throw new Error("HandoffContext is not provided.");
  return value;
}

/**
 * Calls receive with each point handed to toolId: one waiting when the tool
 * mounts, and every later one while it stays mounted.
 * @param {string} toolId the receiving tool's id
 * @param {(point: HandoffPoint) => void} receive must be stable (useCallback)
 */
export function useHandoffReceiver(toolId, receive) {
  const { consume, subscribe } = useHandoff();
  useEffect(() => {
    const take = () => {
      const point = consume(toolId);
      if (point != null) receive(point);
    };
    take();
    return subscribe(toolId, take);
  }, [toolId, receive, consume, subscribe]);
}
