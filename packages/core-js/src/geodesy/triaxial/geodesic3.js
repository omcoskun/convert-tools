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
// Fine intervals per coarse ray spacing in the refinement fan; 0 disables
// the refinement.
const REFINE_RAYS = 16;
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

// Both running sums of the modified midpoint rule (z0 + h f and z0 + 2 h f)
// carry a Neumaier compensation term (a - sum + b, or b - sum + a when the
// increment is larger), so the round-off of every state update is kept and
// added back before the final average. Without it the round-off of the
// velocity accumulates along the line and moves the end point by about
// 1e-13 b.
function midpoint(u, y0, H, n) {
  const h = H / n;
  const z0 = y0.slice();
  const z1 = new Array(DIM);
  const e0 = new Array(DIM).fill(0);
  const e1 = new Array(DIM);
  const f = new Array(DIM);
  derivative(u, z0, f);
  for (let i = 0; i < DIM; i += 1) {
    const increment = h * f[i];
    const value = z0[i] + increment;
    z1[i] = value;
    e1[i] = Math.abs(z0[i]) >= Math.abs(increment) ? z0[i] - value + increment : increment - value + z0[i];
  }
  for (let step = 1; step < n; step += 1) {
    derivative(u, z1, f);
    for (let i = 0; i < DIM; i += 1) {
      const increment = 2 * h * f[i];
      const value = z0[i] + increment;
      const lost = Math.abs(z0[i]) >= Math.abs(increment) ? z0[i] - value + increment : increment - value + z0[i];
      const low = e0[i] + lost;
      z0[i] = z1[i];
      e0[i] = e1[i];
      z1[i] = value;
      e1[i] = low;
    }
  }
  derivative(u, z1, f);
  const out = new Array(DIM);
  for (let i = 0; i < DIM; i += 1) out[i] = 0.5 * (z1[i] + e1[i] + (z0[i] + e0[i]) + h * f[i]);
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

/**
 * Integrates the state over arc length s (unit b), carrying the round-off of
 * each macro step in a compensation term and projecting the state back onto
 * the ellipsoid and the tangent plane after every step.
 */
function integrate(u, y0, s) {
  const count = Math.max(1, Math.ceil(Math.abs(s) / u.step));
  const H = s / count;
  const y = y0.slice();
  const error = new Array(DIM).fill(0);
  const precise = new Array(DIM);
  for (let i = 0; i < count; i += 1) {
    for (let j = 0; j < DIM; j += 1) precise[j] = y[j] + error[j];
    const next = step(u, precise, H);
    // Keep the position on the ellipsoid and the velocity in its tangent plane.
    const [R, V] = projectToSurface(u, [next[0], next[1], next[2]], [next[3], next[4], next[5]]);
    for (let j = 0; j < 3; j += 1) next[j] = R[j];
    for (let j = 0; j < 3; j += 1) next[3 + j] = V[j];
    for (let j = 0; j < 6; j += 1) {
      y[j] = next[j];
      error[j] = 0;
    }
    for (let j = 6; j < DIM; j += 1) {
      const increment = next[j] - precise[j];
      const value = y[j] + increment;
      error[j] += Math.abs(y[j]) >= Math.abs(increment) ? y[j] - value + increment : increment - value + y[j];
      y[j] = value;
    }
  }
  const out = new Array(DIM);
  for (let j = 0; j < DIM; j += 1) out[j] = y[j] + error[j];
  return out;
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
 * `tuning` is internal (the conformance tools use it to compare the search
 * with a finer one) and is not part of the public API: `tuning.rays` is the
 * number of coarse rays and `tuning.refineRays` the number of fine intervals
 * per coarse ray spacing in the refinement fan.
 * @param {object} model
 * @param {number[]} bet1
 * @param {number[]} omg1
 * @param {number[]} bet2
 * @param {number[]} omg2
 * @param {{ rays?: number, refineRays?: number }} [tuning]
 * @returns {{ s12: number, alp1: number[], alp2: number[], m12: number,
 *   M12: number, M21: number, ambiguous: boolean } | null}
 */
export function solveTriaxialInverse(model, bet1, omg1, bet2, omg2, tuning = {}) {
  const { rays = RAYS, refineRays = REFINE_RAYS } = tuning;
  const u = unitModel(model);
  const P1 = ellipToCart(u, bet1, omg1);
  const P2 = ellipToCart(u, bet2, omg2);
  if (P1[0] === P2[0] && P1[1] === P2[1] && P1[2] === P2[2]) {
    return { s12: 0, alp1: angle(0), alp2: angle(0), m12: 0, M12: 1, M21: 1, ambiguous: false };
  }
  // At an umbilical point the heading maps to the direction through 2 alp:
  // headings in [-90, 90) cover every direction once.
  const umb1 = u.umbilical && bet1[1] === 0 && omg1[0] === 0;
  const umb2 = u.umbilical && bet2[1] === 0 && omg2[0] === 0;
  const span = umb1 ? 180 : 360;
  const spacing = span / rays;
  const sMax = Math.PI * u.a;
  const fan = [];
  for (let j = 0; j < rays; j += 1) {
    const alpha = -span / 2 + j * spacing;
    fan.push({ alpha, events: traceRay(u, initialState(u, bet1, omg1, angle(alpha)), P2, sMax) });
  }
  const nearest = (events, s) => {
    let best = null;
    for (const event of events) if (best === null || Math.abs(event.s - s) < Math.abs(best.s - s)) best = event;
    return best;
  };
  const starts = [];
  for (let j = 0; j < rays; j += 1) {
    const left = fan[(j + rays - 1) % rays].events;
    const right = fan[(j + 1) % rays].events;
    for (const event of fan[j].events) {
      const l = nearest(left, event.s);
      const r = nearest(right, event.s);
      if ((l === null || event.miss <= l.miss) && (r === null || event.miss <= r.miss)) {
        starts.push({ alpha: fan[j].alpha, s: event.s, step: spacing });
      }
    }
  }
  let best = null;
  const solutions = [];
  for (const start of starts) {
    const solution = newton(u, bet1, omg1, P2, start.alpha, start.s, start.step);
    if (solution === null) continue;
    solutions.push(solution);
    if (best === null || solution.s < best.s) best = solution;
  }
  if (refineRays > 0) {
    // Two local minima of the miss can sit closer together than one coarse
    // ray spacing, and the missed one can lie up to two coarse cells from the
    // seed when the coarser line sits exactly on a ray (symmetric pairs do).
    // Refine every coarse seed with a fine fan over the seed's cell and its
    // neighbours and start Newton from the fine minima as well; a fine seed
    // limits the Newton update to the fine spacing.
    const fineSpacing = (2 * spacing) / refineRays;
    const fineStarts = [];
    for (const start of starts) {
      const fine = [];
      for (let k = 0; k <= 2 * refineRays; k += 1) {
        const alpha = start.alpha - 2 * spacing + k * fineSpacing;
        fine.push(traceRay(u, initialState(u, bet1, omg1, angle(alpha)), P2, sMax));
      }
      for (let k = 1; k < 2 * refineRays; k += 1) {
        const left = fine[k - 1];
        const right = fine[k + 1];
        const alpha = start.alpha - 2 * spacing + k * fineSpacing;
        for (const event of fine[k]) {
          const l = nearest(left, event.s);
          const r = nearest(right, event.s);
          if ((l === null || event.miss <= l.miss) && (r === null || event.miss <= r.miss)) {
            fineStarts.push({ alpha, s: event.s });
          }
        }
      }
    }
    for (const start of fineStarts) {
      const solution = newton(u, bet1, omg1, P2, start.alpha, start.s, fineSpacing);
      if (solution === null) continue;
      solutions.push(solution);
      if (best === null || solution.s < best.s) best = solution;
    }
  }
  if (best === null) return null;
  let alp2 = directionToHeading(u, bet2, omg2, best.end.V);
  let alp1 = umb1
    ? directionToHeading(u, bet1, omg1, headingToDirection(u, bet1, omg1, angle(best.alpha)))
    : angle(best.alpha);
  // GeographicLib's choice between equally short geodesics and between the
  // two heading labels of a direction at an umbilical point
  // (docs/TRIAXIAL_VALIDATION.md, "Eş uzunlukta jeodezikler ve umbilik yön
  // kuralları"). The mirror image in the plane z = 0 and the heading label
  // leave s12, m12, M12 and M21 unchanged.
  const onPlane = (bet, omg) => bet[1] === 0 || omg[0] === 0;
  const side = (omg) => (omg[0] < 0 ? -1 : 1);
  const opposite = umb1 && umb2 && bet1[0] === -bet2[0] && omg1[1] === -omg2[1];
  // A line leaving the plane bet = 0 has an equally short mirror image.
  let ambiguous = bet1[0] === 0 && bet2[0] === 0 && Math.abs(alp1[1]) > 1e-9;
  // R1: both points on the ellipse bet = 0; leave towards negative bet.
  if (bet1[0] === 0 && bet2[0] === 0 && alp1[1] > 0) {
    alp1 = [alp1[0], -alp1[1]];
    alp2 = [alp2[0], -alp2[1]];
  }
  // R2: umbilical start, end on the plane y = 0.
  if (umb1 && !opposite && onPlane(bet2, omg2) && Math.abs(alp1[1]) <= 1e-9) {
    alp1 = [Math.sign(omg1[1]) * side(omg2), 0];
  }
  // R3: umbilical end, start on the plane y = 0.
  if (umb2 && !opposite && onPlane(bet1, omg1) && Math.abs(alp2[1]) <= 1e-9) {
    alp2 = umb1 ? [Math.sign(omg2[1]), 0] : [-Math.sign(omg2[1]) * side(omg1), 0];
  }
  // Every direction from an umbilic reaches the antipodal umbilic with the
  // same length.
  if (opposite) ambiguous = true;
  // Two converged lines of the same length with different headings are
  // equally short geodesics.
  if (!ambiguous && solutions.length > 1) {
    const period = umb1 ? 180 : 360;
    for (const solution of solutions) {
      if (solution === best || !(Math.abs(solution.s - best.s) <= 1e-13)) continue;
      const wrapped = Math.abs(solution.alpha - best.alpha) % period;
      if (Math.min(wrapped, period - wrapped) > 1e-9) {
        ambiguous = true;
        break;
      }
    }
  }
  return {
    s12: best.s * model.b,
    alp1,
    alp2,
    m12: best.end.m * model.b,
    M12: best.end.M,
    M21: best.end.dm,
    ambiguous,
  };
}

/** Newton's method on (alp1, s) for the line through P2. */
function newton(u, bet1, omg1, P2, alpha0, s0, spacing) {
  let alpha = alpha0;
  let s = s0;
  let best = null;
  let lastBest = 0;
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
    if (best === null || miss < best.miss) {
      best = { alpha, s, end, miss };
      lastBest = iteration;
    }
    // Near an umbilic the reduced length is small and the iteration converges
    // slowly: keep going until the miss itself is well below the distance
    // tolerance, or for three iterations after the last improvement.
    if (miss <= 1e-14 * u.a) break;
    if (iteration - lastBest >= 3) break;
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
