/**
 * @license
 * Inverse geodesic problem on an ellipsoid of revolution (Karney 2013).
 *
 * Ported from GeographicLib's JavaScript implementation (geographiclib-js,
 * geodesic/Geodesic.js: Lengths, astroid, InverseStart, Lambda12 and
 * InverseInt; https://github.com/geographiclib/geographiclib-js), itself a
 * transcription of GeographicLib's C++ class Geodesic. The algorithms are
 * derived in C. F. F. Karney, "Algorithms for geodesics", J. Geodesy 87,
 * 43–55 (2013), https://doi.org/10.1007/s00190-012-0578-z; addenda:
 * https://geographiclib.sourceforge.io/geod-addenda.html
 * Changes: plain functions over numbers and small objects; every output
 * (distance, azimuths, arc length, reduced length, geodesic scales, area) is
 * always computed, as GeodSolve -f does; the iteration limit returns the last
 * iterate (as GeographicLib does) instead of raising an error; exact
 * antipodes report the route over the north pole (public contract) with the
 * reduced length, scales and area of that route; and the classification of
 * inputs with more than one shortest geodesic is decided by the exact public
 * rule.
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

import {
  angDiffWithError,
  angRound,
  atan2d,
  sincosd,
  sincosde,
} from "../core/angles.js";
import { DEGREE } from "../core/numbers.js";
import {
  C3_SIZE,
  C4_SIZE,
  GEODESIC_ORDER,
  TINY,
  TOL0,
  a1m1f,
  a2m1f,
  a3f,
  c1f,
  c2f,
  c3f,
  c4f,
  coefficientArray,
  cosSeries,
  expansionParameter,
  hypot,
  sinSeries,
} from "./geodesic-series.js";

const TOL1 = 200 * TOL0;
const TOL2 = Math.sqrt(TOL0);
const TOLB = TOL0;
const XTHRESH = 1000 * TOL2;
// Newton's method is used for the first MAXIT1 iterations, bisection after
// that; MAXIT2 is the hard limit (GeographicLib: maxit1_, maxit2_ with 53
// digits). The GeodTest set needs at most 16 updates / 17 longitude
// evaluations (measured over 500,000 rows).
const MAXIT1 = 20;
const MAXIT2 = MAXIT1 + 53 + 10;
// Resolution of the `ambiguous` longitude comparison, in degrees. The cut
// locus and its mirror are numerically identical to well below this.
const AMBIGUITY_RESOLUTION_DEGREES = 1e-9;

// Output selection of lengths() (GeographicLib DISTANCE, REDUCEDLENGTH and
// GEODESICSCALE).
const DISTANCE = 1;
const REDUCED_LENGTH = 2;
const GEODESIC_SCALE = 4;
const ALL_LENGTHS = DISTANCE | REDUCED_LENGTH | GEODESIC_SCALE;

function sq(x) {
  return x * x;
}

function copySign(magnitude, sign) {
  const negative = sign < 0 || Object.is(sign, -0);
  return negative ? -Math.abs(magnitude) : Math.abs(magnitude);
}

/**
 * Distance and reduced length divided by b and the geodesic scales, from the
 * auxiliary-sphere arc sig12 between sig1 and sig2 (GeographicLib Lengths).
 * m0 is the coefficient of the secular term of the reduced length. `mask`
 * combines DISTANCE, REDUCED_LENGTH and GEODESIC_SCALE. c1a and c2a are
 * scratch arrays of length GEODESIC_ORDER + 1.
 * @returns {{ s12b: number, m12b: number, m0: number, M12: number,
 *   M21: number }} NaN where not asked
 */
function lengths(
  model,
  eps,
  sig12,
  ssig1,
  csig1,
  dn1,
  ssig2,
  csig2,
  dn2,
  cbet1,
  cbet2,
  mask,
  c1a,
  c2a,
) {
  const wantDistance = (mask & DISTANCE) !== 0;
  const wantReducedLength = (mask & REDUCED_LENGTH) !== 0;
  const wantScale = (mask & GEODESIC_SCALE) !== 0;
  const wantJ12 = wantReducedLength || wantScale;
  let m0x = 0;
  let j12 = 0;
  let a1 = a1m1f(eps);
  let a2 = 0;
  c1f(eps, c1a);
  if (wantJ12) {
    a2 = a2m1f(eps);
    c2f(eps, c2a);
    m0x = a1 - a2;
    a2 = 1 + a2;
  }
  a1 = 1 + a1;
  let s12b = NaN;
  let m12b = NaN;
  let m0 = NaN;
  let M12 = NaN;
  let M21 = NaN;
  if (wantDistance) {
    const b1 = sinSeries(ssig2, csig2, c1a) - sinSeries(ssig1, csig1, c1a);
    s12b = a1 * (sig12 + b1);
    if (wantJ12) {
      const b2 = sinSeries(ssig2, csig2, c2a) - sinSeries(ssig1, csig1, c2a);
      j12 = m0x * sig12 + (a1 * b1 - a2 * b2);
    }
  } else if (wantJ12) {
    for (let l = 1; l <= GEODESIC_ORDER; l += 1) {
      c2a[l] = a1 * c1a[l] - a2 * c2a[l];
    }
    j12 =
      m0x * sig12 +
      (sinSeries(ssig2, csig2, c2a) - sinSeries(ssig1, csig1, c2a));
  }
  if (wantReducedLength) {
    m0 = m0x;
    // The parentheses keep the cancellation accurate for coincident points.
    m12b = dn2 * (csig1 * ssig2) - dn1 * (ssig1 * csig2) - csig1 * csig2 * j12;
  }
  if (wantScale) {
    const csig12 = csig1 * csig2 + ssig1 * ssig2;
    const t = (model.ep2 * (cbet1 - cbet2) * (cbet1 + cbet2)) / (dn1 + dn2);
    M12 = csig12 + ((t * ssig2 - csig2 * j12) * ssig1) / dn1;
    M21 = csig12 - ((t * ssig1 - csig1 * j12) * ssig2) / dn2;
  }
  return { s12b, m12b, m0, M12, M21 };
}

