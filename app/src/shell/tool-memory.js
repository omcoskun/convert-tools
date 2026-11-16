// What the workspace tools keep while another tool is open. Only one
// workspace tool is mounted at a time, so switching from Ölçüm to Konum and
// back would otherwise start Ölçüm again from its first example. The memory
// lives as long as the page (App creates one); nothing is stored in the
// browser.

import { createContext, useContext, useEffect, useReducer, useState } from "react";

export const ToolMemoryContext = createContext(null);

/** A new, empty memory: one entry per tool and key ("measure", "positions.format", ...). */
export function createToolMemory() {
  return new Map();
}

/**
 * useState that starts from the remembered value of key, if any, and
 * remembers every new value.
 * @template T
 * @param {string} key
 * @param {T | (() => T)} initial
 * @returns {[T, (value: T | ((current: T) => T)) => void]}
 */
export function useRememberedState(key, initial) {
  const memory = useContext(ToolMemoryContext);
  const [value, setValue] = useState(() => {
    if (memory?.has(key)) return memory.get(key);
    return typeof initial === "function" ? initial() : initial;
  });
  useEffect(() => {
    memory?.set(key, value);
  }, [memory, key, value]);
  return [value, setValue];
}

/**
 * useReducer that starts from the remembered state of key, passed through
 * restore (to drop what must not survive, such as an armed map pick), and
 * remembers every new state.
 * @template S, A
 * @param {string} key
 * @param {(state: S, action: A) => S} reducer
 * @param {any} initialArg
 * @param {(arg: any) => S} init
 * @param {(saved: S) => S} [restore]
 * @returns {[S, (action: A) => void]}
 */
export function useRememberedReducer(key, reducer, initialArg, init, restore = (saved) => saved) {
  const memory = useContext(ToolMemoryContext);
  const [state, dispatch] = useReducer(reducer, initialArg, (arg) => (memory?.has(key) ? restore(memory.get(key)) : init(arg)));
  useEffect(() => {
    memory?.set(key, state);
  }, [memory, key, state]);
  return [state, dispatch];
}
