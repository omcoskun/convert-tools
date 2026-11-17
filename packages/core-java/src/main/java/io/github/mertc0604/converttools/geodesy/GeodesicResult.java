package io.github.mertc0604.converttools.geodesy;

/**
 * {@code arcDegrees} is the arc length a12 on the auxiliary sphere,
 * {@code reducedLengthMetres} the reduced length m12,
 * {@code geodesicScale12} and {@code geodesicScale21} the geodesic scales M12
 * and M21, and {@code areaSquareMetres} the area S12 between the geodesic and
 * the equator (GeographicLib's a12, m12, M12, M21, S12).
 *
 * <p>{@code bearingUncertaintyDegrees} is how far either azimuth may be from
 * the exact one: 1e-7 m / |m12| as an angle (the contract's azimuth tolerance
 * as an endpoint offset), at least 1e-11 degrees and at most 180. It is large
 * only for nearly antipodal points, where the azimuths depend on the last
 * bits of the input. {@code areaUncertaintySquareMetres} is how far
 * {@code areaSquareMetres} may be from the exact value: 2 c^2 times the
 * bearing uncertainty in radians plus 1e-14 c^2 of round-off (c the authalic
 * radius). Both are null when the azimuth is undefined.
 */
public record GeodesicResult(
        double distanceMetres,
        Double initialBearingDegrees,
        Double finalBearingDegrees,
        boolean azimuthDefined,
        boolean ambiguous,
        String ellipsoid,
        String algorithm,
        String solver,
        int iterations,
        double arcDegrees,
        double reducedLengthMetres,
        double geodesicScale12,
        double geodesicScale21,
        double areaSquareMetres,
        Double bearingUncertaintyDegrees,
        Double areaUncertaintySquareMetres
) {
}
