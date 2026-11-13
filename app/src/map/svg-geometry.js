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
 * Moves a frame vertically so it stays within the poles plus a margin of its
 * own height (a route along a pole-side edge is then not drawn on the border).
 */
export function clampFrameY(frame, margin = 0.15) {
  const pad = frame.height * margin;
  const y = Math.min(Math.max(frame.y, -90 - pad), 90 + pad - frame.height);
  return { ...frame, y };
}

/**
 * The viewBox that shows the given points with some margin, at the given
 * width:height aspect ratio, never taller than the world and kept inside the
 * poles where possible.
 * @param {readonly { x: number, y: number }[]} points
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function frameAround(points, { aspect = 2, margin = 0.15, minimumHeight = 12 } = {}) {
  if (points.length === 0) return worldFrame(0, aspect);
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
  const y = (minY + maxY) / 2 - height / 2;
  return clampFrameY({ x: centreX - width / 2, y, width, height }, margin);
}

/** The whole pole-to-pole band at the given aspect ratio, centred on centreX. */
export function worldFrame(centreX, aspect = 2) {
  return { x: centreX - (WORLD_HEIGHT * aspect) / 2, y: -WORLD_HEIGHT / 2, width: WORLD_HEIGHT * aspect, height: WORLD_HEIGHT };
}

/** Smallest frame height the zoom buttons go to, in degrees of latitude. */
export const MINIMUM_FRAME_HEIGHT = 0.5;

/**
 * Zooms a frame about its centre: factor < 1 zooms in, > 1 out. The height
 * stays between MINIMUM_FRAME_HEIGHT and the whole world; the aspect ratio is
 * kept.
 */
export function zoomFrame(frame, factor) {
  const aspect = frame.width / frame.height;
  const height = Math.min(Math.max(frame.height * factor, MINIMUM_FRAME_HEIGHT), WORLD_HEIGHT);
  const width = height * aspect;
  const centreX = frame.x + frame.width / 2;
  const centreY = frame.y + frame.height / 2;
  return clampFrameY({ x: centreX - width / 2, y: centreY - height / 2, width, height });
}

/** Moves a frame by (dx, dy) map units; it wraps freely east-west but not past the poles. */
export function panFrame(frame, dx, dy) {
  return clampFrameY({ ...frame, x: frame.x + dx, y: frame.y + dy });
}

/** The x of a longitude on the world copy closest to centreX. */
export function nearestCopy(longitude, centreX) {
  return longitude + 360 * Math.round((centreX - longitude) / 360);
}

/**
 * The map point under an SVG coordinate, or null off the globe (beyond a
 * pole). Longitude is wrapped into [-180, 180).
 */
export function pickedPoint(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || y < -90 || y > 90) return null;
  const longitude = ((((x + 180) % 360) + 360) % 360) - 180;
  return { latitude: y === 0 ? 0 : -y, longitude };
}

/**
 * Decimal places worth keeping for a point picked on screen: about one
 * screen pixel, never finer than 1e-5 degrees.
 */
export function pickDigits(degreesPerPixel) {
  const steps = [1, 0.1, 0.01, 0.001, 0.0001];
  const index = steps.findIndex((step) => degreesPerPixel >= step);
  return index === -1 ? 5 : index;
}

/** A picked coordinate as form text with the given decimals, without a "-0". */
export function pickedText(value, digits) {
  const fixed = value.toFixed(digits);
  return /^-0(\.0*)?$/.test(fixed) ? fixed.slice(1) : fixed;
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
 * height to one already placed or to an avoided point (such as a route
 * marker), and when its anchor is within the inset band along the frame edge,
 * where centred text would be cut off.
 * @returns {{ key: string, name: string, kind: string, x: number, y: number }[]}
 */
export function labelsInFrame(collection, frame, { limit = 30, inset = 0, avoid = [] } = {}) {
  const spacingX = frame.width / 8;
  const spacingY = frame.height / 12;
  const left = frame.x + frame.width * inset;
  const right = frame.x + frame.width * (1 - inset);
  const top = frame.y + frame.height * inset;
  const bottom = frame.y + frame.height * (1 - inset);
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
  const near = (other, x, y) => Math.abs(other.x - x) < spacingX && Math.abs(other.y - y) < spacingY;
  sorted.forEach((feature, index) => {
    if (found.length >= limit) return;
    const [longitude, latitude] = feature.geometry.coordinates;
    for (const offset of offsets) {
      const x = longitude + offset;
      const y = -latitude;
      const inside = x >= left && x <= right && y >= top && y <= bottom;
      const crowded = found.some((other) => near(other, x, y)) || avoid.some((other) => near(other, x, y));
      if (inside && !crowded) {
        found.push({ key: `${index}@${offset}`, name: feature.properties.name, kind: feature.properties.kind, x, y });
      }
    }
  });
  return found.slice(0, limit);
}
