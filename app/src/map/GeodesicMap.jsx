import { useMemo } from "react";
import { useConfig, useLanguage } from "../context.js";
import { Box, Paper, Stack, Typography } from "../ui/index.js";
import { frameAround, labelsInFrame, polylinePath, unwrapPoints, worldCopies } from "./svg-geometry.js";
import { useMapData } from "./useMapData.js";

const COLOURS = {
  sea: "#e8eef0",
  border: "#8e9b94",
  route: "#c2410c",
  marker: "#17201b",
  label: "#4b5650",
};

/**
 * Plate carrée sketch of a geodesic already sampled by the core. It is a
 * picture of the result, not a measuring tool.
 */
export default function GeodesicMap({ points, distanceText }) {
  const { text } = useLanguage();
  const { map: settings } = useConfig();
  const { status, data } = useMapData(settings);

  const drawing = useMemo(() => {
    if (points.length < 2) return null;
    const route = unwrapPoints(points);
    const frame = frameAround(route);
    return { route, frame, path: polylinePath(route) };
  }, [points]);

  const labels = useMemo(
    () => (drawing && data ? labelsInFrame(data.labels, drawing.frame) : []),
    [drawing, data],
  );

  const start = points[0];
  const end = points[points.length - 1];

  return (
    <Paper variant="outlined" sx={{ p: 1.5, m: 0, alignSelf: "start" }} component="figure" aria-labelledby="map-title">
      <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
        <Typography id="map-title" variant="subtitle2" component="h3">
          {text.mapTitle}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {text.mapSource}
        </Typography>
      </Stack>
      {drawing == null ? (
        <Typography color="text.secondary">{text.mapEmpty}</Typography>
      ) : (
        <Box
          component="svg"
          viewBox={`${drawing.frame.x} ${drawing.frame.y} ${drawing.frame.width} ${drawing.frame.height}`}
          role="img"
          aria-label={`${text.mapTitle}: ${text.mapStart} ${start.latitude}, ${start.longitude} → ${text.mapEnd} ${end.latitude}, ${end.longitude}; ${text.mapDistance} ${distanceText}`}
          sx={{ display: "block", width: "100%", height: "auto", aspectRatio: "2 / 1", background: COLOURS.sea, borderRadius: 1 }}
        >
          {data && (
            <g fill="none" stroke={COLOURS.border} strokeWidth="1" vectorEffect="non-scaling-stroke">
              {worldCopies(drawing.frame).map((offset) => (
                <path key={offset} d={data.boundariesPath} transform={`translate(${offset} 0)`} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          )}
          {labels.map((label) => (
            <text
              key={label.key}
              x={label.x}
              y={label.y}
              fontSize={drawing.frame.height / (label.kind === "country" ? 16 : 20)}
              fill={COLOURS.label}
              textAnchor="middle"
            >
              {label.name}
            </text>
          ))}
          <path d={drawing.path} fill="none" stroke={COLOURS.route} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          {[
            ["A", drawing.route[0]],
            ["B", drawing.route[drawing.route.length - 1]],
          ].map(([name, point]) => (
            <g key={name}>
              <circle cx={point.x} cy={point.y} r={drawing.frame.height / 60} fill={COLOURS.marker} />
              <text
                x={point.x}
                y={point.y - drawing.frame.height / 30}
                fontSize={drawing.frame.height / 12}
                fontWeight="700"
                fill={COLOURS.marker}
                textAnchor="middle"
              >
                {name}
              </text>
            </g>
          ))}
        </Box>
      )}
      <Typography component="figcaption" variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {status === "loading" ? text.mapLoading : status === "error" ? text.mapUnavailable : text.mapVisualOnly}{" "}
        {text.mapProjection}
      </Typography>
    </Paper>
  );
}
