// The map layers panel: three illustrated basemap cards (a radio group), two
// overlay switches (latitude-longitude grid, MGRS zones) and the "always show
// scale" switch. The parent positions it and gives focus back to the button
// that opened it (returnFocusRef) after onClose. Esc and a press outside
// close it.
import { useEffect, useRef } from "react";
import { useLanguage } from "../context.js";
import { COLORS, MOTION, PHONE, RADIUS, SHADOW, TYPE, UI_FONT } from "../theme.js";
import { Box } from "../ui/index.js";

// Thumbnails are CSS gradients only, so there is nothing to load.
const THUMBNAILS = {
  standard: [
    "linear-gradient(115deg, transparent 46%, rgba(255,255,255,0.95) 46% 51%, transparent 51%)",
    "linear-gradient(20deg, transparent 58%, rgba(255,255,255,0.9) 58% 62%, transparent 62%)",
    "linear-gradient(160deg, #a9cdea 0 26%, transparent 26%)",
    "#e9e7e2",
  ].join(", "),
  detailed: [
    "linear-gradient(115deg, transparent 44%, #f6d98a 44% 50%, #fff 50% 52%, transparent 52%)",
    "linear-gradient(20deg, transparent 60%, rgba(255,255,255,0.95) 60% 64%, transparent 64%)",
    "radial-gradient(circle at 22% 70%, #bcd9a2 0 28%, transparent 29%)",
    "radial-gradient(circle at 80% 25%, #cfe3b6 0 24%, transparent 25%)",
    "linear-gradient(160deg, #9fc7e8 0 20%, transparent 20%)",
    "#efe6d2",
  ].join(", "),
  satellite: [
    "radial-gradient(circle at 25% 65%, #4a5d36 0 30%, transparent 55%)",
    "radial-gradient(circle at 75% 30%, #6b5d43 0 26%, transparent 52%)",
    "radial-gradient(circle at 60% 85%, #2f4a2a 0 24%, transparent 50%)",
    "linear-gradient(160deg, #123a5c 0 30%, transparent 55%)",
    "#3b4a30",
  ].join(", "),
};

function Switch({ checked }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        position: "relative",
        flex: "none",
        width: 40,
        height: 24,
        borderRadius: `${RADIUS.pill}px`,
        bgcolor: checked ? COLORS.a : COLORS.rule2,
        transition: `background-color ${MOTION.fast} ${MOTION.ease}`,
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
    >
      <Box
        component="span"
        sx={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          bgcolor: "#ffffff",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
          transform: checked ? "translateX(16px)" : "none",
          transition: `transform ${MOTION.fast} ${MOTION.ease}`,
          "@media (prefers-reduced-motion: reduce)": { transition: "none" },
        }}
      />
    </Box>
  );
}

function SwitchRow({ label, checked, onToggle }) {
  return (
    <Box
      component="button"
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.5,
        width: "100%",
        minHeight: 40,
        px: 0.5,
        border: 0,
        borderRadius: `${RADIUS.control}px`,
        bgcolor: "transparent",
        color: COLORS.ink,
        font: "inherit",
        fontSize: TYPE.small,
        textAlign: "left",
        cursor: "pointer",
        "&:hover": { bgcolor: COLORS.paper2 },
        "&:focus-visible": { outline: `2px solid ${COLORS.focus}`, outlineOffset: 0 },
        [PHONE]: { minHeight: 44 },
      }}
    >
      <span>{label}</span>
      <Switch checked={checked} />
    </Box>
  );
}

const sectionTitleSx = { m: 0, mb: 1, fontSize: TYPE.label, fontWeight: 650, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.muted };

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   returnFocusRef?: { current: HTMLElement | null },
 *   basemaps: { id: "standard" | "detailed" | "satellite" }[],
 *   basemapId: string,
 *   onChooseBasemap: (id: string) => void,
 *   overlays: { graticule: boolean, mgrs: boolean },
 *   onToggleOverlay: (name: "graticule" | "mgrs") => void,
 *   scalePinned: boolean,
 *   onToggleScalePinned: () => void,
 * }} props
 */
