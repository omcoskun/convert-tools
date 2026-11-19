// The map's scale bar: an Apple-style bar of two alternating segments with
// the round length that fits in 96 px (scale.js). Its numbers sit centred on
// the ticks, the unit hangs after the last one, and the middle number drops
// out when the bar is too short for it. It shows while the map zooms and
// fades out 1.5 s later; it stays while hovered, focused or pinned, and a
// click cycles metric, nautical and imperial. The camera moves every frame,
// so the widths and labels are written to the DOM through refs, never to
// React state. The parent positions it.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLanguage } from "../context.js";
import { COLORS, MONO_FONT, MOTION, PHONE, RADIUS, TYPE } from "../theme.js";
import { Box, visuallyHidden } from "../ui/index.js";
import { SCALE_UNITS, niceScale } from "./scale.js";

const MAX_PX = 96;
const FADE_DELAY_MS = 1500;
// A digit of the 11 px monospace labels, rounded up, and the least room
// between two labels.
const CHAR_PX = 7;
const LABEL_GAP = 6;

// The bar sits on the map, not on a surface, so its colours follow the map's
// tone and not the interface palette.
const INKS = {
  light: { ink: "#18212f", halo: "rgba(255, 255, 255, 0.92)" },
  dark: { ink: "#f2f4f7", halo: "rgba(8, 12, 18, 0.85)" },
};

function haloShadow(color) {
  return [
    `-1px 0 0 ${color}`,
    `1px 0 0 ${color}`,
    `0 -1px 0 ${color}`,
    `0 1px 0 ${color}`,
    `0 0 3px ${color}`,
  ].join(", ");
}

/**
 * @param {{
 *   subscribeView: (listener: (kind: "zoom" | "move") => void) => () => void,
 *   measureScale: () => number | null,
 *   unit: "metric" | "nautical" | "imperial",
 *   onUnitChange: (unit: string) => void,
 *   pinned?: boolean,
 *   tone?: "light" | "dark" | "imagery",
 * }} props
 */
