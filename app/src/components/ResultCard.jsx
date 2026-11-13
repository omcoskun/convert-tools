import { MONO_FONT } from "../theme.js";
import { Box, Paper, Stack, Typography } from "../ui/index.js";
import CopyButton from "./CopyButton.jsx";

/** One labelled output value with a copy button and optional notes below. */
export default function ResultCard({ label, value, copyValue, lines, children }) {
  const shown = lines || [value];
  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          {label}
        </Typography>
        {(copyValue || value) && <CopyButton value={copyValue || value} label={label} />}
      </Stack>
      {shown.map((line) => (
        <Box
          key={line}
          component="code"
          sx={{ fontFamily: MONO_FONT, fontSize: "0.95rem", overflowWrap: "anywhere" }}
        >
          {line}
        </Box>
      ))}
      {children}
    </Paper>
  );
}
