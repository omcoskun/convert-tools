// The kinds of coordinate system the CRS tool offers, shared with the
// reference page. Pure: no React, no DOM.

/**
 * The systems of the source and target selects. A fixed code, a UTM family
 * (base + zone) or a code typed in a text field ("custom").
 * @type {ReadonlyArray<{ id: string, code?: string, base?: number }>}
 */
export const CRS_KINDS = Object.freeze([
  { id: "geographic", code: "EPSG:4326" },
  { id: "webMercator", code: "EPSG:3857" },
  { id: "utmNorth", base: 32600 },
  { id: "utmSouth", base: 32700 },
  { id: "upsNorth", code: "EPSG:5041" },
  { id: "upsSouth", code: "EPSG:5042" },
  { id: "custom" },
]);
