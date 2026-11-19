package io.github.omcoskun.converttools.coordinates.model;

import java.util.Map;
import java.util.Objects;

public record CoordinateResult(
        CoordinatePoint point,
        String dd,
        String dms,
        String ddm,
        String mgrs,
        String utmUps,
        String gars,
        String georef,
        Map<CoordinateFormat, CoordinateResolution> resolution,
        CoordinateSource.Kind sourceKind,
        Double sourceCellMetres,
        Double sourceCellDegrees
) {
    public CoordinateResult {
        Objects.requireNonNull(point, "point");
        Objects.requireNonNull(dd, "dd");
        Objects.requireNonNull(dms, "dms");
        Objects.requireNonNull(ddm, "ddm");
        Objects.requireNonNull(mgrs, "mgrs");
        Objects.requireNonNull(utmUps, "utmUps");
        Objects.requireNonNull(gars, "gars");
        Objects.requireNonNull(georef, "georef");
        resolution = Map.copyOf(
                Objects.requireNonNull(resolution, "resolution")
        );
        Objects.requireNonNull(sourceKind, "sourceKind");
    }
}
