import { useEffect, useState } from "react";
import { geoJsonLinesPath } from "./svg-geometry.js";

const cache = new Map();

function loadOnce(boundariesUrl, labelsUrl) {
  const key = `${boundariesUrl}\n${labelsUrl}`;
  if (!cache.has(key)) {
    const fetchJson = (url) =>
      fetch(new URL(url, document.baseURI)).then((response) => {
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        return response.json();
      });
    const promise = Promise.all([fetchJson(boundariesUrl), fetchJson(labelsUrl)]).then(([boundaries, labels]) => ({
      boundariesPath: geoJsonLinesPath(boundaries),
      labels,
    }));
    // A failed load may be retried on the next mount.
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return cache.get(key);
}

/** Fetches the local Natural Earth files once; { status, data }. */
export function useMapData({ boundaries, labels }) {
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    let active = true;
    loadOnce(boundaries, labels).then(
      (data) => active && setState({ status: "ready", data }),
      () => active && setState({ status: "error", data: null }),
    );
    return () => {
      active = false;
    };
  }, [boundaries, labels]);
  return state;
}
