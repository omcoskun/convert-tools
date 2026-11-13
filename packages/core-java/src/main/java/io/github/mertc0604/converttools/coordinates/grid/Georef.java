package io.github.mertc0604.converttools.coordinates.grid;

import io.github.mertc0604.converttools.coordinates.model.AngularCell;
import io.github.mertc0604.converttools.coordinates.model.CoordinatePoint;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class Georef {
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final String DEGREE_ALPHABET =
            ALPHABET.substring(0, 15);
    private static final Pattern VALUE = Pattern.compile(
            "^([A-HJ-NP-Z]{4})(\\d*)$"
    );

    private Georef() {
    }

    public static String encode(CoordinatePoint point) {
        return encode(point.longitude(), point.latitude(), 4);
    }

    public static String encode(CoordinatePoint point, int precision) {
        return encode(point.longitude(), point.latitude(), precision);
    }

    // GeographicLib Georef::Forward works in units of 1e-9 minute.
    private static final long UNITS_PER_DEGREE = 60000000000L;
    private static final int MAX_PRECISION = 11;

    /**
     * Encodes a point as GEOREF. Digits are truncated, never rounded. Same
     * integer algorithm as GeographicLib's Georef::Forward and the
     * JavaScript core; longitude +180° wraps to -180° and latitude +90°
     * belongs to the northernmost cell.
     */
    public static String encode(
            double longitude,
            double latitude,
            int precision
    ) {
        new CoordinatePoint(latitude, longitude);
        validatePrecision(precision);
        double lon = longitude == 180 ? -180 : longitude;
        double lat = latitude == 90
                ? latitude * (1 - Math.ulp(1.0) / 2)
                : latitude;
        long x = (long) Math.floor(lon * UNITS_PER_DEGREE)
                + 180 * UNITS_PER_DEGREE;
        long y = (long) Math.floor(lat * UNITS_PER_DEGREE)
                + 90 * UNITS_PER_DEGREE;
        int longitudeDegrees = (int) (x / UNITS_PER_DEGREE);
        int latitudeDegrees = (int) (y / UNITS_PER_DEGREE);
        StringBuilder result = new StringBuilder();
        result.append(ALPHABET.charAt(longitudeDegrees / 15));
        result.append(ALPHABET.charAt(latitudeDegrees / 15));
        result.append(DEGREE_ALPHABET.charAt(longitudeDegrees % 15));
        result.append(DEGREE_ALPHABET.charAt(latitudeDegrees % 15));
        if (precision > 0) {
            x -= UNITS_PER_DEGREE * longitudeDegrees;
            y -= UNITS_PER_DEGREE * latitudeDegrees;
            long divisor = 1;
            for (int k = 0; k < MAX_PRECISION - precision; k++) {
                divisor *= 10;
            }
            String digits = "%0" + precision + "d";
            result.append(String.format(Locale.ROOT, digits, x / divisor));
            result.append(String.format(Locale.ROOT, digits, y / divisor));
        }
        return result.toString();
    }

    public static AngularCell decode(String value) {
        String source = value.toUpperCase(Locale.ROOT)
                .replaceAll("\\s+", "");
        Matcher matcher = VALUE.matcher(source);
        if (!matcher.matches()
                || matcher.group(2).length() % 2 != 0
                || matcher.group(2).length() > 10) {
            throw new IllegalArgumentException(
                    "Invalid GEOREF coordinate."
            );
        }

        String letters = matcher.group(1);
        int longitudeZone = ALPHABET.indexOf(letters.charAt(0));
        int latitudeZone = ALPHABET.indexOf(letters.charAt(1));
        int longitudeDegree =
                DEGREE_ALPHABET.indexOf(letters.charAt(2));
        int latitudeDegree =
                DEGREE_ALPHABET.indexOf(letters.charAt(3));
        if (longitudeZone < 0
                || longitudeZone > 23
                || latitudeZone < 0
                || latitudeZone > 11
                || longitudeDegree < 0
                || latitudeDegree < 0) {
            throw new IllegalArgumentException(
                    "Invalid GEOREF grid letters."
            );
        }

        String digits = matcher.group(2);
        int precision = digits.length() / 2;
        String longitudeText = digits.substring(0, precision);
        String latitudeText = digits.substring(precision);
        double stepMinutes = precision == 0
                ? 60
                : Math.pow(10, 2 - precision);
        double longitudeMinutes = precision == 0
                ? 0
                : Integer.parseInt(longitudeText) * stepMinutes;
        double latitudeMinutes = precision == 0
                ? 0
                : Integer.parseInt(latitudeText) * stepMinutes;
        if (longitudeMinutes >= 60 || latitudeMinutes >= 60) {
            throw new IllegalArgumentException(
                    "Invalid GEOREF minute value."
            );
        }

        double cellDegrees = stepMinutes / 60;
        return new AngularCell(
                new CoordinatePoint(
                        -90
                                + latitudeZone * 15
                                + latitudeDegree
                                + (latitudeMinutes + stepMinutes / 2)
                                / 60,
                        -180
                                + longitudeZone * 15
                                + longitudeDegree
                                + (longitudeMinutes + stepMinutes / 2)
                                / 60
                ),
                precision,
                cellDegrees
        );
    }

    private static void validatePrecision(int precision) {
        if (precision < 0 || precision > 5) {
            throw new IllegalArgumentException(
                    "GEOREF precision must be between 0 and 5."
            );
        }
    }
}
