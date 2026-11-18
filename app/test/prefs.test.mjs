import assert from "node:assert/strict";
import test from "node:test";
import { readPref, writePref } from "../src/lib/prefs.js";
import { resolveTheme } from "../src/theme.js";

function withStorage(storage, run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: storage === undefined ? {} : { get localStorage() { return storage(); } } });
  try {
    run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
}

test("preferences fall back when there is no window or storage throws", () => {
  assert.equal(readPref("theme", "system"), "system");
  withStorage(() => {
    throw new Error("blocked");
  }, () => {
    assert.equal(readPref("theme", "system"), "system");
    assert.doesNotThrow(() => writePref("theme", "dark"));
  });
});

test("preferences read back what was written, within the allowed values and type", () => {
  const items = new Map();
  const memory = { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)) };
  withStorage(() => memory, () => {
    writePref("theme", "dark");
    assert.equal(readPref("theme", "system", ["system", "light", "dark"]), "dark");
    writePref("theme", "purple");
    assert.equal(readPref("theme", "system", ["system", "light", "dark"]), "system");
    writePref("overlays", { graticule: true });
    assert.deepEqual(readPref("overlays", {}), { graticule: true });
    assert.equal(readPref("scaleAlways", false), false);
    writePref("scaleAlways", "yes");
    assert.equal(readPref("scaleAlways", false), false);
    items.set("convert-tools:broken", "{");
    assert.equal(readPref("broken", 1), 1);
  });
});

test("the system preference follows the system; light and dark are fixed", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("nonsense", true), "dark");
});
