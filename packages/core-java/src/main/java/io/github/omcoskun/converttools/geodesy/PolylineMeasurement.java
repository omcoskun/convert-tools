package io.github.omcoskun.converttools.geodesy;

import java.util.List;

public record PolylineMeasurement(
        double distanceMetres,
        int segmentCount,
        String ellipsoid,
        String algorithm,
        List<GeodesicResult> segments
) {
    public PolylineMeasurement {
        segments = List.copyOf(segments);
    }
}
