import { DEGREE, RADIAN, WGS84 } from "../core/ellipsoid.js";
import {
  compactNumber,
  parseCoordinateNumber,
  validatePoint,
} from "../core/numbers.js";
import {
  upsForward,
  upsInverse,
  utmForward,
  utmInverse,
} from "./utm-ups.js";
import { ConvertToolsError } from "../../errors.js";

const SUPPORTED_FIXED_CODES = new Set([4326, 3857, 5041, 5042]);
const WEB_MERCATOR_MAX_LATITUDE = 85.0511287798066;

function epsgNumber(value) {
  const source = String(value).trim().toUpperCase();
  const normalized = source.startsWith("EPSG:") ? source : `EPSG:${source}`;
  const match = normalized.match(/^EPSG:(\d+)$/);
  if (!match) throw new ConvertToolsError("UNSUPPORTED_CRS", "Use an EPSG code such as EPSG:4326.");
  const number = Number(match[1]);
  const isUtmNorth = number >= 32601 && number <= 32660;
  const isUtmSouth = number >= 32701 && number <= 32760;
  if (!SUPPORTED_FIXED_CODES.has(number) && !isUtmNorth && !isUtmSouth) {
    throw new ConvertToolsError("UNSUPPORTED_CRS", `Projection definition is not available: ${normalized}.`);
  }
  return { code: normalized, number };
}

function toWgs84(definition, x, y) {
  const { number } = definition;
  if (number === 4326) return validatePoint(y, x);
  if (number === 3857) {
    const maximum = Math.PI * WGS84.a;
    if (Math.abs(x) > maximum || Math.abs(y) > maximum) {
      throw new ConvertToolsError("OUTSIDE_CRS_DOMAIN", "X or Y is outside the Web Mercator domain.");
    }
    const longitude = Math.max(
      -180,
      Math.min(180, (x / WGS84.a) * RADIAN),
    );
    const latitude =
      (2 * Math.atan(Math.exp(y / WGS84.a)) - Math.PI / 2) * RADIAN;
    return validatePoint(latitude, longitude);
  }
  if (number >= 32601 && number <= 32660) {
    return utmInverse(number - 32600, true, x, y);
  }
  if (number >= 32701 && number <= 32760) {
    return utmInverse(number - 32700, false, x, y);
  }
  return upsInverse(number === 5041, x, y);
}

function fromWgs84(definition, point) {
  const { number } = definition;
  if (number === 4326) return [point.longitude, point.latitude];
  if (number === 3857) {
    if (Math.abs(point.latitude) > WEB_MERCATOR_MAX_LATITUDE) {
      throw new ConvertToolsError("OUTSIDE_CRS_DOMAIN", "Latitude is outside the Web Mercator domain.");
    }
    const maximum = Math.PI * WGS84.a;
    const y =
      WGS84.a *
      Math.log(Math.tan(Math.PI / 4 + (point.latitude * DEGREE) / 2));
    return [
      WGS84.a * point.longitude * DEGREE,
      Math.max(-maximum, Math.min(maximum, y)),
    ];
  }
  if (number >= 32601 && number <= 32660) {
    if (point.latitude < 0) {
      throw new ConvertToolsError("OUTSIDE_UTM_DOMAIN", "A northern UTM CRS cannot encode a southern point.");
    }
    const grid = utmForward(point.latitude, point.longitude, number - 32600, true);
    return [grid.easting, grid.northing];
  }
  if (number >= 32701 && number <= 32760) {
    if (point.latitude > 0) {
      throw new ConvertToolsError("OUTSIDE_UTM_DOMAIN", "A southern UTM CRS cannot encode a northern point.");
    }
    const grid = utmForward(point.latitude, point.longitude, number - 32700, false);
    return [grid.easting, grid.northing];
  }
  const north = number === 5041;
  const grid = upsForward(point.latitude, point.longitude, north);
  return [grid.easting, grid.northing];
}

/**
 * @param {string | number} value "EPSG:4326", "4326" or 4326
 * @returns {string} "EPSG:4326"
 * @throws {import("../../errors.js").ConvertToolsError} UNSUPPORTED_CRS
 */
export function normalizeEpsg(value) {
  return epsgNumber(value).code;
}

/**
 * Transforms x/y between supported CRSs (see SUPPORTED_CRS). Geographic
 * input is x = longitude, y = latitude.
 * @param {string | number} sourceValue
 * @param {string | number} targetValue
 * @param {string | number} xValue
 * @param {string | number} yValue
 * @returns {import("../../types.js").CrsTransformResult}
 * @throws {import("../../errors.js").ConvertToolsError} UNSUPPORTED_CRS,
 *   INVALID_NUMBER, OUTSIDE_CRS_DOMAIN, OUTSIDE_UTM_DOMAIN,
 *   OUTSIDE_UPS_DOMAIN, GRID_COORDINATE_OUT_OF_RANGE
 */
export function transformCrs(sourceValue, targetValue, xValue, yValue) {
  const source = epsgNumber(sourceValue);
  const target = epsgNumber(targetValue);
  const x = parseCoordinateNumber(xValue, "X");
  const y = parseCoordinateNumber(yValue, "Y");
  const point = toWgs84(source, x, y);
  const [resultX, resultY] = fromWgs84(target, point);
  if (!Number.isFinite(resultX) || !Number.isFinite(resultY)) {
    throw new ConvertToolsError("OUTSIDE_CRS_DOMAIN", "The transformation did not produce finite coordinates.");
  }
  return {
    source: source.code,
    target: target.code,
    x: resultX,
    y: resultY,
    formattedX: compactNumber(resultX, 8),
    formattedY: compactNumber(resultY, 8),
  };
}

export const SUPPORTED_CRS = Object.freeze([
  "EPSG:4326",
  "EPSG:3857",
  "EPSG:32601–EPSG:32660",
  "EPSG:32701–EPSG:32760",
  "EPSG:5041",
  "EPSG:5042",
]);
