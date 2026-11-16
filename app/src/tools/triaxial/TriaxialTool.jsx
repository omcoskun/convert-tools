import { useEffect, useMemo, useState } from "react";
import CallSnippet from "../../components/CallSnippet.jsx";
import Chips from "../../components/Chips.jsx";
import DataList, { DataRow } from "../../components/DataList.jsx";
import ErrorMessage from "../../components/ErrorMessage.jsx";
import Field from "../../components/Field.jsx";
import Notice from "../../components/Notice.jsx";
import Readout from "../../components/Readout.jsx";
import Segmented from "../../components/Segmented.jsx";
import { useConfig, useLanguage } from "../../context.js";
import { fixedDecimal } from "../../lib/locale-decimal.js";
import { fixedPair, plainNumber } from "../../lib/number-text.js";
import PageLayout from "../../shell/PageLayout.jsx";
import { COLORS, MOTION, PHONE, TYPE } from "../../theme.js";
import { Box, MenuItem, Paper } from "../../ui/index.js";
import EllipsoidFigure from "./EllipsoidFigure.jsx";
import {
  TRIAXIAL_MODES,
  axesOf,
  runFromCartesian,
  runToCartesian,
  runTriaxialDirect,
  runTriaxialInverse,
  triaxialSnippet,
} from "./triaxial.js";

// Results follow the inputs after a short pause in typing, so a slow
// inverse never blocks a keystroke.
const SETTLE_MS = 150;
const LENGTH_DECIMALS = 6;
const ANGLE_DECIMALS = 8;
const SCALE_DECIMALS = 9;

const axesTextOf = (preset) => ({ a: String(preset.a), b: String(preset.b), c: String(preset.c) });

/** The state an example opens: its preset, its mode and its fields. */
function exampleState(example, presets) {
  const preset = presets.find((item) => item.id === example.preset) ?? presets[0];
  const pick = (keys) => Object.fromEntries(keys.map((key) => [key, example[key] ?? ""]));
  const state = { presetId: preset.id, axes: axesTextOf(preset), mode: example.mode };
  if (example.mode === "inverse") state.inverse = pick(["beta1", "omega1", "beta2", "omega2"]);
  if (example.mode === "direct") state.direct = pick(["beta1", "omega1", "azimuth", "distance"]);
  if (example.mode === "cartesian") {
    state.toCartesian = pick(["beta", "omega"]);
    const cartesian = runToCartesian(state.toCartesian, axesOf(preset));
    if (cartesian.ok) {
      const { x, y, z } = cartesian.value;
      state.fromCartesian = { x: plainNumber(x), y: plainNumber(y), z: plainNumber(z) };
    }
  }
  return state;
}

function initialState(settings) {
  const { presets, examples } = settings;
  const base = {
    presetId: presets[0].id,
    axes: axesTextOf(presets[0]),
    mode: "inverse",
    inverse: { beta1: "", omega1: "", beta2: "", omega2: "" },
    direct: { beta1: "", omega1: "", azimuth: "", distance: "" },
    toCartesian: { beta: "", omega: "" },
    fromCartesian: { x: "", y: "", z: "" },
  };
  // Every mode opens on its first example; the page opens on the first one.
  for (const example of [...examples].reverse()) {
    const state = exampleState(example, presets);
    Object.assign(base, state);
  }
  return base;
}

/** The results of one settled set of inputs. */
function compute({ presetId, axes: axesText, mode, inverse, direct, toCartesian, fromCartesian }, presets) {
  const axes = axesOf(presets.find((item) => item.id === presetId) ?? null, axesText);
  const check = runToCartesian({ beta: "0", omega: "0" }, axes);
  if (mode === "inverse") return { axes, check, inverse: runTriaxialInverse(inverse, axes) };
  if (mode === "direct") return { axes, check, direct: runTriaxialDirect(direct, axes) };
  return { axes, check, toCartesian: runToCartesian(toCartesian, axes), fromCartesian: runFromCartesian(fromCartesian, axes) };
}

const filled = (form) => Object.values(form).every((value) => String(value).trim() !== "");

function FieldGrid({ children }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 1.5, [PHONE]: { gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" } }}>
      {children}
    </Box>
  );
}

function SectionTitle({ children }) {
  return (
    <Box component="h2" sx={{ m: 0, color: COLORS.ink, fontSize: TYPE.title, fontWeight: 650, lineHeight: 1.35 }}>
      {children}
    </Box>
  );
}

