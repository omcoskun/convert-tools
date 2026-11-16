import { useId } from "react";
import { useSettledValue } from "../lib/use-settled-value.js";
import { COLORS, LABEL_CAPS, MONO_FONT, PHONE, RADIUS, TYPE } from "../theme.js";
import { Box, visuallyHidden } from "../ui/index.js";
import CopyButton from "./CopyButton.jsx";

// The readout figure is 26 px on phones (spec, section 7).
const READOUT_PHONE = 26;

/** The small uppercase label of an ink readout; shared with the result widget (ResultHud). */
export const readoutLabelSx = Object.freeze({ m: 0, color: COLORS.onInkMuted, lineHeight: 1.4, ...LABEL_CAPS });

/** The large mono figure of an ink readout; shared with the result widget (ResultHud). */
export const readoutFigureSx = Object.freeze({
  minWidth: 0,
  fontSize: TYPE.readout,
  fontWeight: 400,
  lineHeight: 1.2,
  letterSpacing: "-0.03em",
  overflowWrap: "anywhere",
  [PHONE]: { fontSize: READOUT_PHONE },
});

/**
 * The primary result on an ink surface: a small label, the value large in
 * mono with its unit, and secondary rows below. The same readout serves the
 * pages and the result widget on the map.
 * @param {{
 *   label: string,
 *   symbol?: string,
 *   value?: string | null,
 *   unit?: string,
 *   copyValue?: string,
 *   copyLabel?: string,
 *   aside?: import("react").ReactNode,
 *   empty?: import("react").ReactNode,
 *   children?: import("react").ReactNode,
 * }} props
 *   symbol is a mono symbol after the label, kept in its own case (s₁₂ is
 *   not S₁₂). value is the formatted figure; null or undefined shows "—" and the empty
 *   node (what to do) in place of the children. copyValue is the plain value
 *   the copy button copies, named by copyLabel (default: label). aside sits
 *   at the right of the label row, e.g. a unit switch (Segmented tone="ink"
 *   size="sm"). children are the secondary rows, shown with a value only.
 */
export default function Readout({ label, symbol, value, unit, copyValue, copyLabel, aside, empty, children }) {
  const labelId = useId();
  const hasValue = value != null;
  // Announced once the value settles, so typing is not read out per keystroke.
  const name = symbol ? `${label} ${symbol}` : label;
  const announced = useSettledValue(hasValue ? `${name}: ${value}${unit ? ` ${unit}` : ""}` : "", 700);

  return (
    <Box
      role="group"
      aria-labelledby={labelId}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: 0,
        p: 2,
        borderRadius: `${RADIUS.card}px`,
        bgcolor: COLORS.ink,
        color: COLORS.onInk,
      }}
    >
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1, minHeight: 28 }}>
        <Box component="p" id={labelId} sx={readoutLabelSx}>
          {label}
          {symbol && (
            <>
              {" "}
              <Box component="span" sx={{ fontFamily: MONO_FONT, letterSpacing: 0, textTransform: "none" }}>
                {symbol}
              </Box>
            </>
          )}
        </Box>
        {aside}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <Box component="p" sx={{ flex: 1, minWidth: 0, m: 0, fontFamily: MONO_FONT, fontVariantNumeric: "tabular-nums" }}>
          <Box
            component="span"
            aria-hidden={hasValue ? undefined : "true"}
            sx={{ ...readoutFigureSx, color: hasValue ? COLORS.onInk : COLORS.onInkMuted }}
          >
            {hasValue ? value : "—"}
          </Box>
          {unit && (
            <>
              {" "}
              <Box component="span" sx={{ color: COLORS.onInkMuted, fontSize: TYPE.title }}>
                {unit}
              </Box>
            </>
          )}
        </Box>
        {hasValue && copyValue != null && <CopyButton value={copyValue} label={copyLabel || name} iconOnly tone="ink" />}
      </Box>
      {hasValue
        ? children
        : empty != null && (
            <Box sx={{ color: COLORS.onInkMuted, fontSize: TYPE.small, lineHeight: 1.5 }}>{empty}</Box>
          )}
      <Box role="status" aria-live="polite" sx={visuallyHidden}>
        {announced}
      </Box>
    </Box>
  );
}
