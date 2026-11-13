// UTM and UPS on WGS 84.
//
// Transverse Mercator uses Krüger's series to sixth order in the third
// flattening n, as given by C. F. F. Karney, "Transverse Mercator with an
// accuracy of a few nanometers", J. Geodesy 85(8), 475–485 (2011),
// arXiv:1002.1417. Within 3900 km of the central meridian the series error is
// below 5 nm; forward and inverse are both closed-form (no iteration other than
// Newton's method for the conformal latitude). UPS is the polar stereographic
// projection with k0 = 0.994. Zone selection follows NGA.SIG.0012 and matches
// GeographicLib's UTMUPS::StandardZone, including longitude +180° belonging to
// zone 1.

import {
  angDiff,
  angNormalize,
  atan2d,
  atand,
  sincosd,
  tand,
} from "../core/angles.js";
import {
  WGS84,
  WGS84_DERIVED,
  conformalTangent,
  inverseConformalTangent,
} from "../core/ellipsoid.js";
import { validatePoint } from "../core/numbers.js";
import { ConvertToolsError } from "../../errors.js";

const UTM_FALSE_EASTING = 500000;
const UTM_FALSE_NORTHING = 10000000;
const UPS_FALSE_ORIGIN = 2000000;
const UTM_MAXIMUM_LONGITUDE_OFFSET = 6;

const n = WGS84_DERIVED.n;

function polynomial(coefficients, x) {
  // coefficients[k] multiplies x^k
  let result = 0;
  for (let k = coefficients.length - 1; k >= 0; k -= 1) {
    result = result * x + coefficients[k];
  }
  return result;
}

// Karney (2011) Eq. 29: A = a / (1 + n) · (1 + n²/4 + n⁴/64 + n⁶/256 + …)
const RECTIFYING_RADIUS =
  (WGS84.a / (1 + n)) * polynomial([1, 0, 1 / 4, 0, 1 / 64, 0, 1 / 256], n);

// Karney (2011) Eq. 35, terms through n⁶. ALPHA[j] = α_j.
const ALPHA = [
  0,
  polynomial([0, 1 / 2, -2 / 3, 5 / 16, 41 / 180, -127 / 288, 7891 / 37800], n),
  polynomial([0, 0, 13 / 48, -3 / 5, 557 / 1440, 281 / 630, -1983433 / 1935360], n),
  polynomial([0, 0, 0, 61 / 240, -103 / 140, 15061 / 26880, 167603 / 181440], n),
  polynomial([0, 0, 0, 0, 49561 / 161280, -179 / 168, 6601661 / 7257600], n),
  polynomial([0, 0, 0, 0, 0, 34729 / 80640, -3418889 / 1995840], n),
  polynomial([0, 0, 0, 0, 0, 0, 212378941 / 319334400], n),
];

// Karney (2011) Eq. 36, terms through n⁶. BETA[j] = β_j.
const BETA = [
  0,
  polynomial([0, 1 / 2, -2 / 3, 37 / 96, -1 / 360, -81 / 512, 96199 / 604800], n),
  polynomial([0, 0, 1 / 48, 1 / 15, -437 / 1440, 46 / 105, -1118711 / 3870720], n),
  polynomial([0, 0, 0, 17 / 480, -37 / 840, -209 / 4480, 5569 / 90720], n),
  polynomial([0, 0, 0, 0, 4397 / 161280, -11 / 504, -830251 / 7257600], n),
  polynomial([0, 0, 0, 0, 0, 4583 / 161280, -108847 / 3991680], n),
  polynomial([0, 0, 0, 0, 0, 0, 20648693 / 638668800], n),
];

const isNegative = (value) => value < 0 || Object.is(value, -0);

/**
 * Transverse Mercator forward projection (Karney 2011, Sect. 2).
 * Returns x (easting) and y (northing) in metres without false origin.
 */
function transverseMercatorForward(centralLongitude, scale, latitude, longitude) {
  let lat = latitude;
  let lon = angDiff(centralLongitude, longitude);
  let latitudeSign = isNegative(lat) ? -1 : 1;
  const longitudeSign = isNegative(lon) ? -1 : 1;
  lat *= latitudeSign;
  lon *= longitudeSign;
  const backside = lon > 90;
  if (backside) {
    if (lat === 0) latitudeSign = -1;
    lon = 180 - lon;
  }

  const [sinPhi, cosPhi] = sincosd(lat);
  const [sinLambda, cosLambda] = sincosd(lon);
  let xip;
  let etap;
  if (lat !== 90) {
    const taup = conformalTangent(sinPhi / cosPhi);
    // Eq. 10
    xip = Math.atan2(taup, cosLambda);
    etap = Math.asinh(sinLambda / Math.hypot(taup, cosLambda));
  } else {
    xip = Math.PI / 2;
    etap = 0;
  }

  // Eq. 11
  let xi = xip;
  let eta = etap;
  for (let j = 1; j <= 6; j += 1) {
    xi += ALPHA[j] * Math.sin(2 * j * xip) * Math.cosh(2 * j * etap);
    eta += ALPHA[j] * Math.cos(2 * j * xip) * Math.sinh(2 * j * etap);
  }

  // Eq. 13
  return {
    x: RECTIFYING_RADIUS * scale * eta * longitudeSign,
    y: RECTIFYING_RADIUS * scale * (backside ? Math.PI - xi : xi) * latitudeSign,
  };
}

