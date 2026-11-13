// Satellite imagery for the plate carrée map. The ArcGIS export endpoint
// renders any WGS 84 bounding box in EPSG:4326, so an image lines up with the
// SVG frame (x = longitude, y = -latitude) without reprojection.

import { worldCopies } from "./svg-geometry.js";

const round = (value) => Number(value.toFixed(6));

/**
 * The images that cover a frame: one per world copy it touches, clipped to
 * that copy's longitudes and to the poles. Each gives the SVG rectangle it
 * fills and the bounding box (west, south, east, north) and pixel size to ask
 * the server for, at most maxSize pixels on a side.
 *
 * @param {{ x: number, y: number, width: number, height: number }} frame
 * @param {number} pixelWidth width of the map on screen in CSS pixels
 * @param {{ maxSize?: number, pixelRatio?: number }} [options]
 */
export function imageryRequests(frame, pixelWidth, { maxSize = 4096, pixelRatio = 1 } = {}) {
  if (!(pixelWidth > 0) || !(frame.width > 0)) return [];
  const pixelsPerDegree = (pixelWidth * pixelRatio) / frame.width;
  const top = round(Math.max(frame.y, -90));
  const bottom = round(Math.min(frame.y + frame.height, 90));
  if (bottom <= top) return [];
  const requests = [];
  for (const offset of worldCopies(frame)) {
    const left = round(Math.max(frame.x, offset - 180));
    const right = round(Math.min(frame.x + frame.width, offset + 180));
    if (right <= left) continue;
    const width = (right - left) * pixelsPerDegree;
    const height = (bottom - top) * pixelsPerDegree;
    const shrink = Math.min(1, maxSize / Math.max(width, height));
    requests.push({
      x: left,
      y: top,
      width: round(right - left),
      height: round(bottom - top),
      bbox: [round(left - offset), round(-bottom), round(right - offset), round(-top)],
      size: [Math.max(1, Math.round(width * shrink)), Math.max(1, Math.round(height * shrink))],
    });
  }
  return requests;
}

/** The export URL of one request from imageryRequests. */
export function imageryUrl(exportUrl, request) {
  const query = new URLSearchParams({
    bbox: request.bbox.join(","),
    bboxSR: "4326",
    imageSR: "4326",
    size: request.size.join(","),
    format: "jpg",
    f: "image",
  });
  return `${exportUrl}?${query}`;
}
