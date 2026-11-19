// The measure tool's calculations (spec 8.1). Every value comes from
// @omcoskun/convert-tools: this module picks the calls for the three modes,
// reads the model, turns results into scene lines and writes the exact call
// that produced them. Pure: no React, no DOM.

import {
  convertLength,
  directGeodesic,
  inverseGeodesic,
  measureGeodesicPolyline,
  sampleGeodesicPath,
} from "@omcoskun/convert-tools";
import { attempt } from "../../lib/attempt.js";
import { fixedDecimal, localeDecimal } from "../../lib/locale-decimal.js";
import { boundText, meaningfulDecimals, roundedDecimal } from "../../lib/meaningful-digits.js";
import { degreesText, plainNumber } from "../../lib/number-text.js";

/** The three modes, in the order the mode switch shows them. */
export const MEASURE_MODES = Object.freeze(["inverse", "direct", "route"]);

/** Length units a measured or typed distance can be shown or given in. */
export const LENGTH_UNITS = Object.freeze([
  { id: "kilometre", symbol: "km", decimals: 3, tagDecimals: 2 },
  { id: "nautical-mile", symbol: "NM", decimals: 3, tagDecimals: 2 },
  { id: "metre", symbol: "m", decimals: 1, tagDecimals: 0 },
]);

// Metres given to the core for a typed distance: 1e-9 m, well below what
// the geodesic resolves.
const METRE_DECIMALS = 9;

const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** A model parameter as a number: config numbers as they are, text only as a plain decimal (NaN otherwise). */
function readParameter(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  return DECIMAL.test(text) ? Number(text) : Number.NaN;
}

/**
 * The geodesic options of a model of config.measure.models.
 * @param {{ id: "wgs84" | "grs80" | "sphere" | "custom", a?: number, inverseFlattening?: number }} model
 * @param {{ a?: string, inverseFlattening?: string }} [custom] the typed
 *   parameters of the custom model: a in metres and the inverse flattening
 *   1/f, where "0" means f = 0, a sphere
 * @returns {{ ellipsoid?: { a: number, f: number } }} {} for WGS 84, the
 *   core's default. Values the core rejects are passed on, so the core's
 *   own error (INVALID_ARGUMENT) reports them.
 */
export function modelOptions(model, custom = {}) {
  if (model == null || model.id === "wgs84") return {};
  // A bare id ("sphere") or an entry without its parameters is a programming
  // error, not a value for the core to reject: say so instead of passing NaN.
  if (typeof model !== "object" || (model.id !== "custom" && (model.a == null || model.inverseFlattening == null))) {
    throw new TypeError(`modelOptions takes an entry of config.measure.models, not ${JSON.stringify(model)}`);
  }
  const source = model.id === "custom" ? custom : model;
  const a = readParameter(source.a);
  const inverseFlattening = readParameter(source.inverseFlattening);
  // 1/f = 0 is the usual way of writing a sphere (f = 0).
  const f = inverseFlattening === 0 ? 0 : 1 / inverseFlattening;
  return { ellipsoid: { a, f } };
}

const ORIGIN = Object.freeze({ latitude: 0, longitude: 0 });

/**
 * Whether the core accepts a model, before anything is measured with it.
 * @param {{ ellipsoid?: object }} options from modelOptions
 * @returns {{ ok: true } | { ok: false, code: string }}
 */
export function checkModel(options) {
  const result = attempt(() => inverseGeodesic(ORIGIN, ORIGIN, options));
  return result.ok ? { ok: true } : result;
}

/**
 * A distance in metres in the three units of the result, as the core's
 * exact conversions write them (trailing zeros dropped).
 * @param {number | string} metres
 * @returns {{ metre: string, kilometre: string, "nautical-mile": string }}
 */
export function lengthsOf(metres) {
  const text = String(metres);
  return {
    metre: convertLength(text, "metre", "metre", 3).value,
    kilometre: convertLength(text, "metre", "kilometre", 9).value,
    "nautical-mile": convertLength(text, "metre", "nautical-mile", 9).value,
  };
}

