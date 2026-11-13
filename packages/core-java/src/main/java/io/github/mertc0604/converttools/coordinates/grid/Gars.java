package io.github.mertc0604.converttools.coordinates.grid;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import io.github.mertc0604.converttools.coordinates.model.AngularCell;
import io.github.mertc0604.converttools.coordinates.model.CoordinatePoint;

import java.util.Locale;
import java.util.regex.Pattern;

public final class Gars {
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final Pattern VALUE = Pattern.compile(
            "^\\d{3}[A-HJ-NP-Z]{2}(?:[1-4](?:[1-9])?)?$"
    );

    private Gars() {
    }

    public static String encode(CoordinatePoint point) {
        return encode(point.longitude(), point.latitude());
    }

    /**
     * Encodes a point as a 5-minute GARS cell (7 characters, e.g. "574JK19").
     * Follows GeographicLib's GARS::Forward: longitude +180° wraps to band
     * 001 and latitude +90° belongs to the northernmost cell.
     */
    public static String encode(double longitude, double latitude) {
        new CoordinatePoint(latitude, longitude);
        double lon = longitude == 180 ? -180 : longitude;
        double lat = latitude == 90
                ? latitude * (1 - Math.ulp(1.0) / 2)
                : latitude;
        // Work in 5-minute units: 12 per degree.
        int x = (int) Math.floor(lon * 12) + 180 * 12;
        int y = (int) Math.floor(lat * 12) + 90 * 12;
        int longitudeBand = x * 2 / 12;
        int latitudeBand = y * 2 / 12;
        x -= longitudeBand * 12 / 2;
        y -= latitudeBand * 12 / 2;
        int quadrant = 2 * (1 - y / 3) + x / 3 + 1;
        int keypad = 3 * (2 - y % 3) + x % 3 + 1;
        return String.format(Locale.ROOT, "%03d", longitudeBand + 1)
                + ALPHABET.charAt(latitudeBand / 24)
                + ALPHABET.charAt(latitudeBand % 24)
                + quadrant
                + keypad;
    }

    public static AngularCell decode(String value) {
        String source = value.toUpperCase(Locale.ROOT)
                .replaceAll("\\s+", "");
        if (!VALUE.matcher(source).matches()) {
            throw new ConvertToolsException(ErrorCode.INVALID_GARS,
                    "Invalid GARS coordinate."
            );
        }

        int longitudeBand = Integer.parseInt(source.substring(0, 3));
        int latitudeBand = ALPHABET.indexOf(source.charAt(3)) * 24
                + ALPHABET.indexOf(source.charAt(4));
        if (longitudeBand < 1
                || longitudeBand > 720
                || latitudeBand < 0
                || latitudeBand > 359) {
            throw new ConvertToolsException(ErrorCode.INVALID_GARS, "Invalid GARS band.");
        }

        double longitude = -180 + (longitudeBand - 1) * 0.5;
        double latitude = -90 + latitudeBand * 0.5;
        double cellDegrees = 0.5;
        if (source.length() >= 6) {
            int quadrant = Character.digit(source.charAt(5), 10);
            longitude += (quadrant == 2 || quadrant == 4 ? 1 : 0)
                    * 0.25;
            latitude += (quadrant == 1 || quadrant == 2 ? 1 : 0)
                    * 0.25;
            cellDegrees = 0.25;
        }
        if (source.length() == 7) {
            int keypadIndex = Character.digit(source.charAt(6), 10) - 1;
            longitude += keypadIndex % 3 / 12.0;
            latitude += (2 - keypadIndex / 3) / 12.0;
            cellDegrees = 1.0 / 12;
        }

        return new AngularCell(
                new CoordinatePoint(
                        latitude + cellDegrees / 2,
                        longitude + cellDegrees / 2
                ),
                source.length(),
                cellDegrees
        );
    }
}
