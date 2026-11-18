// The component kit (src/components) rendered on the server: each part keeps
// its roles, states and accessible names. Also the design tokens of
// src/theme.js, and that text on every surface meets WCAG AA.

import assert from "node:assert/strict";
import test from "node:test";
import "./support/jsx-loader.mjs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { readJson } from "./support/files.mjs";
import { buttonLabels, markup, visibleText } from "./support/html.mjs";

const lang = readJson("public/lang.json");
const config = readJson("public/config.json");

const { ConfigContext, LanguageContext } = await import("../src/context.js");
const { nextIndex, nextIndexForKey } = await import("../src/lib/roving.js");
const theme = await import("../src/theme.js");
const kit = Object.fromEntries(
  await Promise.all(
    ["CallSnippet", "Chips", "CopyButton", "DataList", "Disclosure", "ErrorMessage", "Notice", "Readout", "Segmented"].map(
      async (name) => [name, await import(`../src/components/${name}.jsx`)],
    ),
  ),
);
const { default: Segmented } = kit.Segmented;
const { default: Readout } = kit.Readout;
const { default: DataList, DataRow } = kit.DataList;
const { default: CallSnippet } = kit.CallSnippet;
const { default: Notice } = kit.Notice;
const { default: ErrorMessage } = kit.ErrorMessage;
const { default: Chips } = kit.Chips;
const { default: Disclosure } = kit.Disclosure;
const { default: CopyButton } = kit.CopyButton;

/** Renders with the contexts the app provides; returns the elements without Emotion's styles. */
function render(element, language = "tr") {
  const languageNames = Object.fromEntries(config.languages.map((code) => [code, lang[code].text.languageName]));
  const value = { language, languageNames, ...lang[language] };
  return markup(
    renderToString(h(ConfigContext.Provider, { value: config }, h(LanguageContext.Provider, { value }, element))),
  );
}

const count = (html, pattern) => (html.match(pattern) || []).length;

const UNITS = [
  { value: "kilometre", label: "km" },
  { value: "nautical-mile", label: "NM" },
  { value: "metre", label: "m" },
];

test("Segmented is a radio group with exactly one checked radio, the only one in the tab order", () => {
  for (const tone of ["paper", "ink"]) {
    for (const size of ["sm", "md"]) {
      const html = render(h(Segmented, { label: "Birim", options: UNITS, value: "nautical-mile", onChange() {}, tone, size }));
      assert.match(html, /role="radiogroup"[^>]*aria-label="Birim"|aria-label="Birim"[^>]*role="radiogroup"/);
      assert.equal(count(html, /role="radio"/g), 3);
      assert.equal(count(html, /aria-checked="true"/g), 1);
      assert.equal(count(html, /aria-checked="false"/g), 2);
      assert.match(html, /aria-checked="true"[^>]*tabindex="0"[^>]*>NM</);
      assert.equal(count(html, /tabindex="0"/g), 1);
      assert.equal(visibleText(html), "km NM m");
    }
  }
});

test("a Segmented with no matching value can still be tabbed into", () => {
  const html = render(h(Segmented, { label: "Birim", options: UNITS, value: "foot", onChange() {} }));
  assert.equal(count(html, /aria-checked="true"/g), 0);
  assert.equal(count(html, /tabindex="0"/g), 1);
});

test("arrow keys move inside a group and wrap; Home and End jump to the ends", () => {
  assert.equal(nextIndex("ArrowRight", 0, 3), 1);
  assert.equal(nextIndex("ArrowDown", 2, 3), 0);
  assert.equal(nextIndex("ArrowLeft", 0, 3), 2);
  assert.equal(nextIndex("ArrowUp", 1, 3), 0);
  assert.equal(nextIndex("Home", 2, 3), 0);
  assert.equal(nextIndex("End", 0, 3), 2);
  // Nothing selected yet: forward starts at the first, backward at the last.
  assert.equal(nextIndex("ArrowRight", -1, 3), 0);
  assert.equal(nextIndex("ArrowLeft", -1, 3), 2);
  for (const key of ["Enter", " ", "Tab", "a"]) assert.equal(nextIndex(key, 1, 3), null, key);
  assert.equal(nextIndex("ArrowRight", 0, 0), null);
});

