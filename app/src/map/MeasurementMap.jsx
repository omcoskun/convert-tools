import { useEffect, useMemo, useRef } from "react";
import Icon from "../components/Icon.jsx";
import { useLanguage } from "../context.js";
import { COLORS, MONO_FONT, PHONE, SHADOW_FLOAT, UI_FONT } from "../theme.js";
import { Box } from "../ui/index.js";
import useMeasurementMap from "./useMeasurementMap.js";

/** Picking cursor: a crosshair with the letter of the point being placed. */
function pickCursor(letter, color) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">' +
    '<g stroke-linecap="round"><path d="M12 2v7M12 15v7M2 12h7M15 12h7" stroke="#16191c" stroke-width="3.6"/>' +
    '<path d="M12 2v7M12 15v7M2 12h7M15 12h7" stroke="#fff" stroke-width="1.6"/></g>' +
    `<circle cx="12" cy="12" r="2.2" fill="${color}" stroke="#fff" stroke-width="1.2"/>` +
    `<rect x="17.5" y="17.5" width="15" height="15" rx="4.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>` +
    '<text x="25" y="29" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="11" fill="#fff" ' +
    `text-anchor="middle">${letter}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
}

const PIN = { start: COLORS.a, end: COLORS.b };

const floating = {
  border: `1px solid ${COLORS.rule2}`,
  bgcolor: COLORS.sheet,
  boxShadow: SHADOW_FLOAT,
};

const plainButton = {
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  "&:disabled": { cursor: "default", opacity: 0.4 },
};

// Everything MapLibre draws (canvas, markers, controls) sits inside the
// stage, so its look is set here with selectors that are more specific than
// MapLibre's own stylesheet.
const stageSx = {
  position: "relative",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  bgcolor: "#e9e7e0",
  fontFamily: UI_FONT,
  "& > .map-canvas": { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  "& > .map-canvas .maplibregl-canvas:focus-visible": { outline: `3px solid ${COLORS.focus}`, outlineOffset: "-3px" },
  "&.is-picking-start > .map-canvas .maplibregl-canvas-container.maplibregl-interactive:not(:active)": {
    cursor: pickCursor("A", COLORS.a),
  },
  "&.is-picking-end > .map-canvas .maplibregl-canvas-container.maplibregl-interactive:not(:active)": {
    cursor: pickCursor("B", COLORS.b),
  },
  "& .map-pin": { width: 30, height: 30, cursor: "grab", touchAction: "none" },
  "& .map-pin.is-dragging": { cursor: "grabbing" },
  "& .map-pin-halo": {
    position: "absolute",
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
    borderRadius: "50%",
    transition: "transform 140ms ease",
  },
  "& .map-pin-start .map-pin-halo": { bgcolor: "rgba(36, 80, 224, 0.24)" },
  "& .map-pin-end .map-pin-halo": { bgcolor: "rgba(226, 73, 44, 0.24)" },
  "& .map-pin:hover .map-pin-halo, & .map-pin.is-dragging .map-pin-halo": { transform: "scale(1.55)" },
  "& .map-pin-dot": {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 14,
    height: 14,
    m: "-7px 0 0 -7px",
    border: "3px solid #ffffff",
    borderRadius: "50%",
    boxShadow: "0 0 0 1px rgba(22, 25, 28, 0.3), 0 2px 6px rgba(22, 25, 28, 0.35)",
  },
  "& .map-pin-tag": {
    position: "absolute",
    left: "50%",
    bottom: "calc(50% + 11px)",
    minWidth: 22,
    height: 22,
    px: "6px",
    transform: "translateX(-50%)",
    border: "1.5px solid #ffffff",
    borderRadius: "7px",
    color: "#ffffff",
    font: `750 12px/19px ${UI_FONT}`,
    textAlign: "center",
    boxShadow: "0 2px 6px rgba(22, 25, 28, 0.3)",
  },
  "& .map-pin-tag::after": {
    content: '""',
    position: "absolute",
    left: "50%",
    top: "100%",
    ml: "-4px",
    border: "4px solid transparent",
    borderTopColor: "#ffffff",
  },
  "& .map-pin-start .map-pin-dot, & .map-pin-start .map-pin-tag": { bgcolor: PIN.start },
  "& .map-pin-end .map-pin-dot, & .map-pin-end .map-pin-tag": { bgcolor: PIN.end },
  "& .map-distance-tag": {
    px: "9px",
    py: "3px",
    border: `1px solid ${COLORS.rule2}`,
    borderRadius: 999,
    bgcolor: "rgba(252, 251, 248, 0.95)",
    color: COLORS.ink,
    font: `600 12px/1.4 ${MONO_FONT}`,
    whiteSpace: "nowrap",
    boxShadow: "0 1px 4px rgba(22, 25, 28, 0.18)",
    pointerEvents: "none",
  },
  "& > .map-canvas .maplibregl-ctrl-attrib": {
    bgcolor: "rgba(252, 251, 248, 0.86)",
    borderRadius: "7px 0 0 0",
    fontSize: 11,
    lineHeight: 1.35,
    color: COLORS.ink2,
  },
  "& > .map-canvas .maplibregl-ctrl-attrib a": { color: COLORS.ink2 },
  "& > .map-canvas .maplibregl-ctrl-bottom-right": { maxWidth: "calc(100% - 130px)" },
  "& > .map-canvas .maplibregl-ctrl-scale": {
    borderColor: COLORS.ink2,
    bgcolor: "rgba(252, 251, 248, 0.8)",
    color: COLORS.ink,
    fontFamily: MONO_FONT,
    fontSize: 10.5,
  },
  [PHONE]: {
    "& > .map-canvas .maplibregl-ctrl-bottom-right": { maxWidth: "calc(100% - 100px)" },
    // The bottom sheet overlaps the map's lower edge by 14px.
    "& > .map-canvas .maplibregl-ctrl-bottom-left, & > .map-canvas .maplibregl-ctrl-bottom-right": { bottom: "14px" },
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
        ...plainButton,
        display: "grid",
        placeItems: "center",
        width: 38,
        height: 38,
        border: 0,
        borderRadius: "9px",
        bgcolor: "transparent",
        color: COLORS.ink,
        "&:hover:not(:disabled)": { bgcolor: COLORS.paper2 },
        "&[aria-pressed='true']": { bgcolor: COLORS.ink, color: COLORS.paper },
        [PHONE]: { width: 36, height: 34 },
      }}
    >
      <Icon name={icon} size={19} />
    </Box>
  );
}

const Gap = () => <Box component="span" sx={{ height: "1px", m: "3px 6px", bgcolor: COLORS.rule }} />;

function LetterBadge({ target, size = 22, pulse = false }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        display: "inline-grid",
        placeItems: "center",
        flex: "none",
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: PIN[target],
        color: "#ffffff",
        fontSize: size > 24 ? 13.5 : 12,
        fontWeight: 750,
        ...(pulse && {
          animation: `${target === "start" ? "convertPulseA" : "convertPulseB"} 1.4s ease-in-out infinite`,
          "@keyframes convertPulseA": { "50%": { boxShadow: "0 0 0 5px rgba(36, 80, 224, 0.18)" } },
          "@keyframes convertPulseB": { "50%": { boxShadow: "0 0 0 5px rgba(226, 73, 44, 0.2)" } },
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }),
      }}
    >
      {target === "start" ? "A" : "B"}
    </Box>
  );
}

const statusButton = {
  ...plainButton,
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  height: 32,
  px: "11px",
  border: "1px solid currentColor",
  borderRadius: "8px",
  bgcolor: COLORS.sheet,
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

/**
 * The interactive map of the distance tool: MapLibre canvas, A/B picking bar,
 * zoom and view controls, and the basemap/loading/error states.
 */
export default function MeasurementMap({
  styleUrl,
  start,
  end,
  points,
  distanceLabel,
  activeTarget,
  fitRequest,
  panelOpen,
  expanded,
  onPick,
  onMove,
  onStartPicking,
  onArm,
  onCancel,
  onShowPanel,
  onToggleExpanded,
}) {
  const { language, text } = useLanguage();
  const labels = useMemo(
    () => ({ mapCanvas: `${text.mapTitle}. ${text.mapPanHint}`, markerStart: text.mapStart, markerEnd: text.mapEnd }),
    [text],
  );
  const { containerRef, cursorRef, status, basemap, retry, zoomIn, zoomOut, focusMeasurement, resetView } =
    useMeasurementMap({
      styleUrl,
      language,
      labels,
      start,
      end,
      points,
      distanceLabel,
      activeTarget,
      fitRequest,
      onPick,
      onMove,
    });
  const ready = status === "ready";
  const picking = activeTarget ? ` is-picking is-picking-${activeTarget}` : "";
  const cancelRef = useRef(null);
  const pickRef = useRef(null);

  // The pick bar swaps its buttons when picking starts or ends. If the
  // button that had keyboard focus disappeared with them, focus moves to the
  // bar's new main button instead of falling back to the page.
  const previousTargetRef = useRef(activeTarget);
  useEffect(() => {
    const switched = Boolean(previousTargetRef.current) !== Boolean(activeTarget);
    previousTargetRef.current = activeTarget;
    const lost = document.activeElement == null || document.activeElement === document.body;
    if (switched && lost) (activeTarget ? cancelRef : pickRef).current?.focus();
  }, [activeTarget]);

  return (
    <Box component="section" className={`map-stage${picking}`} aria-label={text.mapTitle} sx={stageSx}>
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
          border: `2px solid ${activeTarget === "end" ? COLORS.b : COLORS.a}`,
          borderRadius: "50%",
          background: `linear-gradient(${COLORS.ink}, ${COLORS.ink}) center / 2px 14px no-repeat, linear-gradient(${COLORS.ink}, ${COLORS.ink}) center / 14px 2px no-repeat`,
          ".map-stage.is-picking > .map-canvas.is-keyboard-focus ~ &": { display: "block" },
        }}
      />

      <Box
        sx={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 64,
          zIndex: 3,
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
          pointerEvents: "none",
          "& > *": { pointerEvents: "auto" },
          [PHONE]: { top: 10, left: 10, right: 58 },
        }}
      >
        {!panelOpen && (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "6px", [PHONE]: { display: "none" } }}>
            <Box
              component="button"
              type="button"
              onClick={onShowPanel}
              aria-expanded="false"
              aria-controls="measure-panel"
              sx={{
                ...plainButton,
                ...floating,
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                height: 36,
                px: "12px",
                borderRadius: "10px",
                fontSize: 13,
                fontWeight: 650,
                whiteSpace: "nowrap",
              }}
            >
              <Icon name="panel" size={17} />
              {text.showPanel}
            </Box>
            {distanceLabel && (
              <Box
                component="span"
                sx={{
                  ...floating,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  height: 36,
                  px: "12px",
                  borderRadius: "10px",
                  bgcolor: COLORS.ink,
                  borderColor: COLORS.ink,
                  color: COLORS.paper,
                  fontFamily: MONO_FONT,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{ width: 18, height: 3, borderRadius: 2, background: `linear-gradient(90deg, ${COLORS.a}, ${COLORS.b})` }}
                />
                {distanceLabel}
              </Box>
            )}
          </Box>
        )}

        <Box
          role="toolbar"
          aria-label={text.mapPickTools}
          sx={{
            ...floating,
            display: "flex",
            alignItems: "center",
            gap: "4px",
            mx: "auto",
            p: "4px",
            borderRadius: "13px",
            minWidth: 0,
            [PHONE]: { mx: 0 },
          }}
        >
          {activeTarget ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: "10px", p: "2px 2px 2px 8px", minWidth: 0 }}>
              <LetterBadge target={activeTarget} size={26} pulse />
              <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <Box component="strong" sx={{ fontSize: 13.5, lineHeight: 1.25 }}>
                  {activeTarget === "start" ? text.mapPickingStart : text.mapPickingEnd}
                </Box>
                <Box component="small" sx={{ color: COLORS.muted, fontSize: 11.5, [PHONE]: { display: "none" } }}>
                  {text.mapPickKeyboard}
                </Box>
              </Box>
              <Box
                component="button"
                type="button"
                ref={cancelRef}
                onClick={onCancel}
                sx={{
                  ...plainButton,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  height: 34,
                  px: "10px",
                  border: `1px solid ${COLORS.rule2}`,
                  borderRadius: "9px",
                  bgcolor: COLORS.sheet,
                  fontSize: 13,
                  fontWeight: 650,
                  whiteSpace: "nowrap",
                  "&:hover": { borderColor: COLORS.ink2 },
                }}
              >
                {text.mapCancel}
                <Box
                  component="kbd"
                  sx={{
                    px: "5px",
                    border: `1px solid ${COLORS.rule2}`,
                    borderRadius: "5px",
                    fontSize: 11,
                    color: COLORS.muted,
                    "@media (max-width: 480px)": { display: "none" },
                  }}
                >
                  Esc
                </Box>
              </Box>
            </Box>
          ) : (
            <>
              <Box
                component="button"
                type="button"
                ref={pickRef}
                onClick={onStartPicking}
                sx={{
                  ...plainButton,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 1,
                  height: 38,
                  pl: "10px",
                  pr: "12px",
                  border: 0,
                  borderRadius: "9px",
                  bgcolor: COLORS.ink,
                  color: COLORS.paper,
                  fontSize: 14,
                  fontWeight: 650,
                  whiteSpace: "nowrap",
                  "&:hover": { bgcolor: "#2b3035" },
                }}
              >
                <Icon name="crosshair" size={18} />
                {text.mapPickPoints}
                <Box component="small" sx={{ color: "#a9adaf", fontSize: 12, fontWeight: 600, [PHONE]: { display: "none" } }}>
                  A → B
                </Box>
              </Box>
              {["start", "end"].map((target) => {
                const label = target === "start" ? text.mapPickStart : text.mapPickEnd;
                const color = PIN[target];
                return (
                  <Box
                    key={target}
                    component="button"
                    type="button"
                    onClick={() => onArm(target)}
                    aria-label={label}
                    title={label}
                    sx={{
                      ...plainButton,
                      width: 34,
                      height: 34,
                      border: "1.5px solid currentColor",
                      borderRadius: "9px",
                      bgcolor: COLORS.sheet,
                      color,
                      fontSize: 13,
                      fontWeight: 750,
                      "&:hover": { bgcolor: target === "start" ? COLORS.aSoft : COLORS.bSoft },
                    }}
                  >
                    {target === "start" ? "A" : "B"}
                  </Box>
                );
              })}
            </>
          )}
        </Box>
      </Box>

      <Box
        role="group"
        aria-label={text.mapControls}
        sx={{
          ...floating,
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          p: "3px",
          borderRadius: "12px",
          [PHONE]: { top: 10, right: 8 },
        }}
      >
        <ControlButton label={text.mapZoomIn} icon="plus" onClick={zoomIn} disabled={!ready} />
        <ControlButton label={text.mapZoomOut} icon="minus" onClick={zoomOut} disabled={!ready} />
        <Gap />
        <ControlButton label={text.mapFit} icon="focus" onClick={focusMeasurement} disabled={!ready || !(start || end)} />
        <ControlButton label={text.mapWorld} icon="world" onClick={resetView} disabled={!ready} />
        <Gap />
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
          left: 10,
          bottom: 38,
          zIndex: 2,
          px: "7px",
          py: "2px",
          borderRadius: "6px",
          bgcolor: "rgba(252, 251, 248, 0.88)",
          color: COLORS.ink2,
          fontSize: 11.5,
          pointerEvents: "none",
          "&:empty": { display: "none" },
          [PHONE]: { display: "none" },
          "@media (hover: none)": { display: "none" },
        }}
      />

      {(basemap === "fallback" || basemap === "partial") && ready && (
        <Box
          role="alert"
          sx={{
            position: "absolute",
            top: 66,
            left: "50%",
            zIndex: 4,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            width: "max-content",
            maxWidth: "calc(100% - 140px)",
            p: "8px 8px 8px 12px",
            transform: "translateX(-50%)",
            border: "1px solid #ecd59c",
            borderRadius: "11px",
            bgcolor: COLORS.warnSoft,
            color: COLORS.warn,
            boxShadow: SHADOW_FLOAT,
            fontSize: 13,
            fontWeight: 600,
            [PHONE]: { top: 60, left: 10, right: 58, width: "auto", maxWidth: "none", transform: "none" },
          }}
        >
          <Icon name="alert" size={18} />
          <span>{basemap === "fallback" ? text.mapBasemapFallback : text.mapBasemapPartial}</span>
          <Box component="button" type="button" onClick={retry} sx={statusButton}>
            <Icon name="refresh" size={16} />
            {text.mapRetry}
          </Box>
        </Box>
      )}

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
            gap: "10px",
            color: COLORS.muted,
            fontSize: 14,
            fontWeight: 600,
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
            gap: "10px",
            p: 2.5,
            textAlign: "center",
            color: "#b3341d",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <Icon name="alert" />
          <Box component="p" sx={{ m: 0, maxWidth: 420 }}>
            {status === "unsupported" ? text.mapUnsupported : text.mapUnavailable}
          </Box>
          {status === "error" && (
            <Box component="button" type="button" onClick={retry} sx={statusButton}>
              <Icon name="refresh" size={16} />
              {text.mapRetry}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
