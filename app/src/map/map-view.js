// Camera geometry shared by the controls and MapLibre's transform constraint.
// The globe's pixel radius grows as 1/cos(latitude), clamped at the Mercator
// edge by MapLibre. Invert the perspective silhouette radius, not the local
// pixels-per-degree scale: the latter makes the fitted globe too small.
// The flat (2D) world is never shorter than the whole map, widgets included,
// so no space shows above or below it; sideways it repeats.
export function worldMinZoom({ width, height, latitude = 0, mode = "3d", padding = {}, fov = 36.86989764584402 }) {
  if (mode === "2d") return Math.max(-2, Math.min(20, Math.log2(Math.max(1, height) / 512)));
  const freeWidth = Math.max(1, width - (padding.left ?? 0) - (padding.right ?? 0));
  const freeHeight = Math.max(1, height - (padding.top ?? 0) - (padding.bottom ?? 0));
  const diameter = 0.9 * Math.min(freeWidth, freeHeight);
  const distance = Math.max(1, height) / (2 * Math.tan(fov * Math.PI / 360));
  const apparentRadius = diameter / 2;
  const ratio = apparentRadius / distance;
  const radius = apparentRadius * (ratio + Math.sqrt(1 + ratio * ratio));
  const latitudeScale = Math.cos(Math.min(85.0511287798066, Math.abs(latitude)) * Math.PI / 180);
  return Math.max(-2, Math.min(20, Math.log2(radius * 2 * Math.PI * latitudeScale / 512)));
}

/**
 * The centre latitude of the flat map nearest `latitude` (within ±85.05°) at
 * which the world, 512 · 2^zoom px tall, covers the whole map height, so the
 * space behind it never shows. MapLibre draws the centre in the middle of the
 * padded area, `top + (height - top - bottom) / 2` px below the map's top. A
 * world shorter than the map stays centred.
 * @param {number} latitude
 * @param {number} zoom
 * @param {{ height: number, padding?: { top?: number, bottom?: number } }} viewport
 */
export function flatLatitude(latitude, zoom, { height, padding = {} }) {
  const worldSize = 512 * 2 ** zoom;
  const top = padding.top ?? 0;
  const above = top + (height - top - (padding.bottom ?? 0)) / 2;
  const lowest = above;
  const highest = worldSize - (height - above);
  const sine = Math.sin(latitude * Math.PI / 180);
  const y = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * worldSize;
  const clamped = lowest <= highest ? Math.max(lowest, Math.min(highest, y)) : (lowest + highest) / 2;
  if (clamped === y) return latitude;
  return (360 / Math.PI) * Math.atan(Math.exp(Math.PI * (1 - (2 * clamped) / worldSize))) - 90;
}

export const SPACE_SKY = {
  "sky-color": "#000000",
  "horizon-color": "#a5c9ed",
  "fog-color": "#d7e5f0",
  "sky-horizon-blend": 0.7,
  "horizon-fog-blend": 0.5,
  "fog-ground-blend": 0.15,
  "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 4, 0.8, 7, 0],
};
