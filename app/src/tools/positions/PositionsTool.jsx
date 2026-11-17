import { useCallback, useMemo, useState } from "react";
import CallSnippet from "../../components/CallSnippet.jsx";
import Chips from "../../components/Chips.jsx";
import DataList, { DataRow } from "../../components/DataList.jsx";
import Disclosure from "../../components/Disclosure.jsx";
import ErrorMessage from "../../components/ErrorMessage.jsx";
import Field from "../../components/Field.jsx";
import Icon from "../../components/Icon.jsx";
import PasteHint from "../../components/PasteHint.jsx";
import { fill, useConfig, useLanguage } from "../../context.js";
import { attempt } from "../../lib/attempt.js";
import { formatPairForCopy } from "../../lib/coordinate-paste.js";
import { fixedPair } from "../../lib/number-text.js";
import { useHandoff, useHandoffReceiver } from "../../shell/handoff.js";
import InputWidget from "../../shell/InputWidget.jsx";
import ResultHud from "../../shell/ResultHud.jsx";
import { useRememberedState } from "../../shell/tool-memory.js";
import { useMapScene } from "../../shell/workspace-context.js";
import { COLORS, TYPE } from "../../theme.js";
import { Box, Button, MenuItem } from "../../ui/index.js";
import CoordinateInputFields from "./CoordinateInputFields.jsx";
import {
  ANGLE_DIGITS,
  DEFAULT_OUTPUT_OPTIONS,
  GEOREF_PRECISIONS,
  INPUT_FORMATS,
  OUTPUT_FORMATS,
  formatOutputs,
  handoffPoint,
  positionSnippet,
  readPosition,
  resolutionLabel,
  sourceNote,
  valuesFrom,
  withPointText,
} from "./positions.js";

// A grid reference reads better with single spaces in a narrow cell.
const singleSpaced = (value) => value.replace(/\s{2,}/g, " ");

/**
 * The position tool (#positions, spec 8.2): one position in seven formats
 * on the workspace map. The input is one format's fields (DD is one point
 * field); a map click or a drag of the ink pin sets the position as DD. The
 * result widget shows DD with MGRS and UTM/UPS; the details list every
 * format with its resolution, the output options and the library call. The
 * position can be handed to the measure tool (A or B) and to the CRS tool;
 * a point handed here (useHandoffReceiver) opens as DD.
 */
