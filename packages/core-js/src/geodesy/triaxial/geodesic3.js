/**
 * Geodesics on a triaxial ellipsoid by integration of the geodesic and
 * Jacobi equations in Cartesian coordinates (docs/TRIAXIAL_VALIDATION.md):
 *
 *   R' = V,  V' = -kappa n,  n = (X/a², Y/b², Z/c²),
 *   kappa = (Vx²/a² + Vy²/b² + Vz²/c²) / |n|²,
 *   m'' = -K m,  K = 1 / (a² b² c² |n|⁴)   (Gaussian curvature)
 *
 * with s the arc length. Two Jacobi solutions are carried: m (m(0) = 0,
 * m'(0) = 1) gives m12 = m(s) and M21 = m'(s); M (M(0) = 1, M'(0) = 0) gives
 * M12 = M(s). The integrator is Gragg-Bulirsch-Stoer: the modified midpoint
 * rule extrapolated in h² until two successive diagonal entries agree.
 * Lengths are scaled internally so that b = 1.
 * @module
 */
import {
  angle,
  cartToEllip,
  directionToHeading,
  ellipToCart,
  headingToDirection,
  projectToSurface,
} from "./ellipsoid3.js";

const DIM = 10;
const SEQUENCE = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
// Accept an extrapolated step when the last two diagonal entries agree to
// this (unit b); the accepted entry is several orders more accurate.
const STEP_TOLERANCE = 2e-15;
const MAX_SPLIT = 12;
// Rays in the azimuth fan of the inverse problem.
const RAYS = 180;
const NEWTON_ITERATIONS = 40;

/** The ellipsoid scaled to b = 1, with the shape constants of `model`. */
function unitModel(model) {
  const a = model.a / model.b;
  const c = model.c / model.b;
  return {
    a,
    b: 1,
    c,
    k: model.k,
    kp: model.kp,
    k2: model.k2,
    kp2: model.kp2,
    ia2: 1 / (a * a),
    ic2: 1 / (c * c),
    // Macro step: 0.4 of the smallest principal radius of curvature, c²/a.
    step: (0.4 * c * c) / a,
    umbilical: !(model.k === 0 || model.kp === 0),
  };
}

function derivative(u, y, dy) {
  const nx = y[0] * u.ia2;
  const ny = y[1];
  const nz = y[2] * u.ic2;
  const n2 = nx * nx + ny * ny + nz * nz;
  const kappa = (y[3] * y[3] * u.ia2 + y[4] * y[4] + y[5] * y[5] * u.ic2) / n2;
  const curvature = (u.ia2 * u.ic2) / (n2 * n2);
  dy[0] = y[3];
  dy[1] = y[4];
  dy[2] = y[5];
  dy[3] = -kappa * nx;
  dy[4] = -kappa * ny;
  dy[5] = -kappa * nz;
  dy[6] = y[7];
  dy[7] = -curvature * y[6];
  dy[8] = y[9];
  dy[9] = -curvature * y[8];
}

function midpoint(u, y0, H, n) {
  const h = H / n;
  const z0 = y0.slice();
  const z1 = new Array(DIM);
  const f = new Array(DIM);
  derivative(u, z0, f);
  for (let i = 0; i < DIM; i += 1) z1[i] = z0[i] + h * f[i];
  for (let step = 1; step < n; step += 1) {
    derivative(u, z1, f);
    for (let i = 0; i < DIM; i += 1) {
      const t = z0[i] + 2 * h * f[i];
      z0[i] = z1[i];
      z1[i] = t;
    }
  }
  derivative(u, z1, f);
  const out = new Array(DIM);
  for (let i = 0; i < DIM; i += 1) out[i] = 0.5 * (z1[i] + z0[i] + h * f[i]);
  return out;
}

/** One extrapolated step of length H; null if the table does not converge. */
function extrapolatedStep(u, y, H) {
  const table = [];
  for (let k = 0; k < SEQUENCE.length; k += 1) {
    const row = [midpoint(u, y, H, SEQUENCE[k])];
    for (let j = 1; j <= k; j += 1) {
      const ratio = (SEQUENCE[k] / SEQUENCE[k - j]) ** 2 - 1;
      const current = row[j - 1];
      const previous = table[k - 1][j - 1];
      const next = new Array(DIM);
      for (let i = 0; i < DIM; i += 1) next[i] = current[i] + (current[i] - previous[i]) / ratio;
      row.push(next);
    }
    table.push(row);
    if (k > 0) {
      const last = table[k - 1][k - 1];
      let error = 0;
      for (let i = 0; i < DIM; i += 1) error = Math.max(error, Math.abs(row[k][i] - last[i]));
      if (error <= STEP_TOLERANCE) return row[k];
    }
  }
  return null;
}

