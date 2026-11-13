import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROUTE_COLORS,
  WORLD_BOUNDS,
  coordinateFromLngLat,
  decimalsForResolution,
  fallbackStyle,
  isLocalizedLabelLayer,
  isSinglePoint,
  localizedNameExpression,
  markerPosition,
  routeBounds,
  routeFeatureCollection,
  routeMidpoint,
  tuneBasemapStyle,
} from "./map-adapter.js";
import { loadMapLibre, webgl2Available } from "./maplibre.js";

const ROUTE_SOURCE = "convert-route";
const CASING_LAYER = "convert-route-casing";
const LINE_LAYER = "convert-route-line";
const STYLE_TIMEOUT_MS = 15000;
const TILE_ERROR_THRESHOLD = 3;
const DOUBLE_CLICK_GUARD_MS = 450;
const DOUBLE_CLICK_GUARD_PX = 10;
// The pointer readout shows about one metre.
const CURSOR_DECIMALS = 5;
const EMPTY_ROUTE = { type: "FeatureCollection", features: [] };

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const animation = (ms) => (reducedMotion() ? 0 : ms);

function createPin(letter, target) {
  const element = document.createElement("div");
  element.className = `map-pin map-pin-${target}`;
  for (const part of ["halo", "dot"]) {
    const span = document.createElement("span");
    span.className = `map-pin-${part}`;
    element.append(span);
  }
  const tag = document.createElement("span");
  tag.className = "map-pin-tag";
  tag.textContent = letter;
  element.append(tag);
  return element;
}

function fitPadding(container) {
  const width = container?.clientWidth ?? 800;
  const height = container?.clientHeight ?? 600;
  const scale = Math.min(1, width / 700, height / 500);
  const pad = (value) => Math.round(Math.max(16, value * scale));
  return { top: pad(84), right: pad(76), bottom: pad(56), left: pad(52) };
}

/** Decimals that resolve one screen pixel at the current zoom. */
function pickDecimals(map) {
  const left = map.unproject([0, 0]);
  const right = map.unproject([1, 0]);
  return decimalsForResolution(Math.abs(right.lng - left.lng));
}

function routeOf({ points, start, end }) {
  return points?.length ? points : [start, end].filter(Boolean);
}

function installRouteLayers(map) {
  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, { type: "geojson", data: EMPTY_ROUTE, lineMetrics: true });
  }
  if (!map.getLayer(CASING_LAYER)) {
    map.addLayer({
      id: CASING_LAYER,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-opacity": 0.95,
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 6, 12, 10],
      },
    });
  }
  if (!map.getLayer(LINE_LAYER)) {
    map.addLayer({
      id: LINE_LAYER,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 3, 12, 5],
        // The colour runs from A to B, so the direction reads on the map.
        "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, ROUTE_COLORS.start, 1, ROUTE_COLORS.end],
      },
    });
  }
}

/**
 * Owns one MapLibre map for the component's lifetime. React updates never
 * recreate it: they update the route source and the markers in place.
 *
 * status: "loading" | "ready" | "error" | "unsupported" (no WebGL 2)
 * basemap: "loading" | "ready" | "partial" (some tiles failed) | "fallback" (offline grid)
 */
