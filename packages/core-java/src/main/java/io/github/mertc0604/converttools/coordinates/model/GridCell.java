package io.github.mertc0604.converttools.coordinates.model;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import java.util.Objects;

public record GridCell(
        CoordinatePoint point,
        int zone,
        boolean north,
        double easting,
        double northing,
        int precision,
        double cellMetres,
        boolean decodedAtCellCenter
) {
    public GridCell {
        Objects.requireNonNull(point, "point");
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
        if (precision < 0 || precision > 5) {
            throw new ConvertToolsException(ErrorCode.INVALID_PRECISION,
                    "Grid precision must be between 0 and 5."
            );
        }
        if (!Double.isFinite(cellMetres) || cellMetres <= 0) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "Grid cell resolution must be positive."
            );
        }
    }
}
