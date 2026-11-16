import { COLORS, MOTION, RADIUS, TYPE } from "../theme.js";
import { Box } from "../ui/index.js";
import Icon from "./Icon.jsx";

/**
 * A section that is one click away: a native <details> whose <summary> is
 * the title row with a chevron. Closed by default; disclosures that follow
 * each other share one hairline.
 * @param {{ title: import("react").ReactNode, defaultOpen?: boolean, children: import("react").ReactNode }} props
 */
export default function Disclosure({ title, defaultOpen = false, children }) {
  return (
    <Box
      component="details"
      open={defaultOpen || undefined}
      sx={{
        minWidth: 0,
        borderTop: `1px solid ${COLORS.rule}`,
        borderBottom: `1px solid ${COLORS.rule}`,
        "& + &": { borderTop: 0 },
        // The content of <details> is slotted through the browser's own shadow
        // root, so it would inherit content-box sizing from there.
        "& > summary": {
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: 1,
          minHeight: 44,
          py: 1,
          listStyle: "none",
          borderRadius: `${RADIUS.control}px`,
          color: COLORS.ink,
          fontSize: TYPE.body,
          fontWeight: 650,
          lineHeight: 1.4,
          cursor: "pointer",
          userSelect: "none",
          "&::-webkit-details-marker": { display: "none" },
          "&::marker": { content: '""' },
          "& > svg": { ml: "auto", color: COLORS.muted, transition: `transform ${MOTION.base} ${MOTION.ease}` },
          "&:hover > svg": { color: COLORS.ink },
        },
        "&[open] > summary > svg": { transform: "rotate(180deg)" },
      }}
    >
      <summary>
        <span>{title}</span>
        <Icon name="chevron" size={18} />
      </summary>
      <Box sx={{ boxSizing: "border-box", pb: 2, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}
