package io.github.mertc0604.converttools.coordinates.projection;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import io.github.mertc0604.converttools.coordinates.core.Angles;
import io.github.mertc0604.converttools.coordinates.core.Wgs84;
import io.github.mertc0604.converttools.coordinates.model.CoordinatePoint;
import io.github.mertc0604.converttools.coordinates.model.GridCoordinate;

/**
 * UTM and UPS on WGS 84.
 *
 * <p>Transverse Mercator uses Krüger's series to sixth order in the third
 * flattening n, as given by C. F. F. Karney, "Transverse Mercator with an
 * accuracy of a few nanometers", J. Geodesy 85(8), 475–485 (2011),
 * arXiv:1002.1417. Within 3900 km of the central meridian the series error is
 * below 5 nm. UPS is the polar stereographic projection with k0 = 0.994.
 * Zone selection follows NGA.SIG.0012 and GeographicLib's
 * UTMUPS::StandardZone, including longitude +180° belonging to zone 1.
 * Same algorithm as the JavaScript core's {@code projections/utm-ups.js}.
 */
public final class UtmUps {
    private static final double UTM_FALSE_EASTING = 500000;
    private static final double UTM_FALSE_NORTHING = 10000000;
    private static final double UPS_FALSE_ORIGIN = 2000000;
    private static final double UTM_MAXIMUM_LONGITUDE_OFFSET = 6;
    private static final double UPS_LIMIT_LATITUDE = 60;

    private static final double N = Wgs84.THIRD_FLATTENING;

    // Karney (2011) Eq. 29: A = a / (1 + n) · (1 + n²/4 + n⁴/64 + n⁶/256 + …)
    private static final double RECTIFYING_RADIUS =
            Wgs84.SEMI_MAJOR_AXIS / (1 + N)
                    * polynomial(new double[]{1, 0, 1.0 / 4, 0, 1.0 / 64, 0, 1.0 / 256}, N);

    // Karney (2011) Eq. 35, terms through n⁶. ALPHA[j] = α_j.
    private static final double[] ALPHA = {
            0,
            polynomial(new double[]{0, 1.0 / 2, -2.0 / 3, 5.0 / 16, 41.0 / 180,
                    -127.0 / 288, 7891.0 / 37800}, N),
            polynomial(new double[]{0, 0, 13.0 / 48, -3.0 / 5, 557.0 / 1440,
                    281.0 / 630, -1983433.0 / 1935360}, N),
            polynomial(new double[]{0, 0, 0, 61.0 / 240, -103.0 / 140,
                    15061.0 / 26880, 167603.0 / 181440}, N),
            polynomial(new double[]{0, 0, 0, 0, 49561.0 / 161280,
                    -179.0 / 168, 6601661.0 / 7257600}, N),
            polynomial(new double[]{0, 0, 0, 0, 0, 34729.0 / 80640,
                    -3418889.0 / 1995840}, N),
            polynomial(new double[]{0, 0, 0, 0, 0, 0, 212378941.0 / 319334400}, N)
    };

    // Karney (2011) Eq. 36, terms through n⁶. BETA[j] = β_j.
    private static final double[] BETA = {
            0,
            polynomial(new double[]{0, 1.0 / 2, -2.0 / 3, 37.0 / 96, -1.0 / 360,
                    -81.0 / 512, 96199.0 / 604800}, N),
            polynomial(new double[]{0, 0, 1.0 / 48, 1.0 / 15, -437.0 / 1440,
                    46.0 / 105, -1118711.0 / 3870720}, N),
            polynomial(new double[]{0, 0, 0, 17.0 / 480, -37.0 / 840,
                    -209.0 / 4480, 5569.0 / 90720}, N),
            polynomial(new double[]{0, 0, 0, 0, 4397.0 / 161280, -11.0 / 504,
                    -830251.0 / 7257600}, N),
            polynomial(new double[]{0, 0, 0, 0, 0, 4583.0 / 161280,
                    -108847.0 / 3991680}, N),
            polynomial(new double[]{0, 0, 0, 0, 0, 0, 20648693.0 / 638668800}, N)
    };

