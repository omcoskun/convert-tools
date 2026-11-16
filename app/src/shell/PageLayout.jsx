import { COLORS, PHONE, TYPE } from "../theme.js";
import { Box } from "../ui/index.js";

/**
 * Frame of a page tool: a centred 920 px column on paper with the tool's
 * h1, one line of description, then its cards 16 px apart and an optional
 * closing note.
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   footer?: import("react").ReactNode,
 *   children: import("react").ReactNode,
 * }} props
 */
export default function PageLayout({ title, subtitle, footer, children }) {
  return (
    <Box
      component="section"
      aria-labelledby="tool-title"
      sx={{
        width: "100%",
        maxWidth: 920 + 2 * 24,
        mx: "auto",
        px: 3,
        pt: 4,
        pb: 6,
        [PHONE]: { maxWidth: "none", px: 2, pt: 2.5, pb: 4 },
      }}
    >
      <Box component="header" sx={{ mb: 3, [PHONE]: { mb: 2 } }}>
        <Box
          component="h1"
          id="tool-title"
          sx={{ m: 0, color: COLORS.ink, fontSize: TYPE.heading, fontWeight: 650, letterSpacing: "-0.015em", lineHeight: 1.25 }}
        >
          {title}
        </Box>
        {subtitle && (
          <Box component="p" sx={{ m: 0, mt: 0.5, maxWidth: 680, color: COLORS.muted, fontSize: TYPE.body, lineHeight: 1.5 }}>
            {subtitle}
          </Box>
        )}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2 }}>{children}</Box>
      {footer && (
        <Box component="p" sx={{ m: 0, mt: 3, color: COLORS.muted, fontSize: TYPE.meta, lineHeight: 1.5 }}>
          {footer}
        </Box>
      )}
    </Box>
  );
}
