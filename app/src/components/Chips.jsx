import { useId } from "react";
import { COLORS, LABEL_CAPS, MOTION, PHONE, RADIUS, TYPE } from "../theme.js";
import { Box } from "../ui/index.js";

/**
 * A labelled row of pill buttons, e.g. examples that fill a tool in one
 * click. Wraps onto further lines when it does not fit.
 * @param {{
 *   label: string,
 *   items: Array<{ key: string, label: import("react").ReactNode, onClick: () => void, active?: boolean }>,
 * }} props
 *   label is shown before the chips and names the group. A chip with active
 *   (true or false) is a toggle and says whether it is pressed.
 */
export default function Chips({ label, items }) {
  const labelId = useId();
  return (
    <Box role="group" aria-labelledby={labelId} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, minWidth: 0 }}>
      <Box
        component="span"
        id={labelId}
        sx={{ mr: 0.5, color: COLORS.muted, ...LABEL_CAPS }}
      >
        {label}
      </Box>
      {items.map((item) => (
        <Box
          key={item.key}
          component="button"
          type="button"
          onClick={item.onClick}
          aria-pressed={item.active}
          sx={{
            display: "inline-block",
            height: 32,
            lineHeight: "30px",
            maxWidth: "100%",
            px: 1.5,
            border: `1px solid ${item.active ? COLORS.selected : COLORS.rule2}`,
            borderRadius: `${RADIUS.pill}px`,
            bgcolor: item.active ? COLORS.selected : COLORS.sheet,
            color: item.active ? COLORS.onSelected : COLORS.ink,
            font: "inherit",
            fontSize: TYPE.small,
            fontWeight: 650,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            cursor: "pointer",
            transition: `background-color ${MOTION.fast} ${MOTION.ease}, border-color ${MOTION.fast} ${MOTION.ease}`,
            "&:hover": item.active ? undefined : { borderColor: COLORS.ink2, bgcolor: COLORS.paper2 },
            [PHONE]: { height: 40, lineHeight: "38px", px: 2 },
          }}
        >
          {item.label}
        </Box>
      ))}
    </Box>
  );
}
