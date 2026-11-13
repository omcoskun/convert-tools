package io.github.mertc0604.converttools.coordinates.core;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import io.github.mertc0604.converttools.coordinates.model.CoordinatePoint;

import java.util.Locale;
import java.util.regex.Pattern;

public final class CoordinateMath {
    public static final double DEGREE = Math.PI / 180;
    public static final double RADIAN = 180 / Math.PI;

    private static final Pattern DECIMAL = Pattern.compile(
            "^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?$",
            Pattern.CASE_INSENSITIVE
    );

    private CoordinateMath() {
    }

    public static double parseNumber(String value, String name) {
        String source = value.trim().replace(',', '.');
        if (!DECIMAL.matcher(source).matches()) {
            throw new ConvertToolsException(ErrorCode.INVALID_NUMBER,
                    name + " is not a valid number."
            );
        }
        double result = Double.parseDouble(source);
        if (!Double.isFinite(result)) {
            throw new ConvertToolsException(ErrorCode.INVALID_NUMBER, name + " is not finite.");
        }
        return result;
    }

    public static CoordinatePoint point(double latitude, double longitude) {
        return new CoordinatePoint(latitude, longitude);
    }

    public static double normalizeLongitude(double longitude) {
        if (longitude >= -180 && longitude <= 180) {
            return longitude;
        }

        double normalized = ((longitude + 180) % 360 + 360) % 360 - 180;
        return normalized == -180 && longitude > 0 ? 180 : normalized;
    }

    public static String fixed(double value, int digits) {
        if (digits < 0 || digits > 15) {
            throw new ConvertToolsException(ErrorCode.INVALID_PRECISION,
                    "Fraction digits must be between 0 and 15."
            );
        }
        double threshold = 0.5 * Math.pow(10, -digits);
        double normalized = Math.abs(value) < threshold ? 0 : value;
        return String.format(Locale.ROOT, "%." + digits + "f", normalized);
    }

    public static String compactNumber(double value, int digits) {
        String result = fixed(value, digits);
        if (result.indexOf('.') >= 0) {
            result = result.replaceFirst("(\\.\\d*?)0+$", "$1")
                    .replaceFirst("\\.$", "");
        }
        return result;
    }
}