/**
 * Positive root k of k^4 + 2k^3 - (x^2 + y^2 - 1) k^2 - 2 y^2 k - y^2 = 0
 * (Karney 2013, Eq. 55; adapted from Geocentric::Reverse).
 */
function astroid(x, y) {
  const p = sq(x);
  const q = sq(y);
  const r = (p + q - 1) / 6;
  if (q === 0 && r <= 0) {
    // y = 0 with |x| <= 1: the positive root is k = 0.
    return 0;
  }
  // Multiply the equations for s and t by r^3 and r to avoid a division by
  // zero when r = 0.
  const s = (p * q) / 4; // s = r^3 s
  const r2 = sq(r);
  const r3 = r * r2;
  // Zero on the evolute p^(1/3) + q^(1/3) = 1.
  const disc = s * (s + 2 * r3);
  let u = r;
  if (disc >= 0) {
    let t3 = s + r3;
    // The sign of the root maximises |t3| and so avoids cancellation.
    t3 += t3 < 0 ? -Math.sqrt(disc) : Math.sqrt(disc); // t3 = (r t)^3
    const t = Math.cbrt(t3); // real cube root, t = r t
    // t can be zero, but then r2 / t -> 0.
    u += t + (t !== 0 ? r2 / t : 0);
  } else {
    // t is complex, but u is real; disc < 0 implies r < 0.
    const angle = Math.atan2(Math.sqrt(-disc), -(s + r3));
    // Of the three cube roots, the one that avoids cancellation.
    u += 2 * r * Math.cos(angle / 3);
  }
  const v = Math.sqrt(sq(u) + q); // positive
  // Avoid loss of accuracy when u < 0.
  const uv = u < 0 ? q / (v - u) : u + v; // u + v, positive
  const w = (uv - q) / (2 * v); // positive?
  // Rearranged to avoid subtraction; uv > 0 and w >= 0.
  return uv / (Math.sqrt(uv + sq(w)) + w);
}

/**
 * Starting azimuth for Newton's method (sig12 = -1), or the complete
 * solution of a "really short" line (sig12 >= 0 with salp2, calp2 and the
 * mean dn). GeographicLib InverseStart.
 */
