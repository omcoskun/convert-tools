package io.github.mertc0604.converttools.coordinates.projection;

import io.github.mertc0604.converttools.coordinates.core.CoordinateMath;
import io.github.mertc0604.converttools.coordinates.core.Wgs84;
import io.github.mertc0604.converttools.coordinates.model.CoordinatePoint;
import io.github.mertc0604.converttools.coordinates.model.CrsTransformation;
import io.github.mertc0604.converttools.coordinates.model.GridCoordinate;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class CrsTransformer {
    public static final List<String> SUPPORTED_CRS = List.of(
            "EPSG:4326",
            "EPSG:3857",
            "EPSG:32601–EPSG:32660",
            "EPSG:32701–EPSG:32760",
            "EPSG:5041",
            "EPSG:5042"
    );

    private static final Set<Integer> SUPPORTED_FIXED_CODES =
            Set.of(4326, 3857, 5041, 5042);
    private static final Pattern EPSG = Pattern.compile("^EPSG:(\\d+)$");
    private static final double WEB_MERCATOR_MAX_LATITUDE =
            85.0511287798066;

    private CrsTransformer() {
    }

    public static String normalizeEpsg(String value) {
        return definition(value).code();
    }

    public static String normalizeEpsg(int value) {
        return definition(Integer.toString(value)).code();
    }

    public static CrsTransformation transform(
            String sourceValue,
            String targetValue,
            String xValue,
            String yValue
    ) {
        return transform(
                sourceValue,
                targetValue,
                CoordinateMath.parseNumber(xValue, "X"),
                CoordinateMath.parseNumber(yValue, "Y")
        );
    }

    public static CrsTransformation transform(
            String sourceValue,
            String targetValue,
            double x,
            double y
    ) {
        Definition source = definition(sourceValue);
        Definition target = definition(targetValue);
        if (!Double.isFinite(x) || !Double.isFinite(y)) {
            throw new IllegalArgumentException(
                    "X and Y must be finite."
            );
        }
        CoordinatePoint point = toWgs84(source, x, y);
        double[] result = fromWgs84(target, point);
        if (!Double.isFinite(result[0]) || !Double.isFinite(result[1])) {
            throw new IllegalArgumentException(
                    "The transformation did not produce finite coordinates."
            );
        }
        return new CrsTransformation(
                source.code(),
                target.code(),
                result[0],
                result[1],
                CoordinateMath.compactNumber(result[0], 8),
                CoordinateMath.compactNumber(result[1], 8)
        );
    }

    private static CoordinatePoint toWgs84(
            Definition definition,
            double x,
            double y
    ) {
        int number = definition.number();
        if (number == 4326) {
            return new CoordinatePoint(y, x);
        }
        if (number == 3857) {
            double maximum = Math.PI * Wgs84.SEMI_MAJOR_AXIS;
            if (Math.abs(x) > maximum || Math.abs(y) > maximum) {
                throw new IllegalArgumentException(
                        "X or Y is outside the Web Mercator domain."
                );
            }
            double longitude = Math.max(
                    -180,
                    Math.min(
                            180,
                            x
                                    / Wgs84.SEMI_MAJOR_AXIS
                                    * CoordinateMath.RADIAN
                    )
            );
            double latitude = (2 * Math.atan(
                    Math.exp(y / Wgs84.SEMI_MAJOR_AXIS)
            ) - Math.PI / 2) * CoordinateMath.RADIAN;
            return new CoordinatePoint(latitude, longitude);
        }
        if (number >= 32601 && number <= 32660) {
            return UtmUps.utmInverse(number - 32600, true, x, y);
        }
        if (number >= 32701 && number <= 32760) {
            return UtmUps.utmInverse(number - 32700, false, x, y);
        }
        return UtmUps.upsInverse(number == 5041, x, y);
    }

    private static double[] fromWgs84(
            Definition definition,
            CoordinatePoint point
    ) {
        int number = definition.number();
        if (number == 4326) {
            return new double[]{point.longitude(), point.latitude()};
        }
        if (number == 3857) {
            if (Math.abs(point.latitude())
                    > WEB_MERCATOR_MAX_LATITUDE) {
                throw new IllegalArgumentException(
                        "Latitude is outside the Web Mercator domain."
                );
            }
            double maximum = Math.PI * Wgs84.SEMI_MAJOR_AXIS;
            double y = Wgs84.SEMI_MAJOR_AXIS
                    * Math.log(
                            Math.tan(
                                    Math.PI / 4
                                            + point.latitude()
                                            * CoordinateMath.DEGREE
                                            / 2
                            )
                    );
            return new double[]{
                    Wgs84.SEMI_MAJOR_AXIS
                            * point.longitude()
                            * CoordinateMath.DEGREE,
                    Math.max(-maximum, Math.min(maximum, y))
            };
        }
        if (number >= 32601 && number <= 32660) {
            if (point.latitude() < 0) {
                throw new IllegalArgumentException(
                        "A northern UTM CRS cannot encode a southern point."
                );
            }
            GridCoordinate grid = UtmUps.utmForward(
                    point.latitude(),
                    point.longitude(),
                    number - 32600,
                    true
            );
            return new double[]{grid.easting(), grid.northing()};
        }
        if (number >= 32701 && number <= 32760) {
            if (point.latitude() > 0) {
                throw new IllegalArgumentException(
                        "A southern UTM CRS cannot encode a northern point."
                );
            }
            GridCoordinate grid = UtmUps.utmForward(
                    point.latitude(),
                    point.longitude(),
                    number - 32700,
                    false
            );
            return new double[]{grid.easting(), grid.northing()};
        }
        boolean north = number == 5041;
        GridCoordinate grid = UtmUps.upsForward(
                point.latitude(),
                point.longitude(),
                north
        );
        return new double[]{grid.easting(), grid.northing()};
    }

    private static Definition definition(String value) {
        String source = value.trim().toUpperCase(Locale.ROOT);
        String normalized = source.startsWith("EPSG:")
                ? source
                : "EPSG:" + source;
        Matcher matcher = EPSG.matcher(normalized);
        if (!matcher.matches()) {
            throw new IllegalArgumentException(
                    "Use an EPSG code such as EPSG:4326."
            );
        }
        int number;
        try {
            number = Integer.parseInt(matcher.group(1));
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException(
                    "EPSG code is outside the supported range.",
                    error
            );
        }
        boolean utmNorth = number >= 32601 && number <= 32660;
        boolean utmSouth = number >= 32701 && number <= 32760;
        if (!SUPPORTED_FIXED_CODES.contains(number)
                && !utmNorth
                && !utmSouth) {
            throw new IllegalArgumentException(
                    "Projection definition is not available: "
                            + normalized
                            + "."
            );
        }
        return new Definition(normalized, number);
    }

    private record Definition(String code, int number) {
    }
}
