import { COLORS, TYPE } from "../theme.js";
import { Box, visuallyHidden } from "../ui/index.js";
import Icon from "./Icon.jsx";

/**
 * The small line under coordinate fields that says a pair can be pasted;
 * after a pair paste it shows what was filled in. A live region announces
 * that, unless the tool announces it in its own status (announce={false}).
 * @param {{ hint: string, notice?: string, announce?: boolean, sx?: object }} props
 */
export default function PasteHint({ hint, notice, announce = true, sx }) {
  return (
    <>
      <Box
        component="p"
        sx={{
          m: 0,
          display: "flex",
          gap: "6px",
          alignItems: "flex-start",
          color: notice ? COLORS.ink2 : COLORS.muted,
          fontSize: TYPE.small,
          lineHeight: 1.45,
          "& > svg": { mt: "1px", color: notice ? COLORS.success : COLORS.faint },
          ...sx,
        }}
      >
        <Icon name={notice ? "check" : "copy"} size={15} />
        <span>{notice || hint}</span>
      </Box>
      {announce && (
        <Box role="status" aria-live="polite" sx={visuallyHidden}>
          {notice}
        </Box>
      )}
    </>
  );
}
