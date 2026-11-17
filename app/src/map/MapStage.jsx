import { useEffect, useMemo } from "react";
import Icon from "../components/Icon.jsx";
import { useLanguage } from "../context.js";
import { BAR_HEIGHT, COLORS, MONO_FONT, MOTION, PHONE, RADIUS, SHADOW, TYPE, UI_FONT, WORKSPACE } from "../theme.js";
import { Box, visuallyHidden } from "../ui/index.js";
import { PIN_SHAPE } from "./map-adapter.js";
import useMapStage from "./useMapStage.js";

const TONES = {
  a: { color: COLORS.a, soft: COLORS.aSoft, halo: "rgba(36, 80, 224, 0.24)" },
  b: { color: COLORS.b, soft: COLORS.bSoft, halo: "rgba(226, 73, 44, 0.24)" },
  ink: { color: COLORS.ink, soft: COLORS.paper2, halo: "rgba(22, 25, 28, 0.2)" },
};

/** Picking cursor: a crosshair with a dot in the colour of what is being placed. */
function pickCursor(color) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
    '<g stroke-linecap="round"><path d="M13 2v7M13 17v7M2 13h7M17 13h7" stroke="#16191c" stroke-width="3.6"/>' +
    '<path d="M13 2v7M13 17v7M2 13h7M17 13h7" stroke="#fff" stroke-width="1.6"/></g>' +
    `<circle cx="13" cy="13" r="3.4" fill="${color}" stroke="#fff" stroke-width="1.4"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 13 13, crosshair`;
}

const glassSurface = {
  border: `1px solid ${COLORS.rule2}`,
  bgcolor: COLORS.sheet,
  boxShadow: SHADOW.float,
};

// Map controls and the hint column start below the glass bar, or at the top
// of the enlarged map.
const top = (expanded, gap) => (expanded ? gap : BAR_HEIGHT + gap);

