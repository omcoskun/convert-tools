// Where it is night now: the sun's position and a mask of the night side of
// a Web Mercator world square, drawn over the satellite imagery by
// night-layer.js. Pure: tested in test/night.test.mjs.
//
// This is decorative presentation maths (a low-precision solar position on a
// sphere), not geodesy, so it lives in the demo rather than in the core.

const DEG = Math.PI / 180;

/** The latitude of the top and bottom edges of a Web Mercator world square. */
export const MERCATOR_LIMIT = (Math.atan(Math.sinh(Math.PI)) * 180) / Math.PI;

// The sun's elevation at which the night is full; above 0° it is day.
const FULL_NIGHT_ELEVATION = -10;

const wrapLongitude = (longitude) => ((((longitude + 180) % 360) + 360) % 360) - 180;

/**
 * The point where the sun is overhead at `date`, from NOAA's low-precision
 * solar position (declination and equation of time; well under 0.1° here).
 * @param {Date} date
 * @returns {{ latitude: number, longitude: number }}
 */
export function subsolarPoint(date) {
  const millis = date.getTime();
  const century = (millis / 86400000 + 2440587.5 - 2451545) / 36525;
  const meanLongitude = (280.46646 + century * (36000.76983 + century * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + century * (35999.05029 - 0.0001537 * century);
  const eccentricity = 0.016708634 - century * (0.000042037 + 0.0000001267 * century);
  const m = meanAnomaly * DEG;
  const centre =
    Math.sin(m) * (1.914602 - century * (0.004817 + 0.000014 * century)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * century) +
    Math.sin(3 * m) * 0.000289;
  const omega = (125.04 - 1934.136 * century) * DEG;
  const apparentLongitude = (meanLongitude + centre - 0.00569 - 0.00478 * Math.sin(omega)) * DEG;
  const meanObliquity = 23 + (26 + (21.448 - century * (46.815 + century * (0.00059 - century * 0.001813))) / 60) / 60;
  const obliquity = (meanObliquity + 0.00256 * Math.cos(omega)) * DEG;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude));

  const y = Math.tan(obliquity / 2) ** 2;
  const l0 = meanLongitude * DEG;
  const equationOfTime =
    (4 / DEG) *
    (y * Math.sin(2 * l0) -
      2 * eccentricity * Math.sin(m) +
      4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) -
      0.5 * y * y * Math.sin(4 * l0) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * m));
  const utcMinutes = (((millis / 60000) % 1440) + 1440) % 1440;
  return {
    latitude: declination / DEG,
    longitude: wrapLongitude(-15 * ((utcMinutes + equationOfTime) / 60 - 12)),
  };
}

/** Degrees of the sun above the horizon at a point (spherical Earth, no refraction). */
export function sunElevation(latitude, longitude, subsolar) {
  const phi = latitude * DEG;
  const delta = subsolar.latitude * DEG;
  const sine = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos((longitude - subsolar.longitude) * DEG);
  return Math.asin(Math.max(-1, Math.min(1, sine))) / DEG;
}

/** How dark the night is at a sun elevation: 0 in daylight, 1 from FULL_NIGHT_ELEVATION down, smooth between. */
export function nightAlpha(elevation) {
  const t = Math.max(0, Math.min(1, elevation / FULL_NIGHT_ELEVATION));
  return t * t * (3 - 2 * t);
}

/** Latitude of the centre of `row` of a Web Mercator world square `rows` high. */
export function mercatorRowLatitude(row, rows) {
  const y = Math.PI * (1 - (2 * (row + 0.5)) / rows);
  return Math.atan(Math.sinh(y)) / DEG;
}

/**
 * Night alphas of a Web Mercator world square at `date`, row-major, `size`
 * by `size`; column c is longitude −180 + (c + 0.5)·360/size.
 * @param {Date} date
 * @param {number} size
 * @returns {Float32Array}
 */
export function nightMask(date, size) {
  const sun = subsolarPoint(date);
  const mask = new Float32Array(size * size);
  for (let row = 0; row < size; row += 1) {
    const latitude = mercatorRowLatitude(row, size);
    for (let column = 0; column < size; column += 1) {
      const longitude = -180 + ((column + 0.5) * 360) / size;
      mask[row * size + column] = nightAlpha(sunElevation(latitude, longitude, sun));
    }
  }
  return mask;
}