/**
 * Two points (spec 8.1 "İki nokta"): inverseGeodesic, drawn with
 * sampleGeodesicPath (whose result is the inverse result plus the points).
 * @param {{ latitude: string | number, longitude: string | number }[]} points A and B
 * @param {{ ellipsoid?: object }} options from modelOptions
 * @param {{ maxSegmentMetres?: number, maxPoints?: number }} pathOptions
 * @returns {{ ok: true, value: { inverse: object, lengths: ReturnType<typeof lengthsOf>, lines: object[] } } | { ok: false, code: string }}
 */
export function runInverse(points, options = {}, pathOptions = {}) {
  return attempt(() => {
    const [start, end] = points;
    const inverse = sampleGeodesicPath(start, end, { ...pathOptions, ...options });
    return {
      inverse,
      lengths: lengthsOf(inverse.distanceMetres),
      lines: [{ id: "inverse", points: inverse.points, gradient: true }],
    };
  });
}

/**
 * Points along a direct geodesic, sampled by calling directGeodesic at equal
 * steps of the distance. A line longer than half the globe is drawn the way
 * it is travelled, not as the shortest way between its ends.
 * @param {{ latitude: string | number, longitude: string | number }} start
 * @param {number | string} azimuth degrees
 * @param {number | string} distanceMetres non-negative
 * @param {{ ellipsoid?: object }} options
 * @param {{ maxSegmentMetres?: number, maxPoints?: number }} pathOptions
 * @returns {{ latitude: number, longitude: number }[]}
 */
export function directLinePoints(start, azimuth, distanceMetres, options = {}, pathOptions = {}) {
  const { maxSegmentMetres = 25000, maxPoints = 2049 } = pathOptions;
  const total = Number(distanceMetres);
  const steps = total > 0 ? Math.min(maxPoints - 1, Math.max(1, Math.ceil(total / maxSegmentMetres))) : 0;
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    // The last point is the core's own end point, not a rounded multiple.
    const along = index === steps ? distanceMetres : (total * index) / steps;
    const { latitude, longitude } = directGeodesic(start, azimuth, along, options);
    points.push({ latitude, longitude });
  }
  return points;
}

/**
 * Azimuth and distance (spec 8.1 "Azimut + mesafe"): the distance is
 * converted to metres by convertLength, then directGeodesic.
 * @param {{ start: { latitude: string, longitude: string }, azimuth: string, distance: string, unit: string }} request
 * @param {{ ellipsoid?: object }} options
 * @param {{ maxSegmentMetres?: number, maxPoints?: number }} pathOptions
 * @returns {{ ok: true, value: { direct: object, distanceMetres: string, lines: object[] } } | { ok: false, code: string }}
 */
export function runDirect({ start, azimuth, distance, unit }, options = {}, pathOptions = {}) {
  return attempt(() => {
    const distanceMetres = convertLength(distance, unit, "metre", METRE_DECIMALS).value;
    const direct = directGeodesic(start, azimuth, distanceMetres, options);
    const points = directLinePoints(start, azimuth, distanceMetres, options, pathOptions);
    return { direct, distanceMetres, lines: [{ id: "direct", points, gradient: true }] };
  });
}

/**
 * A route (spec 8.1 "Rota"): measureGeodesicPolyline, each segment drawn
 * with sampleGeodesicPath.
 * @param {{ latitude: string, longitude: string }[]} points two or more
 * @param {{ ellipsoid?: object }} options
 * @param {{ maxSegmentMetres?: number, maxPoints?: number }} pathOptions
 * @returns {{ ok: true, value: { polyline: object, lines: object[] } } | { ok: false, code: string }}
 */
export function runRoute(points, options = {}, pathOptions = {}) {
  return attempt(() => {
    const polyline = measureGeodesicPolyline(points, options);
    const lines = [];
    for (let index = 1; index < points.length; index += 1) {
      const path = sampleGeodesicPath(points[index - 1], points[index], { ...pathOptions, ...options });
      lines.push({ id: `segment-${index}`, points: path.points });
    }
    return { polyline, lines };
  });
}

/**
 * The same points measured on a sphere of the given radius, for comparison
 * with sphere-based web maps. Secondary: any failure means "no comparison"
 * and never an error of the main measurement.
 * @param {{ latitude: string | number, longitude: string | number }[]} points
 * @param {number} radiusMetres
 * @param {number} ellipsoidalMetres the main result, to compare against
 * @returns {null | { radiusMetres: number, metres: number, differenceMetres: number, differencePercent: number }}
 */
