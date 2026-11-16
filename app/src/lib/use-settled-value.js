import { useEffect, useState } from "react";

/**
 * The value after it has stopped changing for delay ms: what a polite live
 * region announces, so typing is not read out keystroke by keystroke.
 * @template T
 * @param {T} value
 * @param {number} delay ms
 * @returns {T}
 */
export function useSettledValue(value, delay) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
