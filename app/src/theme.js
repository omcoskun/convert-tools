import { createTheme } from "./ui/index.js";

// Design tokens of the demo. Components are styled from these and nothing
// else, so the whole interface changes in one place.
//
// "Paper and ink": the interface stays neutral and colour is kept for data.
// A is cobalt, B is vermilion, and the measured route runs from one to the
// other. Besides A and B only status (warning, error, success) has a hue.
//
// Two palettes with the same keys, light and dark. Components read COLORS,
// whose values are CSS variables (var(--ct-<key>)); the MUI theme of the
// active mode writes the palette's values to :root (createAppTheme), so the
// whole interface switches without re-rendering a component.
//
// panel: the dark surface of the result widget, readouts and tooltips, dark
// in both modes; onInk, onInkMuted, inkRaised and focusOnInk are its text,
// raised controls and focus ring. selected / onSelected: a pressed or checked
// control on paper (ink in light mode, near-white in dark mode).
//
// Text and focus contrast is verified for both palettes in test/kit.test.mjs.
export const PALETTES = Object.freeze({
  light: Object.freeze({
    paper: "#f2f4f7",
    paper2: "#e9edf2",
    sheet: "#ffffff",
    ink: "#18212f",
    ink2: "#354459",
    muted: "#596779",
    faint: "#8793a3",
    rule: "#dfe5ec",
    rule2: "#c6d0dc",
    a: "#2450e0",
    aSoft: "#e8edfd",
    aInk: "#1a3db0",
    b: "#e2492c",
    bSoft: "#fdece7",
    bInk: "#a92f19",
    warn: "#855600",
    warnSoft: "#fff4d8",
    warnRule: "#ecd59c",
    focus: "#2450e0",
    panel: "#18212f",
    onInk: "#f2f4f7",
    onInkMuted: "#a9aeb0",
    inkRaised: "#2a2f33",
    focusOnInk: "#9fb4ff",
    selected: "#18212f",
    onSelected: "#f2f4f7",
    // The sheet at about 96 %, for bars and widgets over the map.
    glass: "rgba(255, 255, 255, 0.96)",
    scrim: "rgba(22, 25, 28, 0.16)",
    error: "#b3341d",
    errorSoft: "#fbeae6",
    success: "#1d7a4e",
  }),
  dark: Object.freeze({
    paper: "#0e1217",
    paper2: "#1c232c",
    sheet: "#151a21",
    ink: "#e7ecf2",
    ink2: "#c3ccd7",
    muted: "#9aa5b3",
    faint: "#6f7b8b",
    rule: "#252d37",
    rule2: "#36404c",
    a: "#2450e0",
    aSoft: "#1b2954",
    aInk: "#aabdff",
    b: "#e2492c",
    bSoft: "#3b1f19",
    bInk: "#ffad9b",
    warn: "#f1c56e",
    warnSoft: "#33290f",
    warnRule: "#5c4a1c",
    focus: "#8ca8ff",
    panel: "#1f2731",
    onInk: "#eef2f6",
    onInkMuted: "#a7b1bd",
    inkRaised: "#323b47",
    focusOnInk: "#9fb4ff",
    selected: "#e7ecf2",
    onSelected: "#11161c",
    glass: "rgba(21, 26, 33, 0.94)",
    scrim: "rgba(0, 0, 0, 0.45)",
    error: "#ff9580",
    errorSoft: "#3a1d18",
    success: "#62d39f",
  }),
});

/** The palette keys, each as the CSS variable the active palette sets. */
export const COLORS = Object.freeze(Object.fromEntries(Object.keys(PALETTES.light).map((key) => [key, `var(--ct-${key})`])));

/**
 * Colours used where a CSS variable cannot reach: SVG data URLs (the picking
 * cursor) and canvas drawing. The same in both palettes.
 */
export const ACCENT_HEX = Object.freeze({ a: PALETTES.light.a, b: PALETTES.light.b, ink: "#16191c" });

