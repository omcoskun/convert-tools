import { useCallback, useMemo, useState } from "react";
import CallSnippet from "../../components/CallSnippet.jsx";
import Chips from "../../components/Chips.jsx";
import DataList, { DataRow } from "../../components/DataList.jsx";
import Disclosure from "../../components/Disclosure.jsx";
import ErrorMessage from "../../components/ErrorMessage.jsx";
import Field from "../../components/Field.jsx";
import Icon from "../../components/Icon.jsx";
import Notice from "../../components/Notice.jsx";
import PasteHint from "../../components/PasteHint.jsx";
import { fill, useConfig, useLanguage } from "../../context.js";
import { parseCoordinatePaste, parseNumberPair, pastedText } from "../../lib/coordinate-paste.js";
import { degreesText } from "../../lib/number-text.js";
import { useHandoff, useHandoffReceiver } from "../../shell/handoff.js";
import InputWidget from "../../shell/InputWidget.jsx";
import ResultHud from "../../shell/ResultHud.jsx";
import { useRememberedState } from "../../shell/tool-memory.js";
import { useMapScene } from "../../shell/workspace-context.js";
import { COLORS, TYPE } from "../../theme.js";
import { Box, Button, MenuItem, visuallyHidden } from "../../ui/index.js";
import {
  CRS_KINDS,
  SUPPORTED_CRS,
  UTM_ZONES,
  axesOf,
  codeOf,
  crsSnippet,
  geographicOf,
  kindOf,
  pickRequest,
  resultPair,
  runTransform,
  withSource,
  zoneOf,
} from "./crs.js";

/** The select state of an EPSG code: { kind, zone, custom }. */
function systemOf(code) {
  const { kind, zone } = kindOf(code);
  return { kind, zone: zone ?? 36, custom: kind === "custom" ? code : "" };
}

const codeOfSystem = (system) => codeOf(system.kind, system.zone, system.custom);

function stateOf(request) {
  return { source: systemOf(request.source), target: systemOf(request.target), x: request.x, y: request.y };
}

/**
 * A system select: the kind, the zone for UTM, the code for "Özel kod".
 * @param {{ id: string, label: string, system: { kind: string, zone: number, custom: string }, onChange: (system: object) => void, suggestZone: () => number | null }} props
 *   suggestZone gives the zone of the current position, for a switch to UTM.
 */
// The zone and custom-code fields appear for both systems: their accessible
// names carry the system's label, so "Zon" is "Zon (Kaynak CRS)" to a screen
// reader while the narrow column shows only "Zon".
function withSystem(name, system) {
  return (
    <>
      {name}
      <Box component="span" sx={visuallyHidden}>{` (${system})`}</Box>
    </>
  );
}

function SystemSelect({ id, label, system, onChange, suggestZone }) {
  const { text } = useLanguage();
  const kindLabels = {
    geographic: text.crsKindGeographic,
    webMercator: text.crsKindWebMercator,
    utmNorth: text.crsKindUtmNorth,
    utmSouth: text.crsKindUtmSouth,
    upsNorth: text.crsKindUpsNorth,
    upsSouth: text.crsKindUpsSouth,
    custom: text.crsKindCustom,
  };
  const utm = system.kind === "utmNorth" || system.kind === "utmSouth";
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: utm || system.kind === "custom" ? "minmax(0, 1fr) 112px" : "minmax(0, 1fr)", gap: 1 }}>
      <Field
        id={id}
        select
        label={label}
        value={system.kind}
        onChange={(kind) => {
          const toUtm = (kind === "utmNorth" || kind === "utmSouth") && !utm;
          onChange({ ...system, kind, zone: toUtm ? (suggestZone() ?? system.zone) : system.zone });
        }}
      >
        {CRS_KINDS.map((kind) => (
          <MenuItem key={kind.id} value={kind.id}>
            {kindLabels[kind.id]}
          </MenuItem>
        ))}
      </Field>
      {utm && (
        <Field id={`${id}-zone`} select label={withSystem(text.zone, label)} value={system.zone} onChange={(zone) => onChange({ ...system, zone: Number(zone) })}>
          {UTM_ZONES.map((zone) => (
            <MenuItem key={zone} value={zone}>
              {zone}
            </MenuItem>
          ))}
        </Field>
      )}
      {system.kind === "custom" && (
        <Field
          id={`${id}-code`}
          label={withSystem(text.customCode, label)}
          value={system.custom}
          onChange={(custom) => onChange({ ...system, custom })}
          placeholder="EPSG:32636"
        />
      )}
    </Box>
  );
}

/**
 * The CRS tool (#crs, spec 8.3): X/Y from a source system to a target
 * system (transformCrs) on the workspace map. The ink pin stands at the
 * input's WGS 84 position; a map click or a drag of the pin writes X and Y
 * in the source system, and a position outside its domain leaves them as
 * they are with a notice. The result can be opened in the position tool; a
 * point handed here (useHandoffReceiver) arrives as EPSG:4326 X/Y.
 */
