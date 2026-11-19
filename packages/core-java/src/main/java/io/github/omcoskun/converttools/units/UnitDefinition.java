package io.github.omcoskun.converttools.units;

import io.github.omcoskun.converttools.ConvertToolsException;
import io.github.omcoskun.converttools.ErrorCode;
import java.util.Objects;

public record UnitDefinition(
        String id,
        String symbol,
        Rational metresPerUnit
) {
    public UnitDefinition {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(symbol, "symbol");
        Objects.requireNonNull(metresPerUnit, "metresPerUnit");
        if (metresPerUnit.numerator().signum() <= 0) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "metresPerUnit must be positive."
            );
        }
    }

    public static UnitDefinition linear(
            String id,
            String symbol,
            String scale
    ) {
        return new UnitDefinition(
                id,
                symbol,
                Rational.parse(scale)
        );
    }

    public static UnitDefinition linear(
            String id,
            String symbol,
            long numerator,
            long denominator
    ) {
        return new UnitDefinition(
                id,
                symbol,
                Rational.of(numerator, denominator)
        );
    }
}
