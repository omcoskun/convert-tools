/**
 * @license
 * Angle helpers that work in degrees and are exact at multiples of 90°.
 *
 * These follow GeographicLib's Math class (Karney): reducing the argument in
 * degrees before converting to radians makes sin(180°) exactly 0 and keeps
 * symmetric inputs symmetric, so points on a pole, the antimeridian or a
 * zone/square edge land on the same side as in the reference implementation.
 *
 * Ported from GeographicLib's JavaScript implementation (geographiclib-js,
 * geodesic/Math.js, https://github.com/geographiclib/geographiclib-js;
 * Math.hpp in the C++ library). Changes: plain exported functions.
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

import { DEGREE } from "./numbers.js";

const OVERFLOW = 1 / Number.EPSILON ** 2;

function copySign(magnitude, sign) {
  const negative = sign < 0 || Object.is(sign, -0);
  return negative ? -Math.abs(magnitude) : Math.abs(magnitude);
}

/**
 * Remainder of x by 360 in [-180, 180] (GeographicLib Math::remainder:
 * ties go to −180, unlike IEEE remainder which rounds to even).
 */
function remainder360(x) {
  const r = x % 360;
  return r < -180 ? r + 360 : r < 180 ? r : r - 360;
}

/** Error-free sum: returns [s, t] with s = round(u + v) and s + t = u + v. */
function sumWithError(u, v) {
  const s = u + v;
  let up = s - v;
  let vpp = s - up;
  up -= u;
  vpp -= v;
  const t = s === 0 ? s : 0 - (up + vpp);
  return [s, t];
}

/** Longitude reduced to [-180, 180]; ±180 keeps the sign of the input. */
export function angNormalize(x) {
  const y = remainder360(x);
  return Math.abs(y) === 180 ? copySign(180, x) : y;
}

/**
 * y − x reduced to [-180, 180] as [d, e]: d is the nearest double to the
 * exact difference and e = (y − x) − d its rounding error (|e| ≤ 2^-26).
 * At d = ±0 or ±180 the sign of d is the sign of y − x.
 */
export function angDiffWithError(x, y) {
  let [d, e] = sumWithError(remainder360(-x), remainder360(y));
  [d, e] = sumWithError(remainder360(d), e);
  if (d === 0 || Math.abs(d) === 180) {
    d = copySign(d, e === 0 ? y - x : -e);
  }
  return [d, e];
}

/** y − x reduced to [-180, 180], computed without losing precision. */
export function angDiff(x, y) {
  return angDiffWithError(x, y)[0];
}

/**
 * Coarsens angles below 1/16° to a multiple of 2^-57° (0.7 pm on the Earth)
 * so that tiny non-zero values such as 1e-200 cannot create near-singular
 * cases; keeps the sign (GeographicLib Math::AngRound).
 */
export function angRound(x) {
  const z = 1 / 16;
  let y = Math.abs(x);
  // z - (z - y) must not be simplified to y.
  y = y < z ? z - (z - y) : y;
  return copySign(y, x);
}

/** [d, q] with x = d + 90·q (mod 360) exactly and |d| ≤ 45 (Math::sincosd). */
function reducedAngle(x) {
  const d = x % 360;
  const q = Math.round(d / 90); // NaN in, NaN out
  return [d - 90 * q, q];
}

/**
 * [sin, cos] of (d + 90·q)° for |d| ≤ 45. ±30° and ±45° get exact symmetric
 * values, as in GeographicLib 2, so sincosd(45) has sin = cos.
 */
function rotatedSinCos(d, q) {
  const r = d * DEGREE;
  let s = Math.sin(r);
  let c = Math.cos(r);
  if (Math.abs(d) === 45) {
    c = Math.sqrt(0.5);
    s = copySign(c, r);
  } else if (Math.abs(d) === 30) {
    c = Math.sqrt(0.75);
    s = copySign(0.5, r);
  }
  let sinx;
  let cosx;
  switch (((q % 4) + 4) % 4) {
    case 0:
      sinx = s;
      cosx = c;
      break;
    case 1:
      sinx = c;
      cosx = -s;
      break;
    case 2:
      sinx = -s;
      cosx = -c;
      break;
    default:
      sinx = -c;
      cosx = s;
      break;
  }
  cosx += 0;
  return [sinx, cosx];
}

/** [sin x, cos x] for x in degrees, exact at multiples of 90°. */
export function sincosd(x) {
  const [d, q] = reducedAngle(x);
  const result = rotatedSinCos(d, q);
  if (result[0] === 0) result[0] = copySign(0, x);
  return result;
}

/**
 * [sin(x + t), cos(x + t)] for x in degrees plus a small correction t (the
 * error term of {@link angDiffWithError}); the reduced angle is passed
 * through {@link angRound} (GeographicLib Math::sincosde).
 */
export function sincosde(x, t) {
  const [d, q] = reducedAngle(x);
  const result = rotatedSinCos(angRound(d + t), q);
  if (result[0] === 0) result[0] = copySign(0, x + t);
  return result;
}

/** tan x for x in degrees, clamped to ±1/ε² at ±90°. */
export function tand(x) {
  const [s, c] = sincosd(x);
  const r = s / c;
  return Math.min(Math.max(r, -OVERFLOW), OVERFLOW);
}

/** atan2(y, x) in degrees with the result reduced before conversion. */
export function atan2d(y, x) {
  let q = 0;
  let yy = y;
  let xx = x;
  if (Math.abs(yy) > Math.abs(xx)) {
    [xx, yy] = [yy, xx];
    q = 2;
  }
  if (xx < 0 || Object.is(xx, -0)) {
    xx = -xx;
    q += 1;
  }
  let angle = Math.atan2(yy, xx) / DEGREE;
  switch (q) {
    case 1:
      angle = copySign(180, yy) - angle;
      break;
    case 2:
      angle = 90 - angle;
      break;
    case 3:
      angle = -90 + angle;
      break;
    default:
      break;
  }
  return angle;
}

/** atan x in degrees. */
export function atand(x) {
  return atan2d(x, 1);
}
