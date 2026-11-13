import { useMemo, useState } from "react";
import ErrorMessage from "../../components/ErrorMessage.jsx";
import ExampleButtons from "../../components/ExampleButtons.jsx";
import Field from "../../components/Field.jsx";
import ResultCard from "../../components/ResultCard.jsx";
import { useConfig, useLanguage } from "../../context.js";
import { attempt } from "../../lib/attempt.js";
import GeodesicMap from "../../map/GeodesicMap.jsx";
import { Box, Button, Stack, Typography, visuallyHidden } from "../../ui/index.js";
import { measure } from "./distance.js";

const POINT_FIELDS = [
  ["start", "startLatitude", "startLongitude"],
  ["end", "endLatitude", "endLongitude"],
];

function pickPoints(example) {
  const { startLatitude, startLongitude, endLatitude, endLongitude } = example;
  return { startLatitude, startLongitude, endLatitude, endLongitude };
}

export default function DistanceCalculator() {
  const { text, examples: exampleLabels } = useLanguage();
  const { distance: settings } = useConfig();
  const initial = pickPoints(settings.examples[0]);
  const [values, setValues] = useState(initial);
  const [measurement, setMeasurement] = useState(() => attempt(() => measure(initial, settings.path)));
  const [stale, setStale] = useState(false);

  function setValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setStale(true);
  }

  function run(next) {
    setValues(next);
    setMeasurement(attempt(() => measure(next, settings.path)));
    setStale(false);
  }

  const shown = !stale && measurement.ok ? measurement.value : null;
  const points = useMemo(() => (shown ? shown.path.points : []), [shown]);
  const labels = {
    start: [text.startPoint, text.startLatitude, text.startLongitude],
    end: [text.endPoint, text.endLatitude, text.endLongitude],
  };

  return (
    <>
      <Box
        sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1.2fr)" } }}
      >
        <Box>
          <Box
            component="form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              run(values);
            }}
          >
            {POINT_FIELDS.map(([group, latitudeKey, longitudeKey]) => (
              <Box component="fieldset" key={group} sx={{ border: 0, p: 0, m: 0, mb: 2 }}>
                <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
                  {labels[group][0]}
                </Typography>
                <Stack direction="row" spacing={2}>
                  <Field
                    id={`distance-${latitudeKey}`}
                    label={labels[group][1]}
                    value={values[latitudeKey]}
                    onChange={(value) => setValue(latitudeKey, value)}
                    inputMode="decimal"
                  />
                  <Field
                    id={`distance-${longitudeKey}`}
                    label={labels[group][2]}
                    value={values[longitudeKey]}
                    onChange={(value) => setValue(longitudeKey, value)}
                    inputMode="decimal"
                  />
                </Stack>
              </Box>
            ))}
            <Stack direction="row" spacing={2} alignItems="center">
              <Button type="submit" variant="contained">
                {text.measure}
              </Button>
              <Typography variant="body2" color="text.secondary">
                {text.coordinateRange}
              </Typography>
            </Stack>
          </Box>

          {!stale && !measurement.ok && <ErrorMessage summary={text.distanceInvalid} code={measurement.code} />}

          {shown && (
            <Box component="section" aria-labelledby="distance-output-title" sx={{ mt: 2 }}>
              <Typography id="distance-output-title" component="h2" sx={visuallyHidden}>
                {text.measurementResult}
              </Typography>
              <Stack spacing={1}>
                <ResultCard label={text.metres} value={`${shown.metres} m`} copyValue={shown.metres} />
                <ResultCard label={text.kilometres} value={`${shown.kilometres} km`} copyValue={shown.kilometres} />
                <ResultCard label={text.nauticalMiles} value={`${shown.nauticalMiles} NM`} copyValue={shown.nauticalMiles} />
                <ResultCard
                  label={text.bearings}
                  value={
                    shown.path.azimuthDefined
                      ? `${shown.path.initialBearingDegrees.toFixed(6)}° → ${shown.path.finalBearingDegrees.toFixed(6)}°`
                      : "—"
                  }
                />
              </Stack>
              {shown.path.ambiguous && (
                <Typography role="note" variant="body2" color="warning.main" sx={{ mt: 1 }}>
                  {text.ambiguousPath}
                </Typography>
              )}
              <Box component="details" sx={{ mt: 2, typography: "body2" }}>
                <summary>{text.calculationDetails}</summary>
                <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5, m: 0, mt: 1 }}>
                  <dt>{text.mapModel}</dt>
                  <Box component="dd" sx={{ m: 0 }}>
                    WGS 84 · {text.shortestGeodesic}
                  </Box>
                  <dt>{text.solver}</dt>
                  <Box component="dd" sx={{ m: 0 }}>
                    {shown.path.solver}
                  </Box>
                  <dt>{text.iterations}</dt>
                  <Box component="dd" sx={{ m: 0 }}>
                    {shown.path.iterations}
                  </Box>
                  <dt>{text.mapSegments}</dt>
                  <Box component="dd" sx={{ m: 0 }}>
                    {shown.path.segmentCount}
                  </Box>
                  <dt>{text.sphericalComparison}</dt>
                  <Box component="dd" sx={{ m: 0 }}>
                    {text.googleSphereDifference}
                  </Box>
                </Box>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {text.distanceModel}
              </Typography>
            </Box>
          )}

          <Typography role="status" aria-live="polite" sx={visuallyHidden}>
            {stale ? text.measurementCleared : shown ? text.measurementReady : ""}
          </Typography>
        </Box>

        <GeodesicMap points={points} distanceText={shown ? `${shown.kilometres} km` : ""} />
      </Box>

      <ExampleButtons
        items={settings.examples.map((example) => ({
          key: example.id,
          label: exampleLabels[example.id],
          onClick: () => run(pickPoints(example)),
        }))}
      />
    </>
  );
}
