import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon.jsx";
import { useLanguage, useThemeMode } from "../context.js";
import { readPref, writePref } from "../lib/prefs.js";
import { BAR_HEIGHT, COLORS, MONO_FONT, MOTION, PHONE, RADIUS, SHADOW, TYPE, UI_FONT, WORKSPACE } from "../theme.js";
import { Box, visuallyHidden } from "../ui/index.js";
import Attribution from "./Attribution.jsx";
import { TONE_COLORS, findBasemap } from "./basemaps.js";
import ContextMenu from "./ContextMenu.jsx";
import LayerPanel from "./LayerPanel.jsx";
import { PIN_SHAPE } from "./map-adapter.js";
import { SCALE_UNITS } from "./scale.js";
import ScaleBar from "./ScaleBar.jsx";
import SpaceBackdrop from "./SpaceBackdrop.jsx";
import useMapStage from "./useMapStage.js";

// Pin and picking colours. The ink pin takes the colour of the plain line on
// the loaded basemap (--map-ink, set on the stage), so it matches its line on
// light, dark and satellite maps.
const TONES = {
  a: { color: COLORS.a, soft: COLORS.aSoft, on: "#ffffff", halo: "rgba(36, 80, 224, 0.24)" },
  b: { color: COLORS.b, soft: COLORS.bSoft, on: "#ffffff", halo: "rgba(226, 73, 44, 0.24)" },
  ink: { color: "var(--map-ink)", soft: COLORS.paper2, on: "var(--map-on-ink)", halo: "rgba(22, 25, 28, 0.2)" },
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
  bgcolor: COLORS.glass,
  boxShadow: SHADOW.float,
  backdropFilter: "blur(12px) saturate(1.4)",
};

// Half the widest scale bar (96 px and its 28 px sides), for keeping it clear
// of the input widget.
const SCALE_HALF_WIDTH = 76;

// Map controls and the hint column start below the glass bar, or at the top
// of the enlarged map.
const top = (expanded, gap) => (expanded ? gap : `calc(var(--ct-bar-height, ${BAR_HEIGHT}px) + ${gap}px)`);

// Everything MapLibre draws (canvas, markers, controls) sits inside the
// stage, so its look is set here with selectors more specific than
// MapLibre's own stylesheet.
const stageSx = {
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  bgcolor: "#000",
  "& > .map-space": { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" },
  "& > .map-canvas.maplibregl-map": { background: "transparent" },
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
  "& .map-location-dot": {
    position: "relative",
    width: 18,
    height: 18,
    boxSizing: "border-box",
    border: "3px solid #ffffff",
    borderRadius: "50%",
    bgcolor: "#2f7cf6",
    boxShadow: "0 1px 5px rgba(8, 12, 18, 0.4)",
    pointerEvents: "none",
  },
  "& .map-location-dot > span": {
    position: "absolute",
    inset: -3,
    borderRadius: "50%",
    bgcolor: "rgba(47, 124, 246, 0.4)",
    animation: "convertLocationPulse 2.2s ease-out infinite",
    "@keyframes convertLocationPulse": { from: { transform: "scale(1)", opacity: 0.7 }, to: { transform: "scale(3.2)", opacity: 0 } },
    "@media (prefers-reduced-motion: reduce)": { animation: "none", opacity: 0 },
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
      [`& .map-pin.tone-${tone} .map-pin-head`, { color: TONES[tone].on }],
      [`& .map-pin.tone-${tone}.is-hollow .map-pin-head`, { bgcolor: "#ffffff", borderColor: color, color }],
      [`& .map-pin.tone-${tone}.is-hollow .map-pin-dot`, { bgcolor: "#ffffff", borderColor: color }],
    ]),
  ),
  "& .map-line-tag": {
    px: "9px",
    py: "3px",
    border: `1px solid ${COLORS.rule2}`,
    borderRadius: `${RADIUS.pill}px`,
    bgcolor: COLORS.glass,
    color: COLORS.ink,
    font: `650 12px/1.4 ${MONO_FONT}`,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    boxShadow: "0 1px 4px rgba(22, 25, 28, 0.18)",
    pointerEvents: "none",
  },
};

function ControlButton({ label, icon, onClick, disabled, pressed, expanded, buttonRef, busy, children }) {
  return (
    <Box
      component="button"
      type="button"
      ref={buttonRef}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : "dialog"}
      title={label}
      className={busy ? "is-busy" : undefined}
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
        "&[aria-pressed='true'], &[aria-expanded='true']": { bgcolor: COLORS.selected, color: COLORS.onSelected },
        "&:focus-visible": { outline: `3px solid ${COLORS.focus}`, outlineOffset: "1px" },
        "&.is-busy svg": {
          animation: "convertLocate 1.2s ease-in-out infinite",
          "@keyframes convertLocate": { "50%": { opacity: 0.35 } },
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        },
        [PHONE]: { width: 40, height: 40 },
      }}
    >
      {children ?? <Icon name={icon} size={18} />}
    </Box>
  );
}

