import { useState } from "react";
import { normalizeEpsg, transformCrs } from "@convert-tools/core";
import ErrorMessage from "../../components/ErrorMessage.jsx";
import ExampleButtons from "../../components/ExampleButtons.jsx";
import Field from "../../components/Field.jsx";
import Icon from "../../components/Icon.jsx";
import PasteHint from "../../components/PasteHint.jsx";
import ResultCard from "../../components/ResultCard.jsx";
import ToolPage from "../../components/ToolPage.jsx";
import { fill, useConfig, useLanguage } from "../../context.js";
import { attempt } from "../../lib/attempt.js";
import { parseCoordinatePaste, parseNumberPair, pastedText } from "../../lib/coordinate-paste.js";
import { Box, Button, Paper, Stack, Typography } from "../../ui/index.js";

function transform(request) {
  return attempt(() => transformCrs(request.source, request.target, request.x, request.y));
}

/** True for the geographic CRS, whose x is longitude and y latitude. */
function isGeographic(source) {
  const code = attempt(() => normalizeEpsg(source));
  return code.ok && code.value === "EPSG:4326";
}

export default function CrsConverter() {
  const { text, examples: exampleLabels } = useLanguage();
  const { crs: settings } = useConfig();
  const [request, setRequest] = useState(settings.initial);
  const [result, setResult] = useState(() => transform(settings.initial));
  const [stale, setStale] = useState(false);
  const [pasteNotice, setPasteNotice] = useState("");
  const geographic = isGeographic(request.source);

  function setField(key, value) {
    setRequest((current) => ({ ...current, [key]: value }));
    setPasteNotice("");
    setStale(true);
  }

  function run(next) {
    setRequest(next);
    setResult(transform(next));
    setStale(false);
  }

  // A pasted pair fills X and Y and is transformed right away. For EPSG:4326
  // the pair is read as "latitude, longitude" (web-map order), so it lands
  // as Y = latitude, X = longitude; otherwise as "X, Y" in order.
  function handlePaste(event) {
    const clipboard = pastedText(event);
    let next = null;
    let notice = "";
    if (geographic) {
      const parsed = parseCoordinatePaste(clipboard);
      if (parsed == null || parsed.points.length !== 1) return;
      const [{ latitude, longitude }] = parsed.points;
      next = { ...request, x: longitude, y: latitude };
      notice = fill(text.pastedCoordinate, { latitude, longitude });
      if (parsed.swapped) notice = `${notice} ${text.pastedSwapped}`;
    } else {
      const pair = parseNumberPair(clipboard);
      if (pair == null) return;
      next = { ...request, x: pair.first, y: pair.second };
      notice = fill(text.pastedXY, { x: pair.first, y: pair.second });
    }
    event.preventDefault();
    run(next);
    setPasteNotice(notice);
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
    <ToolPage title={text.crsTitle} subtitle={text.crsSubtitle} footer={text.coordinateFooter}>
      <Paper
        component="form"
        sx={{ p: { xs: 2, sm: 3 } }}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          run(request);
        }}
      >
        <Stack spacing={2.5}>
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
          <Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Field
                id="crs-x"
                label={geographic ? `X · ${text.longitude}` : "X"}
                value={request.x}
                onChange={(value) => setField("x", value)}
                onPaste={handlePaste}
                placeholder="32.859742"
                inputMode="decimal"
              />
              <Field
                id="crs-y"
                label={geographic ? `Y · ${text.latitude}` : "Y"}
                value={request.y}
                onChange={(value) => setField("y", value)}
                onPaste={handlePaste}
                placeholder="39.933365"
                inputMode="decimal"
              />
            </Stack>
            <PasteHint hint={geographic ? text.pasteHint : text.pasteHintXY} notice={pasteNotice} sx={{ mt: 1 }} />
          </Box>
          <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
            <Button type="submit" variant="contained">
              {text.transform}
            </Button>
            <Button variant="outlined" onClick={reverse} disabled={stale || !result.ok} startIcon={<Icon name="swap" size={17} />}>
              {text.swapCrs}
            </Button>
          </Stack>
        </Stack>

        {!stale && !result.ok && <ErrorMessage summary={text.crsInvalid} code={result.code} />}

        {!stale && result.ok && (
          <Box sx={{ mt: 2.5 }} aria-live="polite">
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
      </Paper>
    </ToolPage>
  );
}