// Everything MapLibre draws (canvas, markers, controls) sits inside the
// stage, so its look is set here with selectors more specific than
// MapLibre's own stylesheet.
const stageSx = {
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  bgcolor: "#e9e7e0",
  fontFamily: UI_FONT,
  "& > .map-canvas": { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  "& > .map-canvas .maplibregl-canvas:focus-visible": { outline: `3px solid ${COLORS.focus}`, outlineOffset: "-3px" },
  ...Object.fromEntries(
    Object.entries(TONES).map(([tone, { color }]) => [
      `&.is-picking-${tone} > .map-canvas .maplibregl-canvas-container.maplibregl-interactive:not(:active)`,
      { cursor: pickCursor(color) },
    ]),
  ),
  // Needle pins (PIN_SHAPE in map-adapter.js): a round head with the label
  // on top, a needle down to a white-ringed dot whose centre is the
  // coordinate. The marker is anchored at the dot, so the line ends there.
  "& .map-pin": { width: PIN_SHAPE.width, height: PIN_SHAPE.height, touchAction: "none" },
  "& .map-pin.is-draggable": { cursor: "grab" },
  "& .map-pin.is-dragging": { cursor: "grabbing" },
  "& .map-pin-halo": {
    position: "absolute",
    left: "50%",
    bottom: PIN_SHAPE.dot / 2 - 11,
    width: 22,
    height: 22,
    ml: "-11px",
    borderRadius: "50%",
    transform: "scale(0)",
    transition: `transform ${MOTION.fast} ${MOTION.ease}`,
  },
  "& .map-pin.is-draggable:hover .map-pin-halo, & .map-pin.is-dragging .map-pin-halo": { transform: "scale(1)" },
  "& .map-pin-needle": {
    position: "absolute",
    left: "50%",
    top: PIN_SHAPE.head - 2,
    bottom: PIN_SHAPE.dot / 2,
    width: 2,
    ml: "-1px",
    boxShadow: "0 0 0 1px #ffffff, 0 1px 3px rgba(22, 25, 28, 0.35)",
  },
  "& .map-pin-dot": {
    position: "absolute",
    left: "50%",
    bottom: 0,
    width: PIN_SHAPE.dot,
    height: PIN_SHAPE.dot,
    ml: `-${PIN_SHAPE.dot / 2}px`,
    border: "2px solid #ffffff",
    borderRadius: "50%",
    boxShadow: "0 0 0 1px rgba(22, 25, 28, 0.35), 0 1px 4px rgba(22, 25, 28, 0.35)",
  },
  "& .map-pin-head": {
    position: "absolute",
    left: "50%",
    top: 0,
    minWidth: PIN_SHAPE.head,
    height: PIN_SHAPE.head,
    px: "4px",
    transform: "translateX(-50%)",
    boxSizing: "border-box",
    border: "2px solid #ffffff",
    borderRadius: `${RADIUS.pill}px`,
    color: "#ffffff",
    font: `700 12px/22px ${UI_FONT}`,
    textAlign: "center",
    whiteSpace: "nowrap",
    boxShadow: "0 0 0 1px rgba(22, 25, 28, 0.2), 0 3px 8px rgba(22, 25, 28, 0.32)",
  },
  // The computed point of a direct problem: a hollow head and dot, the same tip.
  "& .map-pin.is-hollow .map-pin-head": { bgcolor: "#ffffff", borderWidth: "2.5px", lineHeight: "21px" },
  "& .map-pin.is-hollow .map-pin-dot": { bgcolor: "#ffffff", borderWidth: "2.5px" },
  ...Object.fromEntries(
    Object.entries(TONES).flatMap(([tone, { color, halo }]) => [
      [`& .map-pin.tone-${tone} .map-pin-halo`, { bgcolor: halo }],
      [
        `& .map-pin.tone-${tone} .map-pin-dot, & .map-pin.tone-${tone} .map-pin-head, & .map-pin.tone-${tone} .map-pin-needle`,
        { bgcolor: color },
      ],
      [`& .map-pin.tone-${tone}.is-hollow .map-pin-head`, { bgcolor: "#ffffff", borderColor: color, color }],
      [`& .map-pin.tone-${tone}.is-hollow .map-pin-dot`, { bgcolor: "#ffffff", borderColor: color }],
    ]),
  ),
  "& .map-line-tag": {
    px: "9px",
    py: "3px",
    border: `1px solid ${COLORS.rule2}`,
    borderRadius: `${RADIUS.pill}px`,
    bgcolor: "rgba(252, 251, 248, 0.95)",
    color: COLORS.ink,
    font: `650 12px/1.4 ${MONO_FONT}`,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    boxShadow: "0 1px 4px rgba(22, 25, 28, 0.18)",
    pointerEvents: "none",
  },
  // Attribution in the bottom-right corner, the scale bar above it. Both
  // stay in the strip under the result widget, which floats 20 px up.
  "& > .map-canvas .maplibregl-ctrl-bottom-right": { maxWidth: "calc(100% - 24px)" },
  "& > .map-canvas .maplibregl-ctrl-bottom-right > .maplibregl-ctrl": { m: 0 },
  "& > .map-canvas .maplibregl-ctrl-attrib": {
    p: "2px 8px",
    bgcolor: "rgba(252, 251, 248, 0.86)",
    borderRadius: "7px 0 0 0",
    fontSize: TYPE.label,
    lineHeight: "15px",
    color: COLORS.ink2,
    whiteSpace: "nowrap",
  },
  "& > .map-canvas .maplibregl-ctrl-attrib a": { color: COLORS.ink2 },
  "& > .map-canvas .maplibregl-ctrl-scale": {
    mr: "8px",
    mb: "6px",
    ml: "auto",
    borderColor: COLORS.ink2,
    bgcolor: "rgba(252, 251, 248, 0.8)",
    color: COLORS.ink,
    fontFamily: MONO_FONT,
    fontSize: TYPE.label,
  },
  // Between the phone and a wide window the scale bar would reach under the
  // centred result widget.
  "@media (min-width: 760px) and (max-width: 999.98px)": {
    "& > .map-canvas .maplibregl-ctrl-scale": { display: "none" },
  },
  [PHONE]: {
    "& > .map-canvas .maplibregl-ctrl-attrib": { whiteSpace: "normal" },
    // The sheet overlaps the map's lower edge by 14 px.
    "& > .map-canvas .maplibregl-ctrl-bottom-right": { bottom: "14px" },
  },
};

function ControlButton({ label, icon, onClick, disabled, pressed }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      sx={{
        display: "grid",
        placeItems: "center",
        width: 36,
        height: 36,
        border: 0,
        borderRadius: `${RADIUS.control}px`,
        bgcolor: "transparent",
        color: COLORS.ink,
        font: "inherit",
        cursor: "pointer",
        transition: `background-color ${MOTION.fast} ${MOTION.ease}`,
        "&:hover:not(:disabled)": { bgcolor: COLORS.paper2 },
        "&:disabled": { cursor: "default", opacity: 0.4 },
        "&[aria-pressed='true']": { bgcolor: COLORS.ink, color: COLORS.onInk },
        [PHONE]: { width: 40, height: 40 },
      }}
    >
      <Icon name={icon} size={18} />
    </Box>
  );
}

