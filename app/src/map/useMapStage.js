import { useCallback, useEffect, useRef, useState } from "react";
import {
  GLOBE_MAX_ZOOM,
  LINE_COLORS,
  LINE_WIDTHS,
  LINE_WIDTH_ZOOMS,
  MERCATOR_LATITUDE_LIMIT,
  PIN_SHAPE,
  WORLD_VIEW_LATITUDE,
  constrainView,
  coordinateFromLngLat,
  decimalsForResolution,
  displayLatitude,
  fallbackStyle,
  gradientColor,
  isLocalizedLabelLayer,
  isSinglePoint,
  lineWidthAt,
  localizedNameExpression,
  markerLatitude,
  routeMidpoint,
  screenRuns,
  tuneBasemapStyle,
} from "./map-adapter.js";
import { SPACE_SKY, worldMinZoom } from "./map-view.js";
import { loadMapLibre, webgl2Available } from "./maplibre.js";
import {
  fitTargets,
  longitudeWithin,
  pinClassName,
  polarStretches,
  sceneBounds,
  sceneFeatures,
  scenePoints,
} from "./scene.js";

// One GeoJSON source holds every line of the scene within the Web Mercator
// edge (sceneFeatures): a white casing, then ink lines and A -> B gradient
// lines. A piece of a line cut at the edge gets a gradient layer of its own
// (GRADIENT_PIECE_PREFIX + id:part), whose ramp covers only its stretch of
// the A -> B colours: line-gradient follows line-progress within a feature.
// The stretches beyond the edge (over a pole) are drawn by the polar overlay.
const LINE_SOURCE = "convert-lines";
const CASING_LAYER = "convert-lines-casing";
const PLAIN_LAYER = "convert-lines-plain";
const GRADIENT_LAYER = "convert-lines-gradient";
const GRADIENT_PIECE_PREFIX = "convert-lines-gradient-piece:";
const WHOLE = ["all", ["==", ["get", "from"], 0], ["==", ["get", "to"], 1]];
const EMPTY_LINES = Object.freeze({ type: "FeatureCollection", features: Object.freeze([]) });

const STYLE_TIMEOUT_MS = 15000;
const TILE_ERROR_THRESHOLD = 3;
const DOUBLE_CLICK_GUARD_MS = 450;
const DOUBLE_CLICK_GUARD_PX = 10;
// The pointer readout shows about one metre.
const CURSOR_DECIMALS = 5;
// The view of an empty scene: the whole inhabited world.
const START_VIEW = Object.freeze({ center: [24, 30], zoom: 1.6 });
// Absolute library limits; transformConstrain applies the viewport-aware floor.
const ZOOM_RANGE = Object.freeze({ minZoom: -2, maxZoom: 20 });

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const animation = (ms) => (reducedMotion() ? 0 : ms);
const lineWidth = ([low, high]) => ["interpolate", ["linear"], ["zoom"], LINE_WIDTH_ZOOMS[0], low, LINE_WIDTH_ZOOMS[1], high];

/**
 * Decimals that resolve one screen pixel at the centre of the map (on the
 * globe its corners may be space), measured in latitude: the longitude a
 * pixel spans grows without bound towards a pole, where the centre may be.
 */
function pickDecimals(map) {
  const centre = map.getCenter();
  const point = map.project(centre);
  const next = map.unproject([point.x, point.y + 1]);
  return decimalsForResolution(Math.abs(next.lat - centre.lat));
}

/**
 * The point of the map under a screen point, or null where the screen shows
 * space around the globe: MapLibre then gives a point on the horizon, which
 * projects back somewhere else.
 */
function lngLatOnMap(map, point) {
  const lngLat = map.unproject([point.x, point.y]);
  if (map.getProjection()?.type === "mercator" &&
      (Math.abs(lngLat.lat) > MERCATOR_LATITUDE_LIMIT || (!map.getRenderWorldCopies() && Math.abs(lngLat.lng) > 180))) return null;
  const back = map.project(lngLat);
  return Math.abs(back.x - point.x) + Math.abs(back.y - point.y) < 1 ? lngLat : null;
}

/** False for a point on the far side of the globe: it projects onto a nearer point. */
function isOnVisibleSide(map, [longitude, latitude]) {
  const point = map.project([longitude, latitude]);
  const lngLat = map.unproject(point);
  const turn = (((lngLat.lng - longitude) % 360) + 540) % 360 - 180;
  return Math.abs(lngLat.lat - latitude) < 1e-3 && (Math.abs(turn) < 1e-3 || Math.abs(latitude) > 89.99);
}

// Degrees in a radian: the globe's radius in px is its px per degree of
// latitude at the centre of the view times this.
const DEGREES_PER_RADIAN = 57.29577951308232;
// A fit judges at most about this many points of a scene (a sampled line
// has hundreds of vertices; every few of them are enough).
const FIT_POINTS = 120;
// Halvings of the zoom range a fit makes: 22 levels / 2^12 is 0.005.
const FIT_STEPS = 12;

/**
 * The globe's radius in px at the current view: how large the map is drawn.
 * Measured over one degree of the centre's meridian, kept a degree away from
 * the poles (the centre may be over one).
 */
