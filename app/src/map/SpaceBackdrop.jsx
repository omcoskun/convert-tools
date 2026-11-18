import { useEffect, useRef } from "react";
import { STAR_LAYERS, starTile, starTransform, unwrapLongitude } from "./stars.js";

// Black space with stars that move against the camera (stars.js). The stars
// are drawn once into two repeating tiles; a camera change only refills the
// canvas with the two patterns at a new transform: three fills a frame,
// whatever the number of stars.

const SPACE = "#000";
// The camera the stars keep with prefers-reduced-motion and before the map exists.
const STILL = Object.freeze({ longitude: 0, latitude: 0, bearing: 0, pitch: 0, globe: true });
// Radius in CSS px of a bright star's halo.
const GLOW = 6;
const STAR_RGB = "220, 230, 255";
const WARM_RGB = "255, 226, 194";

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * One tile of `layer`'s stars at about `ratio` device px per CSS px. Stars
 * near an edge are drawn again across it, so the tile repeats seamlessly.
 * Returns the canvas and its period in CSS px (the tile is a whole number of
 * device px, so the period may differ from layer.size by a fraction).
 */
function renderTile(layer, ratio) {
  const pixels = Math.round(layer.size * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const scale = pixels / layer.size;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  for (const star of starTile(layer)) {
    const margin = star.glow ? GLOW : star.radius + 1;
    for (const dx of [-layer.size, 0, layer.size]) {
      for (const dy of [-layer.size, 0, layer.size]) {
        const x = star.x + dx;
        const y = star.y + dy;
        if (x < -margin || y < -margin || x > layer.size + margin || y > layer.size + margin) continue;
        if (star.glow) {
          const halo = context.createRadialGradient(x, y, 0, x, y, GLOW);
          halo.addColorStop(0, "rgba(170, 200, 255, 0.2)");
          halo.addColorStop(1, "rgba(170, 200, 255, 0)");
          context.fillStyle = halo;
          context.fillRect(x - GLOW, y - GLOW, GLOW * 2, GLOW * 2);
        }
        context.beginPath();
        context.arc(x, y, star.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${star.warm ? WARM_RGB : STAR_RGB}, ${star.alpha})`;
        context.fill();
      }
    }
  }
  return { canvas, period: pixels / ratio };
}

/**
 * The space behind the globe. Redrawn when the camera moves (subscribeView),
 * the stage is resized or the map has loaded; not while the flat 2D map,
 * which never shows space, is drawn.
 * @param {{
 *   subscribeView: (listener: () => void) => () => void,
 *   readCamera: () => ({ longitude: number, latitude: number, bearing: number, pitch: number, globe: boolean } | null),
 *   loaded: boolean,
 * }} props
 */
export default function SpaceBackdrop({ subscribeView, readCamera, loaded }) {
  const ref = useRef(null);
  const drawRef = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    // Opaque: every draw fills the whole canvas, so the page composites it cheaply.
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return undefined;
    let size = canvas.getBoundingClientRect();
    let tiles = null;
    let drawn = "";
    let unwrapped = null;
    let longitude = 0;

    function patterns(ratio) {
      if (tiles?.ratio === ratio) return tiles.layers;
      const layers = [];
      for (const layer of STAR_LAYERS) {
        const tile = renderTile(layer, ratio);
        const pattern = tile && context.createPattern(tile.canvas, "repeat");
        if (pattern) layers.push({ pattern, period: tile.period });
      }
      tiles = { ratio, layers };
      return layers;
    }

    function draw() {
      const { width, height } = size;
      if (!width || !height) return;
      const view = readCamera() ?? STILL;
      if (!view.globe && drawn) return;
      // The camera's longitude, continuous across ±180°.
      unwrapped = unwrapped === null ? view.longitude : unwrapLongitude(unwrapped, longitude, view.longitude);
      longitude = view.longitude;
      const shown = reducedMotion() ? STILL : { ...view, longitude: unwrapped };
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      // A zoom alone, or a repeated notice, leaves the stars where they are.
      const key = [pixelWidth, pixelHeight, ratio, shown.longitude, shown.latitude, shown.bearing, shown.pitch].join();
      if (key === drawn) return;
      drawn = key;
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = SPACE;
      context.fillRect(0, 0, pixelWidth, pixelHeight);
      for (const { pattern, period } of patterns(ratio)) {
        pattern.setTransform(new window.DOMMatrix(starTransform(shown, { width, height, ratio, size: period })));
        context.fillStyle = pattern;
        context.fillRect(0, 0, pixelWidth, pixelHeight);
      }
    }

    drawRef.current = draw;
    draw();
    const unsubscribe = subscribeView(draw);
    const observer = new ResizeObserver(([entry]) => {
      size = entry.contentRect;
      draw();
    });
    observer.observe(canvas);
    return () => {
      drawRef.current = null;
      unsubscribe();
      observer.disconnect();
    };
  }, [subscribeView, readCamera]);
  // The first camera of the map, if it was set without a move.
  useEffect(() => drawRef.current?.(), [loaded]);
  return <canvas ref={ref} className="map-space" aria-hidden="true" />;
}