export default function useMeasurementMap({
  styleUrl,
  language,
  labels,
  start,
  end,
  points,
  distanceLabel,
  activeTarget,
  fitRequest,
  onPick,
  onMove,
}) {
  const containerRef = useRef(null);
  const cursorRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const draggingRef = useRef(null);
  const latestRef = useRef(null);
  const basemapRef = useRef({ remote: true, styleLoaded: false, tileErrors: 0, localizedLayers: [] });
  const fitRequestRef = useRef(fitRequest);
  const reloadBasemapRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [basemap, setBasemap] = useState("loading");
  const [styleRevision, setStyleRevision] = useState(0);
  const [initAttempt, setInitAttempt] = useState(0);

  useEffect(() => {
    latestRef.current = { language, labels, start, end, points, activeTarget, onPick, onMove };
  });

  const transformStyle = useCallback((previous, next) => {
    const tuned = tuneBasemapStyle(next, latestRef.current?.language ?? "tr");
    basemapRef.current.localizedLayers = (tuned?.layers ?? []).filter(isLocalizedLabelLayer).map((layer) => layer.id);
    return tuned;
  }, []);

  const focusMeasurement = useCallback(() => {
    const map = mapRef.current;
    const latest = latestRef.current;
    if (!map || !latest) return;
    const bounds = routeBounds(routeOf(latest));
    if (!bounds) return;
    if (isSinglePoint(bounds)) {
      map.easeTo({ center: bounds[0], zoom: Math.max(map.getZoom(), 12), duration: animation(600) });
      return;
    }
    map.fitBounds(bounds, { padding: fitPadding(containerRef.current), maxZoom: 15, duration: animation(700) });
  }, []);

  const resetView = useCallback(() => {
    mapRef.current?.fitBounds(WORLD_BOUNDS, { padding: 12, duration: animation(700) });
  }, []);

  const zoomBy = useCallback((delta) => {
    const map = mapRef.current;
    if (map) map.easeTo({ zoom: map.getZoom() + delta, duration: animation(250) });
  }, []);

  // ---- Create the map once ----------------------------------------------
  useEffect(() => {
    let disposed = false;
    let map = null;
    let styleTimer = 0;
    let cursorFrame = 0;
    let moveFrame = 0;
    let pendingMove = null;
    let lastPick = null;
    let removeKeyListener = null;
    const container = containerRef.current;
    const basemapState = basemapRef.current;

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

    const flushMove = () => {
      moveFrame = 0;
      if (!pendingMove || !map) return;
      const { target, lngLat } = pendingMove;
      pendingMove = null;
      latestRef.current?.onMove(target, coordinateFromLngLat(lngLat, pickDecimals(map)));
    };

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
      const initialBounds = routeBounds(routeOf(latest));
      loadRemoteStyle();
      try {
        map = new maplibregl.Map({
          container,
          style: styleUrl,
          transformStyle,
          ...(initialBounds && !isSinglePoint(initialBounds)
            ? { bounds: initialBounds, fitBoundsOptions: { padding: fitPadding(container), maxZoom: 15 } }
            : { center: initialBounds?.[0] ?? [24, 30], zoom: initialBounds ? 10 : 1.6 }),
          attributionControl: false,
          maplibreLogo: false,
          renderWorldCopies: true,
          minZoom: 0,
          maxZoom: 20,
          maxPitch: 0,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
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
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 96 }), "bottom-left");
      const canvas = map.getCanvas();
      canvas.setAttribute("aria-label", latest.labels.mapCanvas);

      // Markers are DOM elements, so they survive style reloads.
      const markers = { onMap: new Set() };
      for (const target of ["start", "end"]) {
        const element = createPin(target === "start" ? "A" : "B", target);
        const marker = new maplibregl.Marker({ element, anchor: "center", draggable: true, clickTolerance: 3 });
        marker.on("dragstart", () => {
          draggingRef.current = target;
          element.classList.add("is-dragging");
        });
        marker.on("drag", () => {
          pendingMove = { target, lngLat: marker.getLngLat() };
          if (!moveFrame) moveFrame = requestAnimationFrame(flushMove);
        });
        marker.on("dragend", () => {
          pendingMove = { target, lngLat: marker.getLngLat() };
          if (moveFrame) cancelAnimationFrame(moveFrame);
          flushMove();
          draggingRef.current = null;
          element.classList.remove("is-dragging");
        });
        markers[target] = marker;
      }
      const tag = document.createElement("div");
      tag.className = "map-distance-tag";
      tag.setAttribute("aria-hidden", "true");
      markers.distance = new maplibregl.Marker({ element: tag, anchor: "center" });
      markersRef.current = markers;

      map.on("style.load", () => {
        if (basemapState.remote) {
          basemapState.styleLoaded = true;
          window.clearTimeout(styleTimer);
          setBasemap("ready");
        }
        installRouteLayers(map);
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
        const current = latestRef.current;
        if (!current?.activeTarget) return;
        const origin = event.originalEvent?.target;
        if (origin instanceof Element && origin.closest(".maplibregl-marker")) return;
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
        current.onPick(coordinateFromLngLat(event.lngLat, pickDecimals(map)));
      });

      // Keyboard: the arrow keys pan the focused map and Enter places the
      // armed point under the centre reticle.
      const onCanvasKey = (event) => {
        const current = latestRef.current;
        if (event.key !== "Enter" || !current?.activeTarget) return;
        event.preventDefault();
        current.onPick(coordinateFromLngLat(map.getCenter(), pickDecimals(map)));
      };
      // The centre reticle is for keyboard users only: the container (whose
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
      removeKeyListener = () => {
        canvas.removeEventListener("keydown", onCanvasKey);
        canvas.removeEventListener("focus", onCanvasFocus);
        canvas.removeEventListener("blur", onCanvasBlur);
      };

      let cursorLngLat = null;
      map.on("mousemove", (event) => {
        cursorLngLat = event.lngLat;
        if (cursorFrame) return;
        cursorFrame = requestAnimationFrame(() => {
          cursorFrame = 0;
          const output = cursorRef.current;
          if (!output || !cursorLngLat) return;
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
      if (moveFrame) cancelAnimationFrame(moveFrame);
      removeKeyListener?.();
      const markers = markersRef.current;
      if (markers) {
        markers.start.remove();
        markers.end.remove();
        markers.distance.remove();
      }
      markersRef.current = null;
      map?.remove();
      mapRef.current = null;
      reloadBasemapRef.current = null;
      draggingRef.current = null;
    };
    // styleUrl comes from config.json and does not change while the app runs.
  }, [initAttempt, transformStyle]);

  // ---- Keep the route, markers and distance tag in step -----------------
  const startLat = start?.latitude;
  const startLon = start?.longitude;
  const endLat = end?.latitude;
  const endLon = end?.longitude;
  useEffect(() => {
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!map || !markers || styleRevision === 0) return;
    map.getSource(ROUTE_SOURCE)?.setData(routeFeatureCollection(points));

    const show = (key, position) => {
      const marker = markers[key];
      if (!position) {
        marker.remove();
        markers.onMap.delete(key);
        return;
      }
      if (draggingRef.current !== key) marker.setLngLat(position);
      if (!markers.onMap.has(key)) {
        marker.addTo(map);
        markers.onMap.add(key);
      }
    };
    show("start", start ? markerPosition(start) : null);
    show("end", end ? markerPosition(end) : null);
    markers.distance.getElement().textContent = distanceLabel ?? "";
    show("distance", distanceLabel ? routeMidpoint(points) : null);
    // start and end are new objects on every render; their coordinates are
    // the real dependencies.
  }, [startLat, startLon, endLat, endLon, points, distanceLabel, styleRevision]);

  // ---- Language: map labels, canvas and marker names --------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;
    map.getCanvas().setAttribute("aria-label", labels.mapCanvas);
    const markers = markersRef.current;
    markers?.start.getElement().setAttribute("aria-label", labels.markerStart);
    markers?.end.getElement().setAttribute("aria-label", labels.markerEnd);
    if (!basemapRef.current.remote) return;
    for (const id of basemapRef.current.localizedLayers) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "text-field", localizedNameExpression(language));
    }
  }, [language, labels, styleRevision]);

  // ---- Picking: no double-click zoom while points are being placed -------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return undefined;
    if (activeTarget) {
      map.doubleClickZoom.disable();
      return undefined;
    }
    // Re-enabled a moment later, so the second click of the double click
    // that placed the last point does not zoom the map.
    const timer = window.setTimeout(() => map.doubleClickZoom.enable(), 500);
    return () => window.clearTimeout(timer);
  }, [activeTarget, status]);

  // ---- Explicit fit requests (examples, Enter in the form) ---------------
  useEffect(() => {
    if (fitRequestRef.current === fitRequest || status !== "ready") return;
    fitRequestRef.current = fitRequest;
    focusMeasurement();
  }, [fitRequest, status, focusMeasurement]);

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

  return { containerRef, cursorRef, status, basemap, retry, zoomIn, zoomOut, focusMeasurement, resetView };
}