function inverseStart(
  model,
  sbet1,
  cbet1,
  dn1,
  sbet2,
  cbet2,
  dn2,
  lam12,
  slam12,
  clam12,
  c1a,
  c2a,
) {
  const result = { sig12: -1, salp1: 0, calp1: 0, salp2: 0, calp2: 0, dnm: 0 };
  // bet12 = bet2 - bet1 in [0, pi); bet12a = bet2 + bet1 in (-pi, 0]
  const sbet12 = sbet2 * cbet1 - cbet2 * sbet1;
  const cbet12 = cbet2 * cbet1 + sbet2 * sbet1;
  // Two statements, as in GeographicLib, which needs this to be evaluated
  // exactly like this for some nearly antipodal cases.
  let sbet12a = sbet2 * cbet1;
  sbet12a += cbet2 * sbet1;

  const shortline = cbet12 >= 0 && sbet12 < 0.5 && cbet2 * lam12 < 0.5;
  let somg12;
  let comg12;
  if (shortline) {
    // sin((bet1 + bet2) / 2)^2
    let sbetm2 = sq(sbet1 + sbet2);
    sbetm2 /= sbetm2 + sq(cbet1 + cbet2);
    result.dnm = Math.sqrt(1 + model.ep2 * sbetm2);
    const omg12 = lam12 / (model.f1 * result.dnm);
    somg12 = Math.sin(omg12);
    comg12 = Math.cos(omg12);
  } else {
    somg12 = slam12;
    comg12 = clam12;
  }

  result.salp1 = cbet2 * somg12;
  result.calp1 =
    comg12 >= 0
      ? sbet12 + (cbet2 * sbet1 * sq(somg12)) / (1 + comg12)
      : sbet12a - (cbet2 * sbet1 * sq(somg12)) / (1 - comg12);

  const ssig12 = hypot(result.salp1, result.calp1);
  const csig12 = sbet1 * sbet2 + cbet1 * cbet2 * comg12;
  if (shortline && ssig12 < model.etol2) {
    // Really short line: the auxiliary-sphere solution is final.
    result.salp2 = cbet1 * somg12;
    result.calp2 =
      sbet12 -
      cbet1 * sbet2 * (comg12 >= 0 ? sq(somg12) / (1 + comg12) : 1 - comg12);
    const t = hypot(result.salp2, result.calp2);
    result.salp2 /= t;
    result.calp2 /= t;
    result.sig12 = Math.atan2(ssig12, csig12);
  } else if (
    Math.abs(model.n) > 0.1 || // too eccentric for the astroid estimate
    csig12 >= 0 ||
    ssig12 >= 6 * Math.abs(model.n) * Math.PI * sq(cbet1)
  ) {
    // The zeroth-order spherical estimate is good enough.
  } else {
    // Nearly antipodal: scale lam12 and bet2 to x, y coordinates in which
    // the antipodal point is the origin and the singular point is at
    // y = 0, x = -1.
    const lam12x = Math.atan2(-slam12, -clam12); // lam12 - pi
    let x;
    let y;
    let lamscale;
    let betscale;
    if (model.f >= 0) {
      // x = dlong, y = dlat
      const eps = expansionParameter(sq(sbet1) * model.ep2);
      lamscale = model.f * cbet1 * a3f(model, eps) * Math.PI;
      betscale = lamscale * cbet1;
      x = lam12x / lamscale;
      y = sbet12a / betscale;
    } else {
      // x = dlat, y = dlong
      const cbet12a = cbet2 * cbet1 - sbet2 * sbet1;
      const bet12a = Math.atan2(sbet12a, cbet12a);
      const meridional = lengths(
        model,
        model.n,
        Math.PI + bet12a,
        sbet1,
        -cbet1,
        dn1,
        sbet2,
        cbet2,
        dn2,
        cbet1,
        cbet2,
        REDUCED_LENGTH,
        c1a,
        c2a,
      );
      x = -1 + meridional.m12b / (cbet1 * cbet2 * meridional.m0 * Math.PI);
      betscale = x < -0.01 ? sbet12a / x : -model.f * sq(cbet1) * Math.PI;
      lamscale = betscale / cbet1;
      // The offset from the antipodal longitude, lam12 - pi, as in
      // GeographicLib 2.7 C++ (the JavaScript port divides lam12 itself).
      y = lam12x / lamscale;
    }

    if (y > -TOL1 && x > -1 - XTHRESH) {
      // Strip near the cut.
      if (model.f >= 0) {
        result.salp1 = Math.min(1, -x);
        result.calp1 = -Math.sqrt(1 - sq(result.salp1));
      } else {
        result.calp1 = Math.max(x > -TOL1 ? 0 : -1, x);
        result.salp1 = Math.sqrt(1 - sq(result.calp1));
      }
    } else {
      // Estimate omg12 from the astroid problem and use the spherical
      // formula for alp1 (fewer Newton iterations than estimating alp1
      // directly). omg12 is near pi, so work with omg12a = pi - omg12.
      const k = astroid(x, y);
      const omg12a =
        lamscale * (model.f >= 0 ? (-x * k) / (1 + k) : (-y * (1 + k)) / k);
      somg12 = Math.sin(omg12a);
      comg12 = -Math.cos(omg12a);
      result.salp1 = cbet2 * somg12;
      result.calp1 = sbet12a - (cbet2 * sbet1 * sq(somg12)) / (1 - comg12);
    }
  }
  // Sanity check on the starting guess; the backwards test lets NaN through.
  if (!(result.salp1 <= 0)) {
    const t = hypot(result.salp1, result.calp1);
    result.salp1 /= t;
    result.calp1 /= t;
  } else {
    result.salp1 = 1;
    result.calp1 = 0;
  }
  return result;
}

/**
 * Longitude difference lam12 reached by the geodesic that leaves point 1 at
 * azimuth (salp1, calp1) and arrives at the latitude of point 2, minus the
 * target lam120, its derivative with respect to alp1 when diffp, and the
 * ellipsoidal correction domg12 = lam12 - omg12 (GeographicLib Lambda12).
 * c1a, c2a, c3a are scratch arrays.
 */
