import { useCallback, useMemo } from "react";
import { coordinateResults } from "@convert-tools/core";
import CallSnippet from "../../components/CallSnippet.jsx";
import Chips from "../../components/Chips.jsx";
import ErrorMessage from "../../components/ErrorMessage.jsx";
import Icon from "../../components/Icon.jsx";
import Notice from "../../components/Notice.jsx";
import PasteHint from "../../components/PasteHint.jsx";
import Segmented from "../../components/Segmented.jsx";
import { fill, useConfig, useLanguage } from "../../context.js";
import { attempt } from "../../lib/attempt.js";
import { fixedPair, plainNumber } from "../../lib/number-text.js";
import { readNumberText, readPointText } from "../../lib/point-text.js";
import { useHandoffReceiver } from "../../shell/handoff.js";
import InputWidget from "../../shell/InputWidget.jsx";
import ResultHud from "../../shell/ResultHud.jsx";
import { useRememberedReducer } from "../../shell/tool-memory.js";
import { useMapScene } from "../../shell/workspace-context.js";
import { COLORS, TYPE } from "../../theme.js";
import { Box, Button } from "../../ui/index.js";
import DirectMode, { DirectDetails } from "./DirectMode.jsx";
import InverseMode, { InverseDetails } from "./InverseMode.jsx";
import {
  LENGTH_UNITS,
  MEASURE_MODES,
  callSnippet,
  checkModel,
  displayAngle,
  displayDistance,
  lengthsOf,
  measureScene,
  modelOptions,
  routeTone,
  runDirect,
  runInverse,
  runRoute,
  sphericalComparison,
} from "./measure.js";
import { createMeasureState, measureReducer, modePoints, pickTarget } from "./measure-state.js";
import ModelSection, { modelName } from "./ModelSection.jsx";
import RouteMode, { RouteDetails } from "./RouteMode.jsx";

const LETTERS = ["A", "B"];

const asPoint = ({ latitude, longitude }) => ({ latitude, longitude });

/**
 * What the open mode can measure from its fields: the points the core gets
 * and the reason when it cannot measure yet.
 * @returns {{ points: object[], rowsUsed: number[], status: "ready" | "empty" | "incomplete" | "invalid" }}
 */
function readInputs(mode, readings, azimuth, distance) {
  const invalid = readings.some((reading) => reading.status === "invalid");
  const incomplete = readings.some((reading) => reading.status === "incomplete");
  if (mode === "route") {
    // Empty rows (a row just added) are skipped; the route joins the others in order.
    const rowsUsed = readings.flatMap((reading, index) => (reading.status === "valid" ? [index] : []));
    const points = rowsUsed.map((index) => asPoint(readings[index]));
    let status = "ready";
    if (invalid) status = "invalid";
    else if (incomplete) status = "incomplete";
    else if (points.length < 2) status = "empty";
    return { points, rowsUsed, status };
  }
  const points = readings.filter((reading) => reading.status === "valid").map(asPoint);
  const rowsUsed = readings.map((_, index) => index);
  if (invalid || (mode === "direct" && (azimuth.status === "invalid" || distance.status === "invalid"))) {
    return { points, rowsUsed, status: "invalid" };
  }
  if (incomplete) return { points, rowsUsed, status: "incomplete" };
  if (points.length < readings.length || (mode === "direct" && (azimuth.status !== "valid" || distance.status !== "valid"))) {
    return { points, rowsUsed, status: "empty" };
  }
  return { points, rowsUsed, status: "ready" };
}

/**
 * The measure tool (#measure, spec 8.1): three modes on one map. "İki
 * nokta" measures A to B (inverseGeodesic), "Azimut + mesafe" computes the
 * point an azimuth and a distance lead to (directGeodesic), "Rota" measures
 * a line through numbered points (measureGeodesicPolyline). The points are
 * one field each; the model (WGS 84, GRS 80, a sphere or a custom
 * ellipsoid) is chosen in the details. A point handed over by another tool
 * (useHandoffReceiver) fills A or B, also while the tool is hidden.
 */
