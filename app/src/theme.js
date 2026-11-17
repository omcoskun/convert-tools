import { createTheme } from "./ui/index.js";

// Design tokens of the demo. Components are styled from these and nothing
// else, so the whole interface changes in one place.
//
// "Paper and ink": the interface stays neutral and colour is kept for data.
// A is cobalt, B is vermilion, and the measured route runs from one to the
// other. Besides A and B only status (warning, error, success) has a hue.
//
// Text and focus contrast is verified in test/kit.test.mjs.
export const COLORS = Object.freeze({
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
  focus: "#2450e0",
  // Text and controls on ink surfaces (readouts, the result widget).
  onInk: "#f2f4f7",
  onInkMuted: "#a9aeb0",
  inkRaised: "#2a2f33",
  focusOnInk: "#9fb4ff",
  // The sheet at about 90 %, for bars and widgets over the map.
  glass: "rgba(255, 255, 255, 0.96)",
  error: "#b3341d",
  errorSoft: "#fbeae6",
  success: "#1d7a4e",
});

/** Type sizes in px. Text uses two weights, 400 and 650; 700 is for the brand and letter badges. */
export const TYPE = Object.freeze({ label: 11, meta: 12, small: 13, body: 14, title: 16, heading: 22, readout: 32 });

/** The small uppercase label (readouts, chip rows, the library call, indexes); colour is set by the caller. */
export const LABEL_CAPS = Object.freeze({ fontSize: TYPE.label, fontWeight: 650, letterSpacing: "0.08em", textTransform: "uppercase" });

/** Corner radii in px. */
export const RADIUS = Object.freeze({ control: 8, card: 12, widget: 16, pill: 999 });

/** float: widgets on the map. raised: menus and tooltips. Pages use borders, not shadows. */
export const SHADOW = Object.freeze({
  float: "0 1px 3px rgba(22, 25, 28, 0.12), 0 8px 28px rgba(22, 25, 28, 0.14)",
  raised: "0 1px 2px rgba(22, 25, 28, 0.1), 0 12px 32px rgba(22, 25, 28, 0.18)",
});

export const SHADOW_FLOAT = SHADOW.float;

/** fast: hover and press. base: open and close. Numbers never animate. */
export const MOTION = Object.freeze({ fast: "120ms", base: "180ms", ease: "cubic-bezier(0.2, 0, 0, 1)" });

/** Height of the top bar in px. */
export const BAR_HEIGHT = 52;

/**
 * Where the widgets float on the workspace map (spec 6.2), shared by the
 * widgets, the map's own controls and its fit padding. inset: px from the
 * bar and the edges; hudBottom: px between the result widget and the bottom;
 * mapShare: the part of the workspace the widgets at rest (the input widget
 * and the result bar, without its drawer) leave to the map (spec 11).
 */
export const WORKSPACE = Object.freeze({
  inputWidth: "clamp(340px, 27vw, 400px)",
  hudWidth: "min(760px, calc(100% - 48px))",
  inset: 16,
  hudBottom: 20,
  mapShare: 0.6,
});

export const UI_FONT =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, "Helvetica Neue", sans-serif';
export const MONO_FONT = 'ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace';

// Phone layout below this width: the workspace puts the map above a bottom
// sheet, controls grow to 40 px and pages narrow their padding.
export const PHONE = "@media (max-width: 759.98px)";

export const theme = createTheme({
  palette: {
    primary: { main: COLORS.ink, contrastText: COLORS.onInk },
    secondary: { main: COLORS.a, contrastText: "#ffffff" },
    error: { main: COLORS.error },
    warning: { main: COLORS.warn },
    success: { main: COLORS.success },
    background: { default: COLORS.paper, paper: COLORS.sheet },
    text: { primary: COLORS.ink, secondary: COLORS.muted },
    divider: COLORS.rule,
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
      styleOverrides: { root: { border: `1px solid ${COLORS.rule}`, borderRadius: RADIUS.card } },
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
        contained: { "&:hover": { backgroundColor: COLORS.ink2 } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#ffffff",
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