/** Type sizes in px. Text uses two weights, 400 and 650; 700 is for the brand and letter badges. */
export const TYPE = Object.freeze({ label: 11, meta: 12, small: 13, body: 14, title: 16, heading: 22, readout: 28 });

/** The small uppercase label (readouts, chip rows, the library call, indexes); colour is set by the caller. */
export const LABEL_CAPS = Object.freeze({ fontSize: TYPE.label, fontWeight: 650, letterSpacing: "0.08em", textTransform: "uppercase" });

/** Corner radii in px. */
export const RADIUS = Object.freeze({ control: 8, card: 12, widget: 16, pill: 999 });

const SHADOWS = Object.freeze({
  light: Object.freeze({
    float: "0 1px 3px rgba(22, 25, 28, 0.12), 0 8px 28px rgba(22, 25, 28, 0.14)",
    raised: "0 1px 2px rgba(22, 25, 28, 0.1), 0 12px 32px rgba(22, 25, 28, 0.18)",
  }),
  dark: Object.freeze({
    float: "0 1px 3px rgba(0, 0, 0, 0.4), 0 10px 30px rgba(0, 0, 0, 0.45)",
    raised: "0 1px 2px rgba(0, 0, 0, 0.45), 0 14px 36px rgba(0, 0, 0, 0.55)",
  }),
});

/** float: widgets on the map. raised: menus and tooltips. Pages use borders, not shadows. */
export const SHADOW = Object.freeze({ float: "var(--ct-shadow-float)", raised: "var(--ct-shadow-raised)" });

export const SHADOW_FLOAT = SHADOW.float;

/** fast: hover and press. base: open and close. Numbers never animate. */
export const MOTION = Object.freeze({ fast: "120ms", base: "180ms", ease: "cubic-bezier(0.2, 0, 0, 1)" });

/** Height of the top bar in px. */
export const BAR_HEIGHT = 52;
export const PHONE_BAR_HEIGHT = 100;

/**
 * Where the widgets float on the workspace map (spec 6.2), shared by the
 * widgets, the map's own controls and its fit padding. inset: px from the
 * bar and the edges; hudBottom: px between the result widget and the bottom;
 * mapShare: the part of the workspace the widgets at rest (the input widget
 * and the result bar, without its drawer) leave to the map (spec 11).
 */
export const WORKSPACE = Object.freeze({
  inputWidth: "clamp(320px, 25vw, 344px)",
  hudWidth: "min(640px, calc(100% - 48px))",
  inset: 16,
  strip: 40,
  hudBottom: 44,
  mapShare: 0.6,
});

export const UI_FONT =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, "Helvetica Neue", sans-serif';
export const MONO_FONT = 'ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace';

// Phone layout below this width: the workspace puts the map above a bottom
// sheet, controls grow for touch and pages narrow their padding.
export const PHONE = "@media (max-width: 759.98px)";

export const THEME_MODES = Object.freeze(["light", "dark"]);
export const THEME_PREFERENCES = Object.freeze(["system", "light", "dark"]);

/**
 * The mode a preference shows.
 * @param {string} preference "system", "light" or "dark" (anything else is "system")
 * @param {boolean} systemDark whether the system asks for dark
 * @returns {"light" | "dark"}
 */
export function resolveTheme(preference, systemDark) {
  if (preference === "light" || preference === "dark") return preference;
  return systemDark ? "dark" : "light";
}

/** The CSS custom properties of a mode, as written on :root. */
export function cssVariables(mode) {
  const palette = PALETTES[mode];
  return {
    ...Object.fromEntries(Object.entries(palette).map(([key, value]) => [`--ct-${key}`, value])),
    "--ct-shadow-float": SHADOWS[mode].float,
    "--ct-shadow-raised": SHADOWS[mode].raised,
  };
}

/**
 * The MUI theme of a mode. Its palette holds real colours (MUI computes with
 * them); everything the app styles itself reads the CSS variables, which the
 * theme's CssBaseline writes on :root.
 * @param {"light" | "dark"} mode
 */
