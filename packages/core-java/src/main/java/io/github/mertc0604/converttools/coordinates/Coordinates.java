package io.github.mertc0604.converttools.coordinates;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import io.github.mertc0604.converttools.coordinates.core.CoordinateMath;
import io.github.mertc0604.converttools.coordinates.format.CoordinateAxis;
import io.github.mertc0604.converttools.coordinates.format.DmsFormat;
import io.github.mertc0604.converttools.coordinates.grid.Gars;
import io.github.mertc0604.converttools.coordinates.grid.Georef;
import io.github.mertc0604.converttools.coordinates.grid.Mgrs;
import io.github.mertc0604.converttools.coordinates.model.AngularCell;
import io.github.mertc0604.converttools.coordinates.model.CoordinateFormat;
import io.github.mertc0604.converttools.coordinates.model.CoordinatePoint;
import io.github.mertc0604.converttools.coordinates.model.CoordinateResolution;
import io.github.mertc0604.converttools.coordinates.model.CoordinateResult;
import io.github.mertc0604.converttools.coordinates.model.CoordinateSource;
import io.github.mertc0604.converttools.coordinates.model.GridCell;
import io.github.mertc0604.converttools.coordinates.model.GridCoordinate;
import io.github.mertc0604.converttools.coordinates.projection.UtmUps;
import io.github.mertc0604.converttools.geodesy.GeoPoint;

import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

public final class Coordinates {
    private static final int DD_DIGITS = 10;
    private static final int DMS_SECOND_DIGITS = 5;
    private static final int DDM_MINUTE_DIGITS = 7;
    private static final int GRID_METRE_DIGITS = 3;
    private static final double GARS_CELL_DEGREES = 1.0 / 12;
    private static final int GEOREF_PRECISION = 4;
    private static final Pattern ZONE = Pattern.compile("^\\d{1,2}$");

    private Coordinates() {
    }

    public static CoordinateSource fromDecimalDegrees(
            String latitude,
            String longitude
    ) {
        return CoordinateSource.point(
                new CoordinatePoint(
                        CoordinateMath.parseNumber(latitude, "Latitude"),
                        CoordinateMath.parseNumber(longitude, "Longitude")
                )
        );
    }

    public static CoordinateSource fromDecimalDegrees(
            double latitude,
            double longitude
    ) {
        return CoordinateSource.point(
                new CoordinatePoint(latitude, longitude)
        );
    }

    public static CoordinateSource fromDms(
            String latitude,
            String longitude
    ) {
        return CoordinateSource.point(
                DmsFormat.parsePair(latitude, longitude)
        );
    }

    public static CoordinateSource fromDdm(
            String latitude,
            String longitude
    ) {
        return CoordinateSource.point(
                DmsFormat.parsePair(latitude, longitude)
        );
    }

    public static CoordinateSource fromMgrs(String value) {
        GridCell decoded = Mgrs.decode(value, true);
        return CoordinateSource.gridCell(
                decoded.point(),
                decoded.cellMetres()
        );
    }

    public static CoordinateSource fromUtmUps(
            String zoneValue,
            String hemisphereValue,
            String eastingValue,
            String northingValue
    ) {
        String source = zoneValue.trim();
        if (!ZONE.matcher(source).matches()) {
            throw new ConvertToolsException(ErrorCode.INVALID_ZONE,
                    "Zone must be an integer from 0 to 60."
            );
        }
        int zone = Integer.parseInt(source);
        if (zone < 0 || zone > 60) {
            throw new ConvertToolsException(ErrorCode.INVALID_ZONE,
                    "Zone must be an integer from 0 to 60."
            );
        }
        String hemisphere = hemisphereValue.trim()
                .toUpperCase(Locale.ROOT);
        if (!"N".equals(hemisphere) && !"S".equals(hemisphere)) {
            throw new ConvertToolsException(ErrorCode.INVALID_HEMISPHERE,
                    "Hemisphere must be N or S."
            );
        }
        return CoordinateSource.point(
                UtmUps.inverse(
                        zone,
                        "N".equals(hemisphere),
                        CoordinateMath.parseNumber(eastingValue, "Easting"),
                        CoordinateMath.parseNumber(northingValue, "Northing")
                )
        );
    }

    public static CoordinateSource fromGars(String value) {
        AngularCell decoded = Gars.decode(value);
        return CoordinateSource.area(
                decoded.center(),
                decoded.cellDegrees()
        );
    }

    public static CoordinateSource fromGeoref(String value) {
        AngularCell decoded = Georef.decode(value);
        return CoordinateSource.angularCell(
                decoded.center(),
                decoded.cellDegrees()
        );
    }