test("arrow keys with Alt, Ctrl or Meta are left to the browser (history shortcuts)", () => {
  const key = (name, modifiers = {}) => ({ key: name, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...modifiers });
  for (const modifier of ["altKey", "ctrlKey", "metaKey"]) {
    for (const name of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]) {
      assert.equal(nextIndexForKey(key(name, { [modifier]: true }), 1, 3), null, `${modifier} + ${name}`);
    }
  }
  assert.equal(nextIndexForKey(key("ArrowRight"), 1, 3), 2);
  assert.equal(nextIndexForKey(key("ArrowLeft", { shiftKey: true }), 1, 3), 0, "Shift does not stop a move");
  assert.equal(nextIndexForKey(key("Enter"), 1, 3), null);
});

test("a Readout without a value shows a dash and its empty state instead of its rows", () => {
  const html = render(
    h(
      Readout,
      {
        label: "Elipsoidal mesafe",
        value: null,
        unit: "km",
        copyValue: "350.092",
        copyLabel: "Elipsoidal mesafe",
        empty: h("p", null, "EMPTY-STATE"),
      },
      h("p", null, "SECONDARY-ROW"),
    ),
  );
  const text = visibleText(html);
  assert.ok(text.includes("—"), text);
  assert.ok(text.includes("EMPTY-STATE"), text);
  assert.ok(!text.includes("SECONDARY-ROW"), text);
  assert.deepEqual(buttonLabels(html), [], "nothing to copy yet");
});

test("a Readout with a value shows it with its unit, its rows, its aside and a copy button", () => {
  const html = render(
    h(
      Readout,
      {
        label: "Elipsoidal mesafe",
        value: "350,092",
        unit: "km",
        copyValue: "350.091704",
        copyLabel: "Elipsoidal mesafe",
        aside: h("span", null, "UNIT-SWITCH"),
        empty: h("p", null, "EMPTY-STATE"),
      },
      h("p", null, "SECONDARY-ROW"),
    ),
  );
  const text = visibleText(html);
  assert.ok(text.startsWith("Elipsoidal mesafe UNIT-SWITCH 350,092 km"), text);
  assert.ok(text.includes("SECONDARY-ROW"), text);
  assert.ok(!text.includes("EMPTY-STATE") && !text.includes("—"), text);
  assert.ok(buttonLabels(html).some((label) => label.includes("Elipsoidal mesafe")), html);
});

test("a DataRow with copyValue has a copy button named after its label", () => {
  const html = render(
    h(
      DataList,
      null,
      h(DataRow, { label: "İndirgenmiş uzunluk", symbol: "m12", value: "123,456", unit: "m", copyValue: "123.456", note: "NOTE" }),
      h(DataRow, { label: "Çözücü", value: "newton" }),
    ),
  );
  assert.match(html, /^<dl\b/);
  assert.equal(count(html, /<dt\b/g), 2);
  const text = visibleText(html);
  assert.ok(text.includes("m12 İndirgenmiş uzunluk 123,456 m"), text);
  assert.ok(text.includes("NOTE") && text.includes("Çözücü newton"), text);
  const labels = buttonLabels(html);
  assert.equal(labels.length, 1, "only the row with copyValue");
  assert.ok(labels[0].includes("İndirgenmiş uzunluk"), labels[0]);
});

test("CallSnippet shows its call under the library-call title, with a copy button", () => {
  const code = "inverseGeodesic({ latitude: 39.933365, longitude: 32.859742 }, { latitude: 41.008238, longitude: 28.978359 })";
  for (const language of ["tr", "en"]) {
    const html = render(h(CallSnippet, { code }), language);
    const text = visibleText(html);
    assert.ok(text.includes(lang[language].text.libraryCall), text);
    assert.ok(text.includes(code), text);
    assert.match(html, /<code\b/);
    assert.ok(buttonLabels(html).some((label) => label.includes(lang[language].text.libraryCall)));
  }
});