export function sphericalComparison(points, radiusMetres, ellipsoidalMetres) {
  const radius = Number(radiusMetres);
  if (!Number.isFinite(radius) || radius <= 0 || !(ellipsoidalMetres > 0)) return null;
  try {
    const metres = Number(measureGeodesicPolyline(points, { ellipsoid: { a: radius, f: 0 } }).distanceMetres);
    if (!Number.isFinite(metres)) return null;
    const differenceMetres = metres - ellipsoidalMetres;
    return { radiusMetres: radius, metres, differenceMetres, differencePercent: (differenceMetres / ellipsoidalMetres) * 100 };
  } catch {
    // Whatever the core says about this optional line, the measurement stands.
    return null;
  }
}

/**
 * A distance in metres shown in another unit, rounded by the core and
 * grouped for the language.
 * @param {number} metres
 * @param {string} unit length unit id of the core
 * @param {number} decimals
 * @param {string} language
 */
export function displayDistance(metres, unit, decimals, language) {
  return localeDecimal(convertLength(String(metres), "metre", unit, decimals).value, decimals, language);
}

/**
 * Square metres in square kilometres, exactly: 1 km² = (1 km / 1 m)² m², so
 * the core's metre-to-kilometre conversion is applied twice.
 * @param {number} squareMetres
 * @param {number} decimals
 */
export function squareKilometres(squareMetres, decimals) {
  const once = convertLength(String(squareMetres), "metre", "kilometre", 24).value;
  return convertLength(once, "metre", "kilometre", decimals).value;
}

// Marks a value shown with fewer digits than usual because its last digits
// mean nothing (a no-break space keeps the mark on the number's line).
const APPROXIMATE = "≈\u00a0";
// Azimuths: 4 decimals shown (about 1 cm at 10 km), at most 12 copied.
const ANGLE_DECIMALS = 4;
const ANGLE_COPY_DECIMALS = 12;
// S12: 3 decimals of km² shown, at most 9 copied; m² beneath with 1.
const AREA_DECIMALS = 3;
const AREA_COPY_DECIMALS = 9;
const SQUARE_METRE_DECIMALS = 1;

const withoutTrailingZeros = (digits) => (digits.includes(".") ? digits.replace(/\.?0+$/, "") : digits);

/**
 * An angle for display: 4 decimals grouped for the language, with a degree
 * sign. With an uncertainty (an inverse result's bearingUncertaintyDegrees),
 * only the decimals it leaves meaningful, at least whole degrees, marked ≈
 * when fewer than 4.
 * @param {number} degrees
 * @param {string} language
 * @param {number | null} [uncertainty] degrees
 */
export function displayAngle(degrees, language, uncertainty) {
  const decimals = Math.max(0, meaningfulDecimals(uncertainty, ANGLE_DECIMALS));
  const shown = `${localeDecimal(roundedDecimal(degrees, decimals), decimals, language)}°`;
  return decimals < ANGLE_DECIMALS ? APPROXIMATE + shown : shown;
}

/**
 * An angle as copied: without an uncertainty every digit (plainNumber);
 * with one, the decimals it leaves meaningful (at most 12, at least whole
 * degrees), without trailing zeros.
 * @param {number} degrees
 * @param {number | null} [uncertainty] degrees
 */
export function angleCopy(degrees, uncertainty) {
  if (!(uncertainty > 0)) return plainNumber(degrees);
  const decimals = Math.max(0, meaningfulDecimals(uncertainty, ANGLE_COPY_DECIMALS));
  return withoutTrailingZeros(roundedDecimal(degrees, decimals));
}

/**
 * The widest azimuth uncertainty among results whose azimuths are shown with
 * fewer than 4 decimals (see displayAngle), or null when none is.
 * @param {{ azimuthDefined: boolean, bearingUncertaintyDegrees?: number | null }[]} results
 * @returns {number | null}
 */
export function cutAzimuthBound(results) {
  let widest = null;
  for (const result of results) {
    const uncertainty = result.azimuthDefined ? result.bearingUncertaintyDegrees : null;
    if (meaningfulDecimals(uncertainty, ANGLE_DECIMALS) < ANGLE_DECIMALS && (widest === null || uncertainty > widest)) {
      widest = uncertainty;
    }
  }
  return widest;
}

