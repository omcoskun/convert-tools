import { useRef } from "react";
import { nextIndexForKey } from "../lib/roving.js";
import { COLORS, MOTION, PHONE, RADIUS, TYPE } from "../theme.js";
import { Box } from "../ui/index.js";
import Icon from "./Icon.jsx";

const TONES = {
  paper: {
    track: COLORS.paper2,
    color: COLORS.muted,
    hover: COLORS.ink,
    checkedBg: COLORS.sheet,
    checkedColor: COLORS.aInk,
    checkedShadow: "0 1px 2px rgba(22, 25, 28, 0.14), 0 0 0 0.5px rgba(22, 25, 28, 0.06)",
    ring: COLORS.focus,
  },
  ink: {
    track: COLORS.inkRaised,
    color: COLORS.onInkMuted,
    hover: COLORS.onInk,
    checkedBg: COLORS.onInk,
    checkedColor: COLORS.ink,
    checkedShadow: "none",
    ring: COLORS.focusOnInk,
  },
};

// Track padding and option height in px; on phones options grow, and each
// option gets an invisible touch target 40 px tall and at least 40 px wide.
const PHONE_TARGET = 40;
const SIZES = {
  sm: { pad: 2, height: 24, phoneHeight: 28, px: 8, minWidth: 32, font: TYPE.meta, icon: 14 },
  md: { pad: 3, height: 30, phoneHeight: 34, px: 12, minWidth: 36, font: TYPE.small, icon: 16 },
};

/**
 * A single choice among a few options, shown side by side (modes, units,
 * languages). A radio group: one option is checked, Tab enters at it and the
 * arrow keys move and select.
 * @param {{
 *   label: string,
 *   options: Array<{ value: string, label: import("react").ReactNode, icon?: string }>,
 *   value: string,
 *   onChange: (value: string) => void,
 *   tone?: "paper" | "ink",
 *   size?: "sm" | "md",
 * }} props
 *   label is the group's accessible name (not shown); icon is an Icon name.
 *   Stretched by a flex or grid parent, the options share the width.
 */
export default function Segmented({ label, options, value, onChange, tone = "paper", size = "md" }) {
  const buttons = useRef([]);
  const colors = TONES[tone];
  const metrics = SIZES[size];
  // Options that left the group must not stay behind as stale refs.
  buttons.current.length = options.length;
  const checkedIndex = options.findIndex((option) => option.value === value);
  const focusIndex = checkedIndex < 0 ? 0 : checkedIndex;

  function handleKeyDown(event) {
    const current = buttons.current.indexOf(event.target);
    const next = nextIndexForKey(event, current < 0 ? checkedIndex : current, options.length);
    if (next == null) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    if (options[next].value !== value) onChange(options[next].value);
  }

  return (
    <Box
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      sx={{
        display: "inline-flex",
        alignItems: "stretch",
        gap: "2px",
        maxWidth: "100%",
        minWidth: 0,
        p: `${metrics.pad}px`,
        borderRadius: `${RADIUS.control}px`,
        bgcolor: colors.track,
      }}
    >
      {options.map((option, index) => {
        const checked = index === checkedIndex;
        return (
          <Box
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            component="button"
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === focusIndex ? 0 : -1}
            onClick={() => {
              if (!checked) onChange(option.value);
            }}
            sx={{
              position: "relative",
              flex: "1 0 auto",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              height: metrics.height,
              minWidth: metrics.minWidth,
              px: `${metrics.px}px`,
              border: 0,
              borderRadius: `${RADIUS.control - metrics.pad}px`,
              bgcolor: checked ? colors.checkedBg : "transparent",
              boxShadow: checked ? colors.checkedShadow : "none",
              color: checked ? colors.checkedColor : colors.color,
              font: "inherit",
              fontSize: metrics.font,
              fontWeight: 650,
              lineHeight: 1,
              whiteSpace: "nowrap",
              cursor: checked ? "default" : "pointer",
              transition: `background-color ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}`,
              "&:hover": checked ? undefined : { color: colors.hover },
              "&:focus-visible": { outlineColor: colors.ring, outlineOffset: 1 },
              [PHONE]: {
                height: metrics.phoneHeight,
                minWidth: PHONE_TARGET,
                "&::after": {
                  content: '""',
                  position: "absolute",
                  top: -(PHONE_TARGET - metrics.phoneHeight) / 2,
                  right: 0,
                  bottom: -(PHONE_TARGET - metrics.phoneHeight) / 2,
                  left: 0,
                },
              },
            }}
          >
            {option.icon && <Icon name={option.icon} size={metrics.icon} />}
            {option.label}
          </Box>
        );
      })}
    </Box>
  );
}
