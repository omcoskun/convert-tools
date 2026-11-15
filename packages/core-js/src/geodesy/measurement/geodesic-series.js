/**
 * @license
 * Series for geodesics on an ellipsoid of revolution, to sixth order in the
 * third flattening n and in Karney's expansion parameter eps.
 *
 * Ported from GeographicLib's JavaScript implementation (geographiclib-js,
 * geodesic/Geodesic.js, https://github.com/geographiclib/geographiclib-js),
 * itself a transcription of GeographicLib's C++ class Geodesic. The
 * algorithms are derived in C. F. F. Karney, "Algorithms for geodesics",
 * J. Geodesy 87, 43–55 (2013), https://doi.org/10.1007/s00190-012-0578-z;
 * addenda: https://geographiclib.sourceforge.io/geod-addenda.html
 * The coefficient tables are copied from that source (the C4 table was
 * checked against GeographicLib 2.7 C++ src/Geodesic.cpp). Changes: plain
 * functions over numbers and arrays instead of a class.
 *
 * Copyright (c) 2011-2022, Charles Karney
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the
 * following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
 * NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
 * USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// Internal module: the public API is measurement/geodesic.js.
//
// Notation (Karney 2013): beta reduced latitude, sigma arc length and omega
// longitude on the auxiliary sphere, alpha azimuth, alpha0 the azimuth at the
// equator crossing, k^2 = e'^2 cos^2(alpha0) and eps = k^2 / (2 (1 +
// sqrt(1 + k^2)) + k^2). A1, A2, A3 are the secular coefficients and
// C1, C1', C2, C3 the Fourier coefficients of the distance (I1), its
// reversion, the reduced length (I2) and the longitude (I3) integrals. Each
// of these coefficient arrays has c[0] unused, so c[l] multiplies
// sin(2 l sigma). C4 are the coefficients of the area integral (I4), a cosine
// series: c[l], l = 0 … 5, multiplies cos((2 l + 1) sigma).

/** Order of all series (GEOGRAPHICLIB_GEODESIC_ORDER). */
export const GEODESIC_ORDER = 6;

/** C3 array length: c[1] … c[5] plus the unused c[0]. */
export const C3_SIZE = GEODESIC_ORDER;

/** C4 array length: c[0] … c[5], all used. */
export const C4_SIZE = GEODESIC_ORDER;

/** Machine epsilon, 2^-52. */
export const TOL0 = Number.EPSILON;

/**
 * Smallest number whose square is a normalised double; replaces exact zeros
 * of cos(beta) at the poles so that every atan2 keeps a defined quadrant.
 */
export const TINY = Math.sqrt(Number.MIN_VALUE / Number.EPSILON);

// Each block: numerator coefficients of a polynomial (highest power first)
// followed by the common denominator.

// (1 - eps) A1 - 1, polynomial in eps^2 of order 3
const A1M1F_COEFF = [1, 4, 64, 0, 256];

// C1[l] / eps^l, polynomials in eps^2
const C1F_COEFF = [
  -1, 6, -16, 32, // C1[1], order 2
  -9, 64, -128, 2048, // C1[2], order 2
  9, -16, 768, // C1[3], order 1
  3, -5, 512, // C1[4], order 1
  -7, 1280, // C1[5], order 0
  -7, 2048, // C1[6], order 0
];

// C1'[l] / eps^l, polynomials in eps^2
const C1PF_COEFF = [
  205, -432, 768, 1536, // C1'[1], order 2
  4005, -4736, 3840, 12288, // C1'[2], order 2
  -225, 116, 384, // C1'[3], order 1
  -7173, 2695, 7680, // C1'[4], order 1
  3467, 7680, // C1'[5], order 0
  38081, 61440, // C1'[6], order 0
];

// (1 + eps) A2 - 1, polynomial in eps^2 of order 3
const A2M1F_COEFF = [-11, -28, -192, 0, 256];

// C2[l] / eps^l, polynomials in eps^2
const C2F_COEFF = [
  1, 2, 16, 32, // C2[1], order 2
  35, 64, 384, 2048, // C2[2], order 2
  15, 80, 768, // C2[3], order 1
  7, 35, 512, // C2[4], order 1
  63, 1280, // C2[5], order 0
  77, 2048, // C2[6], order 0
];

