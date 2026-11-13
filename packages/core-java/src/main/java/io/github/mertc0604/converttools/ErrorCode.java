package io.github.mertc0604.converttools;

/**
 * Stable error codes, identical to the JavaScript core's {@code ERROR_CODES}
 * and to contracts/error-codes.json.
 */
public enum ErrorCode {
    /** An option or argument has the wrong shape or an impossible value. */
    INVALID_ARGUMENT,
    /** A numeric input is not a valid finite number. */
    INVALID_NUMBER,
    /** A number has more digits or a larger exponent than the exact arithmetic accepts. */
    INPUT_LIMIT_EXCEEDED,
    /** An exact rational division by zero was requested. */
    DIVISION_BY_ZERO,
    /** The unit category id is not in the catalogue. */
    UNKNOWN_UNIT_CATEGORY,
    /** The unit id is not in the requested category. */
    UNKNOWN_UNIT,
    /** A requested precision or digit count is outside its allowed range. */
    INVALID_PRECISION,
    /** Latitude is not finite or not within -90..90 degrees. */
    LATITUDE_OUT_OF_RANGE,
    /** Longitude is not finite or not within -180..180 degrees. */
    LONGITUDE_OUT_OF_RANGE,
    /** Degree/minute/second text cannot be parsed or its hemisphere is inconsistent. */
    INVALID_ANGLE,
    /** A UTM/UPS zone number is outside 0..60 (or 1..60 where UPS is not allowed). */
    INVALID_ZONE,
    /** A UTM/UPS hemisphere designator is not N or S. */
    INVALID_HEMISPHERE,
    /** The point cannot be expressed in the requested UTM zone or hemisphere. */
    OUTSIDE_UTM_DOMAIN,
    /** The point is more than 30 degrees from the requested pole. */
    OUTSIDE_UPS_DOMAIN,
    /** A UTM/UPS easting or northing is outside the projection's accepted area. */
    GRID_COORDINATE_OUT_OF_RANGE,
    /** MGRS text is malformed. */
    INVALID_MGRS,
    /** The MGRS 100 km square cannot lie in its zone and latitude band. */
    MGRS_SQUARE_NOT_IN_BAND,
    /** The grid position cannot be lettered as MGRS. */
    OUTSIDE_MGRS_DOMAIN,
    /** GARS text is malformed or names a nonexistent cell. */
    INVALID_GARS,
    /** GEOREF text is malformed or names a nonexistent cell. */
    INVALID_GEOREF,
    /** The coordinate reference system is not one of the supported EPSG codes. */
    UNSUPPORTED_CRS,
    /** The coordinates are outside the area where the CRS is defined. */
    OUTSIDE_CRS_DOMAIN,
    /** An iterative geodesic solution did not converge; no approximate result is returned. */
    NO_CONVERGENCE
}