const Separator = () => <Box component="span" aria-hidden="true" sx={{ height: "1px", m: "3px 6px", bgcolor: COLORS.rule }} />;

const textButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  flex: "none",
  height: 32,
  px: "10px",
  border: `1px solid ${COLORS.rule2}`,
  borderRadius: `${RADIUS.pill}px`,
  bgcolor: COLORS.sheet,
  color: COLORS.ink,
  font: "inherit",
  fontSize: TYPE.small,
  fontWeight: 650,
  whiteSpace: "nowrap",
  cursor: "pointer",
  "&:hover": { borderColor: COLORS.ink2, bgcolor: COLORS.paper2 },
  [PHONE]: { height: 40, px: "14px" },
};

/**
 * The one map of the workspace: the MapLibre canvas drawing the scene, the
 * picking hint, the map controls (zoom, fit, whole world, enlarge), the
 * pointer readout and the loading, basemap and error states. Rendered once
 * by WorkspaceLayout and kept for the life of the app.
 * @param {{
 *   styleUrl: string,
 *   scene: import("./scene.js").MapScene,
 *   owner: object | null,
 *   handlersRef: { current: import("../shell/workspace-context.js").MapSceneHandlers },
 *   getPadding: () => { top: number, right: number, bottom: number, left: number },
 *   expanded: boolean,
 *   onToggleExpanded: () => void,
 *   onStatusChange: (status: import("../shell/workspace-context.js").MapStatus) => void,
 *   active: boolean,
 * }} props
 *   owner: the tool that published the scene (see useMapStage). active:
 *   false while a page tool hides the workspace, so Esc is left alone.
 */
