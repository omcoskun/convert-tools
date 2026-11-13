// Angle helpers that work in degrees and are exact at multiples of 90°.
//
// These follow GeographicLib's Math class (Karney): reducing the argument in
// degrees before converting to radians makes sin(180°) exactly 0 and keeps
// symmetric inputs symmetric, so points on a pole, the antimeridian or a
// zone/square edge land on the same side as in the reference implementation.

import { DEGREE } from "./numbers.js";

const OVERFLOW = 1 / Number.EPSILON ** 2;

function copySign(magnitude, sign) {
  const negative = sign < 0 || Object.is(sign, -0);
  return negative ? -Math.abs(magnitude) : Math.abs(magnitude);
}

/** IEEE remainder of x by 360 (result in [-180, 180]). */
function remainder360(x) {
  let r = x % 360;
  if (r > 180) r -= 360;
  else if (r < -180) r += 360;
  return r;
}

/** Error-free sum: returns [s, t] with s = round(u + v) and s + t = u + v. */
function sumWithError(u, v) {
  const s = u + v;
  let up = s - v;
  let vpp = s - up;
  up -= u;
  vpp -= v;
  const t = s !== 0 ? 0 - (up + vpp) : s;
  return [s, t];
}

/** Longitude reduced to [-180, 180]; ±180 keeps the sign of the input. */
export function angNormalize(x) {
  const y = remainder360(x);
  return Math.abs(y) === 180 ? copySign(180, x) : y;
}

/** y − x reduced to [-180, 180], computed without losing precision. */
export function angDiff(x, y) {
  let [d, e] = sumWithError(remainder360(-x), remainder360(y));
  [d, e] = sumWithError(remainder360(d), e);
  if (d === 0 || Math.abs(d) === 180) {
    d = copySign(d, e === 0 ? y - x : -e);
  }
  return d;
}

/** [sin x, cos x] for x in degrees, exact at multiples of 90°. */
export function sincosd(x) {
  let r = x % 360;
  const t = r / 90;
  let q = Math.round(t);
  // remquo rounds ties to even
  if (Math.abs(t - Math.trunc(t)) === 0.5) q = 2 * Math.round(t / 2);
  r -= 90 * q;
  r *= DEGREE;
  const s = Math.sin(r);
  const c = Math.cos(r);
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
  if (sinx === 0) sinx = copySign(0, x);
  return [sinx, cosx];
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