function globeRadius(map) {
  const { lng, lat } = map.getCenter();
  const middle = Math.max(-89, Math.min(89, lat));
  const north = map.project([lng, middle + 0.5]);
  const south = map.project([lng, middle - 0.5]);
  return Math.abs(south.y - north.y) * DEGREES_PER_RADIAN;
}

/**
 * The view with `target` in the middle of the part of the map the widgets
 * leave free, at `zoom`, using camera padding to position the globe itself.
 */
function placeAt(map, target, zoom, padding) {
  map.jumpTo({ center: target, zoom, padding, pitch: 0, bearing: 0 });
  return { center: map.getCenter(), zoom: map.getZoom() };
}

/**
 * The largest zoom in [low, high] at which `fits(camera)` holds for the view
 * placeAt gives, by halving, and its camera; null if it fails at `low`.
 */
function largestZoom(map, target, padding, [low, high], fits) {
  let camera = placeAt(map, target, high, padding);
  if (fits(camera)) return camera;
  camera = placeAt(map, target, low, padding);
  if (!fits(camera)) return null;
  for (let step = 0; step < FIT_STEPS; step += 1) {
    const middle = (low + high) / 2;
    const tried = placeAt(map, target, middle, padding);
    if (fits(tried)) {
      low = middle;
      camera = tried;
    } else high = middle;
  }
  return camera;
}

/**
 * The whole globe in the free part of the map, facing the longitude of the
 * scene's first fit target (or of the view, for an empty scene): the
 * largest zoom at which its radius takes at most 45 % of the free width or
 * height.
 */
function worldCamera(map, scene, padding, mode) {
  const [facing] = fitTargets(scene);
  const latitude = mode === "2d" ? 0 : WORLD_VIEW_LATITUDE;
  return {
    center: [mode === "2d" ? 0 : facing ? facing[0] : map.getCenter().lng, latitude],
    zoom: minimumZoom(map, latitude, padding, mode),
    padding,
    pitch: 0,
    bearing: 0,
  };
}

function minimumZoom(map, latitude, padding, mode) {
  const canvas = map.getCanvas();
  return worldMinZoom({ width: canvas.clientWidth, height: canvas.clientHeight, latitude, padding, mode, fov: map.getVerticalFieldOfView() });
}

/**
 * The camera that fits a scene on the globe. For each of its fitTargets, the
 * target goes in the middle of the part of the map the widgets leave free,
 * at the largest zoom up to maxZoom (found by halving) that shows every
 * scenePoint inside the padding, on the visible side of the globe; of these
 * the camera that draws the globe largest is taken. MapLibre's own fitBounds
 * is not used: on the globe it may centre a long line on the far side of
 * the globe from its ends, and its camera eases back to ±85.05° from about
 * zoom 4, short of points nearer a pole. Each camera is tried with jumpTo and the view put back
 * before a frame is drawn.
 */
function fitCamera(map, scene, bounds, { padding, maxZoom }) {
  const targets = fitTargets(scene);
  if (targets.length === 0) return null;
  const all = scenePoints(scene, bounds);
  const stride = Math.max(1, Math.ceil(all.length / FIT_POINTS));
  const points = all.filter((_, index) => index % stride === 0 || index === all.length - 1);
  const { clientWidth: width, clientHeight: height } = map.getCanvas();
  const inView = (lngLat) => {
    const point = map.project(lngLat);
    if (point.x < padding.left - 2 || point.x > width - padding.right + 2) return false;
    if (point.y < padding.top - 2 || point.y > height - padding.bottom + 2) return false;
    return isOnVisibleSide(map, lngLat);
  };
  const minZoom = map.getMinZoom();
  const start = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), padding: map.getPadding() };
  let best = null;
  try {
    for (const target of targets) {
      // Past the Mercator edge only the globe can centre a target.
      const highest = Math.abs(target[1]) > MERCATOR_LATITUDE_LIMIT ? Math.min(maxZoom, GLOBE_MAX_ZOOM) : maxZoom;
      const camera = largestZoom(map, target, padding, [minZoom, highest], () => points.every(inView));
      if (!camera) {
        // Nothing shows it all from here: the widest view, if no target does better.
        best ??= { camera: placeAt(map, target, minZoom, padding), radius: -1 };
        continue;
      }
      map.jumpTo(camera);
      const radius = globeRadius(map);
      if (!best || radius > best.radius) best = { camera, radius };
    }
  } finally {
    map.jumpTo(start);
  }
  return best ? { ...best.camera, pitch: 0, bearing: 0, padding } : null;
}

const SVG = "http://www.w3.org/2000/svg";

/**
 * Draws the stretches of lines beyond ±85.05° (scene.js, polarStretches)
 * over the map on their real path: MapLibre's GeoJSON tiles stop at the
 * Mercator edge, on the globe too (there they would run around the polar
 * cap). An SVG above the canvas and below the pins and tags, redrawn on every
 * frame the map renders: a white casing and the line, as wide as MapLibre's.
 */
