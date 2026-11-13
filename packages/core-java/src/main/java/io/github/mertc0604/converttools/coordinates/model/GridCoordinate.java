package io.github.mertc0604.converttools.coordinates.model;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;

public record GridCoordinate(
        int zone,
        boolean north,
        double easting,
        double northing
) {
    public GridCoordinate {
        if (zone < 0 || zone > 60) {
            throw new ConvertToolsException(ErrorCode.INVALID_ZONE,
                    "Grid zone must be between 0 and 60."
            );
        }
        if (!Double.isFinite(easting) || !Double.isFinite(northing)) {
            throw new ConvertToolsException(ErrorCode.INVALID_NUMBER,
                    "Grid coordinates must be finite."
            );
        }
    }
}
