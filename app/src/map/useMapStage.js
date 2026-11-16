import { useCallback, useEffect, useRef, useState } from "react";
import {
  LINE_COLORS,
  PIN_SHAPE,
  WORLD_BOUNDS,
  constrainView,
  coordinateFromLngLat,
  decimalsForResolution,
  fallbackStyle,
  isLocalizedLabelLayer,
  isSinglePoint,
  localizedNameExpression,
  routeMidpoint,
  tuneBasemapStyle,
} from "./map-adapter.js";
import { loadMapLibre, webgl2Available } from "./maplibre.js";
import { longitudeWithin, pinClassName, pinDisplay, sceneBounds, sceneFeatures } from "./scene.js";

// One GeoJSON source holds every line of the scene; a white casing under
// all of them, then ink lines and A -> B gradient lines.
const LINE_SOURCE = "convert-lines";
const CASING_LAYER = "convert-lines-casing";
const PLAIN_LAYER = "convert-lines-plain";
const GRADIENT_LAYER = "convert-lines-gradient";
const EMPTY_LINES = Object.freeze({ type: "FeatureCollection", features: Object.freeze([]) });

const STYLE_TIMEOUT_MS = 15000;
const TILE_ERROR_THRESHOLD = 3;
const DOUBLE_CLICK_GUARD_MS = 450;
const DOUBLE_CLICK_GUARD_PX = 10;
// The pointer readout shows about one metre.
const CURSOR_DECIMALS = 5;
// The view of an empty scene: the whole inhabited world.
const START_VIEW = Object.freeze({ center: [24, 30], zoom: 1.6 });
const ZOOM_RANGE = Object.freeze({ minZoom: 0, maxZoom: 20 });

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const animation = (ms) => (reducedMotion() ? 0 : ms);
const lineWidth = (low, high) => ["interpolate", ["linear"], ["zoom"], 1, low, 12, high];

/** Decimals that resolve one screen pixel at the current zoom. */
function pickDecimals(map) {
  const left = map.unproject([0, 0]);
  const right = map.unproject([1, 0]);
  return decimalsForResolution(Math.abs(right.lng - left.lng));
}

// A pin is anchored at its tip: the element's bottom edge is moved down by
// half the tip dot, so the dot's centre is on the coordinate.
const PIN_OFFSET = [0, PIN_SHAPE.dot / 2];

// A needle pin (MapStage draws the parts): the head with the label, the
// needle, the tip dot on the coordinate, a halo around the tip while it is
// hovered or dragged, and a chevron beside the tip for a pin clamped to the
// map's edge.
function createPinElement() {
  const element = document.createElement("div");
  // An image named by the pin's title, so screen readers announce its aria-label
  // (moving a pin by keyboard is "Yeniden seç" plus keyboard picking on the map).
  element.setAttribute("role", "img");
  for (const part of ["halo", "needle", "dot", "edge", "head"]) {
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
      paint: { "line-color": "#ffffff", "line-opacity": 0.95, "line-width": lineWidth(6, 10) },
    });
  }
  if (!map.getLayer(PLAIN_LAYER)) {
    map.addLayer({
      id: PLAIN_LAYER,
      type: "line",
      source: LINE_SOURCE,
      filter: ["!=", ["get", "gradient"], true],
      layout,
      paint: { "line-color": LINE_COLORS.ink, "line-width": lineWidth(3, 5) },
    });
  }
  if (!map.getLayer(GRADIENT_LAYER)) {
    map.addLayer({
      id: GRADIENT_LAYER,
      type: "line",
      source: LINE_SOURCE,
      filter: ["==", ["get", "gradient"], true],
      layout,
      paint: {
        "line-width": lineWidth(3, 5),
        // The colour runs from A to B, so the direction reads on the map.
        "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, LINE_COLORS.a, 1, LINE_COLORS.b],
      },
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
  const dragRef = useRef({ id: null, frame: 0, pending: null });
  const latestRef = useRef(null);
  const basemapRef = useRef({ remote: true, styleLoaded: false, tileErrors: 0, localizedLayers: [] });
  const reloadBasemapRef = useRef(null);
  const fitSeenRef = useRef({ owner, fitRequest: scene.fitRequest });
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
    if (isSinglePoint(bounds)) {
      // One point: centre it in the part of the map the widgets leave free.
      map.easeTo({
        center: bounds[0],
        zoom: Math.max(map.getZoom(), 12),
        offset: [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2],
        duration: animate ? animation(600) : 0,
      });
      return;
    }
    map.fitBounds(bounds, { padding, maxZoom: 15, duration: animate ? animation(700) : 0 });
    map.once("moveend", () => placePinsOnRef.current?.());
  }, []);

  const showWorld = useCallback(() => {
    const map = mapRef.current;
    if (map) map.fitBounds(WORLD_BOUNDS, { padding: latestRef.current.getPadding(), duration: animation(700) });
  }, []);

  const zoomBy = useCallback((delta) => {
    const map = mapRef.current;
    if (map) map.easeTo({ zoom: map.getZoom() + delta, duration: animation(250) });
  }, []);

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
          // The centre may reach the Mercator edge, so pins drawn there can be
          // fitted below the glass top bar (see constrainView).
          transformConstrain: (lngLat, zoom) => {
            const view = constrainView(lngLat, zoom, ZOOM_RANGE);
            return { center: new maplibregl.LngLat(view.longitude, view.latitude), zoom: view.zoom };
          },
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
      libraryRef.current = maplibregl;
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
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
        if (event.originalEvent) userMoved = true;
      });
      map.once("load", () => {
        if (!userMoved && initialBounds) fitScene(false);
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
        installLineLayers(map);
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
        pick(event.lngLat);
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
      const drag = dragRef.current;
      if (drag.frame) cancelAnimationFrame(drag.frame);
      dragRef.current = { id: null, frame: 0, pending: null };
      removeCanvasListeners?.();
      for (const entry of pins.values()) entry.marker.remove();
      for (const marker of tags.values()) marker.remove();
      pins.clear();
      tags.clear();
      map?.remove();
      mapRef.current = null;
      libraryRef.current = null;
      reloadBasemapRef.current = null;
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

  // A pin's map position: its drawn latitude, on the copy of the world its
  // line is drawn on.
  const pinLngLat = useCallback((pin, bounds) => {
    const { longitude, latitude } = pinDisplay(pin);
    return [bounds ? longitudeWithin(longitude, bounds) : longitude, latitude];
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
  }, [scenePins, styleRevision, createPinEntry, pinLngLat]);

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
    map.getSource(LINE_SOURCE)?.setData(sceneFeatures({ lines }));
    const tags = tagsRef.current;
    const present = new Set();
    for (const line of lines) {
      const midpoint = line.tag ? routeMidpoint(line.points) : null;
      if (!midpoint) continue;
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
  }, [lines, styleRevision]);

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

  return { containerRef, cursorRef, status, basemap, retry, zoomIn, zoomOut, fitScene, showWorld };
}