export default function MapStage({
  styleUrl,
  scene,
  owner,
  handlersRef,
  getPadding,
  expanded,
  onToggleExpanded,
  onStatusChange,
  active,
}) {
  const { language, text } = useLanguage();
  const labels = useMemo(() => ({ mapCanvas: `${text.mapTitle}. ${text.mapPanHint}` }), [text]);
  const { containerRef, cursorRef, status, basemap, retry, zoomIn, zoomOut, fitScene, showWorld } = useMapStage({
    styleUrl,
    language,
    labels,
    scene,
    owner,
    handlersRef,
    getPadding,
  });
  const ready = status === "ready";
  const { picking } = scene;
  const canFit = scene.pins.length > 0 || scene.lines.some((line) => line.points.length > 0);

  useEffect(() => {
    onStatusChange(status);
  }, [status, onStatusChange]);

  // Escape leaves picking first, then the enlarged view.
  useEffect(() => {
    if (!active) return undefined;
    function onKey(event) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (picking) {
        handlersRef.current?.onCancelPick?.();
        event.preventDefault();
      } else if (expanded) {
        onToggleExpanded();
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, picking, expanded, onToggleExpanded, handlersRef]);

  const tone = TONES[picking?.tone] ?? TONES.ink;

  return (
    <Box
      component="section"
      className={`map-stage${picking ? ` is-picking is-picking-${picking.tone}` : ""}`}
      aria-label={text.mapTitle}
      sx={stageSx}
    >
      <div className="map-canvas" ref={containerRef} />

      {/* Shown while picking with keyboard focus on the canvas: Enter places the point here. */}
      <Box
        aria-hidden="true"
        sx={{
          display: "none",
          position: "absolute",
          left: "50%",
          top: "50%",
          zIndex: 2,
          width: 40,
          height: 40,
          m: "-20px 0 0 -20px",
          pointerEvents: "none",
          border: `2px solid ${tone.color}`,
          borderRadius: "50%",
          background: `linear-gradient(${COLORS.ink}, ${COLORS.ink}) center / 2px 14px no-repeat, linear-gradient(${COLORS.ink}, ${COLORS.ink}) center / 14px 2px no-repeat`,
          ".map-stage.is-picking > .map-canvas.is-keyboard-focus ~ &": { display: "block" },
        }}
      />

      {/* The picking hint and the basemap notice, centred over the part of the map the input widget leaves free. */}
      <Box
        sx={{
          position: "absolute",
          top: top(expanded, WORKSPACE.inset),
          left: expanded ? 76 : `calc(${WORKSPACE.inputWidth} + ${2 * WORKSPACE.inset}px)`,
          right: 76,
          zIndex: 4,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          pointerEvents: "none",
          "& > *": { pointerEvents: "auto" },
          [PHONE]: { top: top(expanded, 10), left: 10, right: 60 },
        }}
      >
        {picking && (
          <Box
            sx={{
              ...glassSurface,
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              maxWidth: "100%",
              minHeight: 44,
              p: "5px 5px 5px 14px",
              borderRadius: `${RADIUS.pill}px`,
              color: COLORS.ink,
              fontSize: TYPE.small,
              lineHeight: 1.35,
            }}
          >
            <Box
              component="span"
              aria-hidden="true"
              sx={{ flex: "none", width: 10, height: 10, borderRadius: "50%", bgcolor: tone.color, boxShadow: `0 0 0 3px ${tone.soft}` }}
            />
            <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <Box component="span" sx={{ fontWeight: 650 }}>
                {picking.label}
              </Box>
              <Box
                component="span"
                sx={{
                  display: "none",
                  color: COLORS.muted,
                  fontSize: TYPE.meta,
                  ".map-canvas.is-keyboard-focus ~ * &": { display: "block" },
                  [PHONE]: { display: "none !important" },
                }}
              >
                {text.mapPickKeyboard}
              </Box>
            </Box>
            <Box component="button" type="button" onClick={() => handlersRef.current?.onCancelPick?.()} sx={textButton}>
              {text.mapCancel}
              <Box
                component="kbd"
                sx={{
                  px: "5px",
                  border: `1px solid ${COLORS.rule2}`,
                  borderRadius: "5px",
                  color: COLORS.muted,
                  fontFamily: MONO_FONT,
                  fontSize: TYPE.label,
                  lineHeight: "16px",
                  [PHONE]: { display: "none" },
                }}
              >
                Esc
              </Box>
            </Box>
          </Box>
        )}
        {(basemap === "fallback" || basemap === "partial") && ready && (
          <Box
            role="alert"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              maxWidth: "100%",
              p: "6px 6px 6px 12px",
              border: "1px solid #ecd59c",
              borderRadius: `${RADIUS.card}px`,
              bgcolor: COLORS.warnSoft,
              color: COLORS.warn,
              boxShadow: SHADOW.float,
              fontSize: TYPE.small,
              fontWeight: 650,
              lineHeight: 1.4,
            }}
          >
            <Icon name="alert" size={18} />
            <span>{basemap === "fallback" ? text.mapBasemapFallback : text.mapBasemapPartial}</span>
            <Box component="button" type="button" onClick={retry} sx={{ ...textButton, color: COLORS.warn, borderColor: "currentColor" }}>
              <Icon name="refresh" size={16} />
              {text.mapRetry}
            </Box>
          </Box>
        )}
      </Box>
      <Box role="status" sx={visuallyHidden}>
        {picking?.label ?? ""}
      </Box>

      <Box
        role="group"
        aria-label={text.mapControls}
        sx={{
          ...glassSurface,
          position: "absolute",
          top: top(expanded, WORKSPACE.inset),
          right: WORKSPACE.inset,
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          p: "3px",
          borderRadius: `${RADIUS.card}px`,
          [PHONE]: { top: top(expanded, 10), right: 10 },
        }}
      >
        <ControlButton label={text.mapZoomIn} icon="plus" onClick={zoomIn} disabled={!ready} />
        <ControlButton label={text.mapZoomOut} icon="minus" onClick={zoomOut} disabled={!ready} />
        <Separator />
        <ControlButton label={text.mapFit} icon="focus" onClick={fitScene} disabled={!ready || !canFit} />
        <ControlButton label={text.mapWorld} icon="world" onClick={showWorld} disabled={!ready} />
        <Separator />
        <ControlButton
          label={expanded ? text.mapCollapse : text.mapExpand}
          icon={expanded ? "collapse" : "expand"}
          onClick={onToggleExpanded}
          pressed={expanded}
        />
      </Box>

      <Box
        component="output"
        ref={cursorRef}
        aria-hidden="true"
        sx={{
          position: "absolute",
          left: 0,
          bottom: 0,
          zIndex: 2,
          p: "2px 8px",
          borderRadius: "0 7px 0 0",
          bgcolor: "rgba(252, 251, 248, 0.86)",
          color: COLORS.ink2,
          fontFamily: MONO_FONT,
          fontSize: TYPE.label,
          lineHeight: "15px",
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "none",
          "&:empty": { display: "none" },
          [PHONE]: { display: "none" },
          "@media (hover: none)": { display: "none" },
        }}
      />

      {status === "loading" && (
        <Box
          role="status"
          sx={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 5,
            display: "grid",
            placeContent: "center",
            justifyItems: "center",
            gap: 1.25,
            color: COLORS.muted,
            fontSize: TYPE.body,
            fontWeight: 650,
            pointerEvents: "none",
          }}
        >
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              width: 26,
              height: 26,
              border: `3px solid ${COLORS.rule2}`,
              borderTopColor: COLORS.ink,
              borderRadius: "50%",
              animation: "convertSpin 800ms linear infinite",
              "@keyframes convertSpin": { to: { transform: "rotate(360deg)" } },
            }}
          />
          {text.mapLoading}
        </Box>
      )}

      {(status === "error" || status === "unsupported") && (
        <Box
          role="alert"
          sx={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 5,
            display: "grid",
            placeContent: "center",
            justifyItems: "center",
            gap: 1.25,
            p: 2.5,
            textAlign: "center",
            color: COLORS.error,
            fontSize: TYPE.body,
            fontWeight: 650,
          }}
        >
          <Icon name="alert" />
          <Box component="p" sx={{ m: 0, maxWidth: 420 }}>
            {status === "unsupported" ? text.mapUnsupported : text.mapUnavailable}
          </Box>
          {status === "error" && (
            <Box component="button" type="button" onClick={retry} sx={{ ...textButton, color: COLORS.error, borderColor: "currentColor" }}>
              <Icon name="refresh" size={16} />
              {text.mapRetry}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
