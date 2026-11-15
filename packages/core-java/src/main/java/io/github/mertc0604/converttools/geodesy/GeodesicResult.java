package io.github.mertc0604.converttools.geodesy;

/**
 * {@code arcDegrees} is the arc length a12 on the auxiliary sphere,
 * {@code reducedLengthMetres} the reduced length m12,
 * {@code geodesicScale12} and {@code geodesicScale21} the geodesic scales M12
 * and M21, and {@code areaSquareMetres} the area S12 between the geodesic and
 * the equator (GeographicLib's a12, m12, M12, M21, S12).
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
        double areaSquareMetres
) {
}
