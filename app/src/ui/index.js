// The only module in the demo that imports the component library.
//
// The team standard is Emotion plus an in-house MUI fork; that fork was not
// reachable, so @mui/material v5 stands in. Swapping the package means
// changing the import below (and app/package.json) and nothing else:
// test/boundaries.test.mjs fails if any other file imports @mui/* or
// @emotion/*, and if this list re-exports something no file uses.

export {
  Alert,
  Box,
  Button,
  Container,
  CssBaseline,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  createTheme,
} from "@mui/material";

/**
 * sx props that hide content visually but keep it for screen readers. Sizes
 * are strings: in sx a bare number <= 1 means a percentage.
 */
export const visuallyHidden = Object.freeze({
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
});