test("a Notice is an alert for errors and a note otherwise", () => {
  assert.match(render(h(Notice, { tone: "error" }, "Bozuk")), /role="alert"/);
  for (const tone of ["info", "warn"]) {
    const html = render(h(Notice, { tone }, "Bilgi"));
    assert.match(html, /role="note"/, tone);
    assert.doesNotMatch(html, /role="alert"/, tone);
    assert.ok(visibleText(html).includes("Bilgi"), tone);
  }
});

test("ErrorMessage is an error Notice: what is wrong, its meaning, then the code in mono", () => {
  const html = render(h(ErrorMessage, { summary: "Dönüşüm yapılamadı.", code: "UNSUPPORTED_CRS" }));
  assert.match(html, /role="alert"/);
  assert.ok(visibleText(html).includes(`Dönüşüm yapılamadı. ${lang.tr.errors.UNSUPPORTED_CRS} (UNSUPPORTED_CRS)`));
  assert.match(html, /<code[^>]*>\(UNSUPPORTED_CRS\)<\/code>/);
});

test("Chips are a labelled group of buttons; only chips with active say whether they are pressed", () => {
  const html = render(
    h(Chips, {
      label: "Örnekler",
      items: [
        { key: "a", label: "Ankara → İstanbul", onClick() {} },
        { key: "b", label: "Kutup", onClick() {}, active: true },
        { key: "c", label: "Ekvator", onClick() {}, active: false },
      ],
    }),
  );
  assert.match(html, /role="group"/);
  assert.equal(count(html, /<button\b/g), 3);
  assert.equal(count(html, /aria-pressed="true"/g), 1);
  assert.equal(count(html, /aria-pressed="false"/g), 1);
  assert.equal(visibleText(html), "Örnekler Ankara → İstanbul Kutup Ekvator");
  const labelId = html.match(/role="group"[^>]*aria-labelledby="([^"]+)"/)[1];
  assert.match(html, new RegExp(`id="${labelId}"[^>]*>Örnekler<`));
});

test("Disclosure is a native details element, closed unless defaultOpen", () => {
  const closed = render(h(Disclosure, { title: "Ayrıntılar" }, h("p", null, "BODY")));
  assert.match(closed, /^<details\b/);
  assert.doesNotMatch(closed.match(/^<details[^>]*>/)[0], /\bopen\b/);
  assert.match(closed, /<summary\b[^>]*>[\s\S]*Ayrıntılar[\s\S]*<\/summary>/);
  assert.ok(visibleText(closed).includes("BODY"), "the body is in the page, only folded");
  const open = render(h(Disclosure, { title: "Ayrıntılar", defaultOpen: true }, "BODY"));
  assert.match(open.match(/^<details[^>]*>/)[0], /\bopen=""/);
});