export default function PositionsTool() {
  const { text, examples: exampleLabels } = useLanguage();
  const { position: settings } = useConfig();
  const { send } = useHandoff();
  // The input and the output options are kept while another tool is open.
  const [format, setFormat] = useRememberedState("positions.format", settings.initial.format);
  const [values, setValues] = useRememberedState("positions.values", () => withPointText(settings.initial.values));
  const [options, setOptions] = useRememberedState("positions.options", () => ({ ...DEFAULT_OUTPUT_OPTIONS, mgrsPrecision: settings.initial.precision }));
  // The next map click places the position, until Esc; the pick button turns it back on.
  const [picking, setPicking] = useState(true);
  const [fitRequest, setFitRequest] = useState(0);
  const [pasteNotice, setPasteNotice] = useState("");

  const reading = useMemo(() => readPosition(format, values, options), [format, values, options.mgrsCorner]);
  const outputs = useMemo(
    () => (reading.status === "valid" ? attempt(() => formatOutputs(reading.source, options)) : null),
    [reading, options],
  );
  const value = outputs?.ok ? outputs.value : null;

  function setValue(key, input) {
    setValues((current) => ({ ...current, [key]: input }));
    setPasteNotice("");
  }

  // A position from the map, a drag or another tool: DD with the given digits.
  const placeAsDd = useCallback((coordinate, fit) => {
    setFormat("dd");
    setValues((current) => ({ ...current, dd: formatPairForCopy(coordinate.latitude, coordinate.longitude) }));
    setPasteNotice("");
    if (fit) setFitRequest((count) => count + 1);
  }, []);

  const receive = useCallback((point) => placeAsDd(point, true), [placeAsDd]);
  useHandoffReceiver("positions", receive);

  // ---- The scene on the map ----------------------------------------------
  const pickingLabel = useMemo(() => (picking ? { label: text.mapPickPosition, tone: "ink" } : null), [picking, text]);
  const scene = useMemo(() => {
    const pins = value
      ? [{ id: "position", label: "", tone: "ink", draggable: true, latitude: value.latitude, longitude: value.longitude, title: text.positionPin }]
      : [];
    return { pins, lines: [], picking: pickingLabel, fitRequest };
  }, [value?.latitude, value?.longitude, pickingLabel, fitRequest, text]);
  useMapScene(scene, {
    onPick: (coordinate) => placeAsDd(coordinate, false),
    onPinMove: (_, coordinate) => placeAsDd(coordinate, false),
    onCancelPick: () => setPicking(false),
  });

  // ---- The input widget --------------------------------------------------
  function applyExample(example) {
    setFormat(example.format);
    setValues((current) => withPointText({ ...current, ...example.values, ...(example.values.ddLat != null && { dd: undefined }) }));
    setPasteNotice("");
    setFitRequest((count) => count + 1);
  }

  function pastePoints(points, { swapped }) {
    const [point] = points;
    setValue("dd", formatPairForCopy(point.latitude, point.longitude));
    const notice = fill(text.pastedCoordinate, point);
    setPasteNotice(swapped ? `${notice} ${text.pastedSwapped}` : notice);
  }

  const actions = (
    <Button
      size="small"
      aria-pressed={picking}
      onClick={() => setPicking(!picking)}
      startIcon={<Icon name="crosshair" size={16} />}
      sx={picking ? { bgcolor: COLORS.paper2 } : undefined}
    >
      {picking ? text.pickingPoint : text.pickPoint}
    </Button>
  );

  // ---- The result widget -------------------------------------------------
  const handoff = value ? handoffPoint(format, values, value) : null;
  const hud = value
    ? {
        value: fixedPair(value.latitude, value.longitude, 6),
        copyValue: `${handoff.latitude}, ${handoff.longitude}`,
        cells: [
          { label: "MGRS", value: value.mgrs, copyValue: value.mgrs },
          { label: "UTM / UPS", value: singleSpaced(value.utmUps), copyValue: singleSpaced(value.utmUps) },
        ],
        actions: [
          { key: "a", label: text.handoffMeasureA, icon: "measure", onClick: () => send("measure", { ...handoff, slot: "start" }) },
          { key: "b", label: text.handoffMeasureB, icon: "measure", onClick: () => send("measure", { ...handoff, slot: "end" }) },
          { key: "crs", label: text.handoffCrs, icon: "crs", onClick: () => send("crs", handoff) },
        ],
      }
    : { value: null };

  let hint = text.positionEmpty;
  if (reading.status === "incomplete") hint = text.pointIncomplete;
  else if (reading.status === "invalid" || reading.status === "error" || (outputs && !outputs.ok)) hint = text.coordinateInvalid;

  const notices = [
    reading.status === "error" && <ErrorMessage key="read" summary={text.coordinateInvalid} code={reading.code} />,
    outputs && !outputs.ok && <ErrorMessage key="outputs" summary={text.coordinateInvalid} code={outputs.code} />,
  ].filter(Boolean);

  const setOption = (key, input) => setOptions((current) => ({ ...current, [key]: input }));
  const digitItems = (list) =>
    list.map((digits) => (
      <MenuItem key={digits} value={digits}>
        {digits}
      </MenuItem>
    ));

  const details = (
    <>
      {value && (
        <Disclosure title={text.outputFormats}>
          <Box component="p" sx={{ m: 0, pt: 0.5, color: COLORS.muted, fontSize: TYPE.meta, lineHeight: 1.5 }}>
            {sourceNote(reading.source, text)}
          </Box>
          <DataList>
            {OUTPUT_FORMATS.map(({ key, label }) => (
              <DataRow
                key={key}
                label={label}
                value={value[key]}
                copyValue={value[key]}
                note={
                  <>
                    {resolutionLabel(key, value.resolution[key], text)}
                    {key === "gars" && (
                      <Box component="span" sx={{ display: "block", color: COLORS.warn }}>
                        {text.areaSource}
                      </Box>
                    )}
                  </>
                }
              />
            ))}
          </DataList>
        </Disclosure>
      )}
      <Disclosure title={text.outputOptions}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 1.5, py: 1 }}>
          <Field
            id="mgrs-precision"
            select
            label={text.precision}
            value={options.mgrsPrecision}
            onChange={(input) => setOption("mgrsPrecision", Number(input))}
          >
            {settings.precisions.map((item) => (
              <MenuItem key={item.digits} value={item.digits}>
                {`${item.digits} · ${item.label}`}
              </MenuItem>
            ))}
          </Field>
          <Field
            id="georef-precision"
            select
            label={text.georefPrecision}
            value={options.georefPrecision}
            onChange={(input) => setOption("georefPrecision", Number(input))}
          >
            {digitItems(GEOREF_PRECISIONS)}
          </Field>
          <Field id="dms-digits" select label={text.dmsDigits} value={options.dmsDigits} onChange={(input) => setOption("dmsDigits", Number(input))}>
            {digitItems(ANGLE_DIGITS)}
          </Field>
          <Field id="ddm-digits" select label={text.ddmDigits} value={options.ddmDigits} onChange={(input) => setOption("ddmDigits", Number(input))}>
            {digitItems(ANGLE_DIGITS)}
          </Field>
          {format === "mgrs" && (
            <Field
              id="mgrs-point"
              select
              label={text.mgrsPoint}
              value={options.mgrsCorner ? "corner" : "centre"}
              onChange={(input) => setOption("mgrsCorner", input === "corner")}
            >
              <MenuItem value="centre">{text.mgrsCentre}</MenuItem>
              <MenuItem value="corner">{text.mgrsCorner}</MenuItem>
            </Field>
          )}
        </Box>
      </Disclosure>
      {value && (
        <Box sx={{ py: 1.5 }}>
          <CallSnippet code={positionSnippet(format, values, options)} />
        </Box>
      )}
    </>
  );

  return (
    <>
      <InputWidget title={text.positionTitle} icon="positions" actions={actions}>
        <Field
          id="coordinate-format"
          select
          label={text.inputFormat}
          value={format}
          onChange={(next) => {
            // The position stays; its fields are written in the new format.
            if (value) setValues((current) => valuesFrom(next, value, current, handoff));
            setFormat(next);
            setPasteNotice("");
          }}
        >
          {INPUT_FORMATS.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.label}
            </MenuItem>
          ))}
        </Field>
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
          sx={{ display: "flex", flexDirection: "column", gap: 1 }}
        >
          <CoordinateInputFields format={format} values={values} setValue={setValue} onPoints={pastePoints} />
          {format === "dd" && <PasteHint hint={text.pasteHint} notice={pasteNotice} sx={{ fontSize: TYPE.meta }} />}
          <Box component="p" sx={{ m: 0, color: COLORS.muted, fontSize: TYPE.meta }}>
            {text.wgs84}
          </Box>
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
        label={`${text.positionLabel} · DD`}
        copyLabel={text.positionLabel}
        valueSize="md"
        {...hud}
        empty={<span>{hint}</span>}
        notices={notices}
        details={details}
      />
    </>
  );
}
