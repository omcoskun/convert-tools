// Small choices the browser remembers between visits: the colour theme and
// the map's basemap, overlays and scale. Kept under one prefix in
// localStorage. Storage may be missing or throw (private windows, blocked
// site data, server rendering); a failed read gives the fallback and a
// failed write is ignored, so nothing depends on it.

const PREFIX = "convert-tools:";

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The stored value of a preference, or `fallback` if there is none, it cannot
 * be read, or it is not one of `allowed` (when given).
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @param {readonly T[]} [allowed]
 * @returns {T}
 */
export function readPref(key, fallback, allowed) {
  try {
    const text = storage()?.getItem(PREFIX + key);
    if (text == null) return fallback;
    const value = JSON.parse(text);
    if (allowed && !allowed.includes(value)) return fallback;
    if (!allowed && typeof value !== typeof fallback) return fallback;
    return value;
  } catch {
    return fallback;
  }
}

/** Stores a preference; does nothing if storage is unavailable. */
export function writePref(key, value) {
  try {
    storage()?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the choice lasts for this visit only.
  }
}