function lambda12(
  model,
  sbet1,
  cbet1,
  dn1,
  sbet2,
  cbet2,
  dn2,
  salp1,
  calp1Value,
  slam120,
  clam120,
  diffp,
  c1a,
  c2a,
  c3a,
) {
  // Break the degeneracy of the equatorial line (handled by the caller).
  const calp1 = sbet1 === 0 && calp1Value === 0 ? -TINY : calp1Value;

  // sin(alp1) cos(bet1) = sin(alp0)
  const salp0 = salp1 * cbet1;
  const calp0 = hypot(calp1, salp1 * sbet1); // calp0 > 0

  // tan(bet1) = tan(sig1) cos(alp1); tan(omg1) = sin(alp0) tan(sig1)
  let ssig1 = sbet1;
  const somg1 = salp0 * sbet1;
  let csig1 = calp1 * cbet1;
  const comg1 = csig1; // omg1 need not be normalised
  let t = hypot(ssig1, csig1);
  ssig1 /= t;
  csig1 /= t;

  // Enforce the symmetries of |bet2| = -bet1, which can otherwise make the
  // Newton iteration singular. sin(alp2) cos(bet2) = sin(alp0), and calp2 is
  // the positive root (alp2 in [0, pi/2]).
  const salp2 = cbet2 !== cbet1 ? salp0 / cbet2 : salp1;
  const calp2 =
    cbet2 !== cbet1 || Math.abs(sbet2) !== -sbet1
      ? Math.sqrt(
          sq(calp1 * cbet1) +
            (cbet1 < -sbet1
              ? (cbet2 - cbet1) * (cbet1 + cbet2)
              : (sbet1 - sbet2) * (sbet1 + sbet2)),
        ) / cbet2
      : Math.abs(calp1);
  // tan(bet2) = tan(sig2) cos(alp2); tan(omg2) = sin(alp0) tan(sig2)
  let ssig2 = sbet2;
  const somg2 = salp0 * sbet2;
  let csig2 = calp2 * cbet2;
  const comg2 = csig2;
  t = hypot(ssig2, csig2);
  ssig2 /= t;
  csig2 /= t;

  // sig12 = sig2 - sig1 and omg12 = omg2 - omg1, limited to [0, pi]
  const sig12 = Math.atan2(
    Math.max(0, csig1 * ssig2 - ssig1 * csig2),
    csig1 * csig2 + ssig1 * ssig2,
  );
  const somg12 = Math.max(0, comg1 * somg2 - somg1 * comg2);
  const comg12 = comg1 * comg2 + somg1 * somg2;
  // eta = omg12 - lam120
  const eta = Math.atan2(
    somg12 * clam120 - comg12 * slam120,
    comg12 * clam120 + somg12 * slam120,
  );
  const eps = expansionParameter(sq(calp0) * model.ep2);
  c3f(model, eps, c3a);
  const b312 = sinSeries(ssig2, csig2, c3a) - sinSeries(ssig1, csig1, c3a);
  const domg12 = -model.f * a3f(model, eps) * salp0 * (sig12 + b312);
  const lam12 = eta + domg12;

  let dlam12 = NaN;
  if (diffp) {
    if (calp2 === 0) {
      dlam12 = (-2 * model.f1 * dn1) / sbet1;
    } else {
      const reduced = lengths(
        model,
        eps,
        sig12,
        ssig1,
        csig1,
        dn1,
        ssig2,
        csig2,
        dn2,
        cbet1,
        cbet2,
        REDUCED_LENGTH,
        c1a,
        c2a,
      );
      dlam12 = reduced.m12b * (model.f1 / (calp2 * cbet2));
    }
  }
  return {
    lam12,
    salp2,
    calp2,
    sig12,
    ssig1,
    csig1,
    ssig2,
    csig2,
    eps,
    domg12,
    dlam12,
  };
}

/**
 * Whether more than one shortest geodesic joins the two points, by the exact
 * rule of the public contract.
 *
 * The points must be symmetric, lat1 + lat2 == 0 exactly, and then the
 * answer is true if and only if at least one of these holds:
 *
 * (a) |lat1| == 90 (the two poles);
 * (b) |lon12| == 180 exactly (exact antipodes);
 * (c) f > 0 and |lon12| - lonCut > 1e-9 degrees, where
 *     lonCut = 180 (1 - f A3(eps) cos(beta1)),
 *     beta1 is the reduced latitude of point 1,
 *     k2 = ep2 sin^2(beta1), eps = k2 / (2 (1 + sqrt(1 + k2)) + k2), and
 *     A3 is Karney's A3 series. On the equator this is |lon12| > (1 - f) 180.
 *
 * For f < 0 only (a) and (b) apply. In every other case the route is unique
 * (a nearly antipodal but unique route is not ambiguous).
 * @param {object} model from createGeodesicModel
 * @param {number} latitude1 degrees, as given by the caller
 * @param {number} latitude2 degrees, as given by the caller
 * @param {number} lon12 |longitude difference| reduced to [0, 180]
 * @returns {boolean}
 */
