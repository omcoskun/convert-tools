// The triaxial tool's calculations (spec 8.5). Every value comes from
// @omcoskun/convert-tools: the inverse and direct geodesic on a triaxial
// ellipsoid and the conversions to and from Cartesian coordinates, plus
// the exact call that produced each result. Pure: no React, no DOM.

import {
  cartesianToTriaxial,
  directTriaxialGeodesic,
  inverseTriaxialGeodesic,
  triaxialToCartesian,
} from "@omcoskun/convert-tools";
import { attempt } from "../../lib/attempt.js";
import { plainNumber } from "../../lib/number-text.js";

/** The modes, in the order the mode switch shows them. */
export const TRIAXIAL_MODES = Object.freeze(["inverse", "direct", "cartesian"]);

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/** A semi-axis as a number: config numbers as they are, text only as a plain decimal (NaN otherwise). */
function readAxis(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  return DECIMAL.test(text) ? Number(text) : Number.NaN;
}

/**
 * The semi-axes to compute with.
 * @param {{ id: string, a?: number, b?: number, c?: number } | null} preset
 *   a preset of config.triaxial.presets, or { id: "custom" } / null for the
 *   typed axes
 * @param {{ a?: string, b?: string, c?: string }} [custom] the typed axes
 * @returns {{ a: number, b: number, c: number }} values the core rejects
 *   (a < b, c <= 0, not a number) are passed on, so the core's own error
 *   (INVALID_ARGUMENT) reports them
 */
export function axesOf(preset, custom = {}) {
  const source = preset == null || preset.id === "custom" ? custom : preset;
  return { a: readAxis(source.a), b: readAxis(source.b), c: readAxis(source.c) };
}

const optionsOf = (axes) => ({ ellipsoid: axes });

/**
 * Ters: the shortest geodesic between (β₁, ω₁) and (β₂, ω₂).
 * @param {{ beta1: string, omega1: string, beta2: string, omega2: string }} form
 * @param {{ a: number, b: number, c: number }} axes
 */
export function runTriaxialInverse(form, axes) {
  return attempt(() =>
    inverseTriaxialGeodesic({ beta: form.beta1, omega: form.omega1 }, { beta: form.beta2, omega: form.omega2 }, optionsOf(axes)),
  );
}

/**
 * Doğrudan: the end of the geodesic leaving (β₁, ω₁) on a heading.
 * @param {{ beta1: string, omega1: string, azimuth: string, distance: string }} form
 * @param {{ a: number, b: number, c: number }} axes
 */
export function runTriaxialDirect(form, axes) {
  return attempt(() =>
    directTriaxialGeodesic({ beta: form.beta1, omega: form.omega1 }, form.azimuth, form.distance, optionsOf(axes)),
  );
}

/**
 * Kartezyen, one way: (β, ω) -> X, Y, Z.
 * @param {{ beta: string, omega: string }} form
 * @param {{ a: number, b: number, c: number }} axes
 */
export function runToCartesian(form, axes) {
  return attempt(() => triaxialToCartesian({ beta: form.beta, omega: form.omega }, optionsOf(axes)));
}

/**
 * Kartezyen, the other way: X, Y, Z -> (β, ω).
 * @param {{ x: string | number, y: string | number, z: string | number }} form
 * @param {{ a: number, b: number, c: number }} axes
 */
export function runFromCartesian(form, axes) {
  return attempt(() => cartesianToTriaxial({ x: form.x, y: form.y, z: form.z }, optionsOf(axes)));
}

/** "1.500" -> "1.5", "-0" -> "0": a plain decimal without trailing fraction zeros. */
const canonicalDecimal = (digits) => digits.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "").replace(/^-0$/, "0");

/** A value in the call: a plain decimal as a JavaScript number, anything else as a string. */
function literal(value) {
  if (typeof value === "number") return Number.isFinite(value) ? plainNumber(value) : JSON.stringify(String(value));
  const text = String(value ?? "").trim();
  const match = /^(-?)0*(\d+(?:\.\d+)?)$/.exec(text);
  // A number literal only when JavaScript keeps every typed digit; else the text, as the core was given it.
  const number = match ? `${match[1]}${match[2]}` : null;
  return number != null && plainNumber(Number(number)) === canonicalDecimal(number) ? number : JSON.stringify(text);
}

const pointLiteral = (beta, omega) => `{ beta: ${literal(beta)}, omega: ${literal(omega)} }`;

/**
 * The exact @omcoskun/convert-tools call that produced a result ("Kütüphane
 * çağrısı").
 * @param {"inverse" | "direct" | "toCartesian" | "fromCartesian"} mode
 * @param {object} form the inputs of that mode
 * @param {{ a: number, b: number, c: number }} axes
 */
export function triaxialSnippet(mode, form, axes) {
  const options = `{ ellipsoid: { a: ${literal(axes.a)}, b: ${literal(axes.b)}, c: ${literal(axes.c)} } }`;
  if (mode === "direct") {
    return `directTriaxialGeodesic(${pointLiteral(form.beta1, form.omega1)}, ${literal(form.azimuth)}, ${literal(form.distance)}, ${options})`;
  }
  if (mode === "toCartesian") return `triaxialToCartesian(${pointLiteral(form.beta, form.omega)}, ${options})`;
  if (mode === "fromCartesian") {
    return `cartesianToTriaxial({ x: ${literal(form.x)}, y: ${literal(form.y)}, z: ${literal(form.z)} }, ${options})`;
  }
  return `inverseTriaxialGeodesic(${pointLiteral(form.beta1, form.omega1)}, ${pointLiteral(form.beta2, form.omega2)}, ${options})`;
}
