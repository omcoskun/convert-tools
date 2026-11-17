// Camera geometry shared by the controls and MapLibre's transform constraint.
// The globe's pixel radius grows as 1/cos(latitude), clamped at the Mercator
// edge by MapLibre. Invert the perspective silhouette radius, not the local
// pixels-per-degree scale: the latter makes the fitted globe too small.
export function worldMinZoom({ width, height, latitude = 0, mode = "3d", padding = {}, fov = 36.86989764584402 }) {
  const freeWidth = Math.max(1, width - (padding.left ?? 0) - (padding.right ?? 0));
  const freeHeight = Math.max(1, height - (padding.top ?? 0) - (padding.bottom ?? 0));
  const diameter = 0.9 * Math.min(freeWidth, freeHeight);
  let scale = diameter / 512;
  if (mode === "3d") {
    const distance = Math.max(1, height) / (2 * Math.tan(fov * Math.PI / 360));
    const apparentRadius = diameter / 2;
    const ratio = apparentRadius / distance;
    const radius = apparentRadius * (ratio + Math.sqrt(1 + ratio * ratio));
    const latitudeScale = Math.cos(Math.min(85.0511287798066, Math.abs(latitude)) * Math.PI / 180);
    scale = radius * 2 * Math.PI * latitudeScale / 512;
  }
  return Math.max(-2, Math.min(20, Math.log2(scale)));
}

export const SPACE_SKY = {
  "sky-color": "#080f22",
  "horizon-color": "#a5c9ed",
  "fog-color": "#d7e5f0",
  "sky-horizon-blend": 0.7,
  "horizon-fog-blend": 0.5,
  "fog-ground-blend": 0.15,
  "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 4, 0.8, 7, 0],
};