const Separator = () => <Box component="span" aria-hidden="true" sx={{ height: "1px", m: "3px 6px", bgcolor: COLORS.rule }} />;

// One rounded group of the control column.
const groupSx = { ...glassSurface, display: "flex", flexDirection: "column", p: "3px", borderRadius: `${RADIUS.card}px` };

/** The compass needle: north red, south grey; MapStage turns it with the map. */
function CompassNeedle() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M11 2.5 14.2 11H7.8Z" fill="#e2492c" />
      <path d="M11 19.5 7.8 11h6.4Z" fill="currentColor" opacity="0.45" />
      <circle cx="11" cy="11" r="1.6" fill="currentColor" />
    </svg>
  );
}

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
 * picking hint, one column of map controls (layers, 3D, zoom, fit, my
 * location, enlarge, and a compass while the map is turned), the scale bar
 * at the top, the credits in the bottom-right corner, the pointer readout, the point
 * menu and the loading, basemap and error states. Rendered once by
 * WorkspaceLayout and kept for the life of the app.
 * @param {{
 *   basemaps: import("./basemaps.js").Basemap[],
 *   defaultBasemap: string,
 *   scene: import("./scene.js").MapScene,
 *   owner: object | null,
 *   handlersRef: { current: import("../shell/workspace-context.js").MapSceneHandlers },
 *   getPadding: () => { top: number, right: number, bottom: number, left: number },
 *   expanded: boolean,
 *   onToggleExpanded: () => void,
 *   onStatusChange: (status: import("../shell/workspace-context.js").MapStatus) => void,
 *   active: boolean,
 * }} props
 *   basemaps, defaultBasemap: config.map. owner: the tool that published
 *   the scene (see useMapStage). active: false while a page tool hides the
 *   workspace, so Esc is left alone.
 */