// A3, coefficients of eps^5 … eps^0, polynomials in n
const A3_COEFF = [
  -3, 128, // eps^5, order 0
  -2, -3, 64, // eps^4, order 1
  -1, -3, -1, 16, // eps^3, order 2
  3, -1, -2, 8, // eps^2, order 2
  1, -1, 2, // eps^1, order 1
  1, 1, // eps^0, order 0
];

// C3[l], coefficients of eps^5 … eps^l, polynomials in n
const C3_COEFF = [
  3, 128, // C3[1], eps^5, order 0
  2, 5, 128, // C3[1], eps^4, order 1
  -1, 3, 3, 64, // C3[1], eps^3, order 2
  -1, 0, 1, 8, // C3[1], eps^2, order 2
  -1, 1, 4, // C3[1], eps^1, order 1
  5, 256, // C3[2], eps^5, order 0
  1, 3, 128, // C3[2], eps^4, order 1
  -3, -2, 3, 64, // C3[2], eps^3, order 2
  1, -3, 2, 32, // C3[2], eps^2, order 2
  7, 512, // C3[3], eps^5, order 0
  -10, 9, 384, // C3[3], eps^4, order 1
  5, -9, 5, 192, // C3[3], eps^3, order 2
  7, 512, // C3[4], eps^5, order 0
  -14, 7, 512, // C3[4], eps^4, order 1
  21, 2560, // C3[5], eps^5, order 0
];

// C4[l], coefficients of eps^5 … eps^l, polynomials in n
const C4_COEFF = [
  97, 15015, // C4[0], eps^5, order 0
  1088, 156, 45045, // C4[0], eps^4, order 1
  -224, -4784, 1573, 45045, // C4[0], eps^3, order 2
  -10656, 14144, -4576, -858, 45045, // C4[0], eps^2, order 3
  64, 624, -4576, 6864, -3003, 15015, // C4[0], eps^1, order 4
  100, 208, 572, 3432, -12012, 30030, 45045, // C4[0], eps^0, order 5
  1, 9009, // C4[1], eps^5, order 0
  -2944, 468, 135135, // C4[1], eps^4, order 1
  5792, 1040, -1287, 135135, // C4[1], eps^3, order 2
  5952, -11648, 9152, -2574, 135135, // C4[1], eps^2, order 3
  -64, -624, 4576, -6864, 3003, 135135, // C4[1], eps^1, order 4
  8, 10725, // C4[2], eps^5, order 0
  1856, -936, 225225, // C4[2], eps^4, order 1
  -8448, 4992, -1144, 225225, // C4[2], eps^3, order 2
  -1440, 4160, -4576, 1716, 225225, // C4[2], eps^2, order 3
  -136, 63063, // C4[3], eps^5, order 0
  1024, -208, 105105, // C4[3], eps^4, order 1
  3584, -3328, 1144, 315315, // C4[3], eps^3, order 2
  -128, 135135, // C4[4], eps^5, order 0
  -2560, 832, 405405, // C4[4], eps^4, order 1
  128, 99099, // C4[5], eps^5, order 0
];

/** sqrt(x² + y²); GeographicLib avoids Math.hypot (inexact in some runtimes). */
export function hypot(x, y) {
  return Math.sqrt(x * x + y * y);
}

/**
 * Horner evaluation of the polynomial of degree `order` whose coefficients
 * (highest power first) start at coefficients[offset]. Returns 0 for a
 * negative order (Math::polyval).
 */
export function polyval(order, coefficients, offset, x) {
  if (order < 0) return 0;
  let y = coefficients[offset];
  for (let k = 1; k <= order; k += 1) {
    y = y * x + coefficients[offset + k];
  }
  return y;
}

/**
 * Clenshaw sum of c[l] sin(2 l x) for l = 1 … c.length - 1, from sin x and
 * cos x (GeographicLib SinCosSeries with sinp = true; c[0] is unused).
 */
