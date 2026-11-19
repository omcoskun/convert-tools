package io.github.omcoskun.converttools.coordinates.model;

import io.github.omcoskun.converttools.ConvertToolsException;
import io.github.omcoskun.converttools.ErrorCode;
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