export default function CrsTool() {
  const { text, errors, examples: exampleLabels } = useLanguage();
  const { crs: settings } = useConfig();
  const { send } = useHandoff();
  // The systems and X/Y are kept while another tool is open.
  const [state, setState] = useRememberedState("crs", () => stateOf(settings.initial));
  // The ConvertToolsError code of the last map position the source system could not take.
  const [failure, setFailure] = useState(null);
  const [picking, setPicking] = useState(true);
  const [fitRequest, setFitRequest] = useState(0);
  const [pasteNotice, setPasteNotice] = useState("");

  const request = { source: codeOfSystem(state.source), target: codeOfSystem(state.target), x: state.x, y: state.y };
  const axes = axesOf(request.source);
  // An empty custom code is not yet an error: the result waits for it.
  const codesTyped = [state.source, state.target].every((system) => system.kind !== "custom" || system.custom.trim() !== "");
  const filled = codesTyped && state.x.trim() !== "" && state.y.trim() !== "";
  const result = useMemo(
    () => (filled ? runTransform(request) : null),
    [filled, request.source, request.target, request.x, request.y],
  );
  const value = result?.ok ? result.value : null;
  const position = useMemo(
    () => (filled ? geographicOf(request.source, request.x, request.y) : null),
    [filled, request.source, request.x, request.y],
  );

  function update(change) {
    setState((current) => ({ ...current, ...change }));
    setFailure(null);
    setPasteNotice("");
  }

  // A new source system (kind or zone) keeps the position: X and Y are
  // written again in it. Typing a custom code changes nothing until done.
  function changeSource(source) {
    const moved = source.kind !== state.source.kind || source.zone !== state.source.zone;
    if (!moved || source.kind === "custom") {
      update({ source });
      return;
    }
    const next = withSource(request, codeOfSystem(source));
    update({ source, x: next.request.x, y: next.request.y });
    if (next.failure?.startsWith("OUTSIDE_")) setFailure(next.failure);
  }

  // ---- The scene on the map ----------------------------------------------
  const place = (coordinate) => {
    const placed = pickRequest(request, coordinate);
    if (placed.failure) {
      // Only a point outside the source system's domain gets the "outside"
      // notice; a source code the core cannot use (an empty or unknown custom
      // code) is already shown by the error message under the result.
      setFailure(placed.failure.startsWith("OUTSIDE_") ? placed.failure : null);
      return;
    }
    update({ x: placed.request.x, y: placed.request.y });
  };
  const pickingLabel = useMemo(
    () => (picking ? { label: fill(text.mapPickCrs, { code: request.source || "?" }), tone: "ink" } : null),
    [picking, request.source, text],
  );
  const scene = useMemo(() => {
    const pins = position
      ? [{ id: "crs-point", label: "", tone: "ink", draggable: true, latitude: position.latitude, longitude: position.longitude, title: text.crsPin }]
      : [];
    return { pins, lines: [], picking: pickingLabel, fitRequest };
  }, [position, pickingLabel, fitRequest, text]);
  useMapScene(scene, {
    onPick: place,
    onPinMove: (_, coordinate) => place(coordinate),
    onCancelPick: () => setPicking(false),
  });

  // A point from another tool ("CRS'e aktar") arrives as EPSG:4326 X/Y.
  const receive = useCallback((point) => {
    setState((current) => ({ ...current, source: systemOf("EPSG:4326"), x: point.longitude, y: point.latitude }));
    setFailure(null);
    setPasteNotice("");
    setFitRequest((count) => count + 1);
  }, []);
  useHandoffReceiver("crs", receive);

  // ---- The input widget --------------------------------------------------
  // A pasted pair fills X and Y. For EPSG:4326 it is read as "latitude,
  // longitude" (web-map order), so Y = latitude, X = longitude; otherwise
  // as "X, Y" in order.
  function handlePaste(event) {
    const clipboard = pastedText(event);
    let change = null;
    let notice = "";
    if (axes === "geographic") {
      const parsed = parseCoordinatePaste(clipboard);
      if (parsed == null || parsed.points.length !== 1) return;
      const [{ latitude, longitude }] = parsed.points;
      change = { x: longitude, y: latitude };
      notice = fill(text.pastedCoordinate, { latitude, longitude });
      if (parsed.swapped) notice = `${notice} ${text.pastedSwapped}`;
    } else {
      const pair = parseNumberPair(clipboard);
      if (pair == null) return;
      change = { x: pair.first, y: pair.second };
      notice = fill(text.pastedXY, { x: pair.first, y: pair.second });
    }
    event.preventDefault();
    update(change);
    setPasteNotice(notice);
    setFitRequest((count) => count + 1);
  }

  function swap() {
    if (!value) return;
    update({ source: state.target, target: state.source, x: value.formattedX, y: value.formattedY });
  }

  function applyExample(example) {
    setState(stateOf(example));
    setFailure(null);
    setPasteNotice("");
    setFitRequest((count) => count + 1);
  }

  const suggestZone = () => (position ? zoneOf(position) : null);
  let xLabel = "X";
  let yLabel = "Y";
  if (axes === "geographic") {
    xLabel = `X · ${text.longitude}`;
    yLabel = `Y · ${text.latitude}`;
  } else if (axes === "projected") {
    xLabel = `X · ${text.easting} (m)`;
    yLabel = `Y · ${text.northing} (m)`;
  }

  const actions = (
    <>
      <Button size="small" onClick={swap} disabled={!value} startIcon={<Icon name="swap" size={16} />}>
        {text.swapCrs}
      </Button>
      <Button
        size="small"
        aria-pressed={picking}
        onClick={() => setPicking(!picking)}
        startIcon={<Icon name="crosshair" size={16} />}
        sx={picking ? { bgcolor: COLORS.paper2 } : undefined}
      >
        {picking ? text.pickingPoint : text.pickPoint}
      </Button>
    </>
  );

  // ---- The result widget -------------------------------------------------
  const handoff = position
    ? axes === "geographic"
      ? { latitude: state.y.trim(), longitude: state.x.trim() }
      : { latitude: degreesText(position.latitude), longitude: degreesText(position.longitude) }
    : null;
  const hud = value
    ? {
        value: resultPair(value),
        copyValue: `${value.formattedX}, ${value.formattedY}`,
        cells: [
          { label: text.sourceCrs, value: value.source },
          { label: text.targetCrs, value: value.target },
        ],
        actions: handoff ? [{ key: "positions", label: text.handoffPositions, icon: "positions", onClick: () => send("positions", handoff) }] : [],
      }
    : { value: null };

  let hint = text.crsEmpty;
  if (result && !result.ok) hint = text.crsInvalid;

  const notices = [
    failure && (
      <Notice key="outside" tone="warn">
        {fill(text.crsPickOutside, { code: request.source })} {errors[failure]} <code>({failure})</code>
      </Notice>
    ),
    result && !result.ok && <ErrorMessage key="error" summary={text.crsInvalid} code={result.code} />,
  ].filter(Boolean);

  const kindNames = [
    text.crsKindGeographic,
    text.crsKindWebMercator,
    text.crsKindUtmNorth,
    text.crsKindUtmSouth,
    text.crsKindUpsNorth,
    text.crsKindUpsSouth,
  ];
  const details = (
    <>
      {value && (
        <Disclosure title={text.crsFullResult}>
          <DataList>
            <DataRow label={`X · ${value.target}`} value={value.formattedX} copyValue={value.formattedX} />
            <DataRow label={`Y · ${value.target}`} value={value.formattedY} copyValue={value.formattedY} />
          </DataList>
        </Disclosure>
      )}
      <Disclosure title={text.axisOrder}>
        <Box component="p" sx={{ m: 0, py: 1, color: COLORS.ink2, fontSize: TYPE.small, lineHeight: 1.5 }}>
          {text.axisNote}
        </Box>
      </Disclosure>
      <Disclosure title={text.supportedSystems}>
        <DataList>
          {SUPPORTED_CRS.map((code, index) => (
            <DataRow key={code} label={kindNames[index] ?? code} value={code} />
          ))}
        </DataList>
      </Disclosure>
      {value && (
        <Box sx={{ py: 1.5 }}>
          <CallSnippet code={crsSnippet(request)} />
        </Box>
      )}
    </>
  );

  return (
    <>
      <InputWidget title={text.crsTitle} icon="crs" actions={actions}>
        <Box
          component="form"
          noValidate
          onSubmit={(event) => event.preventDefault()}
          // Enter in a field shows the position on the map.
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.target.tagName !== "INPUT") return;
            event.preventDefault();
            setFitRequest((count) => count + 1);
          }}
          sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
        >
          <SystemSelect
            id="crs-source"
            label={text.sourceCrs}
            system={state.source}
            onChange={changeSource}
            suggestZone={suggestZone}
          />
          <SystemSelect
            id="crs-target"
            label={text.targetCrs}
            system={state.target}
            onChange={(target) => update({ target })}
            suggestZone={suggestZone}
          />
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 1 }}>
            <Field
              id="crs-x"
              label={xLabel}
              value={state.x}
              onChange={(x) => update({ x })}
              onPaste={handlePaste}
              placeholder="32.859742"
            />
            <Field
              id="crs-y"
              label={yLabel}
              value={state.y}
              onChange={(y) => update({ y })}
              onPaste={handlePaste}
              placeholder="39.933365"
            />
          </Box>
          <PasteHint hint={axes === "geographic" ? text.pasteHint : text.pasteHintXY} notice={pasteNotice} sx={{ fontSize: TYPE.meta }} />
        </Box>
        <Chips
          label={text.examples}
          items={settings.examples.map((example) => ({
            key: example.id,
            label: exampleLabels[example.id],
            onClick: () => applyExample(example),
          }))}
        />
      </InputWidget>
      <ResultHud
        label={text.crsResult}
        valueSize="md"
        {...hud}
        empty={<span>{hint}</span>}
        notices={notices}
        details={details}
      />
    </>
  );
}
