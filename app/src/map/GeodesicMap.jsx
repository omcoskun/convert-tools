import { useEffect, useMemo, useRef, useState } from "react";
import { useConfig, useLanguage } from "../context.js";
import { MONO_FONT } from "../theme.js";
import { Box, Button, Paper, Stack, Typography } from "../ui/index.js";
import {
  frameAround,
  labelsInFrame,
  nearestCopy,
  panFrame,
  pickDigits,
  pickedPoint,
  polylinePath,
  unwrapPoints,
  worldCopies,
  worldFrame,
  zoomFrame,
} from "./svg-geometry.js";
import { useMapData } from "./useMapData.js";

const COLOURS = {
  sea: "#dce6ec",
  border: "#7d8b97",
  route: "#c2410c",
  marker: "#122236",
  label: "#3d4b5a",
  halo: "#ffffff",
};

const KEY_STEPS = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] };

/** Width:height of an element, kept up to date; `fallback` until measured (and on the server). */
function useAspect(ref, fallback) {
  const [aspect, setAspect] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (element == null || typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setAspect(width / height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return aspect;
}

const haloText = { paintOrder: "stroke", stroke: COLOURS.halo, strokeLinejoin: "round" };

/**
 * Plate carrée sketch of a geodesic already sampled by the core, with point
 * picking for the distance form. It is a picture of the result, not a
 * measuring tool: a picked point is only typed into the form, rounded to
 * about one screen pixel, and the core measures it.
 *
 * @param {{
 *   points: { latitude: number, longitude: number }[],
 *   endpoints: { start: { latitude: number, longitude: number } | null, end: { latitude: number, longitude: number } | null },
 *   distanceText: string,
 *   onPick: (target: "start" | "end", point: { latitude: number, longitude: number }, digits: number) => void,
 * }} props
 *   points is the sampled route of the current measurement (empty when there
 *   is none); endpoints are the form values that parse as coordinates.
 */
export default function GeodesicMap({ points, endpoints, distanceText, onPick }) {
  const { text } = useLanguage();
  const { map: settings } = useConfig();
  const { status, data } = useMapData(settings);
  const boxRef = useRef(null);
  const svgRef = useRef(null);
  const drag = useRef(null);
  const aspect = useAspect(boxRef, 2);
  // null follows the route; a frame is a view the user moved to.
  const [view, setView] = useState(null);
  const [picking, setPicking] = useState(null);
  const [shownPoints, setShownPoints] = useState(points);
  if (shownPoints !== points) {
    // A new measurement: show its route.
    setShownPoints(points);
    if (points.length >= 2) setView(null);
  }

  const route = useMemo(() => (points.length >= 2 ? unwrapPoints(points) : null), [points]);
  const known = [endpoints.start, endpoints.end].filter(Boolean);
  const autoFrame = route ? frameAround(route, { aspect }) : frameAround(unwrapPoints(known), { aspect });
  const frame = view
    ? { ...view, x: view.x + view.width / 2 - (view.height * aspect) / 2, width: view.height * aspect }
    : autoFrame;
  const centreX = frame.x + frame.width / 2;
  const copies = worldCopies(frame);

  const markers = route
    ? [
        ["A", route[0]],
        ["B", route[route.length - 1]],
      ]
    : [
        ["A", endpoints.start],
        ["B", endpoints.end],
      ]
        .filter(([, point]) => point != null)
        .map(([name, point]) => [name, { x: nearestCopy(point.longitude, centreX), y: -point.latitude }]);
  const markerCopies = route ? copies.flatMap((offset) => markers.map(([, p]) => ({ x: p.x + offset, y: p.y }))) : markers.map(([, p]) => p);
  const labels = data ? labelsInFrame(data.labels, frame, { inset: 0.06, avoid: markerCopies }) : [];
  const routePath = useMemo(() => (route ? polylinePath(route) : ""), [route]);

  useEffect(() => {
    if (picking == null) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setPicking(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [picking]);

  function startPicking(target) {
    setView(frame); // keep the view still while points are picked
    setPicking(target);
  }

  function screenWidth() {
    return svgRef.current.getBoundingClientRect().width;
  }

  function pick(event) {
    const matrix = svgRef.current.getScreenCTM();
    if (matrix == null) return;
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const point = pickedPoint(position.x, position.y);
    if (point == null) return; // beyond a pole
    const target = picking;
    setPicking(target === "start" ? "end" : null);
    onPick(target, point, pickDigits(frame.width / screenWidth()));
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, frame, moved: false };
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    const current = drag.current;
    if (current == null) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    current.moved = true;
    const scale = current.frame.width / screenWidth();
    setView(panFrame(current.frame, -dx * scale, -dy * scale));
  }

  function handlePointerUp(event) {
    const current = drag.current;
    drag.current = null;
    if (current != null && !current.moved && picking != null) pick(event);
  }

  function handleKeyDown(event) {
    const step = KEY_STEPS[event.key];
    if (step) {
      event.preventDefault();
      setView(panFrame(frame, step[0] * frame.width, step[1] * frame.height));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setView(zoomFrame(frame, 0.5));
    } else if (event.key === "-") {
      event.preventDefault();
      setView(zoomFrame(frame, 2));
    }
  }

  const start = route ? points[0] : endpoints.start;
  const end = route ? points[points.length - 1] : endpoints.end;
  const description =
    route && start && end
      ? `${text.mapTitle}: ${text.mapStart} ${start.latitude}, ${start.longitude} → ${text.mapEnd} ${end.latitude}, ${end.longitude}; ${text.mapDistance} ${distanceText}`
      : text.mapTitle;
  const iconButton = { minWidth: 36, px: 1, fontSize: "1.1rem", lineHeight: 1 };

  return (
    <Paper component="figure" aria-labelledby="map-title" sx={{ p: { xs: 1.5, sm: 2 }, m: 0, minWidth: 0 }}>
      <Stack
        direction="row"
        flexWrap="wrap"
        useFlexGap
        justifyContent="space-between"
        alignItems="baseline"
        columnGap={2}
        sx={{ mb: 1.5 }}
      >
        <Typography id="map-title" variant="h2" component="h2" sx={{ whiteSpace: "nowrap" }}>
          {text.mapTitle}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {text.mapSource}
        </Typography>
      </Stack>

      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} alignItems="center" role="toolbar" aria-label={text.mapControls} sx={{ mb: 1 }}>
        {[
          ["start", text.mapPickStart],
          ["end", text.mapPickEnd],
        ].map(([target, label]) => (
          <Button
            key={target}
            size="small"
            variant={picking === target ? "contained" : "outlined"}
            aria-pressed={picking === target}
            onClick={() => (picking === target ? setPicking(null) : startPicking(target))}
          >
            {label}
          </Button>
        ))}
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" sx={iconButton} aria-label={text.mapZoomIn} title={text.mapZoomIn} onClick={() => setView(zoomFrame(frame, 0.5))}>
          +
        </Button>
        <Button size="small" variant="outlined" sx={iconButton} aria-label={text.mapZoomOut} title={text.mapZoomOut} onClick={() => setView(zoomFrame(frame, 2))}>
          −
        </Button>
        <Button size="small" variant="outlined" onClick={() => setView(worldFrame(centreX, aspect))}>
          {text.mapWorld}
        </Button>
        <Button size="small" variant="outlined" onClick={() => setView(null)} disabled={view == null}>
          {text.mapFit}
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center" aria-live="polite" sx={{ minHeight: 32, mb: 1 }}>
        <Typography variant="body2" color={picking ? "primary" : "text.secondary"} sx={{ fontWeight: picking ? 600 : 400 }}>
          {picking === "start" ? text.mapPickingStart : picking === "end" ? text.mapPickingEnd : text.mapPanHint}
        </Typography>
        {picking && (
          <Button size="small" onClick={() => setPicking(null)}>
            {text.mapCancel}
          </Button>
        )}
      </Stack>

      <Box
        ref={boxRef}
        sx={{
          position: "relative",
          height: { xs: 300, sm: 400, lg: 540 },
          borderRadius: 2,
          overflow: "hidden",
          bgcolor: COLOURS.sea,
          "& svg:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: -3 },
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
          width="100%"
          height="100%"
          role="img"
          aria-label={description}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={handleKeyDown}
          style={{ display: "block", cursor: picking ? "crosshair" : "grab", touchAction: picking ? "none" : "pan-y", userSelect: "none" }}
        >
          {data && (
            <g fill="none" stroke={COLOURS.border} strokeWidth="1">
              {copies.map((offset) => (
                <path key={offset} d={data.boundariesPath} transform={`translate(${offset} 0)`} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          )}
          {labels.map((label) => (
            <text
              key={label.key}
              x={label.x}
              y={label.y}
              fontSize={frame.height / (label.kind === "country" ? 24 : 30)}
              fill={COLOURS.label}
              strokeWidth={frame.height / 250}
              textAnchor="middle"
              style={haloText}
            >
              {label.name}
            </text>
          ))}
          {route &&
            copies.map((offset) => (
              <path
                key={`route${offset}`}
                d={routePath}
                transform={`translate(${offset} 0)`}
                fill="none"
                stroke={COLOURS.route}
                strokeWidth="3"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          {(route ? copies : [0]).flatMap((offset) =>
            markers.map(([name, point]) => (
              <g key={`${name}${offset}`} transform={`translate(${offset} 0)`}>
                <circle cx={point.x} cy={point.y} r={frame.height / 70} fill={COLOURS.marker} stroke={COLOURS.halo} strokeWidth={frame.height / 400} />
                <text
                  x={point.x}
                  y={point.y - frame.height / 40}
                  fontSize={frame.height / 16}
                  fontWeight="700"
                  fill={COLOURS.marker}
                  strokeWidth={frame.height / 160}
                  textAnchor="middle"
                  style={haloText}
                >
                  {name}
                </text>
              </g>
            )),
          )}
        </svg>
        {route && distanceText && (
          // The result stays visible next to the route when the form is below the map.
          <Box
            sx={{
              position: "absolute",
              left: 8,
              bottom: 8,
              px: 1.25,
              py: 0.5,
              borderRadius: 1.5,
              bgcolor: "rgba(255, 255, 255, 0.92)",
              border: 1,
              borderColor: "divider",
              typography: "body2",
              pointerEvents: "none",
            }}
          >
            <Box component="span" sx={{ color: "text.secondary", mr: 1 }}>
              {text.mapDistance}
            </Box>
            <Box component="span" sx={{ fontFamily: MONO_FONT, fontWeight: 600 }}>
              {distanceText}
            </Box>
          </Box>
        )}
      </Box>
      <Typography component="figcaption" variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {status === "loading" ? text.mapLoading : status === "error" ? text.mapUnavailable : text.mapVisualOnly}{" "}
        {text.mapProjection}
      </Typography>
    </Paper>
  );
}