/**
 * An angle bound for text, "0,0069": rounded up to two significant digits
 * and grouped for the language.
 * @param {number} degrees
 * @param {string} language
 */
export function displayBound(degrees, language) {
  const bound = boundText(degrees, ANGLE_COPY_DECIMALS);
  return localeDecimal(bound.text, Math.max(0, bound.decimals), language);
}

/** Square metres in square kilometres rounded to decimals (negative: tens of km², ...). */
function kilometresRounded(squareMetres, decimals) {
  return decimals >= 0 ? squareKilometres(squareMetres, decimals) : roundedDecimal(squareMetres / 1e6, decimals);
}

/**
 * S12 for display: km² with 3 decimals, copied with 9, and m² with 1
 * beneath. With an uncertainty (an inverse result's
 * areaUncertaintySquareMetres), only the km² decimals it leaves meaningful
 * (marked ≈ when fewer than 3; tens or thousands of km² when even whole km²
 * mean nothing), the same for the copy, and m² as "value ± uncertainty".
 * @param {number} squareMetres
 * @param {number | null} [uncertainty] square metres
 * @param {string} language
 * @returns {{ value: string, approximate: boolean, copyValue: string, note: string }}
 */
export function areaDisplay(squareMetres, uncertainty, language) {
  if (!(uncertainty > 0)) {
    return {
      value: localeDecimal(squareKilometres(squareMetres, AREA_DECIMALS), AREA_DECIMALS, language),
      approximate: false,
      copyValue: squareKilometres(squareMetres, AREA_COPY_DECIMALS),
      note: `${fixedDecimal(squareMetres, SQUARE_METRE_DECIMALS, language)} m²`,
    };
  }
  const squareKilometreUncertainty = uncertainty / 1e6;
  const decimals = meaningfulDecimals(squareKilometreUncertainty, AREA_DECIMALS);
  const approximate = decimals < AREA_DECIMALS;
  const shown = localeDecimal(kilometresRounded(squareMetres, decimals), Math.max(0, decimals), language);
  const bound = boundText(uncertainty, SQUARE_METRE_DECIMALS);
  const metreDecimals = Math.max(0, bound.decimals);
  return {
    value: approximate ? APPROXIMATE + shown : shown,
    approximate,
    copyValue: kilometresRounded(squareMetres, meaningfulDecimals(squareKilometreUncertainty, AREA_COPY_DECIMALS)),
    note: `${localeDecimal(roundedDecimal(squareMetres, bound.decimals), metreDecimals, language)} ± ${localeDecimal(bound.text, metreDecimals, language)} m²`,
  };
}

/** A computed point as point-field text: "latitude, longitude". */
export function pointText(latitude, longitude) {
  return `${degreesText(latitude)}, ${degreesText(longitude)}`;
}

/**
 * A distance in metres as field text in a unit, converted by the core
 * (micrometres: 6 decimals of a metre, 9 of a kilometre or nautical mile).
 * @param {number} metres
 * @param {string} unit
 */
export function lengthText(metres, unit) {
  return convertLength(String(metres), "metre", unit, unit === "metre" ? 6 : 9).value;
}

/** "1.500" -> "1.5", "-0" -> "0": a plain decimal without trailing fraction zeros. */
const canonicalDecimal = (digits) => digits.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "").replace(/^-0$/, "0");

/** A number in the call: a plain decimal as a JavaScript number, anything else as a string. */
function literal(value) {
  if (typeof value === "number") return Object.is(value, -0) ? "0" : String(value);
  const text = String(value).trim();
  const match = /^(-?)0*(\d+(?:\.\d+)?)$/.exec(text);
  // A number literal only when JavaScript keeps every typed digit; else the text, as the core was given it.
  const number = match ? `${match[1]}${match[2]}` : null;
  return number != null && plainNumber(Number(number)) === canonicalDecimal(number) ? number : JSON.stringify(text);
}

const pointLiteral = (point) => `{ latitude: ${literal(point.latitude)}, longitude: ${literal(point.longitude)} }`;

