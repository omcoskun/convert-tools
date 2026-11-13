package io.github.mertc0604.converttools.units;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;

public final class UnitConverter {
    private UnitConverter() {
    }

    public static UnitConversion convert(
            String input,
            String categoryId,
            String fromId,
            String toId,
            int precision
    ) {
        return convert(
                Rational.parse(input),
                categoryId,
                fromId,
                toId,
                precision
        );
    }

    public static UnitConversion convert(
            Rational source,
            String categoryId,
            String fromId,
            String toId,
            int precision
    ) {
        if (precision < 0 || precision > 60) {
            throw new ConvertToolsException(ErrorCode.INVALID_PRECISION,
                    "precision must be between 0 and 60."
            );
        }
        UnitCategory category = UnitCatalog.category(categoryId);
        UnitDefinition from = category.unit(fromId);
        UnitDefinition to = category.unit(toId);
        Rational base = source.multiply(from.metresPerUnit());
        Rational result = base.divide(to.metresPerUnit());
        Rational factor = from.metresPerUnit().divide(to.metresPerUnit());
        Integer requiredFractionDigits = result.exactFractionDigits();
        boolean exactDecimal = requiredFractionDigits != null
                && requiredFractionDigits <= precision;

        return new UnitConversion(
                result,
                base,
                result.format(precision),
                exactDecimal,
                !exactDecimal,
                requiredFractionDigits != null,
                requiredFractionDigits,
                precision,
                "HALF_UP",
                factor,
                factor.format(precision),
                from,
                to
        );
    }
}
