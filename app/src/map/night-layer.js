// The live night side of the satellite map, as Apple Maps draws it: the
// half of the Earth where the sun has set is dark, with NASA's Black Marble
// city lights, and a soft twilight band runs along the day-night line.
//
// One Web Mercator world image on a canvas: a dark veil with the lights over
// it, cut to the night side by the mask of night.js. MapLibre draws it as a
// raster tile layer right above the imagery (under boundaries and names),
// its tiles cut from the canvas by a custom protocol: a tile source, unlike
// a canvas or image source, also covers the globe's pole caps.
// NIGHT_OPACITY fades it out by city zooms. It is redrawn when the lights
// arrive, every few minutes and when the page is shown again, never per
// frame. Browser only: nothing here runs at import time.

import { NIGHT_LAYER, NIGHT_OPACITY, NIGHT_SOURCE } from "./basemaps.js";
import { nightMask } from "./night.js";

const PROTOCOL = "convert-night";
const TILE = 256;
const SIZE = 2048;
// The canvas holds 2048 px of world: tiles of zoom 3 are 256 px of it; the
// map stretches them beyond, where the layer is fading out anyway.
const MAX_ZOOM = 3;
const MASK_SIZE = 256;
const REDRAW_MS = 5 * 60 * 1000;
// Where a lights tile is missing the night side is still dark.
const VEIL = "rgb(4, 9, 22)";

function canvasOf(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/**
 * @param {{ lights: string, zoom: number }} night the lights tile template
 *   ({z}/{y}/{x}) and the zoom whose tiles cover the world image
 * @param {{ addProtocol(name: string, load: Function): void }} maplibregl
 * @returns {{ attach(map: object, beforeId?: string): void, detach(): void }}
 */
export function createNightLayer({ lights, zoom }, maplibregl) {
  const canvas = canvasOf(SIZE);
  const lightsCanvas = canvasOf(SIZE);
  const maskCanvas = canvasOf(MASK_SIZE);
  let map = null;
  let timer = 0;
  let lightsLoading = null;
  // Changes with every redraw, so the map asks for the tiles again.
  let revision = 0;
  const template = () => `${PROTOCOL}://${revision}/{z}/{x}/{y}`;

  // A tile is its square of the canvas, as drawn when it is asked for.
  maplibregl.addProtocol(PROTOCOL, async ({ url }) => {
    const [z, x, y] = url.slice(PROTOCOL.length + 3).split("/").slice(1).map(Number);
    const span = SIZE / (1 << z);
    return { data: await window.createImageBitmap(canvas, x * span, y * span, span, span, { resizeWidth: TILE, resizeHeight: TILE }) };
  });

  function push() {
    revision += 1;
    map?.getSource(NIGHT_SOURCE)?.setTiles([template()]);
  }

  function draw() {
    const mask = nightMask(new Date(), MASK_SIZE);
    const maskContext = maskCanvas.getContext("2d");
    const pixels = maskContext.createImageData(MASK_SIZE, MASK_SIZE);
    for (let index = 0; index < mask.length; index += 1) pixels.data[index * 4 + 3] = Math.round(mask[index] * 255);
    maskContext.putImageData(pixels, 0, 0);

    const context = canvas.getContext("2d");
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, SIZE, SIZE);
    context.fillStyle = VEIL;
    context.fillRect(0, 0, SIZE, SIZE);
    context.drawImage(lightsCanvas, 0, 0);
    // Keep only the night side, with the mask's soft edge scaled up.
    context.globalCompositeOperation = "destination-in";
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(maskCanvas, 0, 0, SIZE, SIZE);
    context.globalCompositeOperation = "source-over";
    push();
  }

  function loadLights() {
    const count = 1 << zoom;
    const tile = SIZE / count;
    const context = lightsCanvas.getContext("2d");
    const loads = [];
    for (let y = 0; y < count; y += 1) {
      for (let x = 0; x < count; x += 1) {
        loads.push(
          new Promise((resolve) => {
            const image = new Image();
            // GIBS sends Access-Control-Allow-Origin: *, so the canvas stays
            // readable by WebGL.
            image.crossOrigin = "anonymous";
            image.decoding = "async";
            image.onload = () => {
              context.drawImage(image, x * tile, y * tile, tile, tile);
              resolve();
            };
            // A missing tile leaves its square to the veil.
            image.onerror = () => resolve();
            image.src = lights.replace("{z}", String(zoom)).replace("{y}", String(y)).replace("{x}", String(x));
          }),
        );
      }
    }
    return Promise.all(loads).then(() => {
      if (map) draw();
    });
  }

  const onVisibility = () => {
    if (map && document.visibilityState === "visible") draw();
  };

  return {
    attach(next, beforeId) {
      map = next;
      draw();
      if (!map.getSource(NIGHT_SOURCE)) {
        map.addSource(NIGHT_SOURCE, { type: "raster", tiles: [template()], tileSize: TILE, maxzoom: MAX_ZOOM });
      }
      if (!map.getLayer(NIGHT_LAYER)) {
        map.addLayer(
          { id: NIGHT_LAYER, type: "raster", source: NIGHT_SOURCE, paint: { "raster-opacity": NIGHT_OPACITY, "raster-fade-duration": 0 } },
          beforeId && map.getLayer(beforeId) ? beforeId : undefined,
        );
      }
      if (!timer) {
        timer = window.setInterval(() => {
          if (document.visibilityState === "visible") draw();
        }, REDRAW_MS);
        document.addEventListener("visibilitychange", onVisibility);
      }
      lightsLoading ??= loadLights();
    },

    /** Stops the redraws; the style that replaced the satellite one already dropped the layer. */
    detach() {
      if (timer) {
        window.clearInterval(timer);
        timer = 0;
        document.removeEventListener("visibilitychange", onVisibility);
      }
      map = null;
    },
  };
}
