import { COLORS, MONO_FONT, RADIUS, TYPE } from "../theme.js";
import { Box } from "../ui/index.js";
import Icon from "./Icon.jsx";

const TONES = {
  info: { role: "note", icon: "info", bg: COLORS.paper2, color: COLORS.ink2, iconColor: COLORS.muted },
  warn: { role: "note", icon: "alert", bg: COLORS.warnSoft, color: COLORS.warn, iconColor: COLORS.warn },
  error: { role: "alert", icon: "error", bg: COLORS.errorSoft, color: COLORS.error, iconColor: COLORS.error },
};

/**
 * A short message beside a result: info (a fact worth knowing), warn (the
 * result holds with a caveat) or error (there is no result). Errors are
 * announced (role="alert"); the others are notes.
 * @param {{ tone?: "info" | "warn" | "error", children: import("react").ReactNode }} props
 */
export default function Notice({ tone = "info", children }) {
  const style = TONES[tone];
  return (
    <Box
      role={style.role}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1,
        minWidth: 0,
        px: 1.5,
        py: 1,
        borderRadius: `${RADIUS.control}px`,
        bgcolor: style.bg,
        color: style.color,
        fontSize: TYPE.small,
        lineHeight: 1.5,
        "& > svg": { mt: "2px", color: style.iconColor },
        "& code": { fontFamily: MONO_FONT, fontSize: TYPE.meta },
      }}
    >
      <Icon name={style.icon} size={16} />
      <Box sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{children}</Box>
    </Box>
  );
}
