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
 * @property {number} [tolerance] Deprecated. Validated by `inverseGeodesic`
 *   as before, but ignored by Karney's solver, which carries its own stopping
 *   rules.
 * @property {number} [maxIterations] Deprecated. Validated by
 *   `inverseGeodesic` as before, but ignored by Karney's solver.
 */

/**
 * @typedef {object} GeodesicResult
 * @property {number} distanceMetres
 * @property {number | null} initialBearingDegrees null when undefined
 *   (coincident points)
 * @property {number | null} finalBearingDegrees
 * @property {boolean} azimuthDefined
 * @property {boolean} ambiguous more than one shortest geodesic joins the
 *   points: `lat1 + lat2 == 0` exactly and either both points are poles, or
 *   |lon12| is exactly 180°, or (for f > 0 only) |lon12| exceeds the cut
 *   locus 180 (1 - f A3(eps) cos(beta1)) by more than 1e-9°. For f < 0 only
 *   the pole and exact-180° conditions apply. A nearly antipodal but unique
 *   route is not ambiguous.
 * @property {string} ellipsoid
 * @property {"ellipsoidal"} algorithm
 * @property {"identity" | "karney-inverse"} solver
 * @property {number} iterations inverse: longitude evaluations performed by
 *   the Newton/bisection loop (the loop counter plus the final evaluation);
 *   0 only for the identity result and the closed-form meridional,
 *   equatorial and short-line paths
 * @property {number} arcDegrees arc length a12 on the auxiliary sphere
 * @property {number} reducedLengthMetres reduced length m12
 * @property {number} geodesicScale12 geodesic scale M12 (point 2 relative to
 *   point 1)
 * @property {number} geodesicScale21 geodesic scale M21
 * @property {number} areaSquareMetres area S12 between the geodesic and the
 *   equator: the counter-clockwise area of the quadrilateral (lat1, lon1),
 *   (0, lon1), (0, lon2), (lat2, lon2), as GeographicLib defines it. With
 *   exact antipodes all five describe the returned route over the north pole
 * @property {number | null} bearingUncertaintyDegrees how far either azimuth
 *   may be from the exact one: 1e-7 m / |m12| as an angle (the contract's
 *   azimuth tolerance as an endpoint offset), at least 1e-11° and at most
 *   180°. Large only for nearly antipodal points, where the azimuths depend
 *   on the last bits of the input; null when the azimuth is undefined
 * @property {number | null} areaUncertaintySquareMetres how far
 *   areaSquareMetres may be from the exact value: 2 c^2 times
 *   bearingUncertaintyDegrees in radians, plus 1e-14 c^2 of round-off (c the
 *   authalic radius); null when the azimuth is undefined
 */

/**
 * @typedef {object} DirectGeodesicResult
 * @property {number} latitude
 * @property {number} longitude
 * @property {number} finalBearingDegrees
 * @property {string} ellipsoid
 * @property {"karney-direct"} algorithm
 * @property {number} iterations always 0: the direct problem is closed form
 * @property {number} arcDegrees arc length a12 on the auxiliary sphere
 * @property {number} reducedLengthMetres reduced length m12
 * @property {number} geodesicScale12 geodesic scale M12 (point 2 relative to
 *   point 1)
 * @property {number} geodesicScale21 geodesic scale M21
 * @property {number} areaSquareMetres area S12 between the geodesic and the
 *   equator: the counter-clockwise area of the quadrilateral (lat1, lon1),
 *   (0, lon1), (0, lon2), (lat2, lon2), as GeographicLib defines it
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

/**
 * @typedef {object} TriaxialEllipsoid
 * @property {number} a largest semiaxis
 * @property {number} b middle semiaxis
 * @property {number} c smallest semiaxis; a >= b >= c > 0
 */

/**
 * @typedef {object} TriaxialOptions
 * @property {TriaxialEllipsoid} ellipsoid required
 */

/**
 * @typedef {object} TriaxialPoint
 * @property {number | string} beta ellipsoidal latitude in degrees, -90..90
 * @property {number | string} omega ellipsoidal longitude in degrees,
 *   -180..180
 */

/**
 * @typedef {object} TriaxialInverseResult
 * @property {number} distance length of the shortest geodesic, in the unit of
 *   the semiaxes
 * @property {number | null} initialAzimuthDegrees heading at the start,
 *   clockwise from the line of constant omega, [0, 360); null for coincident
 *   points
 * @property {number | null} finalAzimuthDegrees heading at the end; null for
 *   coincident points
 * @property {number} reducedLength reduced length m12
 * @property {number} geodesicScale12 geodesic scale M12
 * @property {number} geodesicScale21 geodesic scale M21
 * @property {boolean} ambiguous true when several shortest geodesics exist
 *   between the points and the result is only one of them; false for
 *   coincident points
 */

/**
 * @typedef {object} TriaxialDirectResult
 * @property {number} beta ellipsoidal latitude of the end, -90..90
 * @property {number} omega ellipsoidal longitude of the end, (-180, 180]
 * @property {number} finalAzimuthDegrees heading at the end, [0, 360)
 * @property {number} reducedLength reduced length m12
 * @property {number} geodesicScale12 geodesic scale M12
 * @property {number} geodesicScale21 geodesic scale M21
 */

export {};
