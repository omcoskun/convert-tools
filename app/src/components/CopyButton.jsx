import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../context.js";
import { copyText } from "../lib/clipboard.js";
import { COLORS, MOTION, PHONE, RADIUS, TYPE } from "../theme.js";
import { Box, visuallyHidden } from "../ui/index.js";
import Icon from "./Icon.jsx";

const CONFIRM_MS = 1400;

const TONES = {
  paper: { color: COLORS.ink2, hover: COLORS.paper2, hoverColor: COLORS.ink, done: COLORS.success, ring: COLORS.focus },
  ink: { color: COLORS.onInkMuted, hover: COLORS.inkRaised, hoverColor: COLORS.onInk, done: COLORS.onInk, ring: COLORS.focusOnInk },
};

/**
 * Copies a plain value with one click. The icon turns into a check mark and
 * a polite live region says "copied".
 * @param {{
 *   value: string,
 *   label?: string,
 *   iconOnly?: boolean,
 *   tone?: "paper" | "ink",
 *   name?: string,
 * }} props
 *   value is copied as is (plain digits, no grouping); label names what is
 *   copied and makes the accessible name "Copy <label>"; name replaces that
 *   whole accessible name (a sentence such as "Copy point A as …"); iconOnly
 *   drops the visible word; tone "ink" is for ink surfaces.
 */
export default function CopyButton({ value, label, iconOnly = false, tone = "paper", name: fullName }) {
  const { text } = useLanguage();
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  const colors = TONES[tone];
  const name = fullName ?? (label ? `${text.copy} ${label}` : text.copy);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    setCopied(false);
  }, [value]);

  async function handleClick() {
    await copyText(value);
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), CONFIRM_MS);
  }

  // The wrapper is the containing block of the hidden live region, so the
  // region stays inside any scrolling panel instead of overflowing past it.
  return (
    <Box component="span" sx={{ position: "relative", display: "inline-flex", flex: "none", verticalAlign: "middle" }}>
      <Box
        component="button"
        type="button"
        onClick={handleClick}
        aria-label={label || fullName || iconOnly ? name : undefined}
        title={iconOnly ? name : undefined}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          flex: "none",
          height: 32,
          minWidth: 32,
          px: iconOnly ? 0 : "10px",
          border: 0,
          borderRadius: `${RADIUS.control}px`,
          bgcolor: "transparent",
          color: copied ? colors.done : colors.color,
          font: "inherit",
          fontSize: TYPE.small,
          fontWeight: 650,
          whiteSpace: "nowrap",
          cursor: "pointer",
          transition: `background-color ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}`,
          "&:hover": { bgcolor: colors.hover, color: copied ? colors.done : colors.hoverColor },
          "&:focus-visible": { outlineColor: colors.ring },
          [PHONE]: { height: 40, minWidth: 40 },
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={16} />
        {!iconOnly && <span>{copied ? text.copied : text.copy}</span>}
      </Box>
      <Box component="span" role="status" aria-live="polite" sx={visuallyHidden}>
        {copied ? text.copied : ""}
      </Box>
    </Box>
  );
}
