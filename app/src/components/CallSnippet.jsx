import { useId } from "react";
import { useLanguage } from "../context.js";
import { COLORS, LABEL_CAPS, MONO_FONT, RADIUS, TYPE } from "../theme.js";
import { Box } from "../ui/index.js";
import CopyButton from "./CopyButton.jsx";

/**
 * "Library call": the exact @convert-tools/core call that produced a
 * result, in mono, wrapped, with a copy button. Each tool ends its details
 * with one.
 * @param {{ code: string }} props
 */
export default function CallSnippet({ code }) {
  const { text } = useLanguage();
  const titleId = useId();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box
          component="p"
          id={titleId}
          sx={{ m: 0, color: COLORS.muted, ...LABEL_CAPS }}
        >
          {text.libraryCall}
        </Box>
        <CopyButton value={code} label={text.libraryCall} />
      </Box>
      <Box
        component="pre"
        aria-labelledby={titleId}
        sx={{
          m: 0,
          p: 1.5,
          border: `1px solid ${COLORS.rule}`,
          borderRadius: `${RADIUS.control}px`,
          bgcolor: COLORS.paper,
          color: COLORS.ink,
          fontFamily: MONO_FONT,
          fontSize: TYPE.meta,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        <code>{code}</code>
      </Box>
    </Box>
  );
}