/**
 * The exact @omcoskun/convert-tools call that produced a result ("Kütüphane
 * çağrısı"), as JavaScript that gives the same result when run.
 * @param {"inverse" | "direct" | "route"} mode
 * @param {{ points: { latitude: string, longitude: string }[], azimuth?: string, distanceMetres?: string }} input
 *   the points given to the core; direct: the start, the azimuth and the
 *   distance in metres
 * @param {{ ellipsoid?: { a: number, f: number } }} options from modelOptions
 */
export function callSnippet(mode, input, options = {}) {
  const { ellipsoid } = options;
  const tail = ellipsoid ? `, { ellipsoid: { a: ${literal(ellipsoid.a)}, f: ${literal(ellipsoid.f)} } }` : "";
  if (mode === "direct") {
    return `directGeodesic(${pointLiteral(input.points[0])}, ${literal(input.azimuth)}, ${literal(input.distanceMetres)}${tail})`;
  }
  if (mode === "route") return `measureGeodesicPolyline([${input.points.map(pointLiteral).join(", ")}]${tail})`;
  return `inverseGeodesic(${pointLiteral(input.points[0])}, ${pointLiteral(input.points[1])}${tail})`;
}

/** Colour of a route point: the first in A colour, the last in B colour, the rest ink (spec 8.1). */
export function routeTone(index, count) {
  if (index === 0) return "a";
  return index === count - 1 ? "b" : "ink";
}

/** Route segments drawn with a distance tag at most; more tags would cover the map. */
export const MAX_TAGGED_SEGMENTS = 10;

/** A tag on the map's line: the distance rounded for the tag, or none for zero. */
function lineTag(metres, unit, language) {
  return Number(metres) > 0 ? `${displayDistance(metres, unit.id, unit.tagDecimals, language)} ${unit.symbol}` : undefined;
}

/**
 * The pins and lines of the measure tool's map scene (map/scene.js): one
 * draggable pin per valid point (A and B, or numbered route points in A
 * colour, ink and B colour), the computed end of a direct line as a hollow B
 * that cannot be dragged, and the lines with their distance tags.
 * @param {{
 *   mode: "inverse" | "direct" | "route",
 *   readings: { status: string, latitude?: string, longitude?: string }[],
 *   value: object | null,
 *   unit: { id: string, symbol: string, tagDecimals: number },
 *   distanceUnit: { id: string, symbol: string, tagDecimals: number },
 *   language: string,
 *   titles: { start: string, end: string, computed: string, route: (point: string) => string },
 * }} input
 *   readings: readPointText of each field; value: the open mode's run value
 * @returns {{ pins: object[], lines: object[] }}
 */
export function measureScene({ mode, readings, value, unit, distanceUnit, language, titles }) {
  const pins = [];
  readings.forEach((reading, index) => {
    if (reading.status !== "valid") return;
    const pin = { id: `pin-${index}`, draggable: true, latitude: Number(reading.latitude), longitude: Number(reading.longitude) };
    if (mode === "route") {
      const point = String(index + 1);
      pins.push({ ...pin, label: point, tone: routeTone(index, readings.length), title: titles.route(point) });
    } else {
      pins.push({ ...pin, label: index === 0 ? "A" : "B", tone: index === 0 ? "a" : "b", title: index === 0 ? titles.start : titles.end });
    }
  });
  let lines = [];
  if (value && mode === "inverse") {
    lines = value.lines.map((line) => ({ ...line, tag: lineTag(value.inverse.distanceMetres, unit, language) }));
  } else if (value && mode === "direct") {
    // B is computed: a hollow pin that cannot be dragged.
    pins.push({
      id: "end",
      label: "B",
      tone: "b",
      hollow: true,
      draggable: false,
      latitude: value.direct.latitude,
      longitude: value.direct.longitude,
      title: titles.computed,
    });
    lines = value.lines.map((line) => ({ ...line, tag: lineTag(value.distanceMetres, distanceUnit, language) }));
  } else if (value && mode === "route") {
    const tagged = value.lines.length <= MAX_TAGGED_SEGMENTS;
    lines = value.lines.map((line, index) => ({
      ...line,
      ...(tagged && { tag: lineTag(value.polyline.segments[index].distanceMetres, unit, language) }),
    }));
  }
  return { pins, lines };
}
