package io.github.mertc0604.converttools.coordinates.model;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import java.util.Objects;

public record AngularCell(
        CoordinatePoint center,
        int precision,
        double cellDegrees
) {
    public AngularCell {
        Objects.requireNonNull(center, "center");
        if (precision < 0) {
            throw new ConvertToolsException(ErrorCode.INVALID_PRECISION,
                    "Angular cell precision cannot be negative."
            );
        }
        if (!Double.isFinite(cellDegrees) || cellDegrees <= 0) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "Angular cell resolution must be positive."
            );
        }
    }
}
