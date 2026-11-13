package io.github.mertc0604.converttools.coordinates.grid;

import io.github.mertc0604.converttools.coordinates.model.CoordinatePoint;
import io.github.mertc0604.converttools.coordinates.model.GridCell;
import io.github.mertc0604.converttools.coordinates.model.GridCoordinate;
import io.github.mertc0604.converttools.coordinates.projection.UtmUps;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Military Grid Reference System (NGA.SIG.0012).
 *
 * <p>Lettering, truncation and the band/row consistency rules follow
 * GeographicLib's MGRS class (Karney), the reference used for the contract
 * vectors: grid coordinates are first floored to whole micrometres and the
 * digits are then truncated, the zone is always written with two digits, and
 * a 100 km square is accepted only if it can lie in the stated latitude band.
 * Same algorithm as the JavaScript core's {@code grids/mgrs.js}.
 */
public final class Mgrs {
    private static final long TILE = 100000;
    private static final double MICROMETRES_PER_METRE = 1e6;
    private static final long TILE_MICROMETRES = 100000L * 1000000L; // 1e11
    private static final int MAX_DIGITS = 11; // 1 µm internal resolution
    private static final double ANGLE_EPSILON = Math.scalb(1.0, -46);

    private static final String LATITUDE_BANDS = "CDEFGHJKLMNPQRSTUVWX";
    private static final String[] UTM_COLUMNS = {
            "ABCDEFGH",
            "JKLMNPQR",
            "STUVWXYZ"
    };
    private static final String UTM_ROWS = "ABCDEFGHJKLMNPQRSTUV";
    private static final String UPS_BANDS = "ABYZ";
    private static final String[] UPS_COLUMNS = {
            "JKLPQRSTUXYZ",
            "ABCFGHJKLPQR",
            "RSTUXYZ",
            "ABCFGHJ"
    };
    private static final String[] UPS_ROWS = {
            "ABCDEFGHJKLMNPQRSTUVWXYZ",
            "ABCDEFGHJKLMNP"
    };

    private static final int MIN_UTM_COLUMN = 1;
    private static final int MAX_UTM_SOUTH_ROW = 100;
    private static final int UTM_ROW_PERIOD = 20;
    private static final int UTM_EVEN_ROW_SHIFT = 5;
    private static final int MIN_UPS_SOUTH_INDEX = 8;
    private static final int MIN_UPS_NORTH_INDEX = 13;
    private static final int UPS_EASTING_INDEX = 20;

    private static final Pattern UTM_FORMAT = Pattern.compile(
            "^(\\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\\d*)$"
    );
    private static final Pattern UPS_FORMAT = Pattern.compile(
            "^([ABYZ])([A-HJ-NP-Z]{2})(\\d*)$"
    );

    private Mgrs() {
    }

    /**
     * True row index in [-90, 95) for a band (-10…9), column (0…7) and
     * periodic row (0…19), or MAX_UTM_SOUTH_ROW when the square cannot lie in
     * the band. Port of GeographicLib MGRS::UTMRow.
     */
    private static int utmRow(int band, int column, int periodicRow) {
        double centre = 100.0 * (8 * band + 4) / 90;
        int north = band >= 0 ? 1 : 0;
        int minimumRow = band > -10
                ? (int) Math.floor(centre - 4.3 - 0.1 * north)
                : -90;
        int maximumRow = band < 9
                ? (int) Math.floor(centre + 4.4 - 0.1 * north)
                : 94;
        int baseRow = (minimumRow + maximumRow) / 2 - UTM_ROW_PERIOD / 2;
        int row = (periodicRow - baseRow + MAX_UTM_SOUTH_ROW) % UTM_ROW_PERIOD
                + baseRow;
        if (!(row >= minimumRow && row <= maximumRow)) {
            // Northings 71e5 and 80e5 cross band boundaries inside particular
            // columns; these rows are valid only there.
            int foldedBand = band >= 0 ? band : -band - 1;
            int foldedRow = row >= 0 ? row : -row - 1;
            int foldedColumn = column < 4 ? column : -column + 7;
            if (!((foldedRow == 70 && foldedBand == 8 && foldedColumn >= 2)
                    || (foldedRow == 71 && foldedBand == 7 && foldedColumn <= 2)
                    || (foldedRow == 79 && foldedBand == 9 && foldedColumn >= 1)
                    || (foldedRow == 80 && foldedBand == 8 && foldedColumn <= 1))) {
                row = MAX_UTM_SOUTH_ROW;
            }
        }
        return row;
    }

    public static String encode(CoordinatePoint point) {
        return encode(point.latitude(), point.longitude(), 5);
    }

