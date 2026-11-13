import { createTheme } from "./ui/index.js";

// "Paper and ink": the interface stays neutral and colour is kept for data.
// A is cobalt, B is vermilion, and the measured route runs from one to the
// other.
//
// Contrast (WCAG AA needs 4.5:1 for text): ink #16191c on paper #f3f1eb 16:1,
// muted #5f666b on paper 5.3:1 and on sheet #fcfbf8 5.8:1; A ink #1a3db0 on
// white 8.6:1; B ink #a92f19 on white 6.6:1.
export const COLORS = Object.freeze({
  paper: "#f3f1eb",
  paper2: "#ebe8df",
  sheet: "#fcfbf8",
  ink: "#16191c",
  ink2: "#394045",
  muted: "#5f666b",
  faint: "#8a9094",
  rule: "#e2ded3",
  rule2: "#cfc8ba",
  a: "#2450e0",
  aSoft: "#e8edfd",
  aInk: "#1a3db0",
  b: "#e2492c",
  bSoft: "#fdece7",
  bInk: "#a92f19",
  warn: "#855600",
  warnSoft: "#fff4d8",
  focus: "#2450e0",
});

export const UI_FONT =
  '"Avenir Next", Avenir, "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", sans-serif';
export const MONO_FONT = 'ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace';

export const SHADOW_FLOAT = "0 1px 3px rgba(22, 25, 28, 0.12), 0 8px 28px rgba(22, 25, 28, 0.14)";

// The distance workspace switches to its phone layout (map above a bottom
// sheet) below this width.
export const PHONE = "@media (max-width: 759.98px)";

export const theme = createTheme({
  palette: {
    primary: { main: COLORS.ink, contrastText: "#ffffff" },
    secondary: { main: COLORS.a, contrastText: "#ffffff" },
    error: { main: "#b3341d" },
    warning: { main: COLORS.warn },
    success: { main: "#1d7a4e" },
    background: { default: COLORS.paper, paper: COLORS.sheet },
    text: { primary: COLORS.ink, secondary: COLORS.muted },
    divider: COLORS.rule,
  },
  typography: {
    fontFamily: UI_FONT,
    h1: { fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.2 },
    h2: { fontSize: "1rem", fontWeight: 700, lineHeight: 1.4 },
    button: { textTransform: "none", fontWeight: 650 },
    overline: { fontWeight: 700, letterSpacing: "0.08em", fontSize: "0.72rem" },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { WebkitFontSmoothing: "antialiased" },
        "code, kbd, output": { fontFamily: MONO_FONT, fontVariantNumeric: "tabular-nums" },
        ":focus-visible": { outline: `2.5px solid ${COLORS.focus}`, outlineOffset: 2 },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: `1px solid ${COLORS.rule}`, borderRadius: 16 } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, minHeight: 36 },
        outlined: { borderColor: COLORS.rule2, color: COLORS.ink, "&:hover": { borderColor: COLORS.ink2, backgroundColor: COLORS.paper2 } },
        text: { color: COLORS.ink2, "&:hover": { backgroundColor: COLORS.paper2 } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { backgroundColor: "#ffffff", borderRadius: 10 },
        notchedOutline: { borderColor: COLORS.rule2 },
      },
    },
    MuiToggleButton: {
      styleOverrides: { root: { textTransform: "none", fontWeight: 650 } },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
  },
});
