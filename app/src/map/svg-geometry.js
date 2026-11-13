// Drawing helpers for the dependency-free SVG map.
//
// The map is a plain equirectangular (plate carrée) picture: SVG x is
// longitude and SVG y is minus latitude, both in degrees. Nothing here
// measures anything; the geodesic and its distance come from
// @convert-tools/core. These functions only place already-computed points on
// screen.

const WORLD_HEIGHT = 180;

function svgNumber(value, digits) {
  return Number(value.toFixed(digits)).toString();
}

/**
 * Shifts longitudes by whole turns so consecutive vertices never jump more
 * than 180° (a line across the antimeridian stays continuous on screen).
 * @param {readonly { latitude: number, longitude: number }[]} points
 * @returns {{ x: number, y: number }[]}
 */
export function unwrapPoints(points) {
  const result = [];
  let previous = null;
  for (const point of points) {
    let x = point.longitude;
    if (previous != null) {
      while (x - previous > 180) x -= 360;
      while (x - previous < -180) x += 360;
    }
    result.push({ x, y: -point.latitude });
    previous = x;
  }
  return result;
}

/** SVG path data for a polyline of {x, y} points. */
export function polylinePath(points, digits = 6) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${svgNumber(point.x, digits)} ${svgNumber(point.y, digits)}`)
    .join("");
}

/**
 * SVG path data for the LineString and MultiLineString features of a GeoJSON
 * FeatureCollection ([longitude, latitude] positions).
 */
export function geoJsonLinesPath(collection, digits = 4) {
  const parts = [];
  for (const feature of collection.features) {
    const geometry = feature.geometry;
    if (geometry == null) continue;
    const lines =
      geometry.type === "LineString"
        ? [geometry.coordinates]
        : geometry.type === "MultiLineString"
          ? geometry.coordinates
          : [];
    for (const line of lines) {
      if (line.length < 2) continue;
      parts.push(polylinePath(line.map(([x, y]) => ({ x, y: -y })), digits));
    }
  }
  return parts.join("");
}

/**
 * The viewBox that shows the given points with some margin, at the given
 * width:height aspect ratio, never taller than the world and kept inside the
 * poles where possible.
 * @param {readonly { x: number, y: number }[]} points
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function frameAround(points, { aspect = 2, margin = 0.15, minimumHeight = 12 } = {}) {
  if (points.length === 0) return { x: -180, y: -90, width: 360, height: WORLD_HEIGHT };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  let height = Math.max(spanY * (1 + 2 * margin), (spanX * (1 + 2 * margin)) / aspect, minimumHeight);
  height = Math.min(height, WORLD_HEIGHT);
  const width = height * aspect;
  const centreX = (minX + maxX) / 2;
  // Keep the frame within the poles, plus the margin so a route along a
  // pole-side edge is not drawn on the border.
  const pad = height * margin;
  let y = (minY + maxY) / 2 - height / 2;
  y = Math.min(Math.max(y, -90 - pad), 90 + pad - height);
  return { x: centreX - width / 2, y, width, height };
}

/** Whole-turn offsets (…, -360, 0, 360, …) of the world copies a frame touches. */
export function worldCopies(frame) {
  const first = Math.floor((frame.x + 180) / 360);
  const last = Math.floor((frame.x + frame.width + 180) / 360);
  const offsets = [];
  for (let turn = first; turn <= last; turn += 1) offsets.push(turn * 360);
  return offsets;
}

/**
 * Label points of a GeoJSON FeatureCollection that fall inside the frame,
 * repeated for each world copy, best-ranked first. A label is skipped when it
 * would sit closer than an eighth of the frame width and a twelfth of its
 * height to one already placed, so large frames do not pile names up.
 * @returns {{ key: string, name: string, kind: string, x: number, y: number }[]}
 */
export function labelsInFrame(collection, frame, limit = 30) {
  const spacingX = frame.width / 8;
  const spacingY = frame.height / 12;
  const found = [];
  const offsets = worldCopies(frame);
  const kindOrder = (kind) => (kind === "country" ? 0 : 1);
  const sorted = collection.features
    .filter((feature) => feature.geometry && feature.geometry.type === "Point")
    .slice()
    .sort(
      (a, b) =>
        kindOrder(a.properties.kind) - kindOrder(b.properties.kind) ||
        a.properties.rank - b.properties.rank,
    );
  sorted.forEach((feature, index) => {
    if (found.length >= limit) return;
    const [longitude, latitude] = feature.geometry.coordinates;
    for (const offset of offsets) {
      const x = longitude + offset;
      const y = -latitude;
      const inside = x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height;
      const crowded = found.some((other) => Math.abs(other.x - x) < spacingX && Math.abs(other.y - y) < spacingY);
      if (inside && !crowded) {
        found.push({ key: `${index}@${offset}`, name: feature.properties.name, kind: feature.properties.kind, x, y });
      }
    }
  });
  return found.slice(0, limit);
}
