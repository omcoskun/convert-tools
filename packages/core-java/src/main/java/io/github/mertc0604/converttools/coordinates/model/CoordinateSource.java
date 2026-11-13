package io.github.mertc0604.converttools.coordinates.model;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import java.util.Objects;

public record CoordinateSource(
        CoordinatePoint point,
        Kind kind,
        Double cellMetres,
        Double cellDegrees
) {
    public enum Kind {
        POINT,
        CELL,
        AREA
    }

    public CoordinateSource {
        Objects.requireNonNull(point, "point");
        Objects.requireNonNull(kind, "kind");
        if (cellMetres != null
                && (!Double.isFinite(cellMetres) || cellMetres <= 0)) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "Cell resolution in metres must be positive."
            );
        }
        if (cellDegrees != null
                && (!Double.isFinite(cellDegrees) || cellDegrees <= 0)) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "Cell resolution in degrees must be positive."
            );
        }
        if (kind == Kind.POINT
                && (cellMetres != null || cellDegrees != null)) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "Point sources cannot declare a cell resolution."
            );
        }
        if (kind == Kind.CELL
                && (cellMetres == null) == (cellDegrees == null)) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "Cell sources require exactly one resolution unit."
            );
        }
        if (kind == Kind.AREA
                && (cellMetres != null || cellDegrees == null)) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "Area sources require an angular resolution."
            );
        }
    }

    public static CoordinateSource point(CoordinatePoint point) {
        return new CoordinateSource(point, Kind.POINT, null, null);
    }

    public static CoordinateSource gridCell(
            CoordinatePoint point,
            double cellMetres
    ) {
        return new CoordinateSource(point, Kind.CELL, cellMetres, null);
    }

    public static CoordinateSource angularCell(
            CoordinatePoint point,
            double cellDegrees
    ) {
        return new CoordinateSource(point, Kind.CELL, null, cellDegrees);
    }

    public static CoordinateSource area(
            CoordinatePoint point,
            double cellDegrees
    ) {
        return new CoordinateSource(point, Kind.AREA, null, cellDegrees);
    }
}
