/*
 * Triaxial ellipsoid and its ellipsoidal coordinates, ported from
 * GeographicLib's Triaxial::Ellipsoid3 (Ellipsoid3.cpp).
 *
 * Copyright (c) Charles Karney (2024-2025) <karney@alum.mit.edu> and licensed
 * under the MIT/X11 License. For more information, see
 * https://geographiclib.sourceforge.io/
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/**
 * The ellipsoid X²/a² + Y²/b² + Z²/c² = 1 with a >= b >= c > 0 and the
 * ellipsoidal latitude beta and longitude omega of Karney, "Jacobi's solution
 * for geodesics on a triaxial ellipsoid" (2025), section 2:
 *
 *   X = a cos(omega) sqrt(k² cos²(beta) + k'²)
 *   Y = b cos(beta) sin(omega)
 *   Z = c sin(beta) sqrt(k² + k'² sin²(omega))
 *
 * with k² = (b² - c²)/(a² - c²), k'² = (a² - b²)/(a² - c²) (k² = 1, k'² = 0
 * on a sphere). Headings alpha are measured clockwise from a line of constant
 * omega. Angles are handled as [sin, cos] pairs, as GeographicLib's Angle.
 * @module
 */
import { atan2d, sincosd } from "../core/angles.js";
import { ConvertToolsError } from "../../errors.js";

/** sqrt(x² + y²) without Math.hypot, as in the rest of the geodesic code. */
function hypot(x, y) {
  return Math.sqrt(x * x + y * y);
}

function hypot3(x, y, z) {
  return Math.sqrt(x * x + y * y + z * z);
}

function normalize(v) {
  const h = hypot3(v[0], v[1], v[2]);
  return [v[0] / h, v[1] / h, v[2] / h];
}

function finiteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ConvertToolsError("INVALID_ARGUMENT", `${name} must be a finite number.`);
  }
  return value;
}

/**
 * Validates semiaxes and derives the shape constants
 * (GeographicLib Ellipsoid3::Ellipsoid3(a, b, c)).
 * @param {{ a: number, b: number, c: number }} ellipsoid
 */
export function createTriaxialModel(ellipsoid) {
  if (ellipsoid === null || typeof ellipsoid !== "object") {
    throw new ConvertToolsError("INVALID_ARGUMENT", "ellipsoid { a, b, c } is required.");
  }
  const a = finiteNumber(ellipsoid.a, "ellipsoid.a");
  const b = finiteNumber(ellipsoid.b, "ellipsoid.b");
  const c = finiteNumber(ellipsoid.c, "ellipsoid.c");
  if (!(a >= b && b >= c && c > 0)) {
    throw new ConvertToolsError("INVALID_ARGUMENT", "ellipsoid semiaxes must satisfy a >= b >= c > 0.");
  }
  const s = (a - c) * (a + c);
  const kp2 = s === 0 ? 0 : ((a - b) * (a + b)) / s;
  const k2 = s === 0 ? 1 : ((b - c) * (b + c)) / s;
  return Object.freeze({ a, b, c, k2, kp2, k: Math.sqrt(k2), kp: Math.sqrt(kp2) });
}

/** [sin, cos] of an angle in degrees, exact at multiples of 90°. */
export function angle(degrees) {
  return sincosd(degrees);
}

/** Degrees of a [sin, cos] pair. */
export function degreesOf([s, c]) {
  return atan2d(s, c);
}

/** Cartesian position of (beta, omega) (Ellipsoid3::elliptocart2). */
export function ellipToCart(model, bet, omg) {
  const tx = hypot(model.k * bet[1], model.kp);
  const tz = hypot(model.k, model.kp * omg[0]);
  return [model.a * omg[1] * tx, model.b * bet[1] * omg[0], model.c * bet[0] * tz];
}

/**
 * Cartesian unit direction of heading alp at (beta, omega)
 * (Ellipsoid3::elliptocart2 with a heading), including the conventions at
 * umbilical points and at the poles of oblate and prolate ellipsoids.
 */
export function headingToDirection(model, bet, omg, alp) {
  const { a, b, c, k, kp, k2, kp2 } = model;
  const tx = hypot(k * bet[1], kp);
  const tz = hypot(k, kp * omg[0]);
  if (bet[1] === 0 && omg[0] === 0 && !(k === 0 || kp === 0)) {
    // Umbilical point (not oblate or prolate).
    const sa2 = 2 * alp[0] * alp[1];
    const ca2 = (alp[1] - alp[0]) * (alp[1] + alp[0]);
    return [((a * k) / b) * omg[1] * ca2, -omg[1] * bet[0] * sa2, -((c * kp) / b) * bet[0] * ca2];
  }
  let north;
  let east;
  if (tx === 0) {
    // At an oblate pole tx -> |cos(bet)|.
    const scb = Math.sign(1 / bet[1]) < 0 ? -1 : 1;
    north = [-omg[1] * bet[0] * scb, -omg[0] * bet[0], 0];
    east = [-omg[0], omg[1] * scb, 0];
  } else if (tz === 0) {
    // At a prolate pole tz -> |sin(omg)|.
    const sso = Math.sign(1 / omg[0]) < 0 ? -1 : 1;
    north = [0, -bet[0] * sso, bet[1]];
    east = [0, bet[1] * omg[1], bet[0] * omg[1] * sso];
  } else {
    north = [(-a * k2 * bet[1] * bet[0] * omg[1]) / tx, -b * bet[0] * omg[0], c * bet[1] * tz];
    east = [-a * tx * omg[0], b * bet[1] * omg[1], (c * kp2 * bet[0] * omg[1] * omg[0]) / tz];
  }
  north = normalize(north);
  east = normalize(east);
  return [
    alp[1] * north[0] + alp[0] * east[0],
    alp[1] * north[1] + alp[0] * east[1],
    alp[1] * north[2] + alp[0] * east[2],
  ];
}

