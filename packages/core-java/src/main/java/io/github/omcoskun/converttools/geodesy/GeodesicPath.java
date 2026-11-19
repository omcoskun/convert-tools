package io.github.omcoskun.converttools.geodesy;

import java.util.List;

public record GeodesicPath(
        double distanceMetres,
        Double initialBearingDegrees,
        Double finalBearingDegrees,
        boolean azimuthDefined,
        boolean ambiguous,
        String ellipsoid,
        String algorithm,
        String solver,
        int iterations,
        List<GeoPoint> points,
        int segmentCount,
        double sampledMaximumSegmentMetres,
        double arcDegrees,
        double reducedLengthMetres,
        double geodesicScale12,
        double geodesicScale21,
        double areaSquareMetres
) {
    public GeodesicPath {
        points = List.copyOf(points);
    }

    static GeodesicPath from(
            GeodesicResult measurement,
            List<GeoPoint> points,
            int segmentCount,
            double sampledMaximumSegmentMetres
    ) {
        return new GeodesicPath(
                measurement.distanceMetres(),
                measurement.initialBearingDegrees(),
                measurement.finalBearingDegrees(),
                measurement.azimuthDefined(),
                measurement.ambiguous(),
                measurement.ellipsoid(),
                measurement.algorithm(),
                measurement.solver(),
                measurement.iterations(),
                points,
                segmentCount,
                sampledMaximumSegmentMetres,
                measurement.arcDegrees(),
                measurement.reducedLengthMetres(),
                measurement.geodesicScale12(),
                measurement.geodesicScale21(),
                measurement.areaSquareMetres()
        );
    }
}