function createPolarOverlay(map) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "map-polar-lines");
  svg.setAttribute("aria-hidden", "true");
  Object.assign(svg.style, { position: "absolute", inset: "0", width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" });
  map.getCanvas().after(svg);
  let stretches = [];
  const draw = () => {
    svg.replaceChildren();
    if (stretches.length === 0) return;
    const zoom = map.getZoom();
    const view = {
      centerLongitude: map.getCenter().lng,
      project: (lngLat) => {
        const { x, y } = map.project(lngLat);
        return [x, y];
      },
      visible: (lngLat) => isOnVisibleSide(map, lngLat),
    };
    const defs = document.createElementNS(SVG, "defs");
    svg.append(defs);
    stretches.forEach((stretch, index) => {
      for (const run of screenRuns(stretch.coordinates, view)) {
        const points = run.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        const stroke = (color, width, opacity = 1) => {
          const polyline = document.createElementNS(SVG, "polyline");
          polyline.setAttribute("points", points);
          polyline.setAttribute("fill", "none");
          polyline.setAttribute("stroke", color);
          polyline.setAttribute("stroke-width", String(width));
          polyline.setAttribute("stroke-opacity", String(opacity));
          polyline.setAttribute("stroke-linecap", "round");
          polyline.setAttribute("stroke-linejoin", "round");
          svg.append(polyline);
        };
        stroke("#ffffff", lineWidthAt(zoom, LINE_WIDTHS.casing), 0.95);
        let color = stretch.colors[0];
        if (stretch.colors[0] !== stretch.colors[1]) {
          // The colour runs from where the stretch starts to where it ends.
          const id = `map-polar-gradient-${index}-${defs.childElementCount}`;
          const gradient = document.createElementNS(SVG, "linearGradient");
          gradient.setAttribute("id", id);
          gradient.setAttribute("gradientUnits", "userSpaceOnUse");
          const [[x1, y1], [x2, y2]] = [run[0], run.at(-1)];
          for (const [name, value] of Object.entries({ x1, y1, x2, y2 })) gradient.setAttribute(name, value.toFixed(1));
          stretch.colors.forEach((stopColor, stopIndex) => {
            const stop = document.createElementNS(SVG, "stop");
            stop.setAttribute("offset", String(stopIndex));
            stop.setAttribute("stop-color", stopColor);
            gradient.append(stop);
          });
          defs.append(gradient);
          color = `url(#${id})`;
        }
        stroke(color, lineWidthAt(zoom, LINE_WIDTHS.line));
      }
    });
  };
  map.on("render", draw);
  return {
    setStretches(next) {
      stretches = next;
      draw();
    },
    remove() {
      map.off("render", draw);
      svg.remove();
    },
  };
}

// A pin is anchored at its tip: the element's bottom edge is moved down by
// half the tip dot, so the dot's centre is on the coordinate.
const PIN_OFFSET = [0, PIN_SHAPE.dot / 2];

// A needle pin (MapStage draws the parts): the head with the label, the
// needle, the tip dot on the coordinate, and a halo around the tip while it
// is hovered or dragged.
function createPinElement() {
  const element = document.createElement("div");
  // An image named by the pin's title, so screen readers announce its aria-label
  // (moving a pin by keyboard is "Yeniden seç" plus keyboard picking on the map).
  element.setAttribute("role", "img");
  for (const part of ["halo", "needle", "dot", "head"]) {
    const span = document.createElement("span");
    span.className = `map-pin-${part}`;
    element.append(span);
  }
  return element;
}

/** Brings a pin's DOM element in step with its scene pin; MapStage styles the classes. */
function updatePinElement(element, pin) {
  element.className = pinClassName([...element.classList], pin);
  element.lastChild.textContent = pin.label;
  const name = pin.title ?? pin.label;
  element.setAttribute("aria-label", name);
  element.title = name;
}

function installLineLayers(map) {
  if (!map.getSource(LINE_SOURCE)) {
    map.addSource(LINE_SOURCE, { type: "geojson", data: EMPTY_LINES, lineMetrics: true });
  }
  const layout = { "line-cap": "round", "line-join": "round" };
  if (!map.getLayer(CASING_LAYER)) {
    map.addLayer({
      id: CASING_LAYER,
      type: "line",
      source: LINE_SOURCE,
      layout,
      paint: { "line-color": "#ffffff", "line-opacity": 0.95, "line-width": lineWidth(LINE_WIDTHS.casing) },
    });
  }
  if (!map.getLayer(PLAIN_LAYER)) {
    map.addLayer({
      id: PLAIN_LAYER,
      type: "line",
      source: LINE_SOURCE,
      filter: ["!=", ["get", "gradient"], true],
      layout,
      paint: { "line-color": LINE_COLORS.ink, "line-width": lineWidth(LINE_WIDTHS.line) },
    });
  }
  if (!map.getLayer(GRADIENT_LAYER)) {
    map.addLayer({
      id: GRADIENT_LAYER,
      type: "line",
      source: LINE_SOURCE,
      filter: ["all", ["==", ["get", "gradient"], true], WHOLE],
      layout,
      paint: {
        "line-width": lineWidth(LINE_WIDTHS.line),
        // The colour runs from A to B, so the direction reads on the map.
        "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, LINE_COLORS.a, 1, LINE_COLORS.b],
      },
    });
  }
}

/**
 * One gradient layer per shown piece of a cut gradient line, its ramp from
 * the A -> B colour where the piece starts to the colour where it ends; the
 * layers of pieces no longer in `features` are removed.
 * @param {object} map
 * @param {{ properties: { id: string, part: number, gradient: boolean, from: number, to: number } }[]} features
 */
function syncGradientPieces(map, features) {
  const wanted = new Map();
  for (const { properties } of features) {
    const { id, part, gradient, from, to } = properties;
    if (!gradient || (from === 0 && to === 1)) continue;
    wanted.set(`${GRADIENT_PIECE_PREFIX}${id}:${part}`, properties);
  }
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.id.startsWith(GRADIENT_PIECE_PREFIX) && !wanted.has(layer.id)) map.removeLayer(layer.id);
  }
  for (const [layerId, { id, part, from, to }] of wanted) {
    const ramp = ["interpolate", ["linear"], ["line-progress"], 0, gradientColor(from), 1, gradientColor(to)];
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "line-gradient", ramp);
      continue;
    }
    map.addLayer({
      id: layerId,
      type: "line",
      source: LINE_SOURCE,
      filter: ["all", ["==", ["get", "id"], id], ["==", ["get", "part"], part]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-width": lineWidth(LINE_WIDTHS.line), "line-gradient": ramp },
    });
  }
}

