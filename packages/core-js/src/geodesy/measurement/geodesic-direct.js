/**
 * @license
 * Direct geodesic problem on an ellipsoid of revolution (Karney 2013),
 * solved on a geodesic line.
 *
 * Ported from GeographicLib's JavaScript implementation (geographiclib-js,
 * geodesic/GeodesicLine.js, https://github.com/geographiclib/geographiclib-js),
 * itself a transcription of GeographicLib's C++ class GeodesicLine. The
 * algorithms are derived in C. F. F. Karney, "Algorithms for geodesics",
 * J. Geodesy 87, 43–55 (2013), https://doi.org/10.1007/s00190-012-0578-z;
 * addenda: https://geographiclib.sourceforge.io/geod-addenda.html
 * Changes: a plain factory over numbers instead of a class, and every output
 * of a position (latitude, longitude, azimuth, arc length, reduced length,
 * geodesic scales, area) is always computed, as GeodSolve -f does.
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
// The line is the geodesic through point 1 with the given azimuth: its
// equator crossing azimuth alpha0, the arc sigma1 of point 1 from that
// crossing, and the distance series evaluated there. A position is then a
// fixed amount of arc further on (Karney 2013, sections 3-4).

import {
  angNormalize,
  angRound,
  atan2d,
  sincosd,
} from "../core/angles.js";
import { DEGREE } from "../core/numbers.js";
import {
  C3_SIZE,
  C4_SIZE,
  GEODESIC_ORDER,
  TINY,
  a1m1f,
  a2m1f,
  a3f,
  c1f,
  c1pf,
  c2f,
  c3f,
  c4f,
  coefficientArray,
  cosSeries,
  expansionParameter,
  hypot,
  sinSeries,
} from "./geodesic-series.js";

/**
 * Builds the geodesic line that starts at (latitude1, longitude1) with
 * azimuth azimuth1 and the series it needs for positions at any distance.
 * @param {ReturnType<import("./geodesic-series.js").createGeodesicModel>} model
 * @param {number} latitude1 degrees, [-90, 90]
 * @param {number} longitude1 degrees
 * @param {number} azimuth1 degrees
 * @returns {object} opaque line for {@link positionOnLine}
 */