export default function MeasureTool() {
  const { language, text, examples: exampleLabels } = useLanguage();
  const { measure: settings } = useConfig();
  // Kept while another tool is open; a map pick in progress is not.
  const [state, dispatch] = useRememberedReducer(
    "measure",
    measureReducer,
    { example: settings.examples[0], routeMaxPoints: settings.route.maxPoints },
    createMeasureState,
    (saved) => ({ ...saved, armed: null, paused: false, adding: false, lastPaste: null }),
  );
  const { mode, lastPaste } = state;

  // ---- Inputs and the model ---------------------------------------------
  // The point fields change only with these; the rest of the state does not touch them.
  const rows = useMemo(() => modePoints(state), [state.mode, state.a, state.middle, state.b]);
  const readings = useMemo(() => rows.map(readPointText), [rows]);
  const azimuth = readNumberText(state.azimuth);
  const distance = readNumberText(state.distance);
  const model = settings.models.find((entry) => entry.id === state.model) ?? settings.models[0];
  const options = useMemo(() => modelOptions(model, state.custom), [model, state.custom]);
  const modelCheck = useMemo(() => checkModel(options), [options]);
  const isSphere = options.ellipsoid?.f === 0;
  const unit = LENGTH_UNITS.find((item) => item.id === state.unit) ?? LENGTH_UNITS[0];
  const distanceUnit = LENGTH_UNITS.find((item) => item.id === state.distanceUnit) ?? LENGTH_UNITS[0];
  const target = pickTarget(state);

  // ---- The calculation: live, and only from complete inputs --------------
  const inputs = readInputs(mode, readings, azimuth, distance);
  const ready = inputs.status === "ready";
  const { points } = inputs;
  const azimuthValue = azimuth.value;
  const distanceValue = distance.value;
  const run = useMemo(() => {
    if (!ready) return null;
    if (mode === "direct") {
      return runDirect({ start: points[0], azimuth: azimuthValue, distance: distanceValue, unit: state.distanceUnit }, options, settings.path);
    }
    return mode === "route" ? runRoute(points, options, settings.path) : runInverse(points, options, settings.path);
    // points is rebuilt on every render; readings is its stable source.
  }, [ready, mode, readings, azimuthValue, distanceValue, state.distanceUnit, options, settings.path]);
  const value = run?.ok ? run.value : null;

  // The distance measured in the open mode, in metres (none in direct).
  let metres = null;
  if (value && mode === "inverse") metres = value.inverse.distanceMetres;
  if (value && mode === "route") metres = value.polyline.distanceMetres;
  const comparison = useMemo(
    () => (metres != null && state.model === "wgs84" ? sphericalComparison(points, settings.comparisonSphereRadiusMetres, metres) : null),
    [metres, readings, state.model, settings.comparisonSphereRadiusMetres],
  );

  const endMgrs = useMemo(() => {
    if (!value?.direct) return null;
    const result = attempt(() => coordinateResults({ latitude: value.direct.latitude, longitude: value.direct.longitude }, 5).mgrs);
    return result.ok ? result.value : null;
  }, [value]);

  // A point handed over by another tool ("Ölçümde A yap") fills its slot.
  const receive = useCallback((point) => dispatch({ type: "receive", slot: point.slot, coordinate: point }), []);
  useHandoffReceiver("measure", receive);

  // ---- The scene on the map ----------------------------------------------
  const pickingLabel = useMemo(() => {
    if (target == null) return null;
    if (mode === "route") {
      if (target.append) return { label: text.mapPickingAdd, tone: "b" };
      return { label: fill(text.mapPickingPoint, { point: target.index + 1 }), tone: routeTone(target.index, rows.length) };
    }
    return target.index === 0 ? { label: text.mapPickingStart, tone: "a" } : { label: text.mapPickingEnd, tone: "b" };
    // pickTarget returns a new object on every render; its fields are what counts.
  }, [target?.index, target?.append, mode, rows.length, text]);

  const scene = useMemo(() => {
    const titles = { start: text.mapStart, end: text.mapEnd, computed: text.computedPoint, route: (point) => fill(text.routePoint, { point }) };
    const { pins, lines } = measureScene({ mode, readings, value, unit, distanceUnit, language, titles });
    return { pins, lines, picking: pickingLabel, fitRequest: state.fitRequest };
  }, [readings, mode, value, unit, distanceUnit, language, pickingLabel, state.fitRequest, text]);
  useMapScene(scene, {
    onPick: (coordinate) => dispatch({ type: "pick", coordinate }),
    onPinMove: (id, coordinate) => {
      const index = Number(id.replace("pin-", ""));
      if (id.startsWith("pin-") && Number.isInteger(index)) dispatch({ type: "move", index, coordinate });
    },
    onCancelPick: () => dispatch({ type: "cancel" }),
  });

  // ---- The input widget --------------------------------------------------
  const modeLabels = { inverse: text.modeInverse, direct: text.modeDirect, route: text.modeRoute };

  let pasteNotice = "";
  if (lastPaste) {
    if (mode === "route" && lastPaste.count > 1) {
      pasteNotice = fill(text.pastedCount, { count: lastPaste.count });
    } else if (mode === "route") {
      pasteNotice = fill(text.pastedRoutePoint, { point: lastPaste.index + 1, value: rows[lastPaste.index] });
    } else if (lastPaste.count === 2) {
      pasteNotice = text.pastedPoints;
    } else {
      pasteNotice = fill(text.pastedPoint, { point: LETTERS[lastPaste.index], value: rows[lastPaste.index] });
    }
    if (lastPaste.truncated && mode === "route") {
      pasteNotice = `${pasteNotice} ${fill(text.pastedTruncated, { dropped: lastPaste.dropped, max: state.routeMaxPoints })}`;
    }
    if (lastPaste.swapped) pasteNotice = `${pasteNotice} ${text.pastedSwapped}`;
  }
  const pasteHint = { inverse: text.pasteHintPoints, direct: text.pasteHint, route: text.pasteHintRoute }[mode];

  let actions;
  if (mode === "direct") {
    actions = (
      <Button size="small" onClick={() => dispatch({ type: "clear" })} startIcon={<Icon name="clear" size={16} />}>
        {text.clearInputs}
      </Button>
    );
  } else {
    actions = (
      <>
        <Button size="small" onClick={() => dispatch({ type: "reverse" })} startIcon={<Icon name="swap" size={16} />}>
          {mode === "route" ? text.reverseRoute : text.swapPoints}
        </Button>
        <Button size="small" onClick={() => dispatch({ type: "clear" })} startIcon={<Icon name="clear" size={16} />}>
          {text.clearPoints}
        </Button>
      </>
    );
  }

  // ---- The result widget -------------------------------------------------
  const modelLabel = modelName(text, state.model);
  const unitSwitch = (
    <Segmented
      label={text.readoutUnit}
      tone="ink"
      size="sm"
      value={state.unit}
      onChange={(id) => dispatch({ type: "unit", unit: id })}
      options={LENGTH_UNITS.map((item) => ({ value: item.id, label: item.symbol }))}
    />
  );
  const azimuthCell = (label, degrees, defined = true) =>
    defined ? { label, value: displayAngle(degrees, language), copyValue: plainNumber(degrees) } : { label, value: "—" };

  let hud;
  if (mode === "direct") {
    const direct = value?.direct;
    hud = {
      label: `${text.directLabel} · ${modelLabel}`,
      value: direct ? fixedPair(direct.latitude, direct.longitude, 6) : null,
      copyValue: direct ? `${plainNumber(direct.latitude)}, ${plainNumber(direct.longitude)}` : undefined,
      copyLabel: text.directLabel,
      valueSize: "md",
      cells: direct ? [azimuthCell(text.finalAzimuth, direct.finalBearingDegrees), { label: "MGRS", value: endMgrs ?? "—", copyValue: endMgrs ?? undefined }] : [],
    };
  } else if (mode === "route") {
    const polyline = value?.polyline;
    hud = {
      label: `${text.routeLabel} · ${modelLabel}`,
      value: polyline ? displayDistance(polyline.distanceMetres, unit.id, unit.decimals, language) : null,
      unit: unit.symbol,
      copyValue: polyline ? lengthsOf(polyline.distanceMetres)[unit.id] : undefined,
      copyLabel: text.routeLabel,
      aside: unitSwitch,
      cells: polyline
        ? [
            { label: text.routeSegments, value: String(polyline.segmentCount) },
            { label: text.routePoints, value: String(points.length) },
          ]
        : [],
    };
  } else {
    const inverse = value?.inverse;
    hud = {
      label: `${isSphere ? text.distanceSphere : text.distanceEllipsoidal} · ${modelLabel}`,
      value: inverse ? displayDistance(inverse.distanceMetres, unit.id, unit.decimals, language) : null,
      unit: unit.symbol,
      copyValue: value ? value.lengths[unit.id] : undefined,
      copyLabel: text.distance,
      aside: unitSwitch,
      cells: inverse
        ? [
            azimuthCell(text.initialAzimuth, inverse.initialBearingDegrees, inverse.azimuthDefined),
            azimuthCell(text.finalAzimuth, inverse.finalBearingDegrees, inverse.azimuthDefined),
          ]
        : [],
    };
  }

  // What the empty result widget says: what is wrong, else what to do next.
  let hint;
  if (!modelCheck.ok) hint = text.modelFix;
  else if (run && !run.ok) hint = text.resultFailed;
  else if (inputs.status === "invalid") {
    hint = readings.some((reading) => reading.status === "invalid") ? text.coordinateInvalid : text.invalid;
  } else if (inputs.status === "incomplete") hint = text.pointIncomplete;
  else if (mode === "direct") hint = text.directEmpty;
  else if (mode === "route") hint = text.routeEmpty;
  else if (readings[0].status === "valid") hint = text.readoutWaitingEnd;
  else if (readings[1].status === "valid") hint = text.readoutWaitingStart;
  else hint = text.readoutEmpty;
  const canStartPicking = target == null && rows.some((row) => row.trim() === "");

  const ambiguous =
    (mode === "inverse" && value?.inverse.ambiguous) || (mode === "route" && value?.polyline.segments.some((segment) => segment.ambiguous));
  const runSummary = { inverse: text.distanceInvalid, direct: text.directInvalid, route: text.distanceInvalid }[mode];
  const notices = [
    !modelCheck.ok && <ErrorMessage key="model" summary={text.modelInvalid} code={modelCheck.code} />,
    modelCheck.ok && run && !run.ok && <ErrorMessage key="error" summary={runSummary} code={run.code} />,
    ambiguous && (
      <Notice key="ambiguous" tone="warn">
        {mode === "route" ? text.ambiguousRoute : text.ambiguousPath}
      </Notice>
    ),
  ].filter(Boolean);

  let snippet = null;
  if (value && mode === "direct") {
    snippet = callSnippet("direct", { points, azimuth: azimuthValue, distanceMetres: value.distanceMetres }, options);
  } else if (value) {
    snippet = callSnippet(mode, { points }, options);
  }
  const details = (
    <>
      {value && mode === "inverse" && <InverseDetails value={value} />}
      {value && mode === "direct" && <DirectDetails value={value} />}
      {value && mode === "route" && (
        <RouteDetails
          segments={value.polyline.segments}
          labels={value.polyline.segments.map((_, index) => `${inputs.rowsUsed[index] + 1} → ${inputs.rowsUsed[index + 1] + 1}`)}
          unit={unit}
        />
      )}
      <ModelSection
        models={settings.models}
        model={state.model}
        custom={state.custom}
        onModel={(id) => dispatch({ type: "model", model: id })}
        onCustom={(field, input) => dispatch({ type: "custom", field, value: input })}
        comparison={comparison}
        unit={unit}
      />
      {snippet && (
        <Box sx={{ py: 1.5 }}>
          <CallSnippet code={snippet} />
        </Box>
      )}
    </>
  );

  return (
    <>
      <InputWidget title={text.distanceTitle} icon="measure" actions={actions}>
        <Segmented
          label={text.modeLabel}
          value={mode}
          onChange={(next) => dispatch({ type: "mode", mode: next, result: value })}
          options={MEASURE_MODES.map((id) => ({ value: id, label: modeLabels[id] }))}
        />
        <Box
          component="form"
          noValidate
          onSubmit={(event) => event.preventDefault()}
          // Enter in a field shows the points on the map.
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.target.tagName !== "INPUT") return;
            event.preventDefault();
            dispatch({ type: "fit" });
          }}
          sx={{ display: "flex", flexDirection: "column", gap: 1 }}
        >
          {mode === "inverse" && <InverseMode rows={rows} target={target} dispatch={dispatch} />}
          {mode === "direct" && <DirectMode state={state} target={target} dispatch={dispatch} />}
          {mode === "route" && (
            <RouteMode rows={rows} target={target} adding={state.adding} maxPoints={state.routeMaxPoints} dispatch={dispatch} />
          )}
          {/* After a paste of points it says what was pasted, and announces it. */}
          <PasteHint hint={pasteHint} notice={pasteNotice} sx={{ fontSize: TYPE.meta }} />
        </Box>
        <Chips
          label={text.examples}
          items={settings.examples
            .filter((example) => example.mode === mode)
            .map((example) => ({
              key: example.id,
              label: exampleLabels[example.id],
              onClick: () => dispatch({ type: "example", example }),
            }))}
        />
      </InputWidget>
      <ResultHud
        {...hud}
        empty={
          <>
            <span>{hint}</span>
            {canStartPicking && (
              <Button
                variant="contained"
                size="small"
                onClick={() => dispatch({ type: "startPicking" })}
                startIcon={<Icon name="crosshair" size={16} />}
                sx={{
                  bgcolor: COLORS.onInk,
                  color: COLORS.ink,
                  "&:hover": { bgcolor: COLORS.sheet },
                  "&:focus-visible": { outlineColor: COLORS.focusOnInk },
                }}
              >
                {text.mapPickPoints}
              </Button>
            )}
          </>
        }
        notices={notices}
        details={details}
      />
    </>
  );
}