    private static final double POLAR_C = (1 - Wgs84.FLATTENING)
            * Math.exp(Wgs84.ECCENTRICITY * Angles.atanh(Wgs84.ECCENTRICITY));
    private static final double POLAR_SCALE =
            2 * Wgs84.UPS_SCALE * Wgs84.SEMI_MAJOR_AXIS / POLAR_C;
    // The inverse accepts grid points up to 1 µm beyond the 60° circle so that
    // a forward-projected boundary point survives the false-origin rounding.
    private static final double UPS_MAXIMUM_RADIUS =
            polarRadius(UPS_LIMIT_LATITUDE) + 1e-6;

    private UtmUps() {
    }

    private static double polynomial(double[] coefficients, double x) {
        double result = 0;
        for (int k = coefficients.length - 1; k >= 0; k--) {
            result = result * x + coefficients[k];
        }
        return result;
    }

    private static boolean isNegative(double value) {
        return Double.doubleToRawLongBits(value) < 0;
    }

    /** Transverse Mercator forward; returns {x, y} without false origin. */
    private static double[] transverseMercatorForward(
            double centralLongitude,
            double scale,
            double latitude,
            double longitude
    ) {
        double lat = latitude;
        double lon = Angles.angDiff(centralLongitude, longitude);
        double latitudeSign = isNegative(lat) ? -1 : 1;
        double longitudeSign = isNegative(lon) ? -1 : 1;
        lat *= latitudeSign;
        lon *= longitudeSign;
        boolean backside = lon > 90;
        if (backside) {
            if (lat == 0) {
                latitudeSign = -1;
            }
            lon = 180 - lon;
        }

        double[] phi = Angles.sincosd(lat);
        double[] lambda = Angles.sincosd(lon);
        double xip;
        double etap;
        if (lat != 90) {
            double taup = Wgs84.conformalTangent(phi[0] / phi[1]);
            xip = Math.atan2(taup, lambda[1]);
            etap = Angles.asinh(lambda[0] / Math.hypot(taup, lambda[1]));
        } else {
            xip = Math.PI / 2;
            etap = 0;
        }

        double xi = xip;
        double eta = etap;
        for (int j = 1; j <= 6; j++) {
            xi += ALPHA[j] * Math.sin(2 * j * xip) * Math.cosh(2 * j * etap);
            eta += ALPHA[j] * Math.cos(2 * j * xip) * Math.sinh(2 * j * etap);
        }
        return new double[]{
                RECTIFYING_RADIUS * scale * eta * longitudeSign,
                RECTIFYING_RADIUS * scale * (backside ? Math.PI - xi : xi) * latitudeSign
        };
    }

