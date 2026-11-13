import { useState } from "react";
import { transformCrs } from "@convert-tools/core";
import ErrorMessage from "../../components/ErrorMessage.jsx";
import ExampleButtons from "../../components/ExampleButtons.jsx";
import Field from "../../components/Field.jsx";
import ResultCard from "../../components/ResultCard.jsx";
import { useConfig, useLanguage } from "../../context.js";
import { attempt } from "../../lib/attempt.js";
import { Box, Button, Stack, Typography } from "../../ui/index.js";

function transform(request) {
  return attempt(() => transformCrs(request.source, request.target, request.x, request.y));
}

export default function CrsConverter() {
  const { text, examples: exampleLabels } = useLanguage();
  const { crs: settings } = useConfig();
  const [request, setRequest] = useState(settings.initial);
  const [result, setResult] = useState(() => transform(settings.initial));
  const [stale, setStale] = useState(false);

  function setField(key, value) {
    setRequest((current) => ({ ...current, [key]: value }));
    setStale(true);
  }

  function run(next) {
    setRequest(next);
    setResult(transform(next));
    setStale(false);
  }

  function reverse() {
    if (stale || !result.ok) return;
    run({
      source: request.target,
      target: request.source,
      x: String(result.value.x),
      y: String(result.value.y),
    });
  }

  return (
    <Box
      component="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        run(request);
      }}
    >
      <Stack spacing={2}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Field
            id="crs-source"
            label={text.sourceCrs}
            value={request.source}
            onChange={(value) => setField("source", value)}
            placeholder="EPSG:4326"
          />
          <Field
            id="crs-target"
            label={text.targetCrs}
            value={request.target}
            onChange={(value) => setField("target", value)}
            placeholder="EPSG:3857"
          />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Field
            id="crs-x"
            label="X"
            value={request.x}
            onChange={(value) => setField("x", value)}
            placeholder="32.859742"
            inputMode="decimal"
          />
          <Field
            id="crs-y"
            label="Y"
            value={request.y}
            onChange={(value) => setField("y", value)}
            placeholder="39.933365"
            inputMode="decimal"
          />
        </Stack>
        <Stack direction="row" spacing={2}>
          <Button type="submit" variant="contained">
            {text.transform}
          </Button>
          <Button variant="outlined" onClick={reverse} disabled={stale || !result.ok}>
            {text.swapCrs}
          </Button>
        </Stack>
      </Stack>

      {!stale && !result.ok && <ErrorMessage summary={text.crsInvalid} code={result.code} />}

      {!stale && result.ok && (
        <Box sx={{ mt: 2 }} aria-live="polite">
          <ResultCard
            label={`${result.value.source} → ${result.value.target}`}
            copyValue={`${result.value.formattedX}, ${result.value.formattedY}`}
            lines={[`X ${result.value.formattedX}`, `Y ${result.value.formattedY}`]}
          />
        </Box>
      )}

      <ExampleButtons
        items={settings.examples.map((example) => ({
          key: example.id,
          label: exampleLabels[example.id],
          onClick: () => run({ source: example.source, target: example.target, x: example.x, y: example.y }),
        }))}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {text.axisNote} {text.availableEpsg}
      </Typography>
    </Box>
  );
}
