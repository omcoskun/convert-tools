package io.github.mertc0604.converttools.coordinates.format;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import io.github.mertc0604.converttools.coordinates.model.CoordinatePoint;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class DmsFormat {
    private static final Pattern HEMISPHERE = Pattern.compile("[NSEW]");
    private static final Pattern SEPARATORS = Pattern.compile(
            "[°ºD:'′’\"″]",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern NUMBER_TOKEN = Pattern.compile(
            "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)"
    );
    private static final Pattern TRAILING_SOUTH = Pattern.compile(
            "S\\s*$",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern QUOTED_TRAILING_SOUTH = Pattern.compile(
            "[\"″]\\s*S\\s*$",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern UNSUPPORTED = Pattern.compile(
            "[^0-9+\\-.\\s]"
    );
    private static final Pattern SIGN = Pattern.compile("^[+-]");

    private DmsFormat() {
    }

    public static double parse(String value, CoordinateAxis axis) {
        Objects.requireNonNull(value, "value");
        Objects.requireNonNull(axis, "axis");
        String rawSource = value.trim().replace(',', '.');
        Matcher numberMatcher = NUMBER_TOKEN.matcher(rawSource);
        int numberCount = 0;
        while (numberMatcher.find()) {
            numberCount++;
        }
        if (axis == CoordinateAxis.LATITUDE
                && numberCount >= 3
                && TRAILING_SOUTH.matcher(rawSource).find()
                && !QUOTED_TRAILING_SOUTH.matcher(rawSource).find()) {
            throw new ConvertToolsException(ErrorCode.INVALID_ANGLE,
                    "A trailing S after three components is ambiguous. "
                            + "Use a seconds quote before S for south."
            );
        }
        String source = rawSource.toUpperCase(Locale.ROOT);
        if (source.isEmpty()) {
            throw new ConvertToolsException(ErrorCode.INVALID_ANGLE, "Angle is empty.");
        }

        Matcher hemisphereMatcher = HEMISPHERE.matcher(source);
        List<String> hemispheres = new ArrayList<>();
        while (hemisphereMatcher.find()) {
            hemispheres.add(hemisphereMatcher.group());
        }
        if (hemispheres.size() > 1) {
            throw new ConvertToolsException(ErrorCode.INVALID_ANGLE,
                    "Angle has multiple hemispheres."
            );
        }
        String hemisphere = hemispheres.isEmpty()
                ? null
                : hemispheres.get(0);
        if (hemisphere != null
                && ((axis == CoordinateAxis.LATITUDE
                && !"N".equals(hemisphere)
                && !"S".equals(hemisphere))
                || (axis == CoordinateAxis.LONGITUDE
                && !"E".equals(hemisphere)
                && !"W".equals(hemisphere)))) {
            throw new ConvertToolsException(ErrorCode.INVALID_ANGLE,
                    "Hemisphere does not match the coordinate axis."
            );
        }

        String cleaned = HEMISPHERE.matcher(source).replaceAll(" ");
        cleaned = SEPARATORS.matcher(cleaned).replaceAll(" ");
        cleaned = cleaned.replace('M', ' ').trim();
        if (UNSUPPORTED.matcher(cleaned).find()) {
            throw new ConvertToolsException(ErrorCode.INVALID_ANGLE,
                    "Angle contains unsupported characters."
            );
        }

        String[] parts = cleaned.isEmpty()
                ? new String[0]
                : cleaned.split("\\s+");
        if (parts.length < 1 || parts.length > 3) {
            throw new ConvertToolsException(ErrorCode.INVALID_ANGLE,
                    "Angle must contain degrees, optional minutes and seconds."
            );
        }

        double degrees = parsePart(parts[0]);
        double minutes = parts.length > 1 ? parsePart(parts[1]) : 0;
        double seconds = parts.length > 2 ? parsePart(parts[2]) : 0;
        if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
            throw new ConvertToolsException(ErrorCode.INVALID_ANGLE,
                    "Minutes and seconds must be in [0, 60)."
            );
        }
        for (int index = 1; index < parts.length; index++) {
            if (SIGN.matcher(parts[index]).find()) {
                throw new ConvertToolsException(ErrorCode.INVALID_ANGLE,
                        "Only degrees may have a sign."
                );
            }
        }

        boolean negativeZero =
                Double.doubleToRawLongBits(degrees)
                        == Double.doubleToRawLongBits(-0.0);
        int numericSign = degrees < 0 || negativeZero ? -1 : 1;
        int hemisphereSign = "S".equals(hemisphere)
                || "W".equals(hemisphere)
                ? -1
                : 1;
        if (hemisphere != null
                && numericSign < 0
                && hemisphereSign > 0) {
            throw new ConvertToolsException(ErrorCode.INVALID_ANGLE,
                    "The sign conflicts with the hemisphere."
            );
        }

        int sign = hemisphere == null ? numericSign : hemisphereSign;
        double result = sign
                * (Math.abs(degrees) + minutes / 60 + seconds / 3600);
        double maximum = axis == CoordinateAxis.LATITUDE ? 90 : 180;
        if (Math.abs(result) > maximum) {
            throw new ConvertToolsException(
                    axis == CoordinateAxis.LATITUDE
                            ? ErrorCode.LATITUDE_OUT_OF_RANGE
                            : ErrorCode.LONGITUDE_OUT_OF_RANGE,
                    axis.name().toLowerCase(Locale.ROOT)
                            + " is outside its valid range."
            );
        }
        return result;
    }

    public static CoordinatePoint parsePair(
            String latitude,
            String longitude
    ) {
        return new CoordinatePoint(
                parse(latitude, CoordinateAxis.LATITUDE),
                parse(longitude, CoordinateAxis.LONGITUDE)
        );
    }

    public static String formatDms(double value, CoordinateAxis axis) {
        return formatDms(value, axis, 5);
    }

    public static String formatDms(
            double value,
            CoordinateAxis axis,
            int secondDigits
    ) {
        validateValue(value, axis);
        validateDigits(secondDigits);
        Parts parts = encodeParts(value, 3600, secondDigits);
        int degreeWidth = axis == CoordinateAxis.LONGITUDE ? 3 : 2;
        return String.format(
                Locale.ROOT,
                "%0" + degreeWidth + "d°%02d'%02d%s\"%s",
                parts.degrees(),
                parts.units() / 60,
                parts.units() % 60,
                parts.fraction(),
                hemisphere(value, axis)
        );
    }

    public static String formatDdm(double value, CoordinateAxis axis) {
        return formatDdm(value, axis, 7);
    }

    public static String formatDdm(
            double value,
            CoordinateAxis axis,
            int minuteDigits
    ) {
        validateValue(value, axis);
        validateDigits(minuteDigits);
        Parts parts = encodeParts(value, 60, minuteDigits);
        int degreeWidth = axis == CoordinateAxis.LONGITUDE ? 3 : 2;
        return String.format(
                Locale.ROOT,
                "%0" + degreeWidth + "d°%02d%s'%s",
                parts.degrees(),
                parts.units(),
                parts.fraction(),
                hemisphere(value, axis)
        );
    }

    private static double parsePart(String value) {
        try {
            double number = Double.parseDouble(value);
            if (!Double.isFinite(number)) {
                throw new NumberFormatException("not finite");
            }
            return number;
        } catch (NumberFormatException error) {
            throw new ConvertToolsException(ErrorCode.INVALID_ANGLE,
                    "Angle contains an invalid number.",
                    error
            );
        }
    }

    private static void validateValue(double value, CoordinateAxis axis) {
        Objects.requireNonNull(axis, "axis");
        double maximum = axis == CoordinateAxis.LATITUDE ? 90 : 180;
        if (!Double.isFinite(value) || Math.abs(value) > maximum) {
            throw new ConvertToolsException(
                    axis == CoordinateAxis.LATITUDE
                            ? ErrorCode.LATITUDE_OUT_OF_RANGE
                            : ErrorCode.LONGITUDE_OUT_OF_RANGE,
                    "Angle is outside its valid range."
            );
        }
    }

    private static void validateDigits(int digits) {
        if (digits < 0 || digits > 9) {
            throw new ConvertToolsException(ErrorCode.INVALID_PRECISION,
                    "Angle precision must be between 0 and 9."
            );
        }
    }

    private static String hemisphere(double value, CoordinateAxis axis) {
        if (axis == CoordinateAxis.LATITUDE) {
            return value < 0 ? "S" : "N";
        }
        return value < 0 ? "W" : "E";
    }

    /**
     * Whole degrees, whole minutes or seconds below a degree (already carried)
     * and the decimal fraction text (".11400", or "" with no digits).
     */
    private record Parts(long degrees, int units, String fraction) {
    }

    /**
     * As GeographicLib DMS::Encode: the whole degrees are split off first
     * (exactly), the rest is turned into minutes or seconds with one rounding
     * and written with {@code digits} decimals, rounded exactly from the
     * binary value with an exact tie to even (as printf); a carry to 60 goes
     * into the next component. perDegree is 60 (minutes) or 3600 (seconds).
     */
    private static Parts encodeParts(double value, int perDegree, int digits) {
        double magnitude = Math.abs(value);
        double whole = Math.floor(magnitude);
        String text = new BigDecimal((magnitude - whole) * perDegree)
                .setScale(digits, RoundingMode.HALF_EVEN)
                .toPlainString();
        int point = text.indexOf('.');
        int units = Integer.parseInt(point < 0 ? text : text.substring(0, point));
        return new Parts(
                (long) whole + units / perDegree,
                units % perDegree,
                point < 0 ? "" : text.substring(point)
        );
    }
}