/** A step of length H, split in halves until the extrapolation converges. */
function step(u, y, H, depth = 0) {
  const result = extrapolatedStep(u, y, H);
  if (result !== null) return result;
  if (depth >= MAX_SPLIT) return midpoint(u, y, H, SEQUENCE[SEQUENCE.length - 1]);
  return step(u, step(u, y, H / 2, depth + 1), H / 2, depth + 1);
}

/** Integrates the state over arc length s (unit b). */
function integrate(u, y0, s) {
  const count = Math.max(1, Math.ceil(Math.abs(s) / u.step));
  const H = s / count;
  let y = y0;
  for (let i = 0; i < count; i += 1) y = step(u, y, H);
  return y;
}

function initialState(u, bet, omg, alp) {
  const R = ellipToCart(u, bet, omg);
  const V = headingToDirection(u, bet, omg, alp);
  return [R[0], R[1], R[2], V[0], V[1], V[2], 0, 1, 1, 0];
}

/** Position, unit tangent and Jacobi values of a final state, on the surface. */
function finish(u, y) {
  const [R, V] = projectToSurface(u, [y[0], y[1], y[2]], [y[3], y[4], y[5]]);
  return { R, V, m: y[6], dm: y[7], M: y[8] };
}

/**
 * Direct problem. Angles are [sin, cos] pairs; s in the unit of the axes.
 * @returns {{ bet2: number[], omg2: number[], alp2: number[], m12: number,
 *   M12: number, M21: number }}
 */
export function solveTriaxialDirect(model, bet1, omg1, alp1, s) {
  const u = unitModel(model);
  const end = finish(u, integrate(u, initialState(u, bet1, omg1, alp1), s / model.b));
  const [bet2, omg2] = cartToEllip(u, end.R);
  const alp2 = directionToHeading(u, bet2, omg2, end.V);
  return { bet2, omg2, alp2, m12: end.m * model.b, M12: end.M, M21: end.dm };
}

function dot(x, y) {
  return x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
}

function cross(x, y) {
  return [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
}

function unitNormal(u, R) {
  const n = [R[0] * u.ia2, R[1], R[2] * u.ic2];
  const h = Math.sqrt(dot(n, n));
  return [n[0] / h, n[1] / h, n[2] / h];
}

/** (P2 - X) . V, which falls through 0 where the line passes closest to P2. */
function along(y, P2) {
  return (P2[0] - y[0]) * y[3] + (P2[1] - y[1]) * y[4] + (P2[2] - y[2]) * y[5];
}

function alongDerivative(u, y, P2) {
  const dy = new Array(DIM);
  derivative(u, y, dy);
  return -dot([y[3], y[4], y[5]], [y[3], y[4], y[5]]) + (P2[0] - y[0]) * dy[3] + (P2[1] - y[1]) * dy[4] + (P2[2] - y[2]) * dy[5];
}

function distance3(x, y) {
  return Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2);
}

/** Closest approaches to P2 of the line from y0, up to arc length sMax. */
function traceRay(u, y0, P2, sMax) {
  const events = [];
  const count = Math.ceil(sMax / u.step);
  const H = sMax / count;
  let y = y0;
  let f = along(y, P2);
  for (let i = 0; i < count; i += 1) {
    const next = step(u, y, H);
    const fNext = along(next, P2);
    if (f > 0 && fNext <= 0) {
      let d = (H * f) / (f - fNext);
      let at = step(u, y, d);
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const correction = -along(at, P2) / alongDerivative(u, at, P2);
        d = Math.min(H, Math.max(0, d + correction));
        at = step(u, y, d);
        if (Math.abs(correction) <= 1e-15) break;
      }
      events.push({ s: i * H + d, miss: distance3([at[0], at[1], at[2]], P2) });
    }
    y = next;
    f = fNext;
  }
  return events;
}

/**
 * Inverse problem: the shortest geodesic from (bet1, omg1) to (bet2, omg2).
 * Angles are [sin, cos] pairs. A fan of lines leaves point 1; each local
 * minimum (over the azimuth) of the distance by which a line misses point 2
 * starts a Newton iteration on (alp1, s); the shortest converged line wins.
 * @returns {{ s12: number, alp1: number[], alp2: number[], m12: number,
 *   M12: number, M21: number }}
 */