/** Üç eksenli (spec 8.5): the ellipsoid, then Ters, Doğrudan or Kartezyen. */
export default function TriaxialTool() {
  const { text, language, examples: exampleLabels } = useLanguage();
  const { triaxial: settings } = useConfig();
  const { presets } = settings;
  const [state, setState] = useState(() => initialState(settings));
  const key = JSON.stringify(state);
  const [settledKey, setSettledKey] = useState(key);
  useEffect(() => {
    if (key === settledKey) return undefined;
    const timer = setTimeout(() => setSettledKey(key), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [key, settledKey]);
  const settled = useMemo(() => JSON.parse(settledKey), [settledKey]);
  const results = useMemo(() => compute(settled, presets), [settled, presets]);
  const pending = key !== settledKey;
  // A choice (mode, preset, example) applies at once; only typing waits.
  const commit = (next) => {
    setState(next);
    setSettledKey(JSON.stringify(next));
  };
  // Pressing a copy button during the pause settles first, so it never copies the previous result.
  const settleNow = () => {
    if (pending) setSettledKey(key);
  };

  const presetLabels = {
    earth: text.presetEarth,
    cayley: text.presetCayley,
    mild: text.presetMild,
    oblate: text.presetOblate,
    prolate: text.presetProlate,
    custom: text.modelCustom,
  };
  const modeLabels = { inverse: text.triaxialInverse, direct: text.triaxialDirect, cartesian: text.triaxialCartesian };

  const setForm = (form, field) => (value) =>
    setState((current) => ({ ...current, [form]: { ...current[form], [field]: value } }));
  const setAxis = (axis) => (value) =>
    setState((current) => ({ ...current, presetId: "custom", axes: { ...current.axes, [axis]: value } }));
  const choosePreset = (id) => {
    const preset = presets.find((item) => item.id === id);
    commit({ ...state, presetId: id, axes: preset ? axesTextOf(preset) : state.axes });
  };

  const length = (value) => fixedDecimal(value, LENGTH_DECIMALS, language);
  const angle = (value) => (value == null ? "—" : `${fixedDecimal(value, ANGLE_DECIMALS, language)}°`);
  const scale = (value) => fixedDecimal(value, SCALE_DECIMALS, language);
  const axesFailed = !results.check.ok;
  const settledMode = settled.mode;

  // The readout of the settled mode, its rows and its call.
  function failure(result, form) {
    if (axesFailed) return text.triaxialFixAxes;
    if (!filled(form)) return text.triaxialEmpty;
    return <ErrorMessage summary={text.resultFailed} code={result.code} />;
  }

  function geodesicRows(result, withInitial) {
    return (
      <DataList>
        {withInitial && (
          <DataRow label={text.initialAzimuth} symbol="α₁" value={angle(result.initialAzimuthDegrees)} copyValue={result.initialAzimuthDegrees == null ? undefined : plainNumber(result.initialAzimuthDegrees)} />
        )}
        <DataRow label={text.finalAzimuth} symbol="α₂" value={angle(result.finalAzimuthDegrees)} copyValue={result.finalAzimuthDegrees == null ? undefined : plainNumber(result.finalAzimuthDegrees)} />
        <DataRow label={text.reducedLength} symbol="m₁₂" value={length(result.reducedLength)} copyValue={plainNumber(result.reducedLength)} />
        <DataRow label={text.geodesicScale12} symbol="M₁₂" value={scale(result.geodesicScale12)} copyValue={plainNumber(result.geodesicScale12)} />
        <DataRow label={text.geodesicScale21} symbol="M₂₁" value={scale(result.geodesicScale21)} copyValue={plainNumber(result.geodesicScale21)} />
      </DataList>
    );
  }

  let output;
  if (settledMode === "inverse") {
    const { inverse } = results;
    output = (
      <>
        <Readout
          label={text.triaxialDistance}
          symbol="s₁₂"
          value={inverse.ok ? length(inverse.value.distance) : null}
          unit={text.triaxialAxisUnit}
          copyValue={inverse.ok ? plainNumber(inverse.value.distance) : undefined}
          empty={inverse.ok ? null : failure(inverse, settled.inverse)}
        />
        {inverse.ok && geodesicRows(inverse.value, true)}
        {inverse.ok && <CallSnippet code={triaxialSnippet("inverse", settled.inverse, results.axes)} />}
      </>
    );
  } else if (settledMode === "direct") {
    const { direct } = results;
    output = (
      <>
        <Readout
          label={text.triaxialEndPoint}
          value={direct.ok ? fixedPair(direct.value.beta, direct.value.omega, ANGLE_DECIMALS) : null}
          unit="°"
          copyValue={direct.ok ? `${plainNumber(direct.value.beta)}, ${plainNumber(direct.value.omega)}` : undefined}
          empty={direct.ok ? null : failure(direct, settled.direct)}
        />
        {direct.ok && geodesicRows(direct.value, false)}
        {direct.ok && <CallSnippet code={triaxialSnippet("direct", settled.direct, results.axes)} />}
      </>
    );
  } else {
    const { toCartesian } = results;
    output = (
      <>
        <Readout
          label="X, Y, Z"
          value={toCartesian.ok ? `${toCartesian.value.x.toFixed(LENGTH_DECIMALS)}, ${toCartesian.value.y.toFixed(LENGTH_DECIMALS)}, ${toCartesian.value.z.toFixed(LENGTH_DECIMALS)}` : null}
          copyValue={toCartesian.ok ? ["x", "y", "z"].map((axis) => plainNumber(toCartesian.value[axis])).join(", ") : undefined}
          empty={toCartesian.ok ? null : failure(toCartesian, settled.toCartesian)}
        />
        {toCartesian.ok && <CallSnippet code={triaxialSnippet("toCartesian", settled.toCartesian, results.axes)} />}
      </>
    );
  }

  const { mode } = state;
  return (
    <PageLayout title={text.triaxialTitle} subtitle={text.triaxialSubtitle}>
      <Paper component="section" aria-labelledby="triaxial-ellipsoid" sx={{ p: 3, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 3, alignItems: "start", [PHONE]: { p: 2, gridTemplateColumns: "minmax(0, 1fr)", gap: 2 } }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, minWidth: 0 }}>
          <Box id="triaxial-ellipsoid">
            <SectionTitle>{text.triaxialEllipsoid}</SectionTitle>
          </Box>
          <Field id="triaxial-preset" select label={text.triaxialPreset} value={state.presetId} onChange={choosePreset}>
            {[...presets.map((preset) => preset.id), "custom"].map((id) => (
              <MenuItem key={id} value={id}>
                {presetLabels[id] ?? id}
              </MenuItem>
            ))}
          </Field>
          <FieldGrid>
            <Field id="triaxial-a" label={text.axisA} value={state.axes.a} inputMode="decimal" error={axesFailed} onChange={setAxis("a")} />
            <Field id="triaxial-b" label={text.axisB} value={state.axes.b} inputMode="decimal" error={axesFailed} onChange={setAxis("b")} />
            <Field id="triaxial-c" label={text.axisC} value={state.axes.c} inputMode="decimal" error={axesFailed} onChange={setAxis("c")} />
          </FieldGrid>
          {axesFailed ? (
            <ErrorMessage summary={text.triaxialAxesInvalid} code={results.check.code} />
          ) : (
            <Box component="p" sx={{ m: 0, color: COLORS.muted, fontSize: TYPE.meta, lineHeight: 1.5 }}>
              {text.triaxialAxesRule}
            </Box>
          )}
        </Box>
        <Box sx={{ justifySelf: "center", width: 200, maxWidth: "100%" }}>
          <EllipsoidFigure label={text.triaxialFigure} />
        </Box>
      </Paper>

      <Paper component="section" aria-labelledby="triaxial-calculation" sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2, [PHONE]: { p: 2 } }}>
        <Box id="triaxial-calculation">
          <SectionTitle>{text.triaxialMode}</SectionTitle>
        </Box>
        <Segmented
          label={text.triaxialMode}
          options={TRIAXIAL_MODES.map((value) => ({ value, label: modeLabels[value] }))}
          value={mode}
          onChange={(next) => commit({ ...state, mode: next })}
        />
        {mode === "inverse" && (
          <FieldGrid>
            <Field id="triaxial-beta1" label={text.triaxialBeta1} value={state.inverse.beta1} onChange={setForm("inverse", "beta1")} />
            <Field id="triaxial-omega1" label={text.triaxialOmega1} value={state.inverse.omega1} onChange={setForm("inverse", "omega1")} />
            <Field id="triaxial-beta2" label={text.triaxialBeta2} value={state.inverse.beta2} onChange={setForm("inverse", "beta2")} />
            <Field id="triaxial-omega2" label={text.triaxialOmega2} value={state.inverse.omega2} onChange={setForm("inverse", "omega2")} />
          </FieldGrid>
        )}
        {mode === "direct" && (
          <FieldGrid>
            <Field id="triaxial-direct-beta1" label={text.triaxialBeta1} value={state.direct.beta1} onChange={setForm("direct", "beta1")} />
            <Field id="triaxial-direct-omega1" label={text.triaxialOmega1} value={state.direct.omega1} onChange={setForm("direct", "omega1")} />
            <Field id="triaxial-azimuth" label={text.triaxialAzimuth} value={state.direct.azimuth} onChange={setForm("direct", "azimuth")} />
            <Field id="triaxial-distance" label={text.triaxialDistanceInput} value={state.direct.distance} inputMode="decimal" onChange={setForm("direct", "distance")} />
          </FieldGrid>
        )}
        {mode === "cartesian" && (
          <>
            <Box component="h3" sx={{ m: 0, color: COLORS.ink2, fontSize: TYPE.small, fontWeight: 650 }}>
              {text.triaxialToCartesian}
            </Box>
            <FieldGrid>
              <Field id="triaxial-beta" label={text.triaxialBeta} value={state.toCartesian.beta} onChange={setForm("toCartesian", "beta")} />
              <Field id="triaxial-omega" label={text.triaxialOmega} value={state.toCartesian.omega} onChange={setForm("toCartesian", "omega")} />
            </FieldGrid>
          </>
        )}

        <Box component="p" sx={{ m: 0, color: COLORS.muted, fontSize: TYPE.meta, lineHeight: 1.5 }}>
          {text.triaxialNote}
        </Box>
        <Chips
          label={text.examples}
          items={settings.examples.map((example) => ({
            key: example.id,
            label: exampleLabels[example.id] ?? example.id,
            onClick: () => commit({ ...state, ...exampleState(example, presets) }),
          }))}
        />
        <Box aria-busy={pending || undefined} onPointerDownCapture={settleNow} onKeyDownCapture={settleNow} sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, opacity: pending ? 0.55 : 1, transition: `opacity ${MOTION.fast} ${MOTION.ease}`, "@media (prefers-reduced-motion: reduce)": { transition: "none" } }}>
          {output}
        </Box>

        {mode === "cartesian" && settledMode === "cartesian" && (
          <>
            <Box component="h3" sx={{ m: 0, mt: 1, color: COLORS.ink2, fontSize: TYPE.small, fontWeight: 650 }}>
              {text.triaxialFromCartesian}
            </Box>
            <FieldGrid>
              <Field id="triaxial-x" label="X" value={state.fromCartesian.x} inputMode="text" onChange={setForm("fromCartesian", "x")} />
              <Field id="triaxial-y" label="Y" value={state.fromCartesian.y} inputMode="text" onChange={setForm("fromCartesian", "y")} />
              <Field id="triaxial-z" label="Z" value={state.fromCartesian.z} inputMode="text" onChange={setForm("fromCartesian", "z")} />
            </FieldGrid>
            <Box aria-busy={pending || undefined} onPointerDownCapture={settleNow} onKeyDownCapture={settleNow} sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, opacity: pending ? 0.55 : 1 }}>
              {results.fromCartesian.ok ? (
                <>
                  <DataList>
                    <DataRow label={text.triaxialBeta} symbol="β" value={angle(results.fromCartesian.value.beta)} copyValue={plainNumber(results.fromCartesian.value.beta)} />
                    <DataRow label={text.triaxialOmega} symbol="ω" value={angle(results.fromCartesian.value.omega)} copyValue={plainNumber(results.fromCartesian.value.omega)} />
                  </DataList>
                  <Box component="p" sx={{ m: 0, color: COLORS.muted, fontSize: TYPE.meta, lineHeight: 1.5 }}>
                    {text.triaxialOffSurface}
                  </Box>
                  <CallSnippet code={triaxialSnippet("fromCartesian", settled.fromCartesian, results.axes)} />
                </>
              ) : axesFailed ? (
                <Notice>{text.triaxialFixAxes}</Notice>
              ) : filled(settled.fromCartesian) ? (
                <ErrorMessage summary={text.resultFailed} code={results.fromCartesian.code} />
              ) : (
                <Notice>{text.triaxialEmpty}</Notice>
              )}
            </Box>
          </>
        )}

      </Paper>
    </PageLayout>
  );
}
