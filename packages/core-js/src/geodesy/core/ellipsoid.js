import { DEGREE, RADIAN } from "./numbers.js";

/**
 * WGS 84 defining parameters (NGA.STND.0036) and the UTM/UPS central scale
 * factors (NGA.SIG.0012).
 */
export const WGS84 = Object.freeze({
  id: "WGS84",
  a: 6378137,
  f: 1 / 298.257223563,
  b: 6356752.314245179,
  utmScale: 0.9996,
  upsScale: 0.994,
});

const eccentricitySquared = WGS84.f * (2 - WGS84.f);
const eccentricity = Math.sqrt(eccentricitySquared);

export const WGS84_DERIVED = Object.freeze({
  e: eccentricity,
  e2: eccentricitySquared,
  ep2: eccentricitySquared / (1 - eccentricitySquared),
  /** Third flattening n = f / (2 − f). */
  n: WGS84.f / (2 - WGS84.f),
});

function eatanhe(x) {
  return eccentricity * Math.atanh(eccentricity * x);
}

/**
 * tan(χ) of the conformal latitude χ from tan(φ) (Karney 2011, Eqs. 7–9).
 */
export function conformalTangent(tau) {
  if (!Number.isFinite(tau)) return tau;
  const tau1 = Math.hypot(1, tau);
  const sigma = Math.sinh(eatanhe(tau / tau1));
  return Math.hypot(1, sigma) * tau - sigma * tau1;
}

/**
 * Inverse of {@link conformalTangent}: tan(φ) from tan(χ) by Newton's method
 * (Karney 2011, Eqs. 19–21; same iteration as GeographicLib Math::tauf).
 */
export function inverseConformalTangent(taup) {
  const e2m = 1 - eccentricitySquared;
  const tolerance = Math.sqrt(Number.EPSILON) / 10;
  const tauMaximum = 2 / Math.sqrt(Number.EPSILON);
  let tau =
    Math.abs(taup) > 70 ? taup * Math.exp(eatanhe(1)) : taup / e2m;
  const stepTolerance = tolerance * Math.max(1, Math.abs(taup));
  if (!(Math.abs(tau) < tauMaximum)) return tau;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const estimate = conformalTangent(tau);
    const delta =
      ((taup - estimate) * (1 + e2m * tau * tau)) /
      (e2m * Math.hypot(1, tau) * Math.hypot(1, estimate));
    tau += delta;
    if (!(Math.abs(delta) >= stepTolerance)) break;
  }
  return tau;
}

export { DEGREE, RADIAN };