/**
 * Owns the one MapLibre map of the workspace for the component's lifetime
 * and draws a scene on it. A new scene, tool or language never recreates the
 * map: pins are created, moved and removed by id, the lines share one
 * GeoJSON source, and the labels are switched in place.
 *
 * @param {{
 *   styleUrl: string,
 *   language: string,
 *   labels: { mapCanvas: string },
 *   scene: import("./scene.js").MapScene,
 *   owner: object | null,
 *   handlersRef: { current: import("../shell/workspace-context.js").MapSceneHandlers },
 *   getPadding: () => { top: number, right: number, bottom: number, left: number },
 * }} options
 *   owner identifies the tool that published the scene: when it changes,
 *   the new tool's fitRequest is taken as it is, without fitting.
 *   getPadding is read at each fit, so fits keep clear of the widgets.
 * @returns {{
 *   containerRef: { current: HTMLElement | null },
 *   cursorRef: { current: HTMLElement | null },
 *   status: import("../shell/workspace-context.js").MapStatus,
 *   basemap: "loading" | "ready" | "partial" | "fallback",
 *   retry: () => void,
 *   zoomIn: () => void,
 *   zoomOut: () => void,
 *   fitScene: () => void,
 *   showWorld: () => void,
 * }}
 *   basemap "partial": some tiles failed; "fallback": the offline grid.
 */