export function solveTriaxialInverse(model, bet1, omg1, bet2, omg2) {
  const u = unitModel(model);
  const P1 = ellipToCart(u, bet1, omg1);
  const P2 = ellipToCart(u, bet2, omg2);
  if (P1[0] === P2[0] && P1[1] === P2[1] && P1[2] === P2[2]) {
    return { s12: 0, alp1: angle(0), alp2: angle(0), m12: 0, M12: 1, M21: 1 };
  }
  // At an umbilical point the heading maps to the direction through 2 alp:
  // headings in [-90, 90) cover every direction once.
  const umbilic = u.umbilical && bet1[1] === 0 && omg1[0] === 0;
  const span = umbilic ? 180 : 360;
  const spacing = span / RAYS;
  const sMax = Math.PI * u.a;
  const rays = [];
  for (let j = 0; j < RAYS; j += 1) {
    const alpha = -span / 2 + j * spacing;
    rays.push({ alpha, events: traceRay(u, initialState(u, bet1, omg1, angle(alpha)), P2, sMax) });
  }
  const nearest = (events, s) => {
    let best = null;
    for (const event of events) if (best === null || Math.abs(event.s - s) < Math.abs(best.s - s)) best = event;
    return best;
  };
  const starts = [];
  for (let j = 0; j < RAYS; j += 1) {
    const left = rays[(j + RAYS - 1) % RAYS].events;
    const right = rays[(j + 1) % RAYS].events;
    for (const event of rays[j].events) {
      const l = nearest(left, event.s);
      const r = nearest(right, event.s);
      if ((l === null || event.miss <= l.miss) && (r === null || event.miss <= r.miss)) {
        starts.push({ alpha: rays[j].alpha, s: event.s });
      }
    }
  }
  let best = null;
  for (const start of starts) {
    const solution = newton(u, bet1, omg1, P2, start.alpha, start.s, spacing);
    if (solution && (best === null || solution.s < best.s)) best = solution;
  }
  if (best === null) return null;
  const alp2 = directionToHeading(u, bet2, omg2, best.end.V);
  // At an umbilical point alpha and alpha + 180 give the same direction;
  // report the heading by GeographicLib's rule (the heading on leaving).
  const alp1 = umbilic
    ? directionToHeading(u, bet1, omg1, headingToDirection(u, bet1, omg1, angle(best.alpha)))
    : angle(best.alpha);
  return {
    s12: best.s * model.b,
    alp1,
    alp2,
    m12: best.end.m * model.b,
    M12: best.end.M,
    M21: best.end.dm,
  };
}

/** Newton's method on (alp1, s) for the line through P2. */
function newton(u, bet1, omg1, P2, alpha0, s0, spacing) {
  let alpha = alpha0;
  let s = s0;
  let best = null;
  for (let iteration = 0; iteration < NEWTON_ITERATIONS; iteration += 1) {
    const start = angle(alpha);
    const V1 = headingToDirection(u, bet1, omg1, start);
    // dV1/dalp: the heading turned by 90 degrees (by 45 at an umbilical
    // point, where the direction depends on 2 alp, with twice the speed).
    const umbilic = u.umbilical && bet1[1] === 0 && omg1[0] === 0;
    const turned = headingToDirection(u, bet1, omg1, angle(alpha + (umbilic ? 45 : 90)));
    const speed = umbilic ? 2 : 1;
    const R1 = ellipToCart(u, bet1, omg1);
    const sense = Math.sign(dot(cross(unitNormal(u, R1), V1), turned)) || 1;
    const end = finish(u, integrate(u, [R1[0], R1[1], R1[2], V1[0], V1[1], V1[2], 0, 1, 1, 0], s));
    const r = [P2[0] - end.R[0], P2[1] - end.R[1], P2[2] - end.R[2]];
    const miss = Math.sqrt(dot(r, r));
    if (best === null || miss < best.miss) best = { alpha, s, end, miss };
    if (miss <= 1e-15 * u.a) break;
    if (iteration > 4 && miss > best.miss * 0.5 && best.miss < 1e-13) break;
    const W = cross(unitNormal(u, end.R), end.V);
    const ds = dot(r, end.V);
    let dalpha = (sense * dot(r, W)) / (end.m * speed) / (Math.PI / 180);
    if (!Number.isFinite(dalpha)) dalpha = 0;
    dalpha = Math.max(-spacing, Math.min(spacing, dalpha));
    alpha += dalpha;
    s += ds;
    if (!(s > 0)) return null;
  }
  return best.miss < 1e-12 ? best : null;
}