function isAmbiguous(model, latitude1, latitude2, lon12) {
  if (latitude1 + latitude2 !== 0) return false;
  if (Math.abs(latitude1) === 90) return true;
  if (lon12 === 180) return true;
  if (!(model.f > 0)) return false;

  const latitude = sincosd(latitude1);
  let sbet1 = model.f1 * latitude[0];
  let cbet1 = latitude[1];
  const norm = hypot(sbet1, cbet1);
  sbet1 /= norm;
  cbet1 /= norm;
  cbet1 = Math.max(TINY, cbet1);
  const eps = expansionParameter(sbet1 * sbet1 * model.ep2);
  const lonCut = 180 * (1 - model.f * a3f(model, eps) * cbet1);
  return lon12 - lonCut > AMBIGUITY_RESOLUTION_DEGREES;
}

/**
 * Reduced length, geodesic scales and area of the route over the north pole
 * between exact antipodes, the route the public contract returns for them
 * (azimuth 0 at point 1, 180 at point 2). It runs along a meridian: point 1
 * leaves northwards, passes the pole and reaches the opposite meridian at
 * the mirrored latitude, so sig2 = sig1 + pi on the auxiliary sphere
 * (ssig2 = -ssig1, csig2 = -csig1). On a meridian k^2 = e'^2, so eps = n.
 * The area of a meridional geodesic has no series part (A4 = 0) and
 * alp12 = alp2 - alp1 = 180 degrees, so S12 = c^2 pi.
 * @param {object} model from createGeodesicModel
 * @param {number} latitude1 degrees, [-90, 90], as given by the caller
 * @returns {{ m12: number, M12: number, M21: number, S12: number }}
 */
function northPoleRoute(model, latitude1) {
  const sincos = sincosd(angRound(latitude1));
  let sbet1 = model.f1 * sincos[0];
  let cbet1 = sincos[1];
  const t = hypot(sbet1, cbet1);
  sbet1 /= t;
  cbet1 /= t;
  cbet1 = Math.max(TINY, cbet1); // cbet1 = +epsilon at the poles
  const dn1 = Math.sqrt(1 + model.ep2 * sq(sbet1));
  const route = lengths(
    model,
    model.n,
    Math.PI,
    sbet1,
    cbet1,
    dn1,
    -sbet1,
    -cbet1,
    dn1,
    cbet1,
    cbet1,
    ALL_LENGTHS,
    coefficientArray(GEODESIC_ORDER + 1),
    coefficientArray(GEODESIC_ORDER + 1),
  );
  return {
    m12: 0 + route.m12b * model.b,
    M12: route.M12,
    M21: route.M21,
    S12: model.c2 * Math.PI,
  };
}

/**
 * Solves the inverse problem (GeographicLib Geodesic::InverseInt with every
 * output). Latitudes must already be within [-90, 90].
 * @returns {{
 *   distance: number,
 *   azimuth1: number,
 *   azimuth2: number,
 *   a12: number,
 *   m12: number,
 *   M12: number,
 *   M21: number,
 *   S12: number,
 *   iterations: number,
 *   ambiguous: boolean,
 *   exactAntipodes: boolean,
 * }} azimuths and a12 in degrees, azimuths in [-180, 180]; m12 in metres;
 *   S12 in square metres; iterations counts the longitude evaluations
 *   performed by the Newton/bisection loop (the loop counter plus the final
 *   evaluation); it is 0 only for the closed-form meridional, equatorial and
 *   short-line paths
 */