    /** Transverse Mercator inverse; returns {latitude, longitude}. */
    private static double[] transverseMercatorInverse(
            double centralLongitude,
            double scale,
            double x,
            double y
    ) {
        double xi = y / (RECTIFYING_RADIUS * scale);
        double eta = x / (RECTIFYING_RADIUS * scale);
        double xiSign = isNegative(xi) ? -1 : 1;
        double etaSign = isNegative(eta) ? -1 : 1;
        xi *= xiSign;
        eta *= etaSign;
        boolean backside = xi > Math.PI / 2;
        if (backside) {
            xi = Math.PI - xi;
        }

        double xip = xi;
        double etap = eta;
        for (int j = 1; j <= 6; j++) {
            xip -= BETA[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
            etap -= BETA[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
        }

        double s = Math.sinh(etap);
        double c = Math.max(0, Math.cos(xip));
        double r = Math.hypot(s, c);
        double latitude;
        double longitude;
        if (r != 0) {
            longitude = Angles.atan2d(s, c);
            latitude = Angles.atand(
                    Wgs84.inverseConformalTangent(Math.sin(xip) / r)
            );
        } else {
            latitude = 90;
            longitude = 0;
        }
        latitude *= xiSign;
        if (backside) {
            longitude = 180 - longitude;
        }
        longitude *= etaSign;
        return new double[]{
                latitude,
                Angles.angNormalize(longitude + centralLongitude)
        };
    }

    /** MGRS/UTM latitude band index in [-10, 9] (C = -10 … X = 9). */
    public static int latitudeBandIndex(double latitude) {
        int integerLatitude = (int) Math.floor(latitude);
        return Math.max(-10, Math.min(9, (integerLatitude + 80) / 8 - 10));
    }

    /**
     * Standard UTM zone, or 0 where UPS applies (below 80°S or at/above
     * 84°N), including the Norway and Svalbard exceptions. Longitude +180°
     * belongs to zone 1.
     */
    public static int standardUtmZone(double latitude, double longitude) {
        new CoordinatePoint(latitude, longitude);
        if (!(latitude >= -80 && latitude < 84)) {
            return 0;
        }
        int integerLongitude = (int) Math.floor(Angles.angNormalize(longitude));
        if (integerLongitude == 180) {
            integerLongitude = -180;
        }
        int zone = (integerLongitude + 186) / 6;
        int band = latitudeBandIndex(latitude);
        if (band == 7 && zone == 31 && integerLongitude >= 3) {
            zone = 32;
        } else if (band == 9 && integerLongitude >= 0 && integerLongitude < 42) {
            zone = 2 * ((integerLongitude + 183) / 12) + 1;
        }
        return zone;
    }

    public static double centralMeridian(int zone) {
        validateUtmZone(zone);
        return zone * 6 - 183;
    }

    public static GridCoordinate utmForward(double latitude, double longitude) {
        int zone = standardUtmZone(latitude, longitude);
        if (zone == 0) {
            throw new ConvertToolsException(ErrorCode.OUTSIDE_UTM_DOMAIN,
                    "UTM is defined between 80°S and 84°N."
            );
        }
        return utmForward(latitude, longitude, zone);
    }

    /**
     * UTM forward projection in a requested zone; the point must lie within
     * 6° of the zone's central meridian and between 80°S and 84°N.
     */
    public static GridCoordinate utmForward(
            double latitude,
            double longitude,
            int zone
    ) {
        return utmForward(latitude, longitude, zone, latitude >= 0);
    }

    /**
     * UTM forward projection in a requested zone and hemisphere. The equator
     * may be written in either hemisphere; other latitudes must match it.
     */
    public static GridCoordinate utmForward(
            double latitude,
            double longitude,
            int zone,
            boolean north
    ) {
        new CoordinatePoint(latitude, longitude);
        if (latitude < -80 || latitude > 84) {
            throw new ConvertToolsException(ErrorCode.OUTSIDE_UTM_DOMAIN,
                    "UTM is defined between 80°S and 84°N."
            );
        }
        if ((north && latitude < 0) || (!north && latitude > 0)) {
            throw new ConvertToolsException(ErrorCode.OUTSIDE_UTM_DOMAIN,
                    "Latitude is in the other UTM hemisphere."
            );
        }
        double lon0 = centralMeridian(zone);
        if (Math.abs(Angles.angDiff(lon0, longitude))
                > UTM_MAXIMUM_LONGITUDE_OFFSET) {
            throw new ConvertToolsException(ErrorCode.OUTSIDE_UTM_DOMAIN,
                    "Longitude is too far from the selected UTM zone."
            );
        }
        double[] xy = transverseMercatorForward(
                lon0, Wgs84.UTM_SCALE, latitude, longitude
        );
        return new GridCoordinate(
                zone,
                north,
                xy[0] + UTM_FALSE_EASTING,
                xy[1] + (north ? 0 : UTM_FALSE_NORTHING)
        );
    }

    public static CoordinatePoint utmInverse(
            int zone,
            boolean north,
            double easting,
            double northing
    ) {
        double lon0 = centralMeridian(zone);
        if (!Double.isFinite(easting)
                || !Double.isFinite(northing)
                || easting < 0
                || easting > 1000000
                || northing < 0
                || northing > 10000000) {
            throw new ConvertToolsException(ErrorCode.GRID_COORDINATE_OUT_OF_RANGE,
                    "UTM easting or northing is outside the supported range."
            );
        }
        double[] point = transverseMercatorInverse(
                lon0,
                Wgs84.UTM_SCALE,
                easting - UTM_FALSE_EASTING,
                northing - (north ? 0 : UTM_FALSE_NORTHING)
        );
        return new CoordinatePoint(point[0], point[1]);
    }

    private static double polarRadius(double latitude) {
        double taup = Wgs84.conformalTangent(Angles.tand(latitude));
        double rho = Math.hypot(1, taup) + Math.abs(taup);
        return POLAR_SCALE * (taup >= 0 ? (latitude != 90 ? 1 / rho : 0) : rho);
    }

    public static GridCoordinate upsForward(double latitude, double longitude) {
        return upsForward(latitude, longitude, latitude >= 0);
    }

    /** UPS forward projection; the point must be within 30° of the pole. */
    public static GridCoordinate upsForward(
            double latitude,
            double longitude,
            boolean north
    ) {
        new CoordinatePoint(latitude, longitude);
        if ((north && latitude < UPS_LIMIT_LATITUDE)
                || (!north && latitude > -UPS_LIMIT_LATITUDE)) {
            throw new ConvertToolsException(ErrorCode.OUTSIDE_UPS_DOMAIN,
                    "UPS coordinates must be within 30° of the selected pole."
            );
        }
        double rho = polarRadius(north ? latitude : -latitude);
        double[] lambda = Angles.sincosd(longitude);
        return new GridCoordinate(
                0,
                north,
                UPS_FALSE_ORIGIN + rho * lambda[0],
                UPS_FALSE_ORIGIN + (north ? -rho : rho) * lambda[1]
        );
    }

    /** UPS inverse; the grid point must lie within the 60° latitude circle. */
    public static CoordinatePoint upsInverse(
            boolean north,
            double easting,
            double northing
    ) {
        if (!Double.isFinite(easting) || !Double.isFinite(northing)) {
            throw new ConvertToolsException(ErrorCode.GRID_COORDINATE_OUT_OF_RANGE,
                    "UPS easting or northing is outside the supported range."
            );
        }
        double x = easting - UPS_FALSE_ORIGIN;
        double y = northing - UPS_FALSE_ORIGIN;
        double rho = Math.hypot(x, y);
        if (!(rho <= UPS_MAXIMUM_RADIUS)) {
            throw new ConvertToolsException(ErrorCode.GRID_COORDINATE_OUT_OF_RANGE,
                    "UPS easting or northing is outside the supported range."
            );
        }
        double epsilon = Math.ulp(1.0);
        double t = rho != 0 ? rho / POLAR_SCALE : epsilon * epsilon;
        double taup = (1 / t - t) / 2;
        double tau = Wgs84.inverseConformalTangent(taup);
        double latitude = (north ? 1 : -1) * Angles.atand(tau);
        double longitude = Angles.atan2d(x, north ? -y : y);
        return new CoordinatePoint(latitude, longitude);
    }

    public static GridCoordinate forward(double latitude, double longitude) {
        int zone = standardUtmZone(latitude, longitude);
        return zone == 0
                ? upsForward(latitude, longitude)
                : utmForward(latitude, longitude, zone);
    }

    public static CoordinatePoint inverse(
            int zone,
            boolean north,
            double easting,
            double northing
    ) {
        if (zone < 0 || zone > 60) {
            throw new ConvertToolsException(ErrorCode.INVALID_ZONE,
                    "Zone must be between 0 and 60."
            );
        }
        return zone == 0
                ? upsInverse(north, easting, northing)
                : utmInverse(zone, north, easting, northing);
    }

    private static void validateUtmZone(int zone) {
        if (zone < 1 || zone > 60) {
            throw new ConvertToolsException(ErrorCode.INVALID_ZONE,
                    "UTM zone must be an integer from 1 to 60."
            );
        }
    }
}
