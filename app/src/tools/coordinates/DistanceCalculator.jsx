import { Fragment, useMemo, useState } from "react";
import CopyButton from "../../components/CopyButton.jsx";
import ErrorMessage from "../../components/ErrorMessage.jsx";
import ExampleButtons from "../../components/ExampleButtons.jsx";
import Field from "../../components/Field.jsx";
import ToolPage from "../../components/ToolPage.jsx";
import { useConfig, useLanguage } from "../../context.js";
import { attempt } from "../../lib/attempt.js";
import GeodesicMap from "../../map/GeodesicMap.jsx";
import { pickedText } from "../../map/svg-geometry.js";
import { MONO_FONT, NAVY } from "../../theme.js";
import { Box, Button, Paper, Stack, Typography, visuallyHidden } from "../../ui/index.js";
import { endpointFromText, measure, swapEndpoints } from "./distance.js";

const POINT_FIELDS = [
  ["start", "A", "startLatitude", "startLongitude"],
  ["end", "B", "endLatitude", "endLongitude"],
];

function pickPoints(example) {
  const { startLatitude, startLongitude, endLatitude, endLongitude } = example;
  return { startLatitude, startLongitude, endLatitude, endLongitude };
}

function PointBadge({ name }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        display: "inline-grid",
        placeItems: "center",
        width: 22,
        height: 22,
        mr: 1,
        borderRadius: "50%",
        bgcolor: NAVY,
        color: "#ffffff",
        fontSize: "0.75rem",
        fontWeight: 700,
      }}
    >
      {name}
    </Box>
  );
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

  // Empty fields, ready for picking A and B on the map.
  function clearPoints() {
    setValues({ startLatitude: "", startLongitude: "", endLatitude: "", endLongitude: "" });
    setStale(true);
  }

  function handlePick(target, point, digits) {
    const [, , latitudeKey, longitudeKey] = POINT_FIELDS.find(([group]) => group === target);
    const next = {
      ...values,
      [latitudeKey]: pickedText(point.latitude, digits),
      [longitudeKey]: pickedText(point.longitude, digits),
    };
    // A starts a new pair; picking B completes it and measures.
    if (target === "end") {
      run(next);
    } else {
      setValues(next);
      setStale(true);
    }
  }

  const shown = !stale && measurement.ok ? measurement.value : null;
  const points = useMemo(() => (shown ? shown.path.points : []), [shown]);
  const endpoints = {
    start: endpointFromText(values.startLatitude, values.startLongitude),
    end: endpointFromText(values.endLatitude, values.endLongitude),
  };
  const labels = {
    start: [text.startPoint, text.startLatitude, text.startLongitude],
    end: [text.endPoint, text.endLatitude, text.endLongitude],
  };
  const rows = shown
    ? [
        [text.metres, `${shown.metres} m`, shown.metres],
        [text.kilometres, `${shown.kilometres} km`, shown.kilometres],
        [text.nauticalMiles, `${shown.nauticalMiles} NM`, shown.nauticalMiles],
        [
          text.bearings,
          shown.path.azimuthDefined
            ? `${shown.path.initialBearingDegrees.toFixed(6)}° → ${shown.path.finalBearingDegrees.toFixed(6)}°`
            : "—",
          null,
        ],
      ]
    : [];

  return (
    <ToolPage title={text.distanceTitle} subtitle={text.distanceSubtitle} footer={text.coordinateFooter}>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          alignItems: "start",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(300px, 340px) minmax(0, 1fr)" },
        }}
      >
        {/* Below lg the map comes first, as on most map pages. */}
        <Paper sx={{ p: { xs: 2, sm: 2.5 }, order: { xs: 1, lg: 0 } }}>
          <Box
            component="form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              run(values);
            }}
          >
            {POINT_FIELDS.map(([group, name, latitudeKey, longitudeKey]) => (
              <Box component="fieldset" key={group} sx={{ border: 0, p: 0, m: 0, mb: 2 }}>
                <Typography component="legend" variant="subtitle2" sx={{ mb: 1, display: "flex", alignItems: "center" }}>
                  <PointBadge name={name} />
                  {labels[group][0]}
                </Typography>
                <Stack direction="row" spacing={1.5}>
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
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button type="submit" variant="contained">
                {text.measure}
              </Button>
              <Button variant="outlined" onClick={() => run(swapEndpoints(values))}>
                {text.swapPoints}
              </Button>
              <Button onClick={clearPoints}>{text.clearPoints}</Button>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {text.coordinateRange}
            </Typography>
          </Box>

          {!stale && !measurement.ok && <ErrorMessage summary={text.distanceInvalid} code={measurement.code} />}

          {shown && (
            <Box component="section" aria-labelledby="distance-output-title" sx={{ mt: 2.5, pt: 2, borderTop: 1, borderColor: "divider" }}>
              <Typography id="distance-output-title" component="h2" sx={visuallyHidden}>
                {text.measurementResult}
              </Typography>
              <Box
                component="dl"
                sx={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", columnGap: 1.5, rowGap: 0.75, m: 0 }}
              >
                {rows.map(([label, value, copyValue]) => (
                  <Fragment key={label}>
                    <Box component="dt" sx={{ typography: "body2", color: "text.secondary" }}>
                      {label}
                    </Box>
                    <Box component="dd" sx={{ m: 0, fontFamily: MONO_FONT, fontSize: "0.95rem", overflowWrap: "anywhere" }}>
                      {value}
                    </Box>
                    <Box component="dd" sx={{ m: 0 }}>
                      {copyValue && <CopyButton value={copyValue} label={label} />}
                    </Box>
                  </Fragment>
                ))}
              </Box>
              {shown.path.ambiguous && (
                <Typography role="note" variant="body2" color="warning.main" sx={{ mt: 1.5 }}>
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
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                {text.distanceModel}
              </Typography>
            </Box>
          )}

          <Typography role="status" aria-live="polite" sx={visuallyHidden}>
            {stale ? text.measurementCleared : shown ? text.measurementReady : ""}
          </Typography>
        </Paper>

        <GeodesicMap
          points={points}
          endpoints={endpoints}
          distanceText={shown ? `${shown.kilometres} km` : ""}
          onPick={handlePick}
        />
      </Box>

      <ExampleButtons
        items={settings.examples.map((example) => ({
          key: example.id,
          label: exampleLabels[example.id],
          onClick: () => run(pickPoints(example)),
        }))}
      />
    </ToolPage>
  );
}