export function solveInverse(model, latitude1, longitude1, latitude2, longitude2) {
  // The public rules for ambiguity and exact antipodes are stated in terms of
  // the coordinates as given; keep them before AngRound/answers swap points.
  const inputLatitude1 = latitude1;
  const inputLatitude2 = latitude2;
  // If really close to the equator, treat as on the equator.
  let lat1 = angRound(latitude1);
  let lat2 = angRound(latitude2);
  // Longitude difference in [-180, 180] with its rounding error; -180 only
  // for west-going geodesics.
  const difference = angDiffWithError(longitude1, longitude2);
  let lon12 = difference[0];
  let lon12s = difference[1];
  // Make the longitude difference positive.
  let lonsign = copySign(1, lon12);
  lon12 *= lonsign;
  lon12s *= lonsign;
  const lam12 = lon12 * DEGREE;
  // sincos of lon12 + error (AngRound is applied inside).
  const sincosLambda = sincosde(lon12, lon12s);
  const slam12 = sincosLambda[0];
  const clam12 = sincosLambda[1];
  lon12s = 180 - lon12 - lon12s; // the supplementary longitude difference

  // Point 1 is the one with the larger |latitude|, and lat1 <= 0. lonsign,
  // swapp and latsign record the transformation (1 = unchanged).
  const swapp = Math.abs(lat1) < Math.abs(lat2) ? -1 : 1;
  if (swapp < 0) {
    lonsign *= -1;
    const swap = lat1;
    lat1 = lat2;
    lat2 = swap;
  }
  const latsign = copySign(1, -lat1);
  lat1 *= latsign;
  lat2 *= latsign;
  // Now 0 <= lon12 <= 180, -90 <= lat1 <= 0 and lat1 <= lat2 <= -lat1.

  let sincos = sincosd(lat1);
  let sbet1 = model.f1 * sincos[0];
  let cbet1 = sincos[1];
  let t = hypot(sbet1, cbet1);
  sbet1 /= t;
  cbet1 /= t;
  cbet1 = Math.max(TINY, cbet1); // cbet1 = +epsilon at the poles

  sincos = sincosd(lat2);
  let sbet2 = model.f1 * sincos[0];
  let cbet2 = sincos[1];
  t = hypot(sbet2, cbet2);
  sbet2 /= t;
  cbet2 /= t;
  cbet2 = Math.max(TINY, cbet2);

  // If cbet1 < -sbet1, cbet2 - cbet1 is the sensitive measure of
  // |bet1| - |bet2|, otherwise |sbet2| + sbet1 is. Where it vanishes,
  // bet2 = +/-bet1 is enforced exactly (Lambda12 relies on it).
  if (cbet1 < -sbet1) {
    if (cbet2 === cbet1) sbet2 = copySign(sbet1, sbet2);
  } else if (Math.abs(sbet2) === -sbet1) {
    cbet2 = cbet1;
  }

  const dn1 = Math.sqrt(1 + model.ep2 * sq(sbet1));
  const dn2 = Math.sqrt(1 + model.ep2 * sq(sbet2));

  // Index 0 of these arrays is unused.
  const c1a = coefficientArray(GEODESIC_ORDER + 1);
  const c2a = coefficientArray(GEODESIC_ORDER + 1);
  const c3a = coefficientArray(C3_SIZE);

  let salp1 = 0;
  let calp1 = 0;
  let salp2 = 0;
  let calp2 = 0;
  let s12x = 0;
  let m12x = 0;
  let M12 = NaN;
  let M21 = NaN;
  let a12 = NaN;
  let sig12 = 0;
  let omg12 = 0;
  // somg12 = 2 marks "not yet known"; the area then uses sin/cos(omg12).
  let somg12 = 2;
  let comg12 = 0;
  let iterations = 0;

  let meridian = lat1 === -90 || slam12 === 0;
  if (meridian) {
    // Both points on one full meridian: the geodesic may be meridional.
    calp1 = clam12; // head to the target longitude
    salp1 = slam12;
    calp2 = 1; // at the target, heading north
    salp2 = 0;
    // tan(bet) = tan(sig) cos(alp)
    const ssig1 = sbet1;
    const csig1 = calp1 * cbet1;
    const ssig2 = sbet2;
    const csig2 = calp2 * cbet2;
    sig12 = Math.atan2(
      Math.max(0, csig1 * ssig2 - ssig1 * csig2),
      csig1 * csig2 + ssig1 * ssig2,
    );
    const meridional = lengths(
      model,
      model.n,
      sig12,
      ssig1,
      csig1,
      dn1,
      ssig2,
      csig2,
      dn2,
      cbet1,
      cbet2,
      ALL_LENGTHS,
      c1a,
      c2a,
    );
    s12x = meridional.s12b;
    m12x = meridional.m12b;
    M12 = meridional.M12;
    M21 = meridional.M21;
    // sig12 < TOL2 also accepts zero-length lines with m12 < 0.
    if (sig12 < TOL2 || m12x >= 0) {
      // 3 TINY handles 90 0 90 180; also prevents negative s12 or m12 for
      // short lines.
      if (sig12 < 3 * TINY || (sig12 < TOL0 && (s12x < 0 || m12x < 0))) {
        sig12 = 0;
        m12x = 0;
        s12x = 0;
      }
      m12x *= model.b;
      s12x *= model.b;
      a12 = sig12 / DEGREE;
    } else {
      // m12 < 0: prolate and too close to antipodal.
      meridian = false;
    }
  }

  if (
    !meridian &&
    sbet1 === 0 && // and sbet2 === 0
    (model.f <= 0 || lon12s >= model.f * 180)
  ) {
    // The geodesic runs along the equator.
    calp1 = 0;
    calp2 = 0;
    salp1 = 1;
    salp2 = 1;
    s12x = model.a * lam12;
    sig12 = lam12 / model.f1;
    omg12 = sig12;
    m12x = model.b * Math.sin(sig12);
    M12 = Math.cos(sig12);
    M21 = M12;
    a12 = lon12 / model.f1;
  } else if (!meridian) {
    // Neither meridional nor equatorial: point 1 and point 2 lie within a
    // hemisphere bounded by a meridian.
    const start = inverseStart(
      model,
      sbet1,
      cbet1,
      dn1,
      sbet2,
      cbet2,
      dn2,
      lam12,
      slam12,
      clam12,
      c1a,
      c2a,
    );
    sig12 = start.sig12;
    salp1 = start.salp1;
    calp1 = start.calp1;

    if (sig12 >= 0) {
      // Really short line, solved by inverseStart.
      salp2 = start.salp2;
      calp2 = start.calp2;
      const dnm = start.dnm;
      s12x = sig12 * model.b * dnm;
      m12x = sq(dnm) * model.b * Math.sin(sig12 / dnm);
      M12 = Math.cos(sig12 / dnm);
      M21 = M12;
      a12 = sig12 / DEGREE;
      omg12 = lam12 / (model.f1 * dnm);
    } else {
      // Newton's method on f(alp1) = lambda12(alp1) - lam12, which has one
      // root in (0, pi) with a positive derivative there. The bracket
      // (alp1a, alp1b) shrinks with every evaluation; Newton restarts from
      // its midpoint whenever a step would leave (0, pi) or the derivative
      // is not positive.
      let salp1a = TINY;
      let calp1a = 1;
      let salp1b = TINY;
      let calp1b = -1;
      let tripn = false;
      let tripb = false;
      let state = null;
      for (iterations = 0; ; iterations += 1) {
        state = lambda12(
          model,
          sbet1,
          cbet1,
          dn1,
          sbet2,
          cbet2,
          dn2,
          salp1,
          calp1,
          slam12,
          clam12,
          iterations < MAXIT1,
          c1a,
          c2a,
          c3a,
        );
        const v = state.lam12;
        const dv = state.dlam12;
        // The reversed test lets NaN escape. At the hard limit the last
        // iterate is used, as in GeographicLib: no error is thrown.
        if (
          tripb ||
          !(Math.abs(v) >= (tripn ? 8 : 1) * TOL0) ||
          iterations === MAXIT2
        ) {
          break;
        }
        // Update the bracket. While Newton steps are taken (iterations <=
        // MAXIT1) a point replaces a bound only if it narrows the bracket;
        // bisection points always lie inside it. This is GeographicLib 2.7
        // C++ (Geodesic.cpp: numit > maxit1_); the JavaScript port's
        // unconditional update can widen the bracket and leave a nearly
        // equatorial prolate line unconverged at the bisection limit.
        if (v > 0 && (iterations > MAXIT1 || calp1 / salp1 > calp1b / salp1b)) {
          salp1b = salp1;
          calp1b = calp1;
        } else if (
          v < 0 &&
          (iterations > MAXIT1 || calp1 / salp1 < calp1a / salp1a)
        ) {
          salp1a = salp1;
          calp1a = calp1;
        }
        if (iterations < MAXIT1 && dv > 0) {
          const dalp1 = -v / dv;
          if (Math.abs(dalp1) < Math.PI) {
            const sdalp1 = Math.sin(dalp1);
            const cdalp1 = Math.cos(dalp1);
            const nsalp1 = salp1 * cdalp1 + calp1 * sdalp1;
            if (nsalp1 > 0) {
              calp1 = calp1 * cdalp1 - salp1 * sdalp1;
              salp1 = nsalp1;
              t = hypot(salp1, calp1);
              salp1 /= t;
              calp1 /= t;
              // Where the slope tends to zero convergence is not
              // quadratic; then test against epsilon, not sqrt(epsilon).
              tripn = Math.abs(v) <= 16 * TOL0;
              continue;
            }
          }
        }
        // The derivative was not positive or the step left the legal
        // range: continue from the midpoint of the bracket.
        salp1 = (salp1a + salp1b) / 2;
        calp1 = (calp1a + calp1b) / 2;
        t = hypot(salp1, calp1);
        salp1 /= t;
        calp1 /= t;
        tripn = false;
        tripb =
          Math.abs(salp1a - salp1) + (calp1a - calp1) < TOLB ||
          Math.abs(salp1 - salp1b) + (calp1 - calp1b) < TOLB;
      }
      // Report longitude evaluations, not loop updates: the evaluation that
      // satisfies the stopping test counts too. The loop is only entered on
      // this non-closed-form path, so closed-form results keep iterations 0.
      iterations += 1;
      salp2 = state.salp2;
      calp2 = state.calp2;
      sig12 = state.sig12;
      // The reduced length and the scales are computed in the "canonical"
      // way, through the I2 integral, together with the distance.
      const measured = lengths(
        model,
        state.eps,
        sig12,
        state.ssig1,
        state.csig1,
        dn1,
        state.ssig2,
        state.csig2,
        dn2,
        cbet1,
        cbet2,
        ALL_LENGTHS,
        c1a,
        c2a,
      );
      s12x = measured.s12b * model.b;
      m12x = measured.m12b * model.b;
      M12 = measured.M12;
      M21 = measured.M21;
      a12 = sig12 / DEGREE;
      // omg12 = lam12 - domg12
      const sdomg12 = Math.sin(state.domg12);
      const cdomg12 = Math.cos(state.domg12);
      somg12 = slam12 * cdomg12 - clam12 * sdomg12;
      comg12 = clam12 * cdomg12 + slam12 * sdomg12;
    }
  }

  // Area between the geodesic and the equator (Karney 2013, section 6), in
  // the canonical frame, then given the sign of the transformation.
  // sin(alp1) cos(bet1) = sin(alp0)
  const salp0 = salp1 * cbet1;
  const calp0 = hypot(calp1, salp1 * sbet1); // calp0 > 0
  let S12 = 0;
  if (calp0 !== 0 && salp0 !== 0) {
    // tan(bet) = tan(sig) cos(alp)
    let ssig1 = sbet1;
    let csig1 = calp1 * cbet1;
    let ssig2 = sbet2;
    let csig2 = calp2 * cbet2;
    const eps = expansionParameter(sq(calp0) * model.ep2);
    // Multiplier a^2 e^2 cos(alp0) sin(alp0).
    const a4 = sq(model.a) * calp0 * salp0 * model.e2;
    t = hypot(ssig1, csig1);
    ssig1 /= t;
    csig1 /= t;
    t = hypot(ssig2, csig2);
    ssig2 /= t;
    csig2 /= t;
    const c4a = coefficientArray(C4_SIZE);
    c4f(model, eps, c4a);
    const b41 = cosSeries(ssig1, csig1, c4a);
    const b42 = cosSeries(ssig2, csig2, c4a);
    S12 = a4 * (b42 - b41);
  }
  // Otherwise sig1 and sig2 are indeterminate on the equator: S12 stays 0.
  if (!meridian && somg12 === 2) {
    somg12 = Math.sin(omg12);
    comg12 = Math.cos(omg12);
  }
  let alp12;
  if (
    !meridian &&
    comg12 > -0.7071 && // omg12 < 3/4 pi: longitude difference not too big
    sbet2 - sbet1 < 1.75 // latitude difference not too big
  ) {
    // tan(Gamma/2) = tan(omg12/2) (tan(bet1/2) + tan(bet2/2)) /
    // (1 + tan(bet1/2) tan(bet2/2)), with tan(x/2) = sin(x) / (1 + cos(x))
    const domg12 = 1 + comg12;
    const dbet1 = 1 + cbet1;
    const dbet2 = 1 + cbet2;
    alp12 =
      2 *
      Math.atan2(
        somg12 * (sbet1 * dbet2 + sbet2 * dbet1),
        domg12 * (sbet1 * sbet2 + dbet1 * dbet2),
      );
  } else {
    // alp12 = alp2 - alp1, used in atan2 so no need to normalise.
    let salp12 = salp2 * calp1 - calp2 * salp1;
    let calp12 = calp2 * calp1 + salp2 * salp1;
    // For alp1 = +/-180 and alp2 = 0 the sign of salp12 = 0 decides
    // alp12 = -180; set it explicitly (GeographicLib does the same).
    if (salp12 === 0 && calp12 < 0) {
      salp12 = TINY * calp1;
      calp12 = -1;
    }
    alp12 = Math.atan2(salp12, calp12);
  }
  S12 += model.c2 * alp12;
  S12 *= swapp * lonsign * latsign;
  S12 += 0; // -0 becomes 0

  const ambiguous = isAmbiguous(
    model,
    inputLatitude1,
    inputLatitude2,
    lon12,
  );
  const oppositePoles =
    Math.abs(inputLatitude1) === 90 && inputLatitude2 === -inputLatitude1;
  // The route over the pole is a shortest route between antipodes only on an
  // oblate ellipsoid or a sphere. On a prolate one the shortest routes leave
  // sideways, so the solved azimuths stand.
  const exactAntipodes =
    oppositePoles ||
    (model.f >= 0 && inputLatitude1 + inputLatitude2 === 0 && lon12 === 180);

  // Undo the canonical transformation.
  if (swapp < 0) {
    let swap = salp1;
    salp1 = salp2;
    salp2 = swap;
    swap = calp1;
    calp1 = calp2;
    calp2 = swap;
    swap = M12;
    M12 = M21;
    M21 = swap;
  }
  salp1 *= swapp * lonsign;
  calp1 *= swapp * latsign;
  salp2 *= swapp * lonsign;
  calp2 *= swapp * latsign;

  if (exactAntipodes) {
    // Exact antipodes take the route over the north pole (contract); every
    // route-dependent output describes that route, whichever equally short
    // route the solver found.
    const route = northPoleRoute(model, inputLatitude1);
    return {
      distance: 0 + s12x,
      azimuth1: 0,
      azimuth2: 180,
      a12: 180,
      m12: route.m12,
      M12: route.M12,
      M21: route.M21,
      S12: route.S12,
      iterations,
      ambiguous,
      exactAntipodes,
    };
  }

  return {
    distance: 0 + s12x, // -0 becomes 0
    azimuth1: atan2d(salp1, calp1),
    azimuth2: atan2d(salp2, calp2),
    a12,
    m12: 0 + m12x,
    M12,
    M21,
    S12,
    iterations,
    ambiguous,
    exactAntipodes,
  };
}