export function createAppTheme(mode) {
  const P = PALETTES[mode];
  return createTheme({
    palette: {
      mode,
      primary: { main: P.selected, contrastText: P.onSelected },
      secondary: { main: P.a, contrastText: "#ffffff" },
      error: { main: P.error },
      warning: { main: P.warn },
      success: { main: P.success },
      background: { default: P.paper, paper: P.sheet },
      text: { primary: P.ink, secondary: P.muted },
      divider: P.rule,
    },
    typography: {
      fontFamily: UI_FONT,
      fontWeightBold: 650,
      h1: { fontSize: TYPE.heading, fontWeight: 650, letterSpacing: "-0.015em", lineHeight: 1.25 },
      h2: { fontSize: TYPE.title, fontWeight: 650, lineHeight: 1.4 },
      body1: { fontSize: TYPE.body, lineHeight: 1.5 },
      body2: { fontSize: TYPE.small, lineHeight: 1.5 },
      caption: { fontSize: TYPE.meta, lineHeight: 1.45 },
      button: { textTransform: "none", fontWeight: 650, fontSize: TYPE.body },
      overline: { fontSize: TYPE.label, fontWeight: 650, letterSpacing: "0.08em", lineHeight: 1.5 },
    },
    shape: { borderRadius: RADIUS.control },
    transitions: {
      easing: { easeInOut: MOTION.ease, easeOut: MOTION.ease },
      duration: { shortest: 120, shorter: 120, short: 180, standard: 180, complex: 180, enteringScreen: 180, leavingScreen: 120 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": { ...cssVariables(mode), "--ct-bar-height": `${BAR_HEIGHT}px`, colorScheme: mode },
          [PHONE]: { ":root": { "--ct-bar-height": `${PHONE_BAR_HEIGHT}px` } },
          body: { WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" },
          "code, kbd, samp, pre, output": { fontFamily: MONO_FONT, fontVariantNumeric: "tabular-nums" },
          ":focus-visible": { outline: `2.5px solid ${COLORS.focus}`, outlineOffset: 2 },
          "@media (prefers-reduced-motion: reduce)": {
            "*, *::before, *::after": {
              animationDuration: "0.01ms !important",
              animationIterationCount: "1 !important",
              transitionDuration: "0.01ms !important",
              scrollBehavior: "auto !important",
            },
          },
        },
      },
      // No ripple: hover, press and the focus outline carry the feedback.
      MuiButtonBase: { defaultProps: { disableRipple: true } },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: "none", border: `1px solid ${COLORS.rule}`, borderRadius: RADIUS.card } },
      },
      MuiPopover: {
        styleOverrides: { paper: { boxShadow: SHADOW.raised, borderColor: COLORS.rule2 } },
      },
      MuiMenuItem: {
        styleOverrides: { root: { fontSize: TYPE.body, minHeight: 36 } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: RADIUS.control,
            minHeight: 36,
            transition: `background-color ${MOTION.fast} ${MOTION.ease}, border-color ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}`,
            [PHONE]: { minHeight: 40 },
          },
          outlined: {
            borderColor: COLORS.rule2,
            color: COLORS.ink,
            backgroundColor: COLORS.sheet,
            "&:hover": { borderColor: COLORS.ink2, backgroundColor: COLORS.paper2 },
          },
          text: { color: COLORS.ink2, "&:hover": { backgroundColor: COLORS.paper2 } },
          contained: { "&:hover": { backgroundColor: COLORS.ink2, color: COLORS.onSelected } },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: COLORS.sheet,
            borderRadius: RADIUS.control,
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: COLORS.ink2 },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: COLORS.focus, borderWidth: 2 },
            "&.Mui-error .MuiOutlinedInput-notchedOutline": { borderColor: COLORS.error },
          },
          notchedOutline: { borderColor: COLORS.rule2 },
        },
      },
      MuiInputLabel: {
        styleOverrides: { root: { "&.Mui-focused": { color: COLORS.aInk } } },
      },
    },
  });
}

/** The light theme; App picks the theme of the active mode. */
export const theme = createAppTheme("light");