/**
 * (beta, omega) of a position on the surface (Ellipsoid3::cart2toellipint);
 * the result has cos(beta) >= 0 (the conventional sheet).
 * @returns {[number[], number[]]} [bet, omg] as [sin, cos] pairs
 */
export function cartToEllip(model, R) {
  const { a, b, c, k, kp, k2, kp2 } = model;
  const xi = R[0] / a;
  const eta = R[1] / b;
  const zeta = R[2] / c;
  let g = k2 * xi * xi + (k2 - kp2) * eta * eta - kp2 * zeta * zeta;
  if (Math.abs(R[0]) === a * kp2 && R[1] === 0 && Math.abs(R[2]) === c * k2) g = 0;
  const h = hypot(g, 2 * k * kp * eta);
  let so;
  let cb;
  if (h === 0) {
    so = 0;
    cb = 0;
  } else if (g < 0) {
    so = (eta < 0 || Object.is(eta, -0) ? -1 : 1) * (Math.sqrt((h - g) / 2) / kp);
    cb = Math.abs(eta / so);
  } else {
    cb = Math.sqrt((h + g) / 2) / k;
    so = eta / cb;
  }
  const tz = hypot(k, kp * so);
  const tx = hypot(k * cb, kp);
  const sb = tz === 0 ? -1 : zeta / tz;
  const co = tx === 0 ? 1 : xi / tx;
  // Already unit pairs (GeographicLib constructs these Angles with normp).
  return [
    [sb, cb],
    [so, co],
  ];
}

/**
 * Heading of a unit tangent direction V at (beta, omega)
 * (Ellipsoid3::cart2toellip(bet, omg, V, alp)), with GeographicLib's rule at
 * umbilical points (the heading "on leaving the point").
 */
export function directionToHeading(model, bet, omg, V) {
  const { a, b, c, k, kp, k2, kp2 } = model;
  const tz = hypot(k, kp * omg[0]);
  const tx = hypot(k * bet[1], kp);
  if (tx === 0 || tz === 0 || !(bet[1] === 0 && omg[0] === 0)) {
    let north;
    let east;
    if (tx === 0) {
      north = [-omg[1] * bet[0], -omg[0] * bet[0], tx * bet[0]];
      east = [-omg[0], omg[1], tx];
    } else if (tz === 0) {
      north = [tz, -bet[0], bet[1]];
      east = [tz * omg[1], bet[1] * omg[1], bet[0] * omg[1]];
    } else {
      north = [(-a * k2 * bet[1] * bet[0] * omg[1]) / tx, -b * bet[0] * omg[0], c * bet[1] * tz];
      east = [-a * tx * omg[0], b * bet[1] * omg[1], (c * kp2 * bet[0] * omg[1] * omg[0]) / tz];
    }
    north = normalize(north);
    east = normalize(east);
    // north and east are orthonormal (the coordinate lines are lines of
    // curvature), so this pair is unit for a unit tangent V.
    return [
      V[0] * east[0] + V[1] * east[1] + V[2] * east[2],
      V[0] * north[0] + V[1] * north[1] + V[2] * north[2],
    ];
  }
  // Umbilical point: direction cosines of V with respect to the plane y = 0
  // give 2 alp.
  const w = bet[0] * omg[1];
  let upx = (omg[1] * tx) / a;
  let upz = (bet[0] * tz) / c;
  const nu = hypot(upx, upz);
  upx /= nu;
  upz /= nu;
  const s2a = -V[1] * w;
  const c2a = (upz * V[0] - upx * V[2]) * w;
  // For northern umbilical points alp flips to alp + pi.
  const flip = -bet[0];
  let sa;
  let ca;
  if (c2a >= 0) {
    sa = flip * s2a;
    ca = flip * (1 + c2a);
  } else {
    sa = flip * (s2a < 0 || Object.is(s2a, -0) ? -1 : 1) * (1 - c2a);
    ca = flip * Math.abs(s2a);
  }
  const n = hypot(sa, ca);
  return [sa / n, ca / n];
}

/**
 * Puts (bet, omg, alp) on the conventional sheet, cos(beta) >= 0
 * (Ellipsoid3::AngNorm with alt = false): beta -> pi - beta,
 * omega -> -omega, alpha -> pi + alpha leaves position and direction alone.
 */
export function conventionalSheet(bet, omg, alp) {
  if (!(bet[1] < 0 || Object.is(bet[1], -0))) return [bet, omg, alp];
  return [
    [bet[0], -bet[1]],
    [-omg[0], omg[1]],
    alp ? [-alp[0], -alp[1]] : alp,
  ];
}

/** Scales R onto the surface and projects V onto the tangent plane (Ellipsoid3::Norm). */
export function projectToSurface(model, R, V) {
  const ra = hypot3(R[0] / model.a, R[1] / model.b, R[2] / model.c);
  const P = [R[0] / ra, R[1] / ra, R[2] / ra];
  if (!V) return [P, V];
  const up = [P[0] / (model.a * model.a), P[1] / (model.b * model.b), P[2] / (model.c * model.c)];
  const u2 = up[0] * up[0] + up[1] * up[1] + up[2] * up[2];
  const f = (up[0] * V[0] + up[1] * V[1] + up[2] * V[2]) / u2;
  return [P, normalize([V[0] - f * up[0], V[1] - f * up[1], V[2] - f * up[2]])];
}
