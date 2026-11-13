import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { coordinateResults } from "@convert-tools/core";
import CopyButton from "../../components/CopyButton.jsx";
import ErrorMessage from "../../components/ErrorMessage.jsx";
import Field from "../../components/Field.jsx";
import Icon from "../../components/Icon.jsx";
import { fill, useConfig, useLanguage } from "../../context.js";
import { attempt } from "../../lib/attempt.js";
import MeasurementMap from "../../map/MeasurementMap.jsx";
import { isBeyondDisplay } from "../../map/map-adapter.js";
import { COLORS, MONO_FONT, PHONE } from "../../theme.js";
import { Box, Button, Stack, Typography, visuallyHidden } from "../../ui/index.js";
import { displayDistance, endpointOf, endpointStatus, fieldIsInvalid, localeDecimal, measure } from "./distance.js";
import { createMeasurementState, measurementReducer } from "./measurement-state.js";

// Units of the large readout: decimals there and on the map's distance tag.
const READOUT_UNITS = [
  { id: "kilometre", symbol: "km", decimals: 3, tagDecimals: 2 },
  { id: "nautical-mile", symbol: "NM", decimals: 3, tagDecimals: 2 },
  { id: "metre", symbol: "m", decimals: 1, tagDecimals: 0 },
];

// Phone layout: share of the workspace height the bottom sheet may take.
const SHEET_MIN = 0.12;
const SHEET_MAX = 0.86;

const PIN = {
  start: { color: COLORS.a, soft: COLORS.aSoft, ink: COLORS.aInk, letter: "A" },
  end: { color: COLORS.b, soft: COLORS.bSoft, ink: COLORS.bInk, letter: "B" },
};

function pickPoints(example) {
  const { startLatitude, startLongitude, endLatitude, endLongitude } = example;
  return { startLatitude, startLongitude, endLatitude, endLongitude };
}

function displayAngle(degrees, language) {
  return `${localeDecimal(degrees.toFixed(4), 4, language)}°`;
}

/** The value after it has stopped changing for delay ms (for the live region). */
function useSettledValue(value, delay) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

function LetterBadge({ target, size = 22 }) {
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
        bgcolor: PIN[target].color,
        color: "#ffffff",
        fontSize: 12,
        fontWeight: 750,
      }}
    >
      {PIN[target].letter}
    </Box>
  );
}

