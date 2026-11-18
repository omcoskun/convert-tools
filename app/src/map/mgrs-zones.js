// The MGRS grid zones (UTM zone number + latitude band, "35T") as an overlay
// of the layer panel: 6° by 8° cells from 80°S to 84°N, the X band 12° tall,
// with the exceptions of the standard: around Norway band V gives zone 31
// 0–3°E and zone 32 3–12°E; around Svalbard band X has zones 31 (0–9°E),
// 33 (9–21°E), 35 (21–33°E) and 37 (33–42°E) and no 32, 34 or 36. The polar
// UPS areas are left out. Pure: tested against the core's encodeMgrs in
// test/mgrs-zones.test.mjs.

const BANDS = "CDEFGHJKLMNPQRSTUVWX";
const SOUTH_EDGE = -80;

/**
 * @typedef {{ zone: number, band: string, label: string, west: number, south: number, east: number, north: number }} ZoneCell
 */

/** Every grid zone cell, by band from the south, then by zone from the west. */
export function mgrsZoneCells() {
  /** @type {ZoneCell[]} */
  const cells = [];
  for (let index = 0; index < BANDS.length; index += 1) {
    const band = BANDS[index];
    const south = SOUTH_EDGE + 8 * index;
    const north = band === "X" ? 84 : south + 8;
    for (let zone = 1; zone <= 60; zone += 1) {
      let west = -180 + 6 * (zone - 1);
      let east = west + 6;
      if (band === "V" && zone === 31) east = 3;
      if (band === "V" && zone === 32) west = 3;
      if (band === "X") {
        if (zone === 32 || zone === 34 || zone === 36) continue;
        if (zone === 31) east = 9;
        if (zone === 33) [west, east] = [9, 21];
        if (zone === 35) [west, east] = [21, 33];
        if (zone === 37) west = 33;
      }
      cells.push({ zone, band, label: `${zone}${band}`, west, south, east, north });
    }
  }
  return cells;
}

/**
 * The cells as GeoJSON: each cell's outline (a vertex every degree, so the
 * edges follow the globe's curve) and a label point at its centre.
 * @returns {{ type: "FeatureCollection", features: object[] }}
 */
export function mgrsZoneFeatures() {
  const features = [];
  for (const cell of mgrsZoneCells()) {
    const { west, south, east, north, label } = cell;
    const ring = [];
    for (let longitude = west; longitude < east; longitude += 1) ring.push([longitude, south]);
    for (let latitude = south; latitude < north; latitude += 1) ring.push([east, latitude]);
    for (let longitude = east; longitude > west; longitude -= 1) ring.push([longitude, north]);
    for (let latitude = north; latitude > south; latitude -= 1) ring.push([west, latitude]);
    ring.push([west, south]);
    features.push({ type: "Feature", properties: { kind: "zone", label }, geometry: { type: "LineString", coordinates: ring } });
    features.push({
      type: "Feature",
      properties: { kind: "label", label },
      geometry: { type: "Point", coordinates: [(west + east) / 2, (south + north) / 2] },
    });
  }
  return { type: "FeatureCollection", features };
}