    public static GeoPoint toGeoPoint(CoordinateSource source) {
        Objects.requireNonNull(source, "source");
        return toGeoPoint(source.point());
    }

    public static GeoPoint toGeoPoint(CoordinatePoint point) {
        Objects.requireNonNull(point, "point");
        return new GeoPoint(point.latitude(), point.longitude());
    }

    public static CoordinatePoint fromGeoPoint(GeoPoint point) {
        Objects.requireNonNull(point, "point");
        return new CoordinatePoint(point.latitude(), point.longitude());
    }

    public static CoordinateResult results(
            CoordinatePoint point,
            int mgrsPrecision
    ) {
        return results(CoordinateSource.point(point), mgrsPrecision);
    }

    public static CoordinateResult results(
            CoordinateSource source,
            int mgrsPrecision
    ) {
        validateMgrsPrecision(mgrsPrecision);
        CoordinatePoint point = source.point();
        GridCoordinate grid = UtmUps.forward(
                point.latitude(),
                point.longitude()
        );
        String gridPrefix = grid.zone() == 0
                ? "UPS " + (grid.north() ? "N" : "S")
                : grid.zone() + (grid.north() ? "N" : "S");

        double ddStepDegrees = Math.pow(10, -DD_DIGITS);
        double dmsStepDegrees =
                Math.pow(10, -DMS_SECOND_DIGITS) / 3600;
        double ddmStepDegrees =
                Math.pow(10, -DDM_MINUTE_DIGITS) / 60;
        double mgrsCellMetres = Math.pow(10, 5 - mgrsPrecision);
        double gridStepMetres = Math.pow(10, -GRID_METRE_DIGITS);
        double georefCellDegrees =
                Math.pow(10, 2 - GEOREF_PRECISION) / 60;

        Map<CoordinateFormat, CoordinateResolution> resolution =
                new EnumMap<>(CoordinateFormat.class);
        resolution.put(
                CoordinateFormat.DD,
                CoordinateResolution.angularRounding(ddStepDegrees)
        );
        resolution.put(
                CoordinateFormat.DMS,
                CoordinateResolution.angularRounding(dmsStepDegrees)
        );
        resolution.put(
                CoordinateFormat.DDM,
                CoordinateResolution.angularRounding(ddmStepDegrees)
        );
        resolution.put(
                CoordinateFormat.MGRS,
                CoordinateResolution.gridCell(mgrsCellMetres)
        );
        resolution.put(
                CoordinateFormat.UTM_UPS,
                CoordinateResolution.gridRounding(gridStepMetres)
        );
        resolution.put(
                CoordinateFormat.GARS,
                CoordinateResolution.angularCell(GARS_CELL_DEGREES)
        );
        resolution.put(
                CoordinateFormat.GEOREF,
                CoordinateResolution.angularCell(georefCellDegrees)
        );

        return new CoordinateResult(
                point,
                CoordinateMath.fixed(point.latitude(), DD_DIGITS)
                        + ", "
                        + CoordinateMath.fixed(
                                point.longitude(),
                                DD_DIGITS
                        ),
                DmsFormat.formatDms(
                        point.latitude(),
                        CoordinateAxis.LATITUDE,
                        DMS_SECOND_DIGITS
                )
                        + "  "
                        + DmsFormat.formatDms(
                                point.longitude(),
                                CoordinateAxis.LONGITUDE,
                                DMS_SECOND_DIGITS
                        ),
                DmsFormat.formatDdm(
                        point.latitude(),
                        CoordinateAxis.LATITUDE,
                        DDM_MINUTE_DIGITS
                )
                        + "  "
                        + DmsFormat.formatDdm(
                                point.longitude(),
                                CoordinateAxis.LONGITUDE,
                                DDM_MINUTE_DIGITS
                        ),
                Mgrs.format(Mgrs.encode(point, mgrsPrecision)),
                gridPrefix
                        + "  "
                        + CoordinateMath.fixed(
                                grid.easting(),
                                GRID_METRE_DIGITS
                        )
                        + " E  "
                        + CoordinateMath.fixed(
                                grid.northing(),
                                GRID_METRE_DIGITS
                        )
                        + " N",
                Gars.encode(point),
                Georef.encode(point, GEOREF_PRECISION),
                resolution,
                source.kind(),
                source.cellMetres(),
                source.cellDegrees()
        );
    }

    private static void validateMgrsPrecision(int precision) {
        if (precision < 0 || precision > 5) {
            throw new ConvertToolsException(ErrorCode.INVALID_PRECISION,
                    "MGRS precision must be between 0 and 5."
            );
        }
    }
}