function PointCard({ target, values, activeTarget, onEdit, onArm }) {
  const { text } = useLanguage();
  const pin = PIN[target];
  const latitudeKey = `${target}Latitude`;
  const longitudeKey = `${target}Longitude`;
  const latitudeInvalid = fieldIsInvalid(values[latitudeKey], "latitude");
  const longitudeInvalid = fieldIsInvalid(values[longitudeKey], "longitude");
  const status = endpointStatus(values, target);
  const point = endpointOf(values, target);
  const pointLatitude = point?.latitude;
  const pointLongitude = point?.longitude;
  const formats = useMemo(() => {
    if (pointLatitude === undefined) return null;
    const result = attempt(() => coordinateResults({ latitude: pointLatitude, longitude: pointLongitude }, 5));
    return result.ok ? { dms: result.value.dms, mgrs: result.value.mgrs } : null;
  }, [pointLatitude, pointLongitude]);
  const active = activeTarget === target;
  const titleId = `distance-${target}-title`;
  const messageId = `distance-${target}-message`;
  let message = "";
  if (status === "invalid") message = `${text.coordinateInvalid} (${text.coordinateRange})`;
  else if (status === "incomplete") message = text.pointIncomplete;

  return (
    <Box
      role="group"
      aria-labelledby={titleId}
      aria-describedby={message ? messageId : undefined}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
        p: "11px 12px 12px",
        minWidth: 0,
        border: `1px solid ${active ? pin.color : COLORS.rule}`,
        borderLeft: `3px solid ${pin.color}`,
        borderRadius: "12px",
        bgcolor: COLORS.sheet,
        boxShadow: active ? `0 0 0 3px ${pin.soft}` : "none",
        transition: "border-color 140ms ease, box-shadow 140ms ease",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <LetterBadge target={target} />
        <Box component="span" id={titleId} sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700 }}>
          {target === "start" ? text.startPoint : text.endPoint}
        </Box>
        <Box
          component="button"
          type="button"
          aria-pressed={active}
          aria-label={target === "start" ? text.mapPickStart : text.mapPickEnd}
          onClick={() => onArm(target)}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            height: 30,
            px: "10px",
            border: `1px solid ${active ? pin.color : COLORS.rule2}`,
            borderRadius: "8px",
            bgcolor: active ? pin.color : COLORS.sheet,
            color: active ? "#ffffff" : pin.ink,
            font: "inherit",
            fontSize: 12.5,
            fontWeight: 700,
            whiteSpace: "nowrap",
            cursor: "pointer",
            "&:hover": { borderColor: pin.color },
          }}
        >
          <Icon name="crosshair" size={16} />
          {active ? text.pickingPoint : point ? text.repickPoint : text.pickPoint}
        </Box>
      </Box>
      <Stack direction="row" spacing={1}>
        <Field
          id={`distance-${latitudeKey}`}
          label={text.latitude}
          value={values[latitudeKey]}
          onChange={(value) => onEdit(latitudeKey, value)}
          inputMode="decimal"
          error={latitudeInvalid}
        />
        <Field
          id={`distance-${longitudeKey}`}
          label={text.longitude}
          value={values[longitudeKey]}
          onChange={(value) => onEdit(longitudeKey, value)}
          inputMode="decimal"
          error={longitudeInvalid}
        />
      </Stack>
      {message ? (
        <Typography id={messageId} variant="body2" sx={{ color: "error.main", fontWeight: 600, fontSize: 12.5 }}>
          {message}
        </Typography>
      ) : (
        formats && (
          <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "44px minmax(0, 1fr)", gap: "2px 6px" }}>
            {[
              ["DMS", formats.dms],
              ["MGRS", formats.mgrs],
            ].map(([label, value]) => (
              <Box key={label} sx={{ display: "contents" }}>
                <Box component="dt" sx={{ color: COLORS.faint, fontWeight: 700, fontSize: 10.5, letterSpacing: "0.06em", pt: "1px" }}>
                  {label}
                </Box>
                <Box component="dd" sx={{ m: 0, color: COLORS.ink2, fontFamily: MONO_FONT, fontSize: 12, overflowWrap: "anywhere" }}>
                  {value}
                </Box>
              </Box>
            ))}
          </Box>
        )
      )}
    </Box>
  );
}

