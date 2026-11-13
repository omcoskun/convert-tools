package io.github.mertc0604.converttools.coordinates.model;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import java.util.Objects;

public record CoordinateResolution(
        Kind kind,
        Unit unit,
        double step,
        double maximumError,
        ErrorModel errorModel,
        boolean decodedAtCellCenter
) {
    public enum Kind {
        ROUNDING,
        CELL
    }

    public enum Unit {
        DEGREES,
        METRES
    }

    public enum ErrorModel {
        PER_AXIS,
        EUCLIDEAN
    }

    public CoordinateResolution {
        Objects.requireNonNull(kind, "kind");
        Objects.requireNonNull(unit, "unit");
        Objects.requireNonNull(errorModel, "errorModel");
        if (!Double.isFinite(step) || step <= 0) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "Resolution step must be positive."
            );
        }
        if (!Double.isFinite(maximumError) || maximumError < 0) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "Maximum error cannot be negative."
            );
        }
    }

    public static CoordinateResolution angularRounding(double stepDegrees) {
        return new CoordinateResolution(
                Kind.ROUNDING,
                Unit.DEGREES,
                stepDegrees,
                stepDegrees / 2,
                ErrorModel.PER_AXIS,
                false
        );
    }

    public static CoordinateResolution gridRounding(double stepMetres) {
        return new CoordinateResolution(
                Kind.ROUNDING,
                Unit.METRES,
                stepMetres,
                stepMetres / 2,
                ErrorModel.PER_AXIS,
                false
        );
    }

    public static CoordinateResolution gridCell(double cellMetres) {
        return new CoordinateResolution(
                Kind.CELL,
                Unit.METRES,
                cellMetres,
                cellMetres * Math.sqrt(0.5),
                ErrorModel.EUCLIDEAN,
                true
        );
    }

    public static CoordinateResolution angularCell(double cellDegrees) {
        return new CoordinateResolution(
                Kind.CELL,
                Unit.DEGREES,
                cellDegrees,
                cellDegrees / 2,
                ErrorModel.PER_AXIS,
                true
        );
    }
}