export function createGeodesicLine(model, latitude1, longitude1, azimuth1) {
  const lat1 = angRound(latitude1);
  const azi1 = angNormalize(azimuth1);

  const azimuth = sincosd(angRound(azi1));
  const salp1 = azimuth[0];
  const calp1 = azimuth[1];

  const latitude = sincosd(lat1);
  let sbet1 = model.f1 * latitude[0];
  let cbet1 = latitude[1];
  let norm = hypot(sbet1, cbet1);
  sbet1 /= norm;
  cbet1 /= norm;
  cbet1 = Math.max(TINY, cbet1); // cbet1 = +epsilon at the poles
  const dn1 = Math.sqrt(1 + model.ep2 * sbet1 * sbet1);

  // sin(alp1) cos(bet1) = sin(alp0); calp0 > 0.
  const salp0 = salp1 * cbet1;
  const calp0 = hypot(calp1, salp1 * sbet1);

  // tan(bet1) = tan(sig1) cos(alp1); tan(omg1) = sin(alp0) tan(sig1).
  // sig = 0 is the nearest northward equator crossing.
  let ssig1 = sbet1;
  let csig1 = sbet1 !== 0 || calp1 !== 0 ? cbet1 * calp1 : 1;
  const somg1 = salp0 * sbet1;
  const comg1 = csig1; // omg1 need not be normalised
  norm = hypot(ssig1, csig1);
  ssig1 /= norm;
  csig1 /= norm;

  const k2 = calp0 * calp0 * model.ep2;
  const eps = expansionParameter(k2);

  const a1m1 = a1m1f(eps);
  const c1a = coefficientArray(GEODESIC_ORDER + 1);
  c1f(eps, c1a);
  const b11 = sinSeries(ssig1, csig1, c1a);
  const sinB11 = Math.sin(b11);
  const cosB11 = Math.cos(b11);
  // tau1 = sig1 + B11
  const stau1 = ssig1 * cosB11 + csig1 * sinB11;
  const ctau1 = csig1 * cosB11 - ssig1 * sinB11;

  const c1pa = coefficientArray(GEODESIC_ORDER + 1);
  c1pf(eps, c1pa);

  // Reduced length and geodesic scales (I2).
  const a2m1 = a2m1f(eps);
  const c2a = coefficientArray(GEODESIC_ORDER + 1);
  c2f(eps, c2a);
  const b21 = sinSeries(ssig1, csig1, c2a);

  const c3a = coefficientArray(C3_SIZE);
  c3f(model, eps, c3a);
  const a3c = -model.f * salp0 * a3f(model, eps);
  const b31 = sinSeries(ssig1, csig1, c3a);

  // Area (I4); every element of c4a is used.
  const c4a = coefficientArray(C4_SIZE);
  c4f(model, eps, c4a);
  // Multiplier a^2 e^2 cos(alp0) sin(alp0).
  const a4 = model.a * model.a * calp0 * salp0 * model.e2;
  const b41 = cosSeries(ssig1, csig1, c4a);

  return Object.freeze({
    model,
    lat1,
    lon1: longitude1,
    azi1,
    salp1,
    calp1,
    b: model.b,
    f1: model.f1,
    salp0,
    calp0,
    ssig1,
    csig1,
    somg1,
    comg1,
    dn1,
    k2,
    a1m1,
    b11,
    stau1,
    ctau1,
    c1a: Object.freeze(c1a.slice()),
    c1pa: Object.freeze(c1pa.slice()),
    a2m1,
    c2a: Object.freeze(c2a.slice()),
    b21,
    c3a: Object.freeze(c3a.slice()),
    a3c,
    b31,
    c4a: Object.freeze(c4a.slice()),
    a4,
    b41,
  });
}

/**
 * Position on the line at the given distance (GeographicLib
 * GeodesicLine::GenPosition with arcmode = false and every output).
 * @param {object} line from {@link createGeodesicLine}
 * @param {number} distanceMetres non-negative
 * @returns {{ latitude: number, longitude: number,
 *   finalBearingDegrees: number, a12: number, m12: number, M12: number,
 *   M21: number, S12: number }} degrees (the longitude reduced to
 *   [-180, 180]), metres, square metres
 */
