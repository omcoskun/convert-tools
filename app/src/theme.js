import { createTheme } from "./ui/index.js";

export const MONO_FONT = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

// Navigation rail. Text on NAVY: #c9d4e0 is 10.7:1, white 16:1.
export const NAVY = "#122236";
export const NAVY_TEXT = "#c9d4e0";

// Contrast on white / on the #f4f6f8 canvas (WCAG AA needs 4.5:1):
// secondary text #5b6878 5.7 / 5.2; primary #076c66 5.9 / 5.4.
export const theme = createTheme({
  palette: {
    primary: { main: "#076c66", contrastText: "#ffffff" },
    error: { main: "#ae4238" },
    warning: { main: "#9a4a00" },
    background: { default: "#f4f6f8", paper: "#ffffff" },
    text: { primary: "#192b40", secondary: "#5b6878" },
    divider: "#e2e7ed",
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    h1: { fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.25 },
    h2: { fontSize: "1.05rem", fontWeight: 650, lineHeight: 1.4 },
    button: { textTransform: "none", fontWeight: 600 },
    overline: { fontWeight: 600, letterSpacing: "0.08em" },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: "1px solid #e2e7ed" } },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});