export function sinSeries(sinx, cosx, c) {
  let k = c.length; // one beyond the last coefficient
  let n = k - 1; // number of terms
  const ar = 2 * (cosx - sinx) * (cosx + sinx); // 2 cos 2x
  let y0 = 0;
  let y1 = 0;
  if (n % 2 === 1) {
    k -= 1;
    y0 = c[k];
  }
  // Now an even number of terms remains; unrolled twice so that y0 and y1
  // return to their roles.
  for (n = Math.floor(n / 2); n > 0; n -= 1) {
    k -= 1;
    y1 = ar * y0 - y1 + c[k];
    k -= 1;
    y0 = ar * y1 - y0 + c[k];
  }
  return 2 * sinx * cosx * y0; // sin 2x · y0
}

/**
 * Clenshaw sum of c[l] cos((2 l + 1) x) for l = 0 … c.length - 1, from sin x
 * and cos x (GeographicLib SinCosSeries with sinp = false; every element of
 * c is used).
 */
export function cosSeries(sinx, cosx, c) {
  let k = c.length; // one beyond the last coefficient
  let n = k; // number of terms
  const ar = 2 * (cosx - sinx) * (cosx + sinx); // 2 cos 2x
  let y0 = 0;
  let y1 = 0;
  if (n % 2 === 1) {
    k -= 1;
    y0 = c[k];
  }
  for (n = Math.floor(n / 2); n > 0; n -= 1) {
    k -= 1;
    y1 = ar * y0 - y1 + c[k];
    k -= 1;
    y0 = ar * y1 - y0 + c[k];
  }
  return cosx * (y0 - y1); // cos x · (y0 - y1)
}

/** A new coefficient array of the given length, filled with zeros. */
export function coefficientArray(length) {
  const array = [];
  for (let index = 0; index < length; index += 1) array.push(0);
  return array;
}

/** A1 - 1, the secular coefficient of the distance integral. */
export function a1m1f(eps) {
  const p = Math.floor(GEODESIC_ORDER / 2);
  const t = polyval(p, A1M1F_COEFF, 0, eps * eps) / A1M1F_COEFF[p + 1];
  return (t + eps) / (1 - eps);
}

// Shared shape of C1, C1' and C2: c[l] = eps^l · P_l(eps^2) / D_l.
function fourierCoefficients(table, eps, c) {
  const eps2 = eps * eps;
  let d = eps;
  let offset = 0;
  for (let l = 1; l <= GEODESIC_ORDER; l += 1) {
    const p = Math.floor((GEODESIC_ORDER - l) / 2); // order in eps^2
    c[l] = (d * polyval(p, table, offset, eps2)) / table[offset + p + 1];
    offset += p + 2;
    d *= eps;
  }
}

/** Sets c[1] … c[6] to C1 of the distance integral. */
export function c1f(eps, c) {
  fourierCoefficients(C1F_COEFF, eps, c);
}

/** Sets c[1] … c[6] to C1' of the reverted distance series. */
export function c1pf(eps, c) {
  fourierCoefficients(C1PF_COEFF, eps, c);
}

/** A2 - 1, the secular coefficient of the reduced-length integral. */
export function a2m1f(eps) {
  const p = Math.floor(GEODESIC_ORDER / 2);
  const t = polyval(p, A2M1F_COEFF, 0, eps * eps) / A2M1F_COEFF[p + 1];
  return (t - eps) / (1 + eps);
}

/** Sets c[1] … c[6] to C2 of the reduced-length integral. */
export function c2f(eps, c) {
  fourierCoefficients(C2F_COEFF, eps, c);
}

/** Coefficients of A3 as a polynomial in eps, evaluated for n. */
function a3Coefficients(n) {
  const result = [];
  let offset = 0;
  for (let j = GEODESIC_ORDER - 1; j >= 0; j -= 1) {
    const p = Math.min(GEODESIC_ORDER - j - 1, j); // order in n
    result.push(polyval(p, A3_COEFF, offset, n) / A3_COEFF[offset + p + 1]);
    offset += p + 2;
  }
  return result;
}

