import { useState } from "react";
import { useLanguage } from "../../context.js";
import { Box, Paper, Tab, Tabs, Typography } from "../../ui/index.js";
import CrsConverter from "./CrsConverter.jsx";
import DistanceCalculator from "./DistanceCalculator.jsx";
import PositionConverter from "./PositionConverter.jsx";

const MODES = [
  ["formats", "positionFormats", PositionConverter],
  ["crs", "crs", CrsConverter],
  ["distance", "distance", DistanceCalculator],
];

/** @param {{ initialMode?: "formats" | "crs" | "distance" }} props */
export default function CoordinateTool({ initialMode = "formats" }) {
  const { text } = useLanguage();
  const [mode, setMode] = useState(initialMode);
  const Active = MODES.find(([id]) => id === mode)[2];

  return (
    <>
      <Paper component="section" aria-labelledby="coordinate-title" sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography id="coordinate-title" variant="h5" component="h1">
          {text.coordinateTitle}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {text.coordinateSubtitle}
        </Typography>
        <Tabs
          value={mode}
          onChange={(event, next) => setMode(next)}
          aria-label={text.coordinateTitle}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
        >
          {MODES.map(([id, labelKey]) => (
            <Tab key={id} value={id} label={text[labelKey]} id={`coordinate-tab-${id}`} aria-controls="coordinate-panel" />
          ))}
        </Tabs>
        <Box id="coordinate-panel" role="tabpanel" aria-labelledby={`coordinate-tab-${mode}`}>
          <Active />
        </Box>
      </Paper>
      <Typography component="footer" variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {text.coordinateFooter}
      </Typography>
    </>
  );
}