    public static String encode(CoordinatePoint point, int precision) {
        return encode(point.latitude(), point.longitude(), precision);
    }

    /**
     * Encodes a WGS 84 point as MGRS. Digits are truncated, never rounded, so
     * the code names the square that contains the point; the zone always has
     * two digits.
     */
    public static String encode(
            double latitude,
            double longitude,
            int precision
    ) {
        validatePrecision(precision);
        GridCoordinate grid = UtmUps.forward(latitude, longitude);
        long x = (long) Math.floor(grid.easting() * MICROMETRES_PER_METRE);
        long y = (long) Math.floor(grid.northing() * MICROMETRES_PER_METRE);
        int column = (int) Math.floorDiv(x, TILE_MICROMETRES);
        int row = (int) Math.floorDiv(y, TILE_MICROMETRES);
        String letters;
        if (grid.zone() != 0) {
            int band = Math.abs(latitude) < ANGLE_EPSILON
                    ? (grid.north() ? 0 : -1)
                    : UtmUps.latitudeBandIndex(latitude);
            int columnIndex = column - MIN_UTM_COLUMN;
            int trueRow = utmRow(band, columnIndex, row % UTM_ROW_PERIOD);
            if (trueRow != row - (grid.north() ? 0 : MAX_UTM_SOUTH_ROW)) {
                throw new IllegalArgumentException(
                        "Latitude is inconsistent with the UTM coordinates."
                );
            }
            int zoneIndex = grid.zone() - 1;
            letters = String.format(Locale.ROOT, "%02d", grid.zone())
                    + LATITUDE_BANDS.charAt(band + 10)
                    + UTM_COLUMNS[zoneIndex % 3].charAt(columnIndex)
                    + UTM_ROWS.charAt((row
                    + ((zoneIndex & 1) != 0 ? UTM_EVEN_ROW_SHIFT : 0))
                    % UTM_ROW_PERIOD);
        } else {
            boolean east = column >= UPS_EASTING_INDEX;
            int bandIndex = (grid.north() ? 2 : 0) + (east ? 1 : 0);
            int columnOffset = east
                    ? UPS_EASTING_INDEX
                    : grid.north() ? MIN_UPS_NORTH_INDEX : MIN_UPS_SOUTH_INDEX;
            int rowOffset = grid.north()
                    ? MIN_UPS_NORTH_INDEX
                    : MIN_UPS_SOUTH_INDEX;
            String columns = UPS_COLUMNS[bandIndex];
            String rows = UPS_ROWS[grid.north() ? 1 : 0];
            int columnIndex = column - columnOffset;
            int rowIndex = row - rowOffset;
            if (columnIndex < 0 || columnIndex >= columns.length()
                    || rowIndex < 0 || rowIndex >= rows.length()) {
                throw new IllegalArgumentException(
                        "UPS coordinate is outside the MGRS lettering grid."
                );
            }
            letters = Character.toString(UPS_BANDS.charAt(bandIndex))
                    + columns.charAt(columnIndex)
                    + rows.charAt(rowIndex);
        }
        return letters
                + digitText(x, column, precision)
                + digitText(y, row, precision);
    }

    private static String digitText(long micrometres, int tile, int precision) {
        if (precision == 0) {
            return "";
        }
        long withinTile = micrometres - tile * TILE_MICROMETRES;
        long divisor = 1;
        for (int k = 0; k < MAX_DIGITS - precision; k++) {
            divisor *= 10;
        }
        long value = Math.floorDiv(withinTile, divisor);
        return String.format(Locale.ROOT, "%0" + precision + "d", value);
    }

    private static int lookup(String alphabet, String source, int position) {
        return position < source.length()
                ? alphabet.indexOf(source.charAt(position))
                : -1;
    }

    private static boolean isAsciiDigit(char c) {
        return c >= '0' && c <= '9';
    }

    public static GridCell decode(String value) {
        return decode(value, true);
    }