export function positionOnLine(line, distanceMetres) {
  const { model } = line;

  // Interpret the distance as an arc length on the auxiliary sphere, using
  // the reverted distance series (C1').
  const tau12 = distanceMetres / (line.b * (1 + line.a1m1));
  const sinTau12 = Math.sin(tau12);
  const cosTau12 = Math.cos(tau12);
  // tau2 = tau1 + tau12
  let b12 = -sinSeries(
    line.stau1 * cosTau12 + line.ctau1 * sinTau12,
    line.ctau1 * cosTau12 - line.stau1 * sinTau12,
    line.c1pa,
  );
  let sig12 = tau12 - (b12 - line.b11);
  let ssig12 = Math.sin(sig12);
  let csig12 = Math.cos(sig12);
  let correctedSeries = false;

  if (Math.abs(model.f) > 0.01) {
    // The reverted series is inaccurate for |f| > 1/100: correct sig12 with
    // one Newton iteration (GeographicLib GeodesicLine::GenPosition).
    const ssig2 = line.ssig1 * csig12 + line.csig1 * ssig12;
    const csig2 = line.csig1 * csig12 - line.ssig1 * ssig12;
    b12 = sinSeries(ssig2, csig2, line.c1a);
    const seriesError =
      (1 + line.a1m1) * (sig12 + (b12 - line.b11)) - distanceMetres / line.b;
    sig12 -= seriesError / Math.sqrt(1 + line.k2 * ssig2 * ssig2);
    ssig12 = Math.sin(sig12);
    csig12 = Math.cos(sig12);
    correctedSeries = true; // b12 is updated below
  }

  // sig2 = sig1 + sig12
  const ssig2 = line.ssig1 * csig12 + line.csig1 * ssig12;
  let csig2 = line.csig1 * csig12 - line.ssig1 * ssig12;
  const dn2 = Math.sqrt(1 + line.k2 * ssig2 * ssig2);
  if (correctedSeries) b12 = sinSeries(ssig2, csig2, line.c1a);
  const ab1 = (1 + line.a1m1) * (b12 - line.b11);

  // sin(bet2) = cos(alp0) sin(sig2)
  const sbet2 = line.calp0 * ssig2;
  let cbet2 = hypot(line.salp0, line.calp0 * csig2);
  if (cbet2 === 0) {
    // salp0 = 0 and csig2 = 0: break the degeneracy.
    cbet2 = TINY;
    csig2 = TINY;
  }
  // tan(alp0) = cos(sig2) tan(alp2); no need to normalise.
  const salp2 = line.salp0;
  const calp2 = line.calp0 * csig2;

  // tan(omg2) = sin(alp0) tan(sig2); omg2 need not be normalised.
  const somg2 = line.salp0 * ssig2;
  const comg2 = csig2;
  const omg12 = Math.atan2(
    somg2 * line.comg1 - comg2 * line.somg1,
    comg2 * line.comg1 + somg2 * line.somg1,
  );
  const lam12 =
    omg12 +
    line.a3c * (sig12 + (sinSeries(ssig2, csig2, line.c3a) - line.b31));
  const lon12 = lam12 / DEGREE;
  const longitude = angNormalize(
    angNormalize(line.lon1) + angNormalize(lon12),
  );

  // Reduced length and geodesic scales.
  const b22 = sinSeries(ssig2, csig2, line.c2a);
  const ab2 = (1 + line.a2m1) * (b22 - line.b21);
  const j12 = (line.a1m1 - line.a2m1) * sig12 + (ab1 - ab2);
  // The parentheses keep the cancellation accurate for coincident points.
  const m12 =
    line.b *
    (dn2 * (line.csig1 * ssig2) -
      line.dn1 * (line.ssig1 * csig2) -
      line.csig1 * csig2 * j12);
  const t = (line.k2 * (ssig2 - line.ssig1) * (ssig2 + line.ssig1)) / (line.dn1 + dn2);
  const M12 = csig12 + ((t * ssig2 - csig2 * j12) * line.ssig1) / line.dn1;
  const M21 = csig12 - ((t * line.ssig1 - line.csig1 * j12) * ssig2) / dn2;

  // Area between the geodesic and the equator.
  const b42 = cosSeries(ssig2, csig2, line.c4a);
  let salp12;
  let calp12;
  if (line.calp0 === 0 || line.salp0 === 0) {
    // alp12 = alp2 - alp1, used in atan2 so no need to normalise.
    salp12 = salp2 * line.calp1 - calp2 * line.salp1;
    calp12 = calp2 * line.calp1 + salp2 * line.salp1;
  } else {
    // tan(alp) = tan(alp0) sec(sig), so tan(alp2 - alp1) =
    // calp0 salp0 (csig1 - csig2) / (salp0^2 + calp0^2 csig1 csig2), with
    // csig1 - csig2 written without cancellation.
    salp12 =
      line.calp0 *
      line.salp0 *
      (csig12 <= 0
        ? line.csig1 * (1 - csig12) + ssig12 * line.ssig1
        : ssig12 * ((line.csig1 * ssig12) / (1 + csig12) + line.ssig1));
    calp12 =
      line.salp0 * line.salp0 + line.calp0 * line.calp0 * line.csig1 * csig2;
  }
  const S12 = model.c2 * Math.atan2(salp12, calp12) + line.a4 * (b42 - line.b41);

  return {
    latitude: atan2d(sbet2, line.f1 * cbet2),
    longitude,
    finalBearingDegrees: atan2d(salp2, calp2),
    a12: sig12 / DEGREE,
    m12,
    M12,
    M21,
    S12,
  };
}