export default function LayerPanel({
  open,
  onClose,
  returnFocusRef,
  basemaps,
  basemapId,
  onChooseBasemap,
  overlays,
  onToggleOverlay,
  scalePinned,
  onToggleScalePinned,
}) {
  const { text } = useLanguage();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const selected = panelRef.current?.querySelector("[role='radio'][aria-checked='true']") ?? panelRef.current?.querySelector("[role='radio']");
    selected?.focus();
    function onPointer(event) {
      if (panelRef.current?.contains(event.target) || returnFocusRef?.current?.contains(event.target)) return;
      onCloseRef.current();
    }
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  function nameOf(id) {
    switch (id) {
      case "detailed":
        return text.mapBasemapDetailed;
      case "satellite":
        return text.mapBasemapSatellite;
      default:
        return text.mapBasemapStandard;
    }
  }

  const hasSelection = basemaps.some((basemap) => basemap.id === basemapId);

  function onRadioKey(event) {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    event.preventDefault();
    const radios = [...event.currentTarget.querySelectorAll("[role='radio']")];
    const index = radios.indexOf(document.activeElement);
    const next = (index + (forward ? 1 : -1) + radios.length) % radios.length;
    radios[next]?.focus();
    onChooseBasemap(basemaps[next].id);
  }

  return (
    <Box
      ref={panelRef}
      className="map-layer-panel"
      role="dialog"
      aria-label={text.mapLayers}
      sx={{
        width: 288,
        maxWidth: "calc(100vw - 32px)",
        boxSizing: "border-box",
        p: 1.5,
        border: `1px solid ${COLORS.rule2}`,
        borderRadius: `${RADIUS.card}px`,
        bgcolor: COLORS.glass,
        boxShadow: SHADOW.float,
        color: COLORS.ink,
        fontFamily: UI_FONT,
      }}
    >
      <Box component="h2" sx={sectionTitleSx}>
        {text.mapType}
      </Box>
      <Box role="radiogroup" aria-label={text.mapType} onKeyDown={onRadioKey} sx={{ display: "flex", gap: 1, mb: 2 }}>
        {basemaps.map((basemap, index) => {
          const checked = basemap.id === basemapId;
          return (
            <Box
              key={basemap.id}
              component="button"
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (!hasSelection && index === 0) ? 0 : -1}
              onClick={() => onChooseBasemap(basemap.id)}
              sx={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0.75,
                p: 0,
                border: 0,
                bgcolor: "transparent",
                color: checked ? COLORS.ink : COLORS.muted,
                font: "inherit",
                fontSize: TYPE.meta,
                fontWeight: checked ? 650 : 400,
                cursor: "pointer",
                "&:hover": { color: COLORS.ink },
                "&:focus-visible": { outline: "none" },
                "&:focus-visible .thumb": { outline: `2.5px solid ${COLORS.focus}`, outlineOffset: 2 },
              }}
            >
              <Box
                component="span"
                className="thumb"
                sx={{
                  display: "block",
                  width: 76,
                  maxWidth: "100%",
                  height: 52,
                  boxSizing: "border-box",
                  borderRadius: `${RADIUS.control}px`,
                  background: THUMBNAILS[basemap.id] ?? THUMBNAILS.standard,
                  border: checked ? `2px solid ${COLORS.selected}` : `1px solid ${COLORS.rule2}`,
                  boxShadow: checked ? `0 0 0 1px ${COLORS.sheet} inset` : "none",
                }}
              />
              <span>{nameOf(basemap.id)}</span>
            </Box>
          );
        })}
      </Box>
      <Box component="h2" sx={sectionTitleSx}>
        {text.mapOverlays}
      </Box>
      <SwitchRow label={text.mapGraticule} checked={overlays.graticule} onToggle={() => onToggleOverlay("graticule")} />
      <SwitchRow label={text.mapMgrsZones} checked={overlays.mgrs} onToggle={() => onToggleOverlay("mgrs")} />
      <SwitchRow label={text.mapScaleAlways} checked={scalePinned} onToggle={onToggleScalePinned} />
    </Box>
  );
}
