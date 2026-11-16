/**
 * Where arrow-key focus moves inside a group of options (a radio group such
 * as Segmented): the arrows step and wrap around, Home and End jump to the
 * ends. With nothing selected (index -1) forward starts at the first option
 * and backward at the last.
 * @param {string} key KeyboardEvent.key
 * @param {number} index the current option, or -1
 * @param {number} count number of options
 * @returns {number | null} the next index, or null when the key does not move
 */
export function nextIndex(key, index, count) {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return index < 0 ? 0 : (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return index < 0 ? count - 1 : (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * nextIndex for a key event, except that keys pressed with Alt, Ctrl or Meta
 * are left to the browser: Alt+← / Cmd+← go back in history and must not
 * be swallowed by a group that happens to have focus.
 * @param {{ key: string, altKey?: boolean, ctrlKey?: boolean, metaKey?: boolean }} event a KeyboardEvent
 * @param {number} index the current option, or -1
 * @param {number} count number of options
 * @returns {number | null} the next index, or null when the group ignores the key
 */
export function nextIndexForKey(event, index, count) {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  return nextIndex(event.key, index, count);
}
