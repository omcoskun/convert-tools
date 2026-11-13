package io.github.mertc0604.converttools.geodesy;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import java.util.Objects;

public record Ellipsoid(
        String id,
        double semiMajorAxisMetres,
        double flattening,
        double semiMinorAxisMetres
) {
    public static final Ellipsoid WGS84 = new Ellipsoid(
            "WGS84",
            6_378_137.0,
            1.0 / 298.257223563,
            6_356_752.314245179
    );

    public Ellipsoid {
        Objects.requireNonNull(id, "id");
        if (
                !Double.isFinite(semiMajorAxisMetres) ||
                !Double.isFinite(semiMinorAxisMetres) ||
                !Double.isFinite(flattening) ||
                semiMajorAxisMetres <= 0 ||
                semiMinorAxisMetres <= 0 ||
                flattening <= -1 ||
                flattening >= 1
        ) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT, "Ellipsoid parameters are invalid.");
        }
    }
}
