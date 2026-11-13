package io.github.mertc0604.converttools.units;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public record Rational(BigInteger numerator, BigInteger denominator) {
    private static final int MAX_DECIMAL_EXPONENT = 1000;
    private static final int MAX_INPUT_DIGITS = 4096;
    private static final int MAX_RATIONAL_DIGITS = 8192;
    private static final Pattern DECIMAL_PATTERN = Pattern.compile(
            "[+-]?(?:(?:\\d+(?:\\.\\d*)?)|(?:\\.\\d+))"
                    + "(?:[eE]([+-]?\\d+))?"
    );

    public Rational {
        Objects.requireNonNull(numerator, "numerator");
        Objects.requireNonNull(denominator, "denominator");
        requireDigitLimit(
                numerator,
                MAX_RATIONAL_DIGITS,
                "Rational numerator"
        );
        requireDigitLimit(
                denominator,
                MAX_RATIONAL_DIGITS,
                "Rational denominator"
        );
        if (denominator.signum() == 0) {
            throw new ConvertToolsException(ErrorCode.DIVISION_BY_ZERO, "Division by zero is not allowed.");
        }

        if (denominator.signum() < 0) {
            numerator = numerator.negate();
            denominator = denominator.negate();
        }

        if (numerator.signum() == 0) {
            denominator = BigInteger.ONE;
        } else {
            BigInteger divisor = numerator.gcd(denominator);
            numerator = numerator.divide(divisor);
            denominator = denominator.divide(divisor);
        }
    }

    public static Rational of(long numerator, long denominator) {
        return new Rational(
                BigInteger.valueOf(numerator),
                BigInteger.valueOf(denominator)
        );
    }

    public static Rational parse(String input) {
        String normalized = Objects.requireNonNull(input, "input")
                .trim()
                .replaceAll("\\s+", "")
                .replace(',', '.');
        Matcher matcher = DECIMAL_PATTERN.matcher(normalized);
        if (!matcher.matches()) {
            throw new ConvertToolsException(ErrorCode.INVALID_NUMBER, "Enter a valid decimal number.");
        }
        int exponentIndex = Math.max(
                normalized.indexOf('e'),
                normalized.indexOf('E')
        );
        String significand = exponentIndex < 0
                ? normalized
                : normalized.substring(0, exponentIndex);
        long digitCount = significand.chars()
                .filter(Character::isDigit)
                .count();
        if (digitCount > MAX_INPUT_DIGITS) {
            throw new ConvertToolsException(ErrorCode.INPUT_LIMIT_EXCEEDED,
                    "Decimal values must contain at most "
                            + MAX_INPUT_DIGITS
                            + " digits."
            );
        }
        String exponentText = matcher.group(1);
        if (exponentText != null) {
            final int exponent;
            try {
                exponent = Integer.parseInt(exponentText);
            } catch (NumberFormatException exception) {
                throw new ConvertToolsException(ErrorCode.INPUT_LIMIT_EXCEEDED,
                        "Exponent must be between -"
                                + MAX_DECIMAL_EXPONENT
                                + " and "
                                + MAX_DECIMAL_EXPONENT
                                + ".",
                        exception
                );
            }
            if (Math.abs((long) exponent) > MAX_DECIMAL_EXPONENT) {
                throw new ConvertToolsException(ErrorCode.INPUT_LIMIT_EXCEEDED,
                        "Exponent must be between -"
                                + MAX_DECIMAL_EXPONENT
                                + " and "
                                + MAX_DECIMAL_EXPONENT
                                + "."
                );
            }
        }

        BigDecimal decimal = new BigDecimal(normalized);
        BigInteger numerator = decimal.unscaledValue();
        int scale = decimal.scale();
        if (scale < 0) {
            return new Rational(
                    numerator.multiply(BigInteger.TEN.pow(-scale)),
                    BigInteger.ONE
            );
        }
        return new Rational(numerator, BigInteger.TEN.pow(scale));
    }

    private static void requireDigitLimit(
            BigInteger value,
            int maximum,
            String label
    ) {
        int digits = value.abs().toString().length();
        if (digits > maximum) {
            throw new ConvertToolsException(ErrorCode.INPUT_LIMIT_EXCEEDED,
                    label + " must contain at most " + maximum + " digits."
            );
        }
    }

    public Rational add(Rational other) {
        return new Rational(
                numerator.multiply(other.denominator)
                        .add(other.numerator.multiply(denominator)),
                denominator.multiply(other.denominator)
        );
    }

    public Rational subtract(Rational other) {
        return new Rational(
                numerator.multiply(other.denominator)
                        .subtract(other.numerator.multiply(denominator)),
                denominator.multiply(other.denominator)
        );
    }

    public Rational multiply(Rational other) {
        return new Rational(
                numerator.multiply(other.numerator),
                denominator.multiply(other.denominator)
        );
    }

    public Rational divide(Rational other) {
        if (other.numerator.signum() == 0) {
            throw new ConvertToolsException(ErrorCode.DIVISION_BY_ZERO, "Division by zero is not allowed.");
        }
        return new Rational(
                numerator.multiply(other.denominator),
                denominator.multiply(other.numerator)
        );
    }

    public boolean hasTerminatingDecimal() {
        return exactFractionDigits() != null;
    }

    public Integer exactFractionDigits() {
        BigInteger value = denominator;
        BigInteger two = BigInteger.TWO;
        BigInteger five = BigInteger.valueOf(5);
        int twos = 0;
        int fives = 0;
        while (value.mod(two).signum() == 0) {
            value = value.divide(two);
            twos++;
        }
        while (value.mod(five).signum() == 0) {
            value = value.divide(five);
            fives++;
        }
        return value.equals(BigInteger.ONE) ? Math.max(twos, fives) : null;
    }

    public String format(int maximumFractionDigits) {
        if (maximumFractionDigits < 0 || maximumFractionDigits > 60) {
            throw new ConvertToolsException(ErrorCode.INVALID_PRECISION,
                    "maximumFractionDigits must be between 0 and 60."
            );
        }
        BigDecimal decimal = new BigDecimal(numerator).divide(
                new BigDecimal(denominator),
                maximumFractionDigits,
                RoundingMode.HALF_UP
        );
        String output = decimal.stripTrailingZeros().toPlainString();
        return output.equals("-0") ? "0" : output;
    }
}
