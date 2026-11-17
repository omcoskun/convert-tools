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
// Newton switches from the cheap to the accurate integrator below this miss
// (unit b); the cheap integrator's error is about 1e-5.
const CHEAP_MISS = 1e-4;
// Two converged lines of the same length are different geodesics only when
// their initial headings differ by more than this (degrees); two Newton runs
// that end on the same short or near-conjugate line can differ by ~1e-8.
const AMBIGUOUS_HEADING = 1e-6;

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

/** One classical fourth-order Runge-Kutta step of length h. */
function rk4(u, y, h) {
  const k1 = new Array(DIM);
  const k2 = new Array(DIM);
  const k3 = new Array(DIM);
  const k4 = new Array(DIM);
  const z = new Array(DIM);
  derivative(u, y, k1);
  for (let i = 0; i < DIM; i += 1) z[i] = y[i] + (h / 2) * k1[i];
  derivative(u, z, k2);
  for (let i = 0; i < DIM; i += 1) z[i] = y[i] + (h / 2) * k2[i];
  derivative(u, z, k3);
  for (let i = 0; i < DIM; i += 1) z[i] = y[i] + h * k3[i];
  derivative(u, z, k4);
  const out = new Array(DIM);
  for (let i = 0; i < DIM; i += 1) out[i] = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return out;
}

/**
 * Closest approaches to P2 of the line from y0, up to arc length sMax. The
 * fan only seeds Newton (which uses the accurate integrator), so the line is
 * traced with fixed RK4 steps of u.step / 2 and each closest approach is
 * located to about 1e-9. An event carries its arc length s, the distance
 * `miss` from P2, and `side`, the offset of P2 across the line (along
 * n x V): its sign tells on which side of the line P2 lies.
 */
function traceRaySeed(u, y0, P2, sMax) {
  const events = [];
  const h = u.step / 2;
  const count = Math.ceil(sMax / h);
  let y = y0;
  let f = along(y, P2);
  for (let i = 0; i < count; i += 1) {
    const next = rk4(u, y, h);
    const fNext = along(next, P2);
    if (f > 0 && fNext <= 0) {
      let d = (h * f) / (f - fNext);
      let at = rk4(u, y, d);
      for (let iteration = 0; iteration < 2; iteration += 1) {
        const correction = -along(at, P2) / alongDerivative(u, at, P2);
        d = Math.min(h, Math.max(0, d + correction));
        at = rk4(u, y, d);
        if (Math.abs(correction) <= 1e-9) break;
      }
      const R = [at[0], at[1], at[2]];
      const W = cross(unitNormal(u, R), [at[3], at[4], at[5]]);
      const side = (P2[0] - R[0]) * W[0] + (P2[1] - R[1]) * W[1] + (P2[2] - R[2]) * W[2];
      events.push({ s: i * h + d, miss: distance3(R, P2), side });
    }
    y = next;
    f = fNext;
  }
  return events;
}

/** The event of `events` whose arc length is nearest to s, or null. */
function nearestEvent(events, s) {
  let best = null;
  for (const event of events) if (best === null || Math.abs(event.s - s) < Math.abs(best.s - s)) best = event;
  return best;
}

/**
 * Newton seeds from a row of rays at a constant azimuth spacing, each ray
 * `{ alpha, events }`. `minima`: events whose miss is a local minimum
 * against the nearest events (in s) of the two neighbouring rays. `brackets`:
 * pairs of nearest events on neighbouring rays k, k + 1 on which `side`
 * changes sign, so that a line between them passes through P2; the seed is
 * interpolated linearly. A cyclic row joins the last ray to the first;
 * otherwise the two end rays only serve as neighbours of minima.
 */
function seedsOf(rows, spacing, cyclic) {
  const n = rows.length;
  const minima = [];
  const brackets = [];
  for (let k = cyclic ? 0 : 1; k < (cyclic ? n : n - 1); k += 1) {
    const left = rows[(k + n - 1) % n].events;
    const right = rows[(k + 1) % n].events;
    for (const event of rows[k].events) {
      const l = nearestEvent(left, event.s);
      const r = nearestEvent(right, event.s);
      if ((l === null || event.miss <= l.miss) && (r === null || event.miss <= r.miss)) {
        minima.push({ k, event, alpha: rows[k].alpha, s: event.s });
      }
    }
  }
  for (let k = 0; k < (cyclic ? n : n - 1); k += 1) {
    const next = rows[(k + 1) % n].events;
    for (const event of rows[k].events) {
      const other = nearestEvent(next, event.s);
      if (other === null || !(event.side * other.side < 0)) continue;
      const t = event.side / (event.side - other.side);
      brackets.push({ k, event, alpha: rows[k].alpha + t * spacing, s: event.s + t * (other.s - event.s) });
    }
  }
  return { minima, brackets };
}