export default function ScaleBar({ subscribeView, measureScale, unit, onUnitChange, pinned = false, tone = "light" }) {
  const { text, language } = useLanguage();
  const formatter = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }), [language]);
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const midRef = useRef(null);
  const endRef = useRef(null);
  const unitRef = useRef(null);
  const readingRef = useRef(null);
  const timerRef = useRef(0);
  const lastRef = useRef({ empty: false, width: "", end: "", tight: false });
  const shownRef = useRef(false);
  const heldRef = useRef(false);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const palette = tone === "light" ? INKS.light : INKS.dark;

  const update = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const metresPerPixel = measureScale();
    const scale = metresPerPixel == null ? null : niceScale(metresPerPixel, MAX_PX, unit);
    const shown = lastRef.current;
    if ((scale == null) !== shown.empty) {
      shown.empty = scale == null;
      root.classList.toggle("is-empty", shown.empty);
    }
    if (scale == null) return;
    // Most frames change neither the width nor the length: no DOM write then.
    const width = `${Math.round(scale.widthPx)}px`;
    const endNumber = formatter.format(scale.end);
    const mid = formatter.format(scale.mid);
    const end = `${endNumber} ${scale.unit}`;
    // The middle number needs half the bar for half of itself and half of the end number.
    const tight = scale.widthPx / 2 < ((mid.length + endNumber.length) * CHAR_PX) / 2 + LABEL_GAP;
    if (width !== shown.width) {
      shown.width = width;
      trackRef.current.style.width = width;
    }
    if (tight !== shown.tight) {
      shown.tight = tight;
      root.classList.toggle("is-tight", tight);
    }
    if (end !== shown.end) {
      shown.end = end;
      midRef.current.textContent = mid;
      endRef.current.textContent = endNumber;
      unitRef.current.textContent = scale.unit;
      readingRef.current.textContent = end;
    }
  }, [measureScale, unit, formatter]);

  useEffect(() => {
    const root = rootRef.current;
    function setVisible(visible) {
      root.classList.toggle("is-visible", visible);
    }
    function isVisible() {
      return pinnedRef.current || shownRef.current || heldRef.current;
    }
    function onView(kind) {
      if (kind === "zoom") {
        shownRef.current = true;
        setVisible(true);
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          shownRef.current = false;
          setVisible(isVisible());
        }, FADE_DELAY_MS);
        update();
      } else if (isVisible()) {
        update();
      }
    }
    function hold() {
      heldRef.current = true;
      setVisible(true);
      update();
    }
    function release() {
      heldRef.current = root.matches(":hover") || root.contains(document.activeElement);
      setVisible(isVisible());
    }
    root.addEventListener("pointerenter", hold);
    root.addEventListener("pointerleave", release);
    root.addEventListener("focusin", hold);
    root.addEventListener("focusout", release);
    setVisible(isVisible());
    update();
    const unsubscribe = subscribeView(onView);
    return () => {
      unsubscribe();
      window.clearTimeout(timerRef.current);
      root.removeEventListener("pointerenter", hold);
      root.removeEventListener("pointerleave", release);
      root.removeEventListener("focusin", hold);
      root.removeEventListener("focusout", release);
    };
  }, [subscribeView, update, pinned]);

  function cycle() {
    const next = SCALE_UNITS[(SCALE_UNITS.indexOf(unit) + 1) % SCALE_UNITS.length];
    onUnitChange(next);
  }

  const labelSx = {
    position: "absolute",
    bottom: 0,
    transform: "translateX(-50%)",
    whiteSpace: "nowrap",
    lineHeight: 1,
  };

  return (
    <Box
      component="button"
      type="button"
      ref={rootRef}
      className="map-scale"
      onClick={cycle}
      sx={{
        display: "block",
        // Even sides keep the bar centred; the unit hangs into the right one.
        p: "6px 28px",
        border: 0,
        bgcolor: "transparent",
        font: "inherit",
        fontFamily: MONO_FONT,
        fontSize: TYPE.label,
        fontWeight: 650,
        fontVariantNumeric: "tabular-nums",
        color: palette.ink,
        textShadow: haloShadow(palette.halo),
        cursor: "pointer",
        opacity: 0,
        pointerEvents: "none",
        transition: `opacity ${MOTION.base} ${MOTION.ease}`,
        "&.is-visible": { opacity: 1, pointerEvents: "auto" },
        "&.is-empty": { visibility: "hidden" },
        "&.is-tight .scale-mid": { visibility: "hidden" },
        "&:focus-visible": { outline: `2px solid ${COLORS.focus}`, outlineOffset: 0, borderRadius: `${RADIUS.control}px` },
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
        [PHONE]: { p: "10px 28px 10px 12px" },
      }}
    >
      {/* The name is the reading ("500 m") and then the action, so it holds
          the scale the bar shows (WCAG 2.5.3); the drawn ticks repeat it. */}
      <Box component="span" sx={visuallyHidden} ref={readingRef} />
      <Box component="span" sx={visuallyHidden}>{`, ${text.mapScaleChange}`}</Box>
      <Box component="span" ref={trackRef} aria-hidden="true" sx={{ position: "relative", display: "block", width: 48 }}>
        <Box component="span" sx={{ position: "relative", display: "block", height: 14, mb: "2px" }}>
          <Box component="span" sx={{ ...labelSx, left: 0 }}>0</Box>
          <Box component="span" ref={midRef} className="scale-mid" sx={{ ...labelSx, left: "50%" }} />
          {/* Centred on its tick by the number alone; the unit hangs after it. */}
          <Box component="span" sx={{ ...labelSx, left: "100%" }}>
            <span ref={endRef} />
            <Box component="span" ref={unitRef} sx={{ position: "absolute", left: "100%", bottom: 0, pl: "3px" }} />
          </Box>
        </Box>
        <Box
          component="span"
          sx={{
            display: "flex",
            height: 4,
            boxShadow: `0 0 0 1px ${palette.halo}`,
            textShadow: "none",
          }}
        >
          <Box component="span" sx={{ flex: 1, bgcolor: palette.ink }} />
          <Box component="span" sx={{ flex: 1, bgcolor: palette.halo }} />
        </Box>
      </Box>
    </Box>
  );
}
