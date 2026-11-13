import { createTheme } from "./ui/index.js";

export const MONO_FONT = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

export const theme = createTheme({
  palette: {
    primary: { main: "#176b46" },
    error: { main: "#a33d35" },
    background: { default: "#f5f7f6", paper: "#ffffff" },
    text: { primary: "#17201b", secondary: "#657169" },
    divider: "#dce2de",
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
});
