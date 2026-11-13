// JSDoc types shared by the public API. This module has no run-time content;
// the functions reference these types as import("../types.js").Name.

/**
 * Exact rational number in lowest terms; `d` is always positive.
 * @typedef {{ readonly n: bigint, readonly d: bigint }} Rational
 */

/**
 * JSON-safe rational: decimal integer strings.
 * @typedef {{ readonly numerator: string, readonly denominator: string }} JsonRational
 */

/** @typedef {string | number | bigint} RationalComponent */

/**
 * Anything `toRational` accepts: a decimal string ("1852", "3e-4"), a safe
 * integer, a BigInt, a Rational, a JsonRational or a [numerator, denominator]
 * pair.
 * @typedef {string | number | bigint | Rational | JsonRational
 *   | readonly [RationalComponent, RationalComponent]} RationalInput
 */

/**
 * @typedef {object} UnitDefinition
 * @property {string} id stable identifier, e.g. "nautical-mile"
 * @property {string} label display name (Turkish in the built-in catalogue)
 * @property {string} symbol e.g. "NM"
 * @property {Rational} scale metres per unit
 * @property {Rational} offset
 * @property {string} [detail]
 */

/**
 * @typedef {object} UnitCategory
 * @property {string} id
 * @property {string} label
 * @property {string} defaultFrom
 * @property {string} defaultTo
 * @property {readonly UnitDefinition[]} units
 */

/**
 * @typedef {object} UnitConversion
 * @property {Rational} rational exact result
 * @property {string} value decimal text rounded HALF_UP to `precision` digits;
 *   for display only
 * @property {JsonRational} exactValue exact result; use this when chaining
 * @property {JsonRational | null} exactMetres
 * @property {JsonRational} exactFactor
 * @property {boolean} exactDecimal `value` is the exact result
 * @property {boolean} rounded
 * @property {boolean} terminatingDecimal
 * @property {number | null} requiredFractionDigits
 * @property {number} precision
 * @property {"HALF_UP"} roundingMode
 * @property {string} factor
 * @property {UnitDefinition} from
 * @property {UnitDefinition} to
 */

/**
 * Point given by the caller; strings are parsed as decimal degrees.
 * @typedef {{ readonly latitude: number | string, readonly longitude: number | string }} GeoPoint
 */

/** @typedef {{ readonly latitude: number, readonly longitude: number }} NumericGeoPoint */

/**
 * @typedef {object} Ellipsoid
 * @property {string} id
 * @property {number} a semi-major axis, metres
 * @property {number} b semi-minor axis, metres
 * @property {number} f flattening
 */

/**
 * @typedef {object} GeodesicOptions
 * @property {Ellipsoid} [ellipsoid] default WGS 84
 * @property {number} [tolerance]
 * @property {number} [maxIterations]
 */

/**
 * @typedef {object} GeodesicResult
 * @property {number} distanceMetres
 * @property {number | null} initialBearingDegrees null when undefined
 *   (coincident points)
 * @property {number | null} finalBearingDegrees
 * @property {boolean} azimuthDefined
 * @property {boolean} ambiguous several routes are equally short within the
 *   solver accuracy (antipodal points)
 * @property {string} ellipsoid
 * @property {"ellipsoidal"} algorithm
 * @property {"identity" | "vincenty-inverse" | "vincenty-direct-shooting"} solver
 * @property {number} iterations
 */

/**
 * @typedef {object} DirectGeodesicResult
 * @property {number} latitude
 * @property {number} longitude
 * @property {number} finalBearingDegrees
 * @property {string} ellipsoid
 * @property {"vincenty-direct"} algorithm
 * @property {number} iterations
 */

/**
 * @typedef {object} PolylineMeasurement
 * @property {number} distanceMetres
 * @property {number} segmentCount
 * @property {string} ellipsoid
 * @property {"ellipsoidal-segments"} algorithm
 * @property {readonly GeodesicResult[]} segments
 */

/**
 * @typedef {GeodesicOptions & {
 *   maxSegmentMetres?: number,
 *   maxPoints?: number,
 * }} GeodesicPathOptions
 * `maxSegmentMetres` is a requested upper bound for a drawn segment; the
 * `maxPoints` cap can make `sampledMaximumSegmentMetres` larger.
 */

/**
 * @typedef {GeodesicResult & {
 *   points: readonly NumericGeoPoint[],
 *   segmentCount: number,
 *   sampledMaximumSegmentMetres: number,
 * }} GeodesicPath
 * `distanceMetres` is the measurement; `points` are drawing vertices only.
 */

/**
 * UTM (zone 1–60) or UPS (zone 0) grid coordinate.
 * @typedef {object} GridCoordinate
 * @property {number} zone
 * @property {boolean} north
 * @property {number} easting metres
 * @property {number} northing metres
 */

/**
 * Decoded MGRS square.
 * @typedef {NumericGeoPoint & {
 *   zone: number,
 *   north: boolean,
 *   easting: number,
 *   northing: number,
 *   precision: number,
 *   cellMetres: number,
 * }} MgrsCell
 */

/**
 * Decoded GARS or GEOREF cell; the point is the cell centre.
 * @typedef {NumericGeoPoint & { precision: number, cellDegrees: number }} AngularCell
 */

/**
 * Point produced by a `from*` parser, with what the input could resolve.
 * @typedef {NumericGeoPoint & {
 *   sourceKind: "point" | "cell" | "area",
 *   sourceCellMetres?: number,
 *   sourceCellDegrees?: number,
 * }} CoordinateSource
 */

/**
 * @typedef {object} CrsTransformResult
 * @property {string} source normalised EPSG code
 * @property {string} target
 * @property {number} x
 * @property {number} y
 * @property {string} formattedX
 * @property {string} formattedY
 */

export {};