const sectionLabel = {
  m: 0,
  color: COLORS.muted,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export default function DistanceCalculator() {
  const { language, text, examples: exampleLabels } = useLanguage();
  const { distance: settings, map: mapSettings } = useConfig();
  const [state, dispatch] = useReducer(measurementReducer, pickPoints(settings.examples[0]), createMeasurementState);
  const [unit, setUnit] = useState("kilometre");
  const [panelOpen, setPanelOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [sheetRatio, setSheetRatio] = useState(0.46);
  const workspaceRef = useRef(null);
  const sheetDragRef = useRef(null);
  // Enlarging gives the map the whole window and tucks the panel away; the
  // panel's previous state returns when the enlarged view closes.
  const panelBeforeExpandRef = useRef(true);
  const { values, activeTarget, fitRequest } = state;

  const start = endpointOf(values, "start");
  const end = endpointOf(values, "end");
  const startStatus = endpointStatus(values, "start");
  const endStatus = endpointStatus(values, "end");
  // Measured live whenever both points are complete; the core parses the
  // text again, so its error (with code) is shown if it rejects a value.
  const complete = start != null && end != null;
  const result = useMemo(
    () => (complete ? attempt(() => measure(values, settings.path)) : null),
    [complete, values, settings.path],
  );
  const measurement = result?.ok ? result.value : null;

  const unitInfo = READOUT_UNITS.find((item) => item.id === unit);
  const metres = measurement?.path.distanceMetres;
  const readoutValue = metres === undefined ? null : displayDistance(metres, unit, unitInfo.decimals, language);
  const distanceLabel =
    metres === undefined || metres === 0
      ? null
      : `${displayDistance(metres, unit, unitInfo.tagDecimals, language)} ${unitInfo.symbol}`;
  const announced = useSettledValue(readoutValue ? `${text.measurementReady} ${readoutValue} ${unitInfo.symbol}` : "", 700);
  const polarPoints = [start && isBeyondDisplay(start) ? "A" : null, end && isBeyondDisplay(end) ? "B" : null]
    .filter(Boolean)
    .join(", ");

  const onPick = useCallback((coordinate) => dispatch({ type: "pick", coordinate }), []);
  const onMove = useCallback((target, coordinate) => dispatch({ type: "move", target, coordinate }), []);
  const onArm = useCallback((target) => dispatch({ type: "arm", target }), []);
  const onCancel = useCallback(() => dispatch({ type: "cancel" }), []);
  const onStartPicking = useCallback(() => dispatch({ type: "startPicking" }), []);
  const onEdit = useCallback((key, value) => dispatch({ type: "edit", key, value }), []);

  function toggleExpanded() {
    if (expanded) {
      setPanelOpen(panelBeforeExpandRef.current);
    } else {
      panelBeforeExpandRef.current = panelOpen;
      setPanelOpen(false);
    }
    setExpanded(!expanded);
  }
  const toggleExpandedRef = useRef(toggleExpanded);
  useEffect(() => {
    toggleExpandedRef.current = toggleExpanded;
  });

  // Escape leaves picking first, then the enlarged view.
  useEffect(() => {
    function onKey(event) {
      if (event.key !== "Escape") return;
      if (activeTarget) {
        dispatch({ type: "cancel" });
        event.preventDefault();
      } else if (expanded) {
        toggleExpandedRef.current();
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTarget, expanded]);

  // Phone layout: the handle resizes the bottom sheet against the map.
  const clampRatio = (ratio) => Math.min(SHEET_MAX, Math.max(SHEET_MIN, ratio));
  function sheetRatioAt(clientY) {
    const box = workspaceRef.current.getBoundingClientRect();
    return clampRatio((box.bottom - clientY) / box.height);
  }
  function onSheetPointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    sheetDragRef.current = { frame: 0, y: event.clientY, startY: event.clientY, moved: false };
    if (!panelOpen) setPanelOpen(true);
  }
  function onSheetPointerMove(event) {
    const drag = sheetDragRef.current;
    if (!drag) return;
    drag.y = event.clientY;
    // A tap (no real movement) only opens the sheet at its previous height.
    if (!drag.moved && Math.abs(drag.y - drag.startY) < 4) return;
    drag.moved = true;
    if (drag.frame) return;
    drag.frame = requestAnimationFrame(() => {
      drag.frame = 0;
      setSheetRatio(sheetRatioAt(drag.y));
    });
  }
  function onSheetPointerUp(event) {
    const drag = sheetDragRef.current;
    if (!drag) return;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    sheetDragRef.current = null;
    if (drag.moved) setSheetRatio(sheetRatioAt(event.clientY));
  }
  function onSheetKey(event) {
    const steps = { ArrowUp: 0.08, ArrowDown: -0.08, PageUp: 0.2, PageDown: -0.2 };
    if (event.key in steps) {
      event.preventDefault();
      if (!panelOpen) setPanelOpen(true);
      setSheetRatio((ratio) => clampRatio(ratio + steps[event.key]));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (!panelOpen) setPanelOpen(true);
      setSheetRatio(event.key === "Home" ? SHEET_MIN : SHEET_MAX);
    }
  }

  let readoutHint = text.readoutEmpty;
  if (startStatus === "invalid" || endStatus === "invalid") readoutHint = text.coordinateInvalid;
  else if (start && !end) readoutHint = text.readoutWaitingEnd;
  else if (end && !start) readoutHint = text.readoutWaitingStart;

  const exactRows = measurement
    ? [
        [text.kilometres, measurement.kilometres, "km"],
        [text.metres, measurement.metres, "m"],
        [text.nauticalMiles, measurement.nauticalMiles, "NM"],
      ]
    : [];

  return (
    <Box
      ref={workspaceRef}
      style={{ "--sheet-ratio": sheetRatio }}
      sx={{
        flex: 1,
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: panelOpen ? "clamp(320px, 22vw + 56px, 380px) minmax(0, 1fr)" : "minmax(0, 1fr)",
        bgcolor: COLORS.paper,
        ...(expanded && {
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 1300,
        }),
        [PHONE]: { display: "flex", flexDirection: "column" },
      }}
    >
      <Box
        component="aside"
        id="measure-panel"
        aria-labelledby="tool-title"
        sx={{
          position: "relative",
          zIndex: 2,
          display: panelOpen ? "flex" : "none",
          flexDirection: "column",
          minWidth: 0,
          minHeight: 0,
          bgcolor: COLORS.sheet,
          borderRight: `1px solid ${COLORS.rule}`,
          [PHONE]: {
            order: 1,
            display: "flex",
            flex: "none",
            height: panelOpen ? "clamp(104px, calc(var(--sheet-ratio) * 100%), calc(100% - 150px))" : "auto",
            mt: "-14px",
            borderRight: 0,
            borderTop: `1px solid ${COLORS.rule2}`,
            borderRadius: "18px 18px 0 0",
            boxShadow: "0 -6px 24px rgba(22, 25, 28, 0.12)",
          },
        }}
      >
        <Box
          role="separator"
          aria-orientation="horizontal"
          aria-label={text.resizePanel}
          aria-valuemin={Math.round(SHEET_MIN * 100)}
          aria-valuemax={Math.round(SHEET_MAX * 100)}
          aria-valuenow={Math.round((panelOpen ? sheetRatio : SHEET_MIN) * 100)}
          tabIndex={0}
          onPointerDown={onSheetPointerDown}
          onPointerMove={onSheetPointerMove}
          onPointerUp={onSheetPointerUp}
          onPointerCancel={onSheetPointerUp}
          onKeyDown={onSheetKey}
          sx={{
            display: "none",
            [PHONE]: {
              display: "grid",
              placeItems: "center",
              flex: "none",
              height: 20,
              cursor: "ns-resize",
              touchAction: "none",
              userSelect: "none",
              "&:focus-visible": { outlineOffset: "-4px" },
            },
          }}
        >
          <Box component="span" sx={{ width: 42, height: 5, borderRadius: 5, bgcolor: COLORS.rule2 }} />
        </Box>

        <Box
          component="header"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            flex: "none",
            p: "12px 10px 10px 18px",
            borderBottom: `1px solid ${COLORS.rule}`,
            [PHONE]: { p: "0 8px 8px 16px" },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography id="tool-title" variant="h1" sx={{ fontSize: 16, letterSpacing: "-0.01em" }}>
              {text.distanceTitle}
            </Typography>
            <Typography sx={{ color: COLORS.muted, fontSize: 12, mt: 0.25, [PHONE]: { display: "none" } }}>
              {text.distanceSubtitle}
            </Typography>
          </Box>
          {distanceLabel && (
            <Box
              component="span"
              aria-hidden="true"
              sx={{ display: "none", fontFamily: MONO_FONT, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", [PHONE]: { display: "block" } }}
            >
              {distanceLabel}
            </Box>
          )}
          <Box
            component="button"
            type="button"
            onClick={() => setPanelOpen(!panelOpen)}
            aria-expanded={panelOpen}
            aria-controls="measure-panel-body"
            aria-label={panelOpen ? text.hidePanel : text.showPanel}
            title={panelOpen ? text.hidePanel : text.showPanel}
            sx={{
              display: "grid",
              placeItems: "center",
              flex: "none",
              width: 36,
              height: 36,
              border: 0,
              borderRadius: "9px",
              bgcolor: "transparent",
              color: COLORS.ink2,
              cursor: "pointer",
              "&:hover": { bgcolor: COLORS.paper2 },
            }}
          >
            <Icon name="panel" size={18} />
          </Box>
        </Box>

        <Box
          id="measure-panel-body"
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            scrollbarGutter: "stable",
            display: "flex",
            flexDirection: "column",
            gap: 1.75,
            p: "14px 14px 24px 16px",
            [PHONE]: { display: panelOpen ? "flex" : "none", p: "12px 12px 20px" },
          }}
        >
          <Box
            component="section"
            aria-labelledby="distance-readout-label"
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1.25,
              p: "14px 14px 13px",
              borderRadius: "14px",
              bgcolor: COLORS.ink,
              backgroundImage:
                "linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px)",
              backgroundSize: "14px 14px",
              backgroundPosition: "-1px -1px",
              color: COLORS.paper,
            }}
          >
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
              <Box
                component="h2"
                id="distance-readout-label"
                sx={{ ...sectionLabel, color: "#b9bcbd", whiteSpace: "nowrap" }}
              >
                {text.mapDistance}
              </Box>
              <Box
                role="group"
                aria-label={text.readoutUnit}
                sx={{ display: "flex", gap: "2px", p: "2px", borderRadius: "9px", bgcolor: "rgba(255, 255, 255, 0.09)" }}
              >
                {READOUT_UNITS.map((item) => (
                  <Box
                    key={item.id}
                    component="button"
                    type="button"
                    aria-pressed={unit === item.id}
                    onClick={() => setUnit(item.id)}
                    sx={{
                      minWidth: 32,
                      height: 24,
                      px: "7px",
                      border: 0,
                      borderRadius: "7px",
                      bgcolor: unit === item.id ? COLORS.paper : "transparent",
                      color: unit === item.id ? COLORS.ink : "#b9bcbd",
                      fontFamily: MONO_FONT,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      "&:focus-visible": { outlineColor: "#9fb4ff" },
                    }}
                  >
                    {item.symbol}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box
              component="p"
              aria-hidden={measurement ? undefined : "true"}
              sx={{ m: 0, display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 8px", fontFamily: MONO_FONT }}
            >
              <Box
                component="span"
                sx={{
                  fontSize: "clamp(28px, 2.3vw + 6px, 36px)",
                  fontWeight: 500,
                  lineHeight: 1.05,
                  letterSpacing: "-0.035em",
                  overflowWrap: "anywhere",
                  color: measurement ? "inherit" : "#6f7477",
                }}
              >
                {readoutValue ?? "—"}
              </Box>
              <Box component="small" sx={{ color: "#b9bcbd", fontSize: 15 }}>
                {unitInfo.symbol}
              </Box>
            </Box>
            {measurement ? (
              <>
                <Box aria-hidden="true" sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <LetterBadge target="start" size={20} />
                  <Box sx={{ flex: 1, height: 3, borderRadius: 3, background: `linear-gradient(90deg, ${COLORS.a}, ${COLORS.b})` }} />
                  <LetterBadge target="end" size={20} />
                </Box>
                <Box component="dl" sx={{ m: 0 }}>
                  <Box component="dt" sx={{ color: "#a5a9ab", fontSize: 11.5 }}>
                    {text.bearings}
                  </Box>
                  <Box component="dd" sx={{ m: 0, fontFamily: MONO_FONT, fontSize: 13.5 }}>
                    {measurement.path.azimuthDefined
                      ? `${displayAngle(measurement.path.initialBearingDegrees, language)} → ${displayAngle(measurement.path.finalBearingDegrees, language)}`
                      : "—"}
                  </Box>
                </Box>
              </>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
                <Box component="p" sx={{ m: 0, color: "#cfd2d3", fontSize: 13.5 }}>
                  {readoutHint}
                </Box>
                {!activeTarget && (
                  <Button
                    variant="contained"
                    onClick={onStartPicking}
                    startIcon={<Icon name="crosshair" size={18} />}
                    sx={{
                      bgcolor: COLORS.paper,
                      color: COLORS.ink,
                      "&:hover": { bgcolor: "#ffffff" },
                      "&:focus-visible": { outlineColor: "#9fb4ff" },
                    }}
                  >
                    {text.mapPickPoints}
                  </Button>
                )}
              </Box>
            )}
          </Box>
          <Typography role="status" aria-live="polite" sx={visuallyHidden}>
            {announced}
          </Typography>

          {result && !result.ok && <ErrorMessage summary={text.distanceInvalid} code={result.code} />}
          {measurement?.path.ambiguous && (
            <Box role="note" sx={{ display: "flex", gap: 1, fontSize: 13, color: COLORS.warn, alignItems: "flex-start" }}>
              <Icon name="alert" size={16} />
              {text.ambiguousPath}
            </Box>
          )}
          {polarPoints && (
            <Box role="note" sx={{ display: "flex", gap: 1, fontSize: 13, color: COLORS.ink2, alignItems: "flex-start" }}>
              <Icon name="alert" size={16} />
              {fill(text.mapPolarNote, { points: polarPoints })}
            </Box>
          )}

          <Box
            component="form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              dispatch({ type: "fit" });
            }}
            sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}
          >
            <PointCard target="start" values={values} activeTarget={activeTarget} onEdit={onEdit} onArm={onArm} />
            <PointCard target="end" values={values} activeTarget={activeTarget} onEdit={onEdit} onArm={onArm} />
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
              <Button type="submit" variant="outlined" size="small" startIcon={<Icon name="focus" size={17} />} sx={{ mr: "auto" }}>
                {text.mapFit}
              </Button>
              <Button size="small" onClick={() => dispatch({ type: "swap" })} startIcon={<Icon name="swap" size={16} />}>
                {text.swapPoints}
              </Button>
              <Button size="small" onClick={() => dispatch({ type: "clear" })} startIcon={<Icon name="clear" size={16} />}>
                {text.clearPoints}
              </Button>
            </Box>
          </Box>

          {measurement && (
            <Box component="section" aria-labelledby="distance-exact-title" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box component="h2" id="distance-exact-title" sx={sectionLabel}>
                {text.exact}
              </Box>
              <Box component="dl" sx={{ m: 0, border: `1px solid ${COLORS.rule}`, borderRadius: "12px", overflow: "hidden" }}>
                {exactRows.map(([label, value, symbol]) => (
                  <Box
                    key={symbol}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gridTemplateAreas: '"label copy" "value copy"',
                      alignItems: "center",
                      columnGap: 1,
                      p: "6px 4px 6px 11px",
                      "& + &": { borderTop: `1px solid ${COLORS.rule}` },
                    }}
                  >
                    <Box component="dt" sx={{ gridArea: "label", color: COLORS.muted, fontSize: 11.5 }}>
                      {label}
                    </Box>
                    <Box component="dd" sx={{ gridArea: "value", m: 0, minWidth: 0, fontFamily: MONO_FONT, fontSize: 13.5, overflowWrap: "anywhere" }}>
                      <code>{value}</code>{" "}
                      <Box component="span" sx={{ color: COLORS.faint, fontSize: 12 }}>
                        {symbol}
                      </Box>
                    </Box>
                    <Box component="dd" sx={{ gridArea: "copy", m: 0 }}>
                      <CopyButton value={value} label={label} />
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {measurement && (
            <Box
              component="details"
              sx={{
                border: `1px solid ${COLORS.rule}`,
                borderRadius: "12px",
                fontSize: 12.5,
                "& > summary": { p: "10px 12px", cursor: "pointer", fontSize: 13.5, fontWeight: 650 },
              }}
            >
              <summary>{text.calculationDetails}</summary>
              <Box
                component="dl"
                sx={{ m: 0, p: "0 12px 8px", display: "grid", gridTemplateColumns: "112px minmax(0, 1fr)", gap: "6px 8px" }}
              >
                {[
                  [text.mapModel, `WGS 84 · ${text.shortestGeodesic}`],
                  [text.solver, measurement.path.solver],
                  [text.iterations, measurement.path.iterations],
                  [text.mapSegments, measurement.path.segmentCount],
                  [text.sphericalComparison, text.googleSphereDifference],
                ].map(([label, value]) => (
                  <Box key={label} sx={{ display: "contents" }}>
                    <Box component="dt" sx={{ color: COLORS.muted }}>
                      {label}
                    </Box>
                    <Box component="dd" sx={{ m: 0, overflowWrap: "anywhere" }}>
                      {value}
                    </Box>
                  </Box>
                ))}
              </Box>
              <Box component="p" sx={{ m: 0, p: "0 12px 12px", color: COLORS.muted }}>
                {text.mapVisualOnly} {text.mapProjection}
              </Box>
            </Box>
          )}

          <Box component="section" aria-labelledby="distance-examples-title" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Box component="h2" id="distance-examples-title" sx={sectionLabel}>
              {text.examples}
            </Box>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {settings.examples.map((example) => (
                <Button
                  key={example.id}
                  size="small"
                  variant="outlined"
                  onClick={() => dispatch({ type: "example", values: pickPoints(example) })}
                  sx={{ borderRadius: 999, minHeight: 30, px: 1.5 }}
                >
                  {exampleLabels[example.id]}
                </Button>
              ))}
            </Box>
          </Box>

          <Box sx={{ color: COLORS.muted, fontSize: 12, display: "flex", flexDirection: "column", gap: 0.75 }}>
            <Box component="p" sx={{ m: 0 }}>
              {text.distanceModel}
            </Box>
            <Box component="p" sx={{ m: 0 }}>
              {text.mapPickRounding} {text.mapBasemapSource}
            </Box>
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: "flex", minWidth: 0, minHeight: 0, "& > .map-stage": { flex: 1 }, [PHONE]: { order: 0, flex: "1 1 auto", minHeight: 150 } }}>
        <MeasurementMap
          styleUrl={mapSettings.style}
          start={start}
          end={end}
          points={measurement?.path.points ?? null}
          distanceLabel={distanceLabel}
          activeTarget={activeTarget}
          fitRequest={fitRequest}
          panelOpen={panelOpen}
          expanded={expanded}
          onPick={onPick}
          onMove={onMove}
          onStartPicking={onStartPicking}
          onArm={onArm}
          onCancel={onCancel}
          onShowPanel={() => setPanelOpen(true)}
          onToggleExpanded={toggleExpanded}
        />
      </Box>
    </Box>
  );
}