    /**
     * Decodes MGRS to its grid square. With {@code center} the returned point
     * is the centre of the square, otherwise its south-west corner. Throws when
     * the square cannot lie in the stated zone and latitude band.
     */
    public static GridCell decode(String value, boolean center) {
        String source = normalize(value);
        int position = 0;
        int zone = 0;
        while (position < source.length()
                && isAsciiDigit(source.charAt(position))) {
            if (position < 2) {
                zone = zone * 10 + (source.charAt(position) - '0');
            }
            position++;
        }
        if (position > 2) {
            throw new IllegalArgumentException(
                    "MGRS zone has more than two digits."
            );
        }
        if (position > 0 && !(zone >= 1 && zone <= 60)) {
            throw new IllegalArgumentException(
                    "MGRS zone must be from 1 to 60."
            );
        }
        boolean utm = position > 0;
        int band = lookup(utm ? LATITUDE_BANDS : UPS_BANDS, source, position);
        if (band < 0) {
            throw new IllegalArgumentException(
                    "Invalid MGRS latitude band letter."
            );
        }
        position++;
        boolean north = band >= (utm ? 10 : 2);
        if (source.length() - position < 2) {
            throw new IllegalArgumentException(
                    "MGRS must include the 100 km square letters."
            );
        }
        int column = lookup(
                utm ? UTM_COLUMNS[(zone - 1) % 3] : UPS_COLUMNS[band],
                source,
                position
        );
        if (column < 0) {
            throw new IllegalArgumentException(
                    "Invalid MGRS 100 km column letter."
            );
        }
        int row = lookup(
                utm ? UTM_ROWS : UPS_ROWS[north ? 1 : 0],
                source,
                position + 1
        );
        if (row < 0) {
            throw new IllegalArgumentException(
                    "Invalid MGRS 100 km row letter."
            );
        }
        position += 2;

        if (utm) {
            if (((zone - 1) & 1) != 0) {
                row = (row + UTM_ROW_PERIOD - UTM_EVEN_ROW_SHIFT)
                        % UTM_ROW_PERIOD;
            }
            band -= 10;
            row = utmRow(band, column, row);
            if (row == MAX_UTM_SOUTH_ROW) {
                throw new IllegalArgumentException(
                        "MGRS 100 km square is not in its zone and latitude band."
                );
            }
            row = north ? row : row + MAX_UTM_SOUTH_ROW;
            column += MIN_UTM_COLUMN;
        } else {
            boolean east = (band & 1) == 1;
            column += east
                    ? UPS_EASTING_INDEX
                    : north ? MIN_UPS_NORTH_INDEX : MIN_UPS_SOUTH_INDEX;
            row += north ? MIN_UPS_NORTH_INDEX : MIN_UPS_SOUTH_INDEX;
        }

        String digits = source.substring(position);
        for (int index = 0; index < digits.length(); index++) {
            if (!isAsciiDigit(digits.charAt(index))) {
                throw new IllegalArgumentException(
                        "MGRS digits contain a non-digit."
                );
            }
        }
        if (digits.length() % 2 != 0) {
            throw new IllegalArgumentException(
                    "MGRS must end with an even number of digits."
            );
        }
        int precision = digits.length() / 2;
        if (precision > 5) {
            throw new IllegalArgumentException(
                    "MGRS supports at most 5 digits per axis."
            );
        }
        long unit = 1;
        long x = column;
        long y = row;
        for (int index = 0; index < precision; index++) {
            unit *= 10;
            x = x * 10 + (digits.charAt(index) - '0');
            y = y * 10 + (digits.charAt(index + precision) - '0');
        }
        if (center) {
            unit *= 2;
            x = 2 * x + 1;
            y = 2 * y + 1;
        }
        double easting = (double) (TILE * x) / unit;
        double northing = (double) (TILE * y) / unit;
        CoordinatePoint point = UtmUps.inverse(
                utm ? zone : 0,
                north,
                easting,
                northing
        );
        long cellMetres = 1;
        for (int k = precision; k < 5; k++) {
            cellMetres *= 10;
        }
        return new GridCell(
                point,
                utm ? zone : 0,
                north,
                easting,
                northing,
                precision,
                cellMetres,
                center
        );
    }

    /**
     * Inserts spaces between MGRS parts for display: "38 S LC 39187 01405".
     * Returns the normalised input unchanged if it is not MGRS-shaped.
     */
    public static String format(String value) {
        String source = normalize(value);
        Matcher utm = UTM_FORMAT.matcher(source);
        if (utm.matches()) {
            return spaced(
                    utm.group(1) + " " + utm.group(2) + " " + utm.group(3),
                    utm.group(4)
            );
        }
        Matcher ups = UPS_FORMAT.matcher(source);
        if (ups.matches()) {
            return spaced(
                    ups.group(1) + " " + ups.group(2),
                    ups.group(3)
            );
        }
        return source;
    }

    private static String spaced(String prefix, String numeric) {
        if (numeric.isEmpty()) {
            return prefix;
        }
        int split = numeric.length() / 2;
        return prefix
                + " "
                + numeric.substring(0, split)
                + " "
                + numeric.substring(split);
    }

    private static String normalize(String value) {
        return value.toUpperCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    private static void validatePrecision(int precision) {
        if (precision < 0 || precision > 5) {
            throw new IllegalArgumentException(
                    "MGRS precision must be between 0 and 5."
            );
        }
    }
}