/** Coefficients of C3[l] as polynomials in eps, evaluated for n. */
function c3Coefficients(n) {
  const result = [];
  let offset = 0;
  for (let l = 1; l < GEODESIC_ORDER; l += 1) {
    for (let j = GEODESIC_ORDER - 1; j >= l; j -= 1) {
      const p = Math.min(GEODESIC_ORDER - j - 1, j); // order in n
      result.push(polyval(p, C3_COEFF, offset, n) / C3_COEFF[offset + p + 1]);
      offset += p + 2;
    }
  }
  return result;
}

/** A3, the secular coefficient of the longitude integral. */
export function a3f(model, eps) {
  return polyval(GEODESIC_ORDER - 1, model.a3x, 0, eps);
}

/** Sets c[1] … c[5] to C3 of the longitude integral. */
export function c3f(model, eps, c) {
  let mult = 1;
  let offset = 0;
  for (let l = 1; l < GEODESIC_ORDER; l += 1) {
    const p = GEODESIC_ORDER - l - 1; // order in eps
    mult *= eps;
    c[l] = mult * polyval(p, model.c3x, offset, eps);
    offset += p + 1;
  }
}

/** Coefficients of C4[l] as polynomials in eps, evaluated for n. */
function c4Coefficients(n) {
  const result = [];
  let offset = 0;
  for (let l = 0; l < GEODESIC_ORDER; l += 1) {
    for (let j = GEODESIC_ORDER - 1; j >= l; j -= 1) {
      const p = GEODESIC_ORDER - j - 1; // order in n
      result.push(polyval(p, C4_COEFF, offset, n) / C4_COEFF[offset + p + 1]);
      offset += p + 2;
    }
  }
  return result;
}

/** Sets c[0] … c[5] to C4 of the area integral. */
export function c4f(model, eps, c) {
  let mult = 1;
  let offset = 0;
  for (let l = 0; l < GEODESIC_ORDER; l += 1) {
    const p = GEODESIC_ORDER - l - 1; // order in eps
    c[l] = mult * polyval(p, model.c4x, offset, eps);
    offset += p + 1;
    mult *= eps;
  }
}

/**
 * The square of the authalic radius, c^2 = (a^2 + b^2 atanh(e) / e) / 2
 * (GeographicLib Geodesic::_c2, written with Math::eatanhe as in the C++
 * source: atan replaces atanh for a prolate ellipsoid, and c^2 = a^2 on a
 * sphere).
 */
function authalicRadiusSquared(a, b, e2, f) {
  if (e2 === 0) return (a * a + b * b) / 2;
  const es = (f < 0 ? -1 : 1) * Math.sqrt(Math.abs(e2));
  const eatanhe = es > 0 ? es * Math.atanh(es) : -es * Math.atan(es);
  return (a * a + b * b * (eatanhe / e2)) / 2;
}

/** eps = k^2 / (2 (1 + sqrt(1 + k^2)) + k^2), the expansion parameter. */
export function expansionParameter(k2) {
  return k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
}

/**
 * Everything the solvers need about one ellipsoid: a and f, the derived
 * constants, and the A3/C3/C4 coefficients, which depend only on n.
 * @param {number} a equatorial radius, metres
 * @param {number} f flattening; 0 is a sphere, negative is prolate
 */
export function createGeodesicModel(a, f) {
  const f1 = 1 - f;
  const e2 = f * (2 - f);
  const n = f / (2 - f);
  const b = a * f1;
  return Object.freeze({
    a,
    f,
    f1,
    e2,
    ep2: e2 / (f1 * f1), // e'^2 = e^2 / (1 - e^2)
    n,
    b,
    c2: authalicRadiusSquared(a, b, e2, f),
    // Arc length below which the auxiliary-sphere solution with dn at the
    // mean latitude is accurate to round-off ("really short" lines).
    etol2:
      (0.1 * Math.sqrt(TOL0)) /
      Math.sqrt((Math.max(0.001, Math.abs(f)) * Math.min(1, 1 - f / 2)) / 2),
    a3x: Object.freeze(a3Coefficients(n)),
    c3x: Object.freeze(c3Coefficients(n)),
    c4x: Object.freeze(c4Coefficients(n)),
  });
}