/**
 * Transverse Mercator inverse projection (Karney 2011, Sect. 3).
 */
function transverseMercatorInverse(centralLongitude, scale, x, y) {
  let xi = y / (RECTIFYING_RADIUS * scale);
  let eta = x / (RECTIFYING_RADIUS * scale);
  const xiSign = isNegative(xi) ? -1 : 1;
  const etaSign = isNegative(eta) ? -1 : 1;
  xi *= xiSign;
  eta *= etaSign;
  const backside = xi > Math.PI / 2;
  if (backside) xi = Math.PI - xi;

  // Eq. 15
  let xip = xi;
  let etap = eta;
  for (let j = 1; j <= 6; j += 1) {
    xip -= BETA[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etap -= BETA[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }

  // Eqs. 18–19 and Newton's method for tan(φ)
  const s = Math.sinh(etap);
  const c = Math.max(0, Math.cos(xip));
  const r = Math.hypot(s, c);
  let latitude;
  let longitude;
  if (r !== 0) {
    longitude = atan2d(s, c);
    latitude = atand(inverseConformalTangent(Math.sin(xip) / r));
  } else {
    latitude = 90;
    longitude = 0;
  }
  latitude *= xiSign;
  if (backside) longitude = 180 - longitude;
  longitude *= etaSign;
  return {
    latitude,
    longitude: angNormalize(longitude + centralLongitude),
  };
}

/**
 * MGRS/UTM latitude band index in [-10, 9] (C = -10 … X = 9).
 * @param {number} latitude degrees
 * @returns {number}
 */
export function latitudeBandIndex(latitude) {
  const integerLatitude = Math.floor(latitude);
  return Math.max(-10, Math.min(9, Math.trunc((integerLatitude + 80) / 8) - 10));
}

/**
 * Standard UTM zone for a point, or 0 where UPS applies (latitude below 80°S
 * or at/above 84°N). Includes the Norway (32V) and Svalbard (31X–37X)
 * exceptions; longitude +180° belongs to zone 1.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {number}
 */
export function standardUtmZone(latitude, longitude) {
  validatePoint(latitude, longitude);
  if (!(latitude >= -80 && latitude < 84)) return 0;
  let integerLongitude = Math.floor(angNormalize(longitude));
  if (integerLongitude === 180) integerLongitude = -180;
  let zone = Math.trunc((integerLongitude + 186) / 6);
  const band = latitudeBandIndex(latitude);
  if (band === 7 && zone === 31 && integerLongitude >= 3) {
    zone = 32;
  } else if (band === 9 && integerLongitude >= 0 && integerLongitude < 42) {
    zone = 2 * Math.trunc((integerLongitude + 183) / 12) + 1;
  }
  return zone;
}

/**
 * @param {number} zone UTM zone 1–60
 * @returns {number} central meridian in degrees
 */
export function centralMeridian(zone) {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) {
    throw new ConvertToolsError("INVALID_ZONE", "UTM zone must be an integer from 1 to 60.");
  }
  return zone * 6 - 183;
}

/**
 * UTM forward projection in the standard zone or a requested zone.
 * @param {number} latitude degrees, −80 … 84
 * @param {number} longitude degrees
 * @param {number} [requestedZone] 1–60; the point must lie within 6° of its
 *   central meridian
 * @param {boolean} [requestedNorth] hemisphere of the false northing; defaults
 *   to latitude ≥ 0. The equator may be written in either hemisphere.
 * @returns {{zone: number, north: boolean, easting: number, northing: number}}
 */
export function utmForward(latitude, longitude, requestedZone, requestedNorth) {
  validatePoint(latitude, longitude);
  if (latitude < -80 || latitude > 84) {
    throw new ConvertToolsError("OUTSIDE_UTM_DOMAIN", "UTM is defined between 80°S and 84°N.");
  }
  const zone = requestedZone ?? standardUtmZone(latitude, longitude);
  if (zone === 0) throw new ConvertToolsError("OUTSIDE_UTM_DOMAIN", "UTM is defined between 80°S and 84°N.");
  const north = requestedNorth ?? latitude >= 0;
  if ((north && latitude < 0) || (!north && latitude > 0)) {
    throw new ConvertToolsError("OUTSIDE_UTM_DOMAIN", "Latitude is in the other UTM hemisphere.");
  }
  const lon0 = centralMeridian(zone);
  if (Math.abs(angDiff(lon0, longitude)) > UTM_MAXIMUM_LONGITUDE_OFFSET) {
    throw new ConvertToolsError("OUTSIDE_UTM_DOMAIN", "Longitude is too far from the selected UTM zone.");
  }
  const { x, y } = transverseMercatorForward(lon0, WGS84.utmScale, latitude, longitude);
  return {
    zone,
    north,
    easting: x + UTM_FALSE_EASTING,
    northing: y + (north ? 0 : UTM_FALSE_NORTHING),
  };
}

/**
 * UTM inverse projection.
 * @param {number} zone 1–60
 * @param {boolean} north hemisphere of the false northing
 * @param {number} easting metres, 0 … 1 000 000
 * @param {number} northing metres, 0 … 10 000 000
 * @returns {{latitude: number, longitude: number}}
 */
export function utmInverse(zone, north, easting, northing) {
  const lon0 = centralMeridian(zone);
  if (
    !Number.isFinite(easting) ||
    !Number.isFinite(northing) ||
    easting < 0 ||
    easting > 1000000 ||
    northing < 0 ||
    northing > 10000000
  ) {
    throw new ConvertToolsError("GRID_COORDINATE_OUT_OF_RANGE", "UTM easting or northing is outside the supported range.");
  }
  const point = transverseMercatorInverse(
    lon0,
    WGS84.utmScale,
    easting - UTM_FALSE_EASTING,
    northing - (north ? 0 : UTM_FALSE_NORTHING),
  );
  return validatePoint(point.latitude, point.longitude);
}

const POLAR_C = (1 - WGS84.f) * Math.exp(WGS84_DERIVED.e * Math.atanh(WGS84_DERIVED.e));
const POLAR_SCALE = (2 * WGS84.upsScale * WGS84.a) / POLAR_C;

/**
 * UPS forward projection (polar stereographic, k0 = 0.994).
 * @param {number} latitude degrees, within 30° of the selected pole
 * @param {number} longitude degrees
 * @param {boolean} [requestedNorth] defaults to the point's hemisphere
 * @returns {{zone: 0, north: boolean, easting: number, northing: number}}
 */
export function upsForward(latitude, longitude, requestedNorth) {
  validatePoint(latitude, longitude);
  const north = requestedNorth ?? latitude >= 0;
  if ((north && latitude < UPS_LIMIT_LATITUDE) || (!north && latitude > -UPS_LIMIT_LATITUDE)) {
    throw new ConvertToolsError("OUTSIDE_UPS_DOMAIN", "UPS coordinates must be within 30° of the selected pole.");
  }
  const rho = polarRadius(north ? latitude : -latitude);
  const [sinLambda, cosLambda] = sincosd(longitude);
  return {
    zone: 0,
    north,
    easting: UPS_FALSE_ORIGIN + rho * sinLambda,
    northing: UPS_FALSE_ORIGIN + (north ? -rho : rho) * cosLambda,
  };
}

function polarRadius(latitude) {
  const taup = conformalTangent(tand(latitude));
  const rho = Math.hypot(1, taup) + Math.abs(taup);
  return POLAR_SCALE * (taup >= 0 ? (latitude !== 90 ? 1 / rho : 0) : rho);
}

// UPS is defined here within 30° of the pole (EPSG:5041/5042 area of use).
// The inverse accepts grid points up to 1 µm beyond that circle so that a
// forward-projected point on the 60° boundary survives the rounding of its
// false-origin addition.
const UPS_LIMIT_LATITUDE = 60;
const UPS_MAXIMUM_RADIUS = polarRadius(UPS_LIMIT_LATITUDE) + 1e-6;

/**
 * UPS inverse projection.
 * @param {boolean} north
 * @param {number} easting metres
 * @param {number} northing metres; together with easting within the 60°
 *   latitude circle around the pole
 * @returns {{latitude: number, longitude: number}}
 */
export function upsInverse(north, easting, northing) {
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
    throw new ConvertToolsError("GRID_COORDINATE_OUT_OF_RANGE", "UPS easting or northing is outside the supported range.");
  }
  const x = easting - UPS_FALSE_ORIGIN;
  const y = northing - UPS_FALSE_ORIGIN;
  const rho = Math.hypot(x, y);
  if (!(rho <= UPS_MAXIMUM_RADIUS)) {
    throw new ConvertToolsError("GRID_COORDINATE_OUT_OF_RANGE", "UPS easting or northing is outside the supported range.");
  }
  const t = rho !== 0 ? rho / POLAR_SCALE : Number.EPSILON ** 2;
  const taup = (1 / t - t) / 2;
  const tau = inverseConformalTangent(taup);
  const latitude = (north ? 1 : -1) * atand(tau);
  const longitude = atan2d(x, north ? -y : y);
  return validatePoint(latitude, longitude);
}

/**
 * Projects a point to UTM, or to UPS where UTM does not apply.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {{zone: number, north: boolean, easting: number, northing: number}}
 *   zone 0 means UPS
 */
export function utmUpsForward(latitude, longitude) {
  const zone = standardUtmZone(latitude, longitude);
  return zone === 0
    ? upsForward(latitude, longitude)
    : utmForward(latitude, longitude, zone);
}

/**
 * Inverse of {@link utmUpsForward}.
 * @param {number} zone 0 for UPS, otherwise 1–60
 * @param {boolean} north
 * @param {number} easting
 * @param {number} northing
 * @returns {{latitude: number, longitude: number}}
 */
export function utmUpsInverse(zone, north, easting, northing) {
  return zone === 0
    ? upsInverse(north, easting, northing)
    : utmInverse(zone, north, easting, northing);
}
