package io.github.omcoskun.converttools.units;

/**
 * Exact length conversion entry point.
 *
 * <p>Use the {@link Rational} overload when chaining conversions so a
 * repeating decimal is never reduced to its display representation.</p>
 */
public final class LengthConverter {
    private static final String LENGTH = "length";

    private LengthConverter() {
    }

    public static UnitConversion convert(
            String input,
            String fromId,
            String toId,
            int precision
    ) {
        return UnitConverter.convert(
                input,
                LENGTH,
                fromId,
                toId,
                precision
        );
    }

    public static UnitConversion convert(
            Rational input,
            String fromId,
            String toId,
            int precision
    ) {
        return UnitConverter.convert(
                input,
                LENGTH,
                fromId,
                toId,
                precision
        );
    }
}