/**
 * Inverse problem: the shortest geodesic from (bet1, omg1) to (bet2, omg2).
 * Angles are [sin, cos] pairs. A fan of lines leaves point 1; each local
 * minimum (over the azimuth) of the distance by which a line misses point 2,
 * and each pair of neighbouring lines that pass point 2 on opposite sides,
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
  const trace = (alpha) => traceRaySeed(u, initialState(u, bet1, omg1, angle(alpha)), P2, sMax);
  const coarseRows = [];
  for (let j = 0; j < rays; j += 1) {
    const alpha = -span / 2 + j * spacing;
    coarseRows.push({ alpha, events: trace(alpha) });
  }
  const coarse = seedsOf(coarseRows, spacing, true);
  // Seeds: { alpha, s, step }, step being the largest Newton update of alpha.
  // Every coarse minimum seeds Newton with the coarse spacing as step limit:
  // near the antipodal umbilic of an umbilical start the miss varies by less
  // than the seed tracer's error and only a long Newton step finds the line.
  const starts = coarse.minima.map((seed) => ({ alpha: seed.alpha, s: seed.s, step: spacing }));
  if (refineRays === 0) {
    for (const seed of coarse.brackets) starts.push({ alpha: seed.alpha, s: seed.s, step: spacing });
  } else {
    // Two local minima of the miss can sit closer together than one coarse
    // ray spacing, and the missed one can lie up to two coarse cells from the
    // seed when the coarser line sits exactly on a ray (symmetric pairs do).
    // Every coarse minimum is therefore also refined by a fine fan over its
    // cell and two neighbours on each side (refineRays fine rays per two
    // coarse cells; refineRays is even), whose minima and brackets seed Newton
    // with the fine spacing as step limit. A coarse bracket outside every fine
    // fan seeds Newton directly: near a caustic (m12 close to 0) the miss is
    // small over a wide range of azimuths and its local minimum can lie
    // several cells away from the line through P2.
    const fineSpacing = (2 * spacing) / refineRays;
    const perCell = refineRays / 2;
    const total = rays * perCell;
    const traced = new Map();
    const fineEvents = (g) => {
      const key = ((g % total) + total) % total;
      if (!traced.has(key)) traced.set(key, trace(-span / 2 + key * fineSpacing));
      return traced.get(key);
    };
    const centres = [...new Set(coarse.minima.map((seed) => seed.k))];
    const covered = new Set();
    for (const j of centres) for (let d = -2; d < 2; d += 1) covered.add((((j + d) % rays) + rays) % rays);
    for (const seed of coarse.brackets) {
      if (!covered.has(seed.k)) starts.push({ alpha: seed.alpha, s: seed.s, step: spacing });
    }
    const seenMinima = new Set();
    const seenBrackets = new Set();
    for (const j of centres) {
      const rows = [];
      for (let k = 0; k <= 2 * refineRays; k += 1) {
        const g = j * perCell - refineRays + k;
        rows.push({ alpha: -span / 2 + g * fineSpacing, events: fineEvents(g) });
      }
      const fine = seedsOf(rows, fineSpacing, false);
      for (const seed of fine.minima) {
        if (seenMinima.has(seed.event)) continue;
        seenMinima.add(seed.event);
        starts.push({ alpha: seed.alpha, s: seed.s, step: fineSpacing });
      }
      for (const seed of fine.brackets) {
        if (seenBrackets.has(seed.event)) continue;
        seenBrackets.add(seed.event);
        starts.push({ alpha: seed.alpha, s: seed.s, step: fineSpacing });
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
      if (Math.min(wrapped, period - wrapped) > AMBIGUOUS_HEADING) {
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

/** The state after arc length s, by fixed RK4 steps of at most u.step / 4. */
function integrateCheap(u, y0, s) {
  const count = Math.max(1, Math.ceil(Math.abs(s) / (u.step / 4)));
  const h = s / count;
  let y = y0;
  for (let i = 0; i < count; i += 1) y = rk4(u, y, h);
  return y;
}

/**
 * Newton's method on (alp1, s) for the line through P2. The first phase
 * follows the line with the cheap RK4 integrator (error about 1e-5 b) until
 * it passes within CHEAP_MISS of P2; the second phase finishes with the
 * accurate integrator. Each phase has up to NEWTON_ITERATIONS iterations and
 * stops after three iterations without a smaller miss.
 */
function newton(u, bet1, omg1, P2, alpha0, s0, spacing) {
  // dV1/dalp: the heading turned by 90 degrees (by 45 at an umbilical point,
  // where the direction depends on 2 alp, with twice the speed).
  const umbilic = u.umbilical && bet1[1] === 0 && omg1[0] === 0;
  const speed = umbilic ? 2 : 1;
  const R1 = ellipToCart(u, bet1, omg1);
  let alpha = alpha0;
  let s = s0;
  for (const accurate of [false, true]) {
    let best = null;
    let lastBest = 0;
    let reached = false;
    for (let iteration = 0; iteration < NEWTON_ITERATIONS; iteration += 1) {
      const V1 = headingToDirection(u, bet1, omg1, angle(alpha));
      const turned = headingToDirection(u, bet1, omg1, angle(alpha + (umbilic ? 45 : 90)));
      const sense = Math.sign(dot(cross(unitNormal(u, R1), V1), turned)) || 1;
      const y0 = [R1[0], R1[1], R1[2], V1[0], V1[1], V1[2], 0, 1, 1, 0];
      const end = finish(u, accurate ? integrate(u, y0, s) : integrateCheap(u, y0, s));
      const r = [P2[0] - end.R[0], P2[1] - end.R[1], P2[2] - end.R[2]];
      const miss = Math.sqrt(dot(r, r));
      if (best === null || miss < best.miss) {
        best = { alpha, s, end, miss };
        lastBest = iteration;
      }
      if (!accurate && miss <= CHEAP_MISS) {
        reached = true;
        break;
      }
      // Near an umbilic the reduced length is small and the iteration
      // converges slowly: keep going until the miss itself is well below the
      // distance tolerance, or for three iterations after the last improvement.
      if (accurate && miss <= 1e-14 * u.a) break;
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
    if (!accurate && !reached) return null;
    if (accurate) return best.miss < 1e-12 ? best : null;
  }
  return null;
}