export default function MapStage({
  basemaps,
  defaultBasemap,
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
  const { mode } = useThemeMode();
  const labels = useMemo(
    () => ({
      mapCanvas: `${text.mapTitle}. ${text.mapPanHint}`,
      continents: {
        northAmerica: text.mapContinentNorthAmerica,
        southAmerica: text.mapContinentSouthAmerica,
        europe: text.mapContinentEurope,
        africa: text.mapContinentAfrica,
        asia: text.mapContinentAsia,
        oceania: text.mapContinentOceania,
        antarctica: text.mapContinentAntarctica,
      },
    }),
    [text],
  );
  const map = useMapStage({ basemaps, defaultBasemap, mode, language, labels, scene, owner, handlersRef, getPadding });
  const { status, basemapStatus, retry, viewMode, setMode, loaded, location } = map;
  const ready = status === "ready";
  const { picking } = scene;
  const canFit = scene.pins.length > 0 || scene.lines.some((line) => line.points.length > 0);

  const [layersOpen, setLayersOpen] = useState(false);
  const layersButtonRef = useRef(null);
  const [scaleUnit, setScaleUnit] = useState(() => readPref("map-scale-unit", "metric", SCALE_UNITS));
  const [scalePinned, setScalePinned] = useState(() => readPref("map-scale-pinned", false));
  const changeScaleUnit = useCallback((unit) => {
    setScaleUnit(unit);
    writePref("map-scale-unit", unit);
  }, []);
  const toggleScalePinned = useCallback(() => {
    setScalePinned((current) => {
      writePref("map-scale-pinned", !current);
      return !current;
    });
  }, []);
  const closeLayers = useCallback(() => {
    // Focus goes back to the button only from inside the panel (Esc, or a
    // press elsewhere while a card had focus), never away from the map.
    const focused = document.activeElement;
    if (focused instanceof Element && focused.closest(".map-layer-panel")) layersButtonRef.current?.focus();
    setLayersOpen(false);
  }, []);

  useEffect(() => {
    onStatusChange(status);
  }, [status, onStatusChange]);

  // Escape leaves picking first, then the enlarged view. The panel and the
  // point menu handle their own Escape first.
  useEffect(() => {
    if (!active) return undefined;
    function onKey(event) {
      if (event.key !== "Escape" || event.defaultPrevented || layersOpen || map.contextMenu) return;
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
  }, [active, picking, expanded, onToggleExpanded, handlersRef, layersOpen, map.contextMenu]);

  const tone = TONES[picking?.tone] ?? TONES.ink;
  const toneColors = TONE_COLORS[loaded.tone] ?? TONE_COLORS.light;
  const credits = loaded.id ? findBasemap(basemaps, loaded.id)?.attribution ?? [] : [];
  const locationError = {
    mapLocationDenied: text.mapLocationDenied,
    mapLocationTimeout: text.mapLocationTimeout,
    mapLocationUnavailable: text.mapLocationUnavailable,
  }[location.errorKey];
  const columnTop = top(expanded, WORKSPACE.inset);

  return (
    <Box
      component="section"
      className={`map-stage${picking ? ` is-picking is-picking-${picking.tone}` : ""}`}
      aria-label={text.mapTitle}
      sx={{ ...stageSx, "--map-ink": toneColors.line, "--map-on-ink": toneColors.onLine }}
    >
      <SpaceBackdrop subscribeView={map.subscribeView} readCamera={map.readCamera} loaded={map.loaded} />
      <div className="map-canvas" ref={map.containerRef} />

      {/* Shown while picking with keyboard focus on the canvas: Enter places the point here. */}
      <Box
        aria-hidden="true"
        sx={{
          display: "none",
          position: "absolute",
          left: "var(--map-center-x, 50%)",
          top: "var(--map-center-y, 50%)",
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

      {/* The picking hint and the notices, centred over the part of the map the input widget leaves free. */}
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
          [PHONE]: { top: top(expanded, 62), left: 10, right: 60 },
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
        {(basemapStatus === "fallback" || basemapStatus === "partial") && ready && (
          <Box
            role="alert"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              maxWidth: "100%",
              p: "6px 6px 6px 12px",
              border: `1px solid ${COLORS.warnRule}`,
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
            <span>{basemapStatus === "fallback" ? text.mapBasemapFallback : text.mapBasemapPartial}</span>
            <Box component="button" type="button" onClick={retry} sx={{ ...textButton, color: COLORS.warn, borderColor: "currentColor" }}>
              <Icon name="refresh" size={16} />
              {text.mapRetry}
            </Box>
          </Box>
        )}
        {locationError && (
          <Box
            role="alert"
            sx={{
              ...glassSurface,
              display: "flex",
              alignItems: "center",
              gap: 1,
              maxWidth: "100%",
              p: "8px 14px 8px 10px",
              borderRadius: `${RADIUS.pill}px`,
              color: COLORS.ink,
              fontSize: TYPE.small,
              fontWeight: 600,
              "& svg": { color: COLORS.warn, flex: "none" },
            }}
          >
            <Icon name="locate" size={18} />
            <span>{locationError}</span>
          </Box>
        )}
      </Box>
      <Box role="status" sx={visuallyHidden}>
        {picking?.label ?? ""}
      </Box>

      {/* The control column: what the map shows, where it looks, what it does. */}
      <Box
        role="group"
        className="map-controls"
        aria-label={text.mapControls}
        sx={{
          position: "absolute",
          top: columnTop,
          right: WORKSPACE.inset,
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          // A short map keeps the column above the credits strip: groups that do
          // not fit wrap into a second column to its left.
          [PHONE]: { top: top(expanded, 10), right: 10, bottom: 60, gap: 0.75, flexWrap: "wrap-reverse", alignContent: "flex-start", justifyContent: "flex-start" },
        }}
      >
        <Box sx={groupSx}>
          <ControlButton
            label={text.mapLayers}
            icon="layers"
            buttonRef={layersButtonRef}
            expanded={layersOpen}
            onClick={() => setLayersOpen((open) => !open)}
            disabled={!ready}
          />
          <ControlButton label={text.map3D} onClick={() => setMode(viewMode === "3d" ? "2d" : "3d")} disabled={!ready} pressed={viewMode === "3d"}>
            <Box component="span" sx={{ fontSize: 12, fontWeight: 750, letterSpacing: "0.02em" }}>3D</Box>
          </ControlButton>
        </Box>
        <Box sx={groupSx}>
          <ControlButton label={text.mapZoomIn} icon="plus" onClick={map.zoomIn} disabled={!ready || !map.canZoomIn} />
          <Separator />
          <ControlButton label={text.mapZoomOut} icon="minus" onClick={map.zoomOut} disabled={!ready || !map.canZoomOut} />
        </Box>
        <Box sx={groupSx}>
          <ControlButton label={text.mapFit} icon="focus" onClick={() => map.fitScene()} disabled={!ready || !canFit} />
          <ControlButton
            label={text.mapMyLocation}
            icon="locate"
            onClick={map.toggleLocation}
            disabled={!ready}
            pressed={location.status === "on" || location.status === "searching"}
            busy={location.status === "searching"}
          />
          <ControlButton
            label={expanded ? text.mapCollapse : text.mapExpand}
            icon={expanded ? "collapse" : "expand"}
            onClick={onToggleExpanded}
            pressed={expanded}
          />
        </Box>
        {map.rotated && (
          // On a phone the column fills the map's height: the compass goes beside its top.
          <Box sx={{ ...groupSx, borderRadius: "50%", [PHONE]: { position: "absolute", top: 0, right: "calc(100% + 8px)" } }}>
            <ControlButton label={text.mapNorth} onClick={map.resetNorth} disabled={!ready}>
              <Box component="span" ref={map.compassRef} sx={{ display: "grid", placeItems: "center", color: COLORS.ink }}>
                <CompassNeedle />
              </Box>
            </ControlButton>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          position: "absolute",
          top: columnTop,
          right: WORKSPACE.inset + 52,
          zIndex: 5,
          "&:empty": { display: "none" },
          [PHONE]: { top: top(expanded, 10), right: 66 },
        }}
      >
        <LayerPanel
          open={layersOpen && ready}
          onClose={closeLayers}
          returnFocusRef={layersButtonRef}
          basemaps={basemaps}
          basemapId={map.basemapId}
          onChooseBasemap={map.chooseBasemap}
          overlays={map.overlays}
          onToggleOverlay={map.toggleOverlay}
          scalePinned={scalePinned}
          onToggleScalePinned={toggleScalePinned}
        />
      </Box>

      {/* The scale bar, as on Apple Maps: top centre of the window, or just
          right of the input widget when the centre would reach it; top left
          on a phone, above the hint column. It catches the pointer only
          while shown (ScaleBar). */}
      {ready && (
        <Box
          sx={{
            position: "absolute",
            top: top(expanded, WORKSPACE.inset / 2),
            left: expanded ? "50%" : `max(50%, calc(${WORKSPACE.inputWidth} + ${2 * WORKSPACE.inset}px + ${SCALE_HALF_WIDTH}px))`,
            transform: "translateX(-50%)",
            zIndex: 3,
            pointerEvents: "none",
            [PHONE]: { left: 0, transform: "none" },
          }}
        >
          <ScaleBar
            subscribeView={map.subscribeView}
            measureScale={map.measureScale}
            unit={scaleUnit}
            onUnitChange={changeScaleUnit}
            pinned={scalePinned}
            tone={loaded.tone}
          />
        </Box>
      )}

      {/* The credits, in the strip under the result widget. */}
      <Box
        sx={{
          position: "absolute",
          right: 8,
          bottom: 8,
          zIndex: 2,
          // Desktop: one row in the strip under the result widget (WORKSPACE.strip).
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-end",
          gap: "8px",
          maxWidth: "calc(100% - 16px)",
          pointerEvents: "none",
          "& > *": { pointerEvents: "auto" },
          // The sheet overlaps the map's lower edge by 14 px.
          [PHONE]: { bottom: 22, flexDirection: "column", alignItems: "flex-end", gap: "2px" },
        }}
      >
        <Attribution credits={credits} revision={map.styleRevision} />
      </Box>

      <Box
        component="output"
        ref={map.cursorRef}
        aria-hidden="true"
        sx={{
          ...glassSurface,
          position: "absolute",
          left: 8,
          bottom: 8,
          zIndex: 2,
          p: "3px 10px",
          borderRadius: `${RADIUS.pill}px`,
          color: COLORS.ink2,
          fontFamily: MONO_FONT,
          fontSize: TYPE.label,
          lineHeight: "16px",
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "none",
          "&:empty": { display: "none" },
          [PHONE]: { display: "none" },
          "@media (hover: none)": { display: "none" },
        }}
      />

      <ContextMenu menu={map.contextMenu} onClose={map.closeContextMenu} />

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
            color: "#c6d4e8",
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
              border: "3px solid rgba(198, 212, 232, 0.25)",
              borderTopColor: "#c6d4e8",
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
            color: "#ffb4a6",
            fontSize: TYPE.body,
            fontWeight: 650,
          }}
        >
          <Icon name="alert" />
          <Box component="p" sx={{ m: 0, maxWidth: 420 }}>
            {status === "unsupported" ? text.mapUnsupported : text.mapUnavailable}
          </Box>
          {status === "error" && (
            <Box component="button" type="button" onClick={retry} sx={textButton}>
              <Icon name="refresh" size={16} />
              {text.mapRetry}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