test("CopyButton names what it copies and has a polite status region for the confirmation", () => {
  for (const props of [{}, { iconOnly: true }, { iconOnly: true, tone: "ink" }]) {
    const html = render(h(CopyButton, { value: "1852", label: "Sonuç", ...props }));
    assert.deepEqual(buttonLabels(html), [`${lang.tr.text.copy} Sonuç`], JSON.stringify(props));
    assert.match(html, /role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"/);
    assert.match(html, /<svg\b/, "the copy icon");
  }
  const text = visibleText(render(h(CopyButton, { value: "1852", label: "Sonuç" })));
  assert.equal(text, lang.tr.text.copy);
  assert.equal(visibleText(render(h(CopyButton, { value: "1852", iconOnly: true }))), "");
});

test("theme.js exports the design tokens", () => {
  assert.deepEqual(theme.TYPE, { label: 11, meta: 12, small: 13, body: 14, title: 16, heading: 22, readout: 32 });
  assert.deepEqual(theme.RADIUS, { control: 8, card: 12, widget: 16, pill: 999 });
  assert.deepEqual(theme.MOTION, { fast: "120ms", base: "180ms", ease: "cubic-bezier(0.2, 0, 0, 1)" });
  assert.equal(theme.BAR_HEIGHT, 52);
  assert.deepEqual(Object.keys(theme.SHADOW).sort(), ["float", "raised"]);
  assert.equal(theme.SHADOW_FLOAT, theme.SHADOW.float);
  for (const key of ["onInk", "onInkMuted", "inkRaised", "glass"]) assert.equal(typeof theme.COLORS[key], "string", key);
  for (const name of ["UI_FONT", "MONO_FONT", "PHONE", "theme"]) assert.ok(theme[name], name);
});

// WCAG 2.x relative luminance and contrast, for "#rrggbb" and "rgba(r, g, b, a)".
function rgba(color) {
  const hex = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) return { r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16), a: 1 };
  const [r, g, b, a = 1] = color.match(/[\d.]+/g).map(Number);
  return { r, g, b, a };
}
function over(top, bottom) {
  const front = rgba(top);
  const back = rgba(bottom);
  const mix = (channel) => front[channel] * front.a + back[channel] * (1 - front.a);
  return { r: mix("r"), g: mix("g"), b: mix("b"), a: 1 };
}
function luminance(color) {
  const { r, g, b } = typeof color === "string" ? rgba(color) : color;
  const linear = (value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}
function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test("both palettes have the same keys, and COLORS names each as a CSS variable", () => {
  const keys = Object.keys(theme.PALETTES.light).sort();
  assert.deepEqual(Object.keys(theme.PALETTES.dark).sort(), keys);
  assert.deepEqual(Object.keys(theme.COLORS).sort(), keys);
  for (const key of keys) assert.equal(theme.COLORS[key], `var(--ct-${key})`);
  for (const mode of theme.THEME_MODES) {
    const variables = theme.cssVariables(mode);
    for (const key of keys) assert.equal(variables[`--ct-${key}`], theme.PALETTES[mode][key], `${mode} ${key}`);
    assert.ok(variables["--ct-shadow-float"] && variables["--ct-shadow-raised"], mode);
  }
});

for (const mode of ["light", "dark"]) {
  test(`${mode}: text meets WCAG AA (4.5:1) on paper, sheet, glass and panels; focus rings 3:1`, () => {
    const C = theme.PALETTES[mode];
    // The bar's glass over the most contrasting map pixel is the worst case.
    const glass = over(C.glass, mode === "light" ? "#000000" : "#ffffff");
    const pairs = [
      ...["ink", "ink2", "muted"].flatMap((text) =>
        ["paper", "paper2", "sheet"].map((surface) => [text, C[text], surface, C[surface]]),
      ),
      ...["ink", "ink2", "muted"].map((text) => [text, C[text], "glass over the map", glass]),
      ["onInk", C.onInk, "panel", C.panel],
      ["onInk", C.onInk, "inkRaised", C.inkRaised],
      ["onInkMuted", C.onInkMuted, "panel", C.panel],
      ["onInkMuted", C.onInkMuted, "inkRaised", C.inkRaised],
      ["onSelected", C.onSelected, "selected", C.selected],
      ["panel", C.panel, "onInk", C.onInk],
      ["warn", C.warn, "warnSoft", C.warnSoft],
      ["error", C.error, "errorSoft", C.errorSoft],
      ["error", C.error, "sheet", C.sheet],
      ["success", C.success, "sheet", C.sheet],
      ["aInk", C.aInk, "sheet", C.sheet],
      ["aInk", C.aInk, "aSoft", C.aSoft],
      ["bInk", C.bInk, "sheet", C.sheet],
      ["bInk", C.bInk, "bSoft", C.bSoft],
    ];
    for (const [textName, text, surfaceName, surface] of pairs) {
      const ratio = contrast(text, surface);
      assert.ok(ratio >= 4.5, `${textName} on ${surfaceName}: ${ratio.toFixed(2)}`);
    }
    for (const [ring, surface] of [
      [C.focus, C.paper],
      [C.focus, C.sheet],
      [C.focusOnInk, C.panel],
      [C.focusOnInk, C.inkRaised],
    ]) {
      assert.ok(contrast(ring, surface) >= 3, `${ring} on ${surface}`);
    }
  });
}