export default function useMapStage({ styleUrl, language, labels, scene, owner, handlersRef, getPadding }) {
  const containerRef = useRef(null);
  const cursorRef = useRef(null);
  const mapRef = useRef(null);
  const libraryRef = useRef(null);
  const pinsRef = useRef(new Map());
  const tagsRef = useRef(new Map());
  const polarRef = useRef(null);
  const dragRef = useRef({ id: null, frame: 0, pending: null });
  const latestRef = useRef(null);
  const basemapRef = useRef({ remote: true, styleLoaded: false, tileErrors: 0, localizedLayers: [] });
  const reloadBasemapRef = useRef(null);
  const fitSeenRef = useRef({ owner, fitRequest: scene.fitRequest });
  const modeRef = useRef("3d");
  const navigatedRef = useRef(false);
  const worldOverviewRef = useRef(false);
  const syncViewRef = useRef(null);
  const [viewMode, setViewMode] = useState("3d");
  const [navigation, setNavigation] = useState({ canZoomIn: true, canZoomOut: true, bearing: 0 });
  const [status, setStatus] = useState("loading");
  const [basemap, setBasemap] = useState("loading");
  const [styleRevision, setStyleRevision] = useState(0);
  const [initAttempt, setInitAttempt] = useState(0);

  useEffect(() => {
    latestRef.current = { language, labels, scene, getPadding };
  });

  const transformStyle = useCallback((previous, next) => {
    const tuned = tuneBasemapStyle(next, latestRef.current?.language ?? "tr");
    basemapRef.current.localizedLayers = (tuned?.layers ?? []).filter(isLocalizedLabelLayer).map((layer) => layer.id);
    return tuned;
  }, []);

  // Set by the pin effect: puts every pin on the copy of the world its line
  // is drawn on (see placePinsOnScene there).
  const placePinsOnRef = useRef(null);

  const fitScene = useCallback((animate = true) => {
    const map = mapRef.current;
    const latest = latestRef.current;
    if (!map || !latest) return;
    const bounds = sceneBounds(latest.scene);
    if (!bounds) return;
    const padding = latest.getPadding();
    worldOverviewRef.current = false;
    // One point keeps a closer zoom, if the map has one.
    const single = isSinglePoint(bounds);
    const maxZoom = single ? Math.max(map.getZoom(), 12) : 15;
    const camera = modeRef.current === "2d"
      ? map.cameraForBounds(bounds, { padding, absolutePadding: true, maxZoom, bearing: 0 })
      : fitCamera(map, latest.scene, bounds, { padding, maxZoom });
    if (!camera) return;
    if (single) map.easeTo({ ...camera, padding, pitch: 0, bearing: 0, duration: animate ? animation(600) : 0 });
    else map.flyTo({ ...camera, padding, pitch: 0, bearing: 0, duration: animate ? animation(700) : 0 });
    map.once("moveend", () => placePinsOnRef.current?.());
  }, []);

  const showWorld = useCallback(() => {
    navigatedRef.current = true;
    worldOverviewRef.current = true;
    const map = mapRef.current;
    const latest = latestRef.current;
    if (map) map.flyTo({ ...worldCamera(map, latest.scene, latest.getPadding(), modeRef.current), duration: animation(700) });
  }, []);

  const zoomBy = useCallback((delta) => {
    navigatedRef.current = true;
    if (delta > 0) worldOverviewRef.current = false;
    const map = mapRef.current;
    if (map) map.easeTo({ zoom: map.getZoom() + delta, duration: animation(250) });
  }, []);

  const setMode = useCallback((mode) => {
    const map = mapRef.current;
    if (!map || modeRef.current === mode) return;
    navigatedRef.current = true;
    map.stop();
    worldOverviewRef.current = false;
    modeRef.current = mode;
    setViewMode(mode);
    map.setProjection({ type: mode === "3d" ? "globe" : "mercator" });
    map.setSky(mode === "3d" ? SPACE_SKY : undefined);
    map.setMaxPitch(mode === "3d" ? 60 : 0);
    if (mode === "3d") {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
      map.touchPitch.enable();
      map.keyboard.enableRotation();
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.touchPitch.disable();
      map.keyboard.disableRotation();
    }
    const center = map.getCenter();
    map.jumpTo({ center: [center.lng, mode === "2d" ? Math.max(-MERCATOR_LATITUDE_LIMIT, Math.min(MERCATOR_LATITUDE_LIMIT, center.lat)) : center.lat] });
    map.easeTo({ pitch: mode === "3d" && map.getZoom() >= 5 ? 45 : 0, bearing: 0, duration: animation(500) });
    syncViewRef.current?.();
  }, []);

  const resetNorth = useCallback(() => {
    mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: animation(400) });
  }, []);

  // Keep camera padding in step with floating widgets and expanded mode.
  useEffect(() => { syncViewRef.current?.(); });

  // A dragged pin reports its position once per frame and at the drop.
  const flushMove = useCallback(() => {
    const drag = dragRef.current;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    drag.frame = 0;
    const { pending } = drag;
    drag.pending = null;
    const map = mapRef.current;
    if (!pending || !map) return;
    handlersRef.current?.onPinMove?.(pending.id, coordinateFromLngLat(pending.lngLat, pickDecimals(map)));
  }, [handlersRef]);

  const queueMove = useCallback(
    (id, lngLat) => {
      const drag = dragRef.current;
      drag.pending = { id, lngLat };
      if (!drag.frame) drag.frame = requestAnimationFrame(flushMove);
    },
    [flushMove],
  );

  // ---- Create the map once ----------------------------------------------
  useEffect(() => {
    let disposed = false;
    let map = null;
    let styleTimer = 0;
    let cursorFrame = 0;
    let lastPick = null;
    let removeCanvasListeners = null;
    const container = containerRef.current;
    const basemapState = basemapRef.current;
    const pins = pinsRef.current;
    const tags = tagsRef.current;

    const switchToFallback = () => {
      if (!map || disposed || !basemapState.remote) return;
      window.clearTimeout(styleTimer);
      basemapState.remote = false;
      setBasemap("fallback");
      // setStyle reuses the constructor's transformStyle by default and then
      // waits for the previous style to finish loading, which a failed remote
      // style never does. The local style needs no transform.
      map.setStyle(fallbackStyle(), { diff: false, transformStyle: undefined });
    };

    const loadRemoteStyle = () => {
      basemapState.remote = true;
      basemapState.styleLoaded = false;
      basemapState.tileErrors = 0;
      setBasemap("loading");
      window.clearTimeout(styleTimer);
      styleTimer = window.setTimeout(() => {
        if (!basemapState.styleLoaded) switchToFallback();
      }, STYLE_TIMEOUT_MS);
    };

    const pick = (lngLat) => handlersRef.current?.onPick?.(coordinateFromLngLat(lngLat, pickDecimals(map)));

    async function initialise() {
      if (!webgl2Available()) {
        setStatus("unsupported");
        return;
      }
      let maplibregl;
      try {
        maplibregl = await loadMapLibre();
      } catch (error) {
        if (!disposed) {
          console.error("MapLibre could not be loaded.", error);
          setStatus("error");
        }
        return;
      }
      if (disposed || !container) return;
      const latest = latestRef.current;
      const initialBounds = sceneBounds(latest.scene);
      loadRemoteStyle();
      try {
        map = new maplibregl.Map({
          container,
          style: styleUrl,
          transformStyle,
          ...(initialBounds && !isSinglePoint(initialBounds)
            ? { bounds: initialBounds, fitBoundsOptions: { padding: latest.getPadding(), maxZoom: 15 } }
            : initialBounds
              ? { center: initialBounds[0], zoom: 10 }
              : START_VIEW),
          attributionControl: false,
          maplibreLogo: false,
          renderWorldCopies: true,
          ...ZOOM_RANGE,
          // On the globe the centre may go up to the pole; zoomed in, up to
          // the Mercator edge (see constrainView). `map` is unset while the
          // constructor fits the first view.
          transformConstrain: (lngLat, zoom) => {
            const mode = modeRef.current;
            const padding = latestRef.current.getPadding();
            const minZoom = worldMinZoom({ width: container.clientWidth, height: container.clientHeight, latitude: lngLat.lat, mode, padding });
            const view = constrainView(lngLat, zoom, { ...ZOOM_RANGE, minZoom }, map ? map.getZoom() : zoom, mode);
            return { center: new maplibregl.LngLat(view.longitude, view.latitude), zoom: view.zoom };
          },
          maxPitch: 60,
          dragRotate: true,
          pitchWithRotate: true,
          touchPitch: true,
          // Wheel, trackpad and pinch zoom without a modifier key.
          cooperativeGestures: false,
          clickTolerance: 4,
          fadeDuration: 120,
        });
      } catch (error) {
        window.clearTimeout(styleTimer);
        console.error("The map could not be created.", error);
        setStatus("error");
        return;
      }
      mapRef.current = map;
      libraryRef.current = maplibregl;
      polarRef.current = createPolarOverlay(map);
      const updateNavigation = () => {
        const centerPoint = map.project(map.getCenter());
        container.parentElement.style.setProperty("--map-center-x", `${centerPoint.x}px`);
        container.parentElement.style.setProperty("--map-center-y", `${centerPoint.y}px`);
        // Only the explicit north-up world overview suppresses wrapped tiles.
        // Free navigation and scene fits need them for date-line crossings.
        const copies = modeRef.current === "3d" || !worldOverviewRef.current;
        if (map.getRenderWorldCopies() !== copies) map.setRenderWorldCopies(copies);
        const floor = minimumZoom(map, map.getCenter().lat, latestRef.current.getPadding(), modeRef.current);
        const next = { canZoomIn: map.getZoom() < map.getMaxZoom() - 0.01, canZoomOut: map.getZoom() > floor + 0.01, bearing: Math.round(map.getBearing()) };
        setNavigation((current) => Object.keys(next).every((key) => next[key] === current[key]) ? current : next);
      };
      const syncView = () => {
        const padding = latestRef.current.getPadding();
        const previous = map.getPadding();
        if (Object.keys(padding).some((key) => padding[key] !== previous[key])) map.setPadding(padding);
        const minZoom = minimumZoom(map, map.getCenter().lat, padding, modeRef.current);
        if (map.getZoom() < minZoom) map.jumpTo({ zoom: minZoom });
        updateNavigation();
      };
      syncViewRef.current = syncView;
      map.on("move", updateNavigation);
      map.on("resize", syncView);
      syncView();
      // Bottom-right controls stack upwards: the scale bar sits above the attribution.
      map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 96 }), "bottom-right");
      const canvas = map.getCanvas();
      canvas.setAttribute("aria-label", latest.labels.mapCanvas);

      // The first view is fitted while the layout may still be settling (the
      // phone sheet takes its height after the map is created), so it is
      // fitted again once the map has loaded, unless the user has moved it.
      let userMoved = false;
      map.on("movestart", (event) => {
        if (event.originalEvent) {
          userMoved = true;
          worldOverviewRef.current = false;
        }
      });
      map.once("load", () => {
        if (!userMoved && !navigatedRef.current && initialBounds) fitScene(false);
      });
      // One point has no bounds to give the constructor: centre it in the free
      // part of the map now, without waiting for "load" (which a background
      // tab may not reach for a long time).
      if (initialBounds && isSinglePoint(initialBounds)) fitScene(false);

      map.on("style.load", () => {
        if (basemapState.remote) {
          basemapState.styleLoaded = true;
          window.clearTimeout(styleTimer);
          setBasemap("ready");
        }
        map.setProjection({ type: modeRef.current === "3d" ? "globe" : "mercator" });
        map.setSky(modeRef.current === "3d" ? SPACE_SKY : undefined);
        installLineLayers(map);
        syncView();
        setStatus("ready");
        setStyleRevision((value) => value + 1);
      });

      map.on("error", (event) => {
        if (disposed || !basemapState.remote) return;
        if (!basemapState.styleLoaded) {
          console.warn("Basemap style unavailable; showing the offline grid.", event.error);
          switchToFallback();
          return;
        }
        basemapState.tileErrors += 1;
        if (basemapState.tileErrors >= TILE_ERROR_THRESHOLD) setBasemap("partial");
      });

      map.on("click", (event) => {
        if (!latestRef.current?.scene.picking) return;
        const origin = event.originalEvent?.target;
        if (origin instanceof Element && origin.closest(".maplibregl-marker")) return;
        // A click in the space around the globe places nothing.
        const lngLat = lngLatOnMap(map, event.point);
        if (!lngLat) return;
        // The second click of a double click must not place the next point.
        const now = performance.now();
        if (
          lastPick &&
          now - lastPick.time < DOUBLE_CLICK_GUARD_MS &&
          Math.abs(event.point.x - lastPick.x) + Math.abs(event.point.y - lastPick.y) < DOUBLE_CLICK_GUARD_PX
        ) {
          return;
        }
        lastPick = { time: now, x: event.point.x, y: event.point.y };
        pick(lngLat);
      });

      // Keyboard: the arrow keys pan the focused map and Enter places what
      // is being picked under the centre mark.
      const onCanvasKey = (event) => {
        if (event.key !== "Enter" || !latestRef.current?.scene.picking) return;
        event.preventDefault();
        pick(map.getCenter());
      };
      // The centre mark is for keyboard users only: the container (whose
      // class React never rewrites) gets a class while the canvas has
      // keyboard, not mouse, focus.
      const onCanvasFocus = () => {
        let keyboard = false;
        try {
          keyboard = canvas.matches(":focus-visible");
        } catch {
          keyboard = false;
        }
        container.classList.toggle("is-keyboard-focus", keyboard);
      };
      const onCanvasBlur = () => container.classList.remove("is-keyboard-focus");
      canvas.addEventListener("keydown", onCanvasKey);
      canvas.addEventListener("focus", onCanvasFocus);
      canvas.addEventListener("blur", onCanvasBlur);
      removeCanvasListeners = () => {
        canvas.removeEventListener("keydown", onCanvasKey);
        canvas.removeEventListener("focus", onCanvasFocus);
        canvas.removeEventListener("blur", onCanvasBlur);
      };

      let cursorLngLat = null;
      map.on("mousemove", (event) => {
        cursorLngLat = lngLatOnMap(map, event.point);
        if (cursorFrame) return;
        cursorFrame = requestAnimationFrame(() => {
          cursorFrame = 0;
          const output = cursorRef.current;
          if (!output) return;
          if (!cursorLngLat) {
            output.textContent = "";
            return;
          }
          const { latitude, longitude } = coordinateFromLngLat(cursorLngLat, CURSOR_DECIMALS);
          output.textContent = `${latitude}, ${longitude}`;
        });
      });
      map.on("mouseout", () => {
        cursorLngLat = null;
        if (cursorRef.current) cursorRef.current.textContent = "";
      });

      reloadBasemapRef.current = () => {
        loadRemoteStyle();
        map.setStyle(styleUrl, { diff: false, transformStyle });
      };
    }

    initialise();
    return () => {
      disposed = true;
      window.clearTimeout(styleTimer);
      if (cursorFrame) cancelAnimationFrame(cursorFrame);
      const drag = dragRef.current;
      if (drag.frame) cancelAnimationFrame(drag.frame);
      dragRef.current = { id: null, frame: 0, pending: null };
      removeCanvasListeners?.();
      for (const entry of pins.values()) entry.marker.remove();
      for (const marker of tags.values()) marker.remove();
      pins.clear();
      tags.clear();
      polarRef.current?.remove();
      polarRef.current = null;
      map?.remove();
      mapRef.current = null;
      libraryRef.current = null;
      reloadBasemapRef.current = null;
      syncViewRef.current = null;
    };
    // styleUrl comes from config.json and does not change while the app runs.
  }, [initAttempt, transformStyle, handlersRef]);

  // ---- Pins: created, updated and removed by id -------------------------
  const createPinEntry = useCallback(
    (maplibregl, id) => {
      const element = createPinElement();
      const marker = new maplibregl.Marker({ element, anchor: "bottom", offset: PIN_OFFSET, clickTolerance: 3 });
      marker.on("dragstart", () => {
        dragRef.current.id = id;
        element.classList.add("is-dragging");
      });
      marker.on("drag", () => queueMove(id, marker.getLngLat()));
      marker.on("dragend", () => {
        queueMove(id, marker.getLngLat());
        flushMove();
        dragRef.current.id = null;
        element.classList.remove("is-dragging");
      });
      return { marker, element, onMap: false, pin: null };
    },
    [queueMove, flushMove],
  );

  // A pin's map position: on the copy of the world its line is drawn on
  // (Web Mercator, zoomed in; the globe has one copy).
  const pinLngLat = useCallback((pin, bounds) => {
    const longitude = bounds ? longitudeWithin(pin.longitude, bounds) : pin.longitude;
    return [longitude, modeRef.current === "2d" ? displayLatitude(pin.latitude) : markerLatitude(pin.latitude)];
  }, []);

  const { pins: scenePins } = scene;
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = libraryRef.current;
    if (!map || !maplibregl || styleRevision === 0) return;
    const pins = pinsRef.current;
    const bounds = sceneBounds(latestRef.current.scene);
    const present = new Set();
    for (const pin of scenePins) {
      present.add(pin.id);
      let entry = pins.get(pin.id);
      if (!entry) {
        entry = createPinEntry(maplibregl, pin.id);
        pins.set(pin.id, entry);
      }
      entry.pin = pin;
      updatePinElement(entry.element, pin);
      entry.marker.setDraggable(pin.draggable === true);
      if (dragRef.current.id !== pin.id) entry.marker.setLngLat(pinLngLat(pin, bounds));
      if (!entry.onMap) {
        entry.marker.addTo(map);
        entry.onMap = true;
      }
    }
    for (const [id, entry] of pins) {
      if (present.has(id)) continue;
      entry.marker.remove();
      pins.delete(id);
    }
  }, [scenePins, styleRevision, viewMode, createPinEntry, pinLngLat]);

  // MapLibre keeps a marker on the copy of the world nearest where it was on
  // screen, so a pin that moved far (the end of a 30 000 km line) can stay on
  // another copy than its line. After a fit the pins on a wrong copy are
  // made again on the right one; a new marker has no earlier position.
  useEffect(() => {
    placePinsOnRef.current = () => {
      const map = mapRef.current;
      const maplibregl = libraryRef.current;
      const bounds = sceneBounds(latestRef.current.scene);
      if (!map || !maplibregl || !bounds) return;
      for (const [id, entry] of pinsRef.current) {
        if (!entry.pin || dragRef.current.id === id) continue;
        const wanted = pinLngLat(entry.pin, bounds);
        if (Math.abs(entry.marker.getLngLat().lng - wanted[0]) < 1e-6) continue;
        entry.marker.remove();
        const fresh = createPinEntry(maplibregl, id);
        fresh.pin = entry.pin;
        updatePinElement(fresh.element, entry.pin);
        fresh.marker.setDraggable(entry.pin.draggable === true).setLngLat(wanted).addTo(map);
        fresh.onMap = true;
        pinsRef.current.set(id, fresh);
      }
    };
    return () => {
      placePinsOnRef.current = null;
    };
  }, [createPinEntry, pinLngLat]);

  // ---- Lines and their tags ---------------------------------------------
  const { lines } = scene;
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = libraryRef.current;
    if (!map || !maplibregl || styleRevision === 0) return;
    const features = sceneFeatures({ lines });
    map.getSource(LINE_SOURCE)?.setData(features);
    syncGradientPieces(map, features.features);
    polarRef.current?.setStretches(viewMode === "2d" ? [] : polarStretches({ lines }));
    const tags = tagsRef.current;
    const present = new Set();
    for (const line of lines) {
      const middle = line.tag ? routeMidpoint(line.points) : null;
      if (!middle) continue;
      const midpoint = [middle[0], viewMode === "2d" ? displayLatitude(middle[1]) : markerLatitude(middle[1])];
      present.add(line.id);
      let marker = tags.get(line.id);
      if (!marker) {
        const element = document.createElement("div");
        element.className = "map-line-tag";
        element.setAttribute("aria-hidden", "true");
        marker = new maplibregl.Marker({ element, anchor: "center" }).setLngLat(midpoint).addTo(map);
        tags.set(line.id, marker);
      }
      marker.getElement().textContent = line.tag;
      marker.setLngLat(midpoint);
    }
    for (const [id, marker] of tags) {
      if (present.has(id)) continue;
      marker.remove();
      tags.delete(id);
    }
  }, [lines, styleRevision, viewMode]);

  // ---- Language: map labels and the canvas name -------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;
    map.getCanvas().setAttribute("aria-label", labels.mapCanvas);
    if (!basemapRef.current.remote) return;
    for (const id of basemapRef.current.localizedLayers) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "text-field", localizedNameExpression(language));
    }
  }, [language, labels, styleRevision]);

  // ---- Picking: no double-click zoom while something is being placed -----
  const picking = scene.picking != null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return undefined;
    if (picking) {
      map.doubleClickZoom.disable();
      return undefined;
    }
    // Re-enabled a moment later, so the second click of the double click
    // that placed the last point does not zoom the map.
    const timer = window.setTimeout(() => map.doubleClickZoom.enable(), 500);
    return () => window.clearTimeout(timer);
  }, [picking, status]);

  // ---- Fit requests ------------------------------------------------------
  useEffect(() => {
    const seen = fitSeenRef.current;
    if (seen.owner !== owner) {
      // Another tool opened: its scene starts where the map is.
      fitSeenRef.current = { owner, fitRequest: scene.fitRequest };
      return;
    }
    if (seen.fitRequest === scene.fitRequest || status !== "ready") return;
    fitSeenRef.current = { owner, fitRequest: scene.fitRequest };
    fitScene();
  }, [owner, scene.fitRequest, status, fitScene]);

  const retry = useCallback(() => {
    if (mapRef.current) {
      reloadBasemapRef.current?.();
      return;
    }
    setStatus("loading");
    setInitAttempt((value) => value + 1);
  }, []);

  const zoomIn = useCallback(() => zoomBy(1), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(-1), [zoomBy]);

  return { containerRef, cursorRef, status, basemap, retry, zoomIn, zoomOut, fitScene, showWorld, viewMode, setMode, resetNorth, ...navigation };
}
