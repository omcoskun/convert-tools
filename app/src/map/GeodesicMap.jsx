import { useEffect, useMemo, useRef, useState } from "react";
import { useConfig, useLanguage } from "../context.js";
import { MONO_FONT } from "../theme.js";
import { Box, Button, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from "../ui/index.js";
import { imageryRequests, imageryUrl } from "./imagery.js";
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

const BASEMAP_STYLES = {
  local: { sea: "#dce6ec", border: "#7d8b97", label: "#3d4b5a", labelHalo: "#ffffff" },
  imagery: { sea: "#0e2233", border: "rgba(255, 255, 255, 0.65)", label: "#ffffff", labelHalo: "rgba(9, 20, 32, 0.85)" },
};
const ROUTE = "#c2410c";
const MARKER = "#122236";
const HALO = "#ffffff";

const KEY_STEPS = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] };

// The map's size before it is measured (and on the server).
const FALLBACK_SIZE = { width: 0, height: 0 };

/** Size of an element in CSS pixels, kept up to date. */
function useBoxSize(ref) {
  const [size, setSize] = useState(FALLBACK_SIZE);
  useEffect(() => {
    const element = ref.current;
    if (element == null || typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(url);
    image.onerror = () => reject(new Error("imagery"));
    image.src = url;
  });
}

/**
 * Satellite images for the frame, fetched once the view has been still for a
 * moment. The previous images stay on screen (they are placed in map
 * coordinates) until the new ones have loaded.
 */
function useImagery(settings, enabled, frame, pixelWidth) {
  const [state, setState] = useState({ layers: [], failed: false });
  const key = enabled && pixelWidth > 0 ? JSON.stringify([frame.x, frame.y, frame.width, frame.height, pixelWidth]) : "";
  useEffect(() => {
    if (key === "") return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      const [x, y, width, height, pixels] = JSON.parse(key);
      // One image pixel per CSS pixel: the export renders on demand, and
      // twice the pixels on high-density screens took ~8 s instead of ~2 s.
      const requests = imageryRequests({ x, y, width, height }, pixels, { maxSize: settings.maxSize });
      Promise.all(
        requests.map((request) => {
          const href = imageryUrl(settings.exportUrl, request);
          return loadImage(href).then(() => ({ ...request, href }));
        }),
      ).then(
        (layers) => {
          if (!cancelled) setState({ layers, failed: false });
        },
        () => {
          if (!cancelled) setState((current) => ({ ...current, failed: true }));
        },
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, settings]);
  return state;
}

/**
 * Plate carrée sketch of a geodesic already sampled by the core, over
 * satellite imagery or the local Natural Earth borders, with point picking
 * for the distance form. It is a picture of the result, not a measuring tool:
 * a picked point is only typed into the form, rounded to about one screen
 * pixel, and the core measures it.
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
  const size = useBoxSize(boxRef);
  const aspect = size.width > 0 ? size.width / size.height : 2;
  // null follows the route; a frame is a view the user moved to.
  const [view, setView] = useState(null);
  const [picking, setPicking] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [basemap, setBasemap] = useState(settings.imagery ? "imagery" : "local");
  const known = [endpoints.start, endpoints.end].filter(Boolean);
  const [shownPoints, setShownPoints] = useState(points);
  if (shownPoints !== points) {
    // A new measurement shows its route; cleared points show the world. A
    // point picked on its own keeps the view still.
    setShownPoints(points);
    if (points.length >= 2 || known.length === 0) setView(null);
  }

  const route = useMemo(() => (points.length >= 2 ? unwrapPoints(points) : null), [points]);
  const autoFrame = route ? frameAround(route, { aspect }) : frameAround(unwrapPoints(known), { aspect });
  const frame = view
    ? { ...view, x: view.x + view.width / 2 - (view.height * aspect) / 2, width: view.height * aspect }
    : autoFrame;
  const centreX = frame.x + frame.width / 2;
  const copies = worldCopies(frame);
  // Map units per CSS pixel: labels and markers keep their size on screen.
  const unit = frame.height / (size.height > 0 ? size.height : 400);

  const imagery = useImagery(settings.imagery, basemap === "imagery", frame, size.width);
  const showImagery = basemap === "imagery" && !imagery.failed;
  const style = showImagery ? BASEMAP_STYLES.imagery : BASEMAP_STYLES.local;
  const haloText = { paintOrder: "stroke", stroke: style.labelHalo, strokeLinejoin: "round" };

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
    if (picking == null && !expanded) return undefined;
    // Escape cancels picking first, then leaves the enlarged view.
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (picking != null) setPicking(null);
      else setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [picking, expanded]);

  useEffect(() => {
    if (!expanded) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [expanded]);

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
  const overlay = {
    position: "absolute",
    borderRadius: 1.5,
    bgcolor: "rgba(255, 255, 255, 0.92)",
    pointerEvents: "none",
  };

  return (
    <Paper
      component="figure"
      aria-labelledby="map-title"
      sx={{
        p: { xs: 1.5, sm: 2 },
        m: 0,
        minWidth: 0,
        ...(expanded && {
          position: "fixed",
          // top/right/bottom/left rather than inset: iOS 12 is a build target.
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 1300,
          border: 0,
          borderRadius: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
        }),
      }}
    >
      <Stack direction="row" flexWrap="wrap" useFlexGap justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography id="map-title" variant="h2" component="h2">
            {text.mapTitle}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {basemap === "imagery" ? text.mapImagerySource : text.mapSource}
          </Typography>
        </Box>
        {settings.imagery && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={basemap}
            onChange={(event, value) => value && setBasemap(value)}
            aria-label={text.mapBasemap}
          >
            <ToggleButton value="imagery" sx={{ px: 1.5, py: 0.25 }}>
              {text.mapImagery}
            </ToggleButton>
            <ToggleButton value="local" sx={{ px: 1.5, py: 0.25 }}>
              {text.mapLocal}
            </ToggleButton>
          </ToggleButtonGroup>
        )}
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
        <Button size="small" variant={expanded ? "contained" : "outlined"} aria-pressed={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? text.mapCollapse : text.mapExpand}
        </Button>
      </Stack>

      <Stack direction="row" flexWrap="wrap" useFlexGap alignItems="center" justifyContent="space-between" columnGap={2} rowGap={0.5} sx={{ minHeight: 32, mb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" aria-live="polite">
          <Typography variant="body2" color={picking ? "primary" : "text.secondary"} sx={{ fontWeight: picking ? 600 : 400 }}>
            {picking === "start" ? text.mapPickingStart : picking === "end" ? text.mapPickingEnd : text.mapPanHint}
          </Typography>
          {picking && (
            <Button size="small" onClick={() => setPicking(null)}>
              {text.mapCancel}
            </Button>
          )}
        </Stack>
        {route && distanceText && (
          // The result stays in sight when the form is out of view.
          <Box sx={{ px: 1.25, py: 0.25, borderRadius: 1.5, border: 1, borderColor: "divider", typography: "body2" }}>
            <Box component="span" sx={{ color: "text.secondary", mr: 1 }}>
              {text.mapDistance}
            </Box>
            <Box component="span" sx={{ fontFamily: MONO_FONT, fontWeight: 600 }}>
              {distanceText}
            </Box>
          </Box>
        )}
      </Stack>

      <Box
        ref={boxRef}
        sx={{
          position: "relative",
          ...(expanded ? { flex: "1 1 0", minHeight: 240 } : { height: { xs: 320, sm: 420, lg: 600 } }),
          borderRadius: 2,
          overflow: "hidden",
          bgcolor: style.sea,
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
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            display: "block",
            cursor: picking ? "crosshair" : "grab",
            touchAction: picking ? "none" : "pan-y",
            userSelect: "none",
          }}
        >
          {showImagery &&
            imagery.layers.map((layer) => (
              <image key={layer.href} href={layer.href} x={layer.x} y={layer.y} width={layer.width} height={layer.height} preserveAspectRatio="none" />
            ))}
          {data && (
            <g fill="none" stroke={style.border} strokeWidth="1">
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
              fontSize={unit * (label.kind === "country" ? 15 : 12.5)}
              fill={style.label}
              strokeWidth={unit * 3}
              textAnchor="middle"
              style={haloText}
            >
              {label.name}
            </text>
          ))}
          {route &&
            copies.map((offset) => (
              <g key={`route${offset}`} transform={`translate(${offset} 0)`} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke">
                {showImagery && <path d={routePath} stroke={HALO} strokeWidth="6" strokeOpacity="0.85" vectorEffect="non-scaling-stroke" />}
                <path d={routePath} stroke={ROUTE} strokeWidth="3" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          {(route ? copies : [0]).flatMap((offset) =>
            markers.map(([name, point]) => (
              <g key={`${name}${offset}`} transform={`translate(${offset} 0)`}>
                <circle cx={point.x} cy={point.y} r={unit * 6.5} fill={MARKER} stroke={HALO} strokeWidth={unit * 2} />
                <text
                  x={point.x}
                  y={point.y - unit * 13}
                  fontSize={unit * 18}
                  fontWeight="700"
                  fill={MARKER}
                  strokeWidth={unit * 4}
                  textAnchor="middle"
                  style={{ paintOrder: "stroke", stroke: HALO, strokeLinejoin: "round" }}
                >
                  {name}
                </text>
              </g>
            )),
          )}
        </svg>
        {showImagery && imagery.layers.length === 0 && (
          <Box sx={{ ...overlay, right: 8, top: 8, px: 1.25, py: 0.25, typography: "body2", whiteSpace: "nowrap" }}>
            {text.mapImageryLoading}
          </Box>
        )}
        {basemap === "imagery" && settings.imagery && (
          <Box sx={{ ...overlay, right: 4, bottom: 4, maxWidth: "75%", px: 0.75, borderRadius: 1, fontSize: "0.625rem", lineHeight: 1.5, color: "#3d4b5a" }}>
            {settings.imagery.attribution}
          </Box>
        )}
      </Box>
      <Typography component="figcaption" variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {basemap === "imagery" && imagery.failed && (
          <Box component="span" sx={{ display: "block", color: "warning.main", fontWeight: 600 }}>
            {text.mapImageryError}
          </Box>
        )}
        {status === "loading" ? text.mapLoading : status === "error" ? text.mapUnavailable : text.mapVisualOnly}{" "}
        {text.mapProjection} {text.mapPickRounding}
      </Typography>
    </Paper>
  );
}
