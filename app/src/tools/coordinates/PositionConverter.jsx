import { useMemo, useState } from "react";
import { coordinateResults } from "@convert-tools/core";
import ErrorMessage from "../../components/ErrorMessage.jsx";
import ExampleButtons from "../../components/ExampleButtons.jsx";
import Field from "../../components/Field.jsx";
import ResultCard from "../../components/ResultCard.jsx";
import ToolPage from "../../components/ToolPage.jsx";
import { useConfig, useLanguage } from "../../context.js";
import { attempt } from "../../lib/attempt.js";
import { Box, Button, MenuItem, Paper, Stack, Typography } from "../../ui/index.js";
import CoordinateInputFields from "./CoordinateInputFields.jsx";
import { INPUT_FORMATS, OUTPUT_FORMATS, readPoint, resolutionLabel, sourceNote } from "./positions.js";

export default function PositionConverter() {
  const { text, examples: exampleLabels } = useLanguage();
  const { position: settings } = useConfig();
  const [format, setFormat] = useState(settings.initial.format);
  const [precision, setPrecision] = useState(settings.initial.precision);
  const [values, setValues] = useState(settings.initial.values);
  // The parsed input; null while the form differs from the last conversion.
  const [read, setRead] = useState(() => attempt(() => readPoint(settings.initial.format, settings.initial.values)));
  const [stale, setStale] = useState(false);

  const result = useMemo(
    () => (read.ok ? attempt(() => coordinateResults(read.value, precision)) : read),
    [read, precision],
  );

  function markStale() {
    setStale(true);
  }

  function setValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    markStale();
  }

  function convert(nextFormat, nextValues) {
    setRead(attempt(() => readPoint(nextFormat, nextValues)));
    setStale(false);
  }

  function handleSubmit(event) {
    event.preventDefault();
    convert(format, values);
  }

  function applyExample(example) {
    const nextValues = { ...values, ...example.values };
    setFormat(example.format);
    setValues(nextValues);
    convert(example.format, nextValues);
  }

  return (
    <ToolPage title={text.positionTitle} subtitle={text.positionSubtitle} footer={text.coordinateFooter}>
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
          <Field
            id="coordinate-format"
            select
            label={text.inputFormat}
            value={format}
            onChange={(next) => {
              setFormat(next);
              markStale();
            }}
          >
            {INPUT_FORMATS.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.label}
              </MenuItem>
            ))}
          </Field>
          <Field
            id="mgrs-precision"
            select
            label={text.precision}
            value={precision}
            onChange={(next) => setPrecision(Number(next))}
          >
            {settings.precisions.map((item) => (
              <MenuItem key={item.digits} value={item.digits}>
                {item.label}
              </MenuItem>
            ))}
          </Field>
        </Stack>

        <CoordinateInputFields format={format} values={values} setValue={setValue} />

        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }}>
          <Button type="submit" variant="contained">
            {text.convert}
          </Button>
          <Typography variant="body2" color="text.secondary">
            {text.wgs84}
          </Typography>
        </Stack>
      </Box>

      {!stale && !result.ok && <ErrorMessage summary={text.coordinateInvalid} code={result.code} />}

      {!stale && result.ok && (
        <Box component="section" aria-labelledby="coordinate-output-title" sx={{ mt: 3 }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
            <Typography id="coordinate-output-title" variant="h2">
              {text.outputFormats}
            </Typography>
            <Typography id="coordinate-source-note" variant="body2" color="text.secondary">
              {sourceNote(read.value, text)}
            </Typography>
          </Stack>
          <Box
            aria-live="polite"
            aria-describedby="coordinate-source-note"
            sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}
          >
            {OUTPUT_FORMATS.map(({ key, label }) => (
              <ResultCard key={key} label={label} value={result.value[key]}>
                <Typography variant="caption" color="text.secondary">
                  {resolutionLabel(key, result.value.resolution[key], text)}
                </Typography>
                {key === "gars" && (
                  <Typography variant="caption" color="warning.main">
                    {text.areaSource}
                  </Typography>
                )}
              </ResultCard>
            ))}
          </Box>
        </Box>
      )}

      <ExampleButtons
        items={settings.examples.map((example) => ({
          key: example.id,
          label: exampleLabels[example.id],
          onClick: () => applyExample(example),
        }))}
      />
      </Paper>
    </ToolPage>
  );
}
