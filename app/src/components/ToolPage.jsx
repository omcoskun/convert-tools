import { Box, Typography } from "../ui/index.js";

/** Page frame of one tool: its h1, a one-line description and a closing note. */
export default function ToolPage({ title, subtitle, footer, children }) {
  return (
    <Box component="section" aria-labelledby="tool-title">
      <Typography id="tool-title" variant="h1">
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.75, mb: 3, maxWidth: 760 }}>
        {subtitle}
      </Typography>
      {children}
      {footer && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          {footer}
        </Typography>
      )}
    </Box>
  );
}
