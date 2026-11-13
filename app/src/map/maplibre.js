// The only module that loads MapLibre GL JS. The library is a separate chunk,
// fetched when the distance tool opens (or when its tab is pointed at), so the
// other tools never download it.
//
// webpack.config.js copies MapLibre's stylesheet and worker to vendor/, so
// both come from the app's own origin: the Content-Security-Policy needs no
// blob: workers and no inline scripts.

const STYLESHEET = "vendor/maplibre-gl.css";
const WORKER = "vendor/maplibre-gl-worker.mjs";

let loading = null;

function loadStylesheet() {
  const href = new URL(STYLESHEET, document.baseURI).href;
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    if (link.href === href) return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove();
      reject(new Error(`${STYLESHEET} could not be loaded.`));
    };
    // First in <head>: Emotion's <style> elements follow it and win where a
    // selector has the same specificity.
    document.head.prepend(link);
  });
}

/** MapLibre GL JS 5+ draws with WebGL 2 only. */
export function webgl2Available() {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

/**
 * Resolves to the maplibregl namespace, with its stylesheet applied and its
 * worker URL set. A failed load is not cached, so a retry fetches again.
 */
export function loadMapLibre() {
  if (loading == null) {
    loading = Promise.all([import("maplibre-gl"), loadStylesheet()]).then(([module]) => {
      const maplibregl = module.default ?? module;
      maplibregl.setWorkerUrl(new URL(WORKER, document.baseURI).href);
      return maplibregl;
    });
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** Starts the download early; errors surface when the map really loads. */
export function prefetchMapLibre() {
  loadMapLibre().catch(() => {});
}
