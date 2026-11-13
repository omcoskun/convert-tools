package io.github.mertc0604.converttools.coordinates.core;

import io.github.mertc0604.converttools.geodesy.Ellipsoid;

public final class Wgs84 {
    public static final String ID = Ellipsoid.WGS84.id();
    public static final double SEMI_MAJOR_AXIS =
            Ellipsoid.WGS84.semiMajorAxisMetres();
    public static final double FLATTENING = Ellipsoid.WGS84.flattening();
    public static final double SEMI_MINOR_AXIS =
            Ellipsoid.WGS84.semiMinorAxisMetres();
    public static final double UTM_SCALE = 0.9996;
    public static final double UPS_SCALE = 0.994;
    public static final double ECCENTRICITY_SQUARED =
            FLATTENING * (2 - FLATTENING);
    public static final double ECCENTRICITY =
            Math.sqrt(ECCENTRICITY_SQUARED);
    public static final double SECOND_ECCENTRICITY_SQUARED =
            ECCENTRICITY_SQUARED / (1 - ECCENTRICITY_SQUARED);
    /** Third flattening n = f / (2 − f). */
    public static final double THIRD_FLATTENING =
            FLATTENING / (2 - FLATTENING);

    private Wgs84() {
    }

    /**
     * tan(χ) of the conformal latitude χ from tan(φ) (Karney 2011, Eqs. 7–9).
     */
    public static double conformalTangent(double tau) {
        if (!Double.isFinite(tau)) {
            return tau;
        }
        double tau1 = Math.hypot(1, tau);
        double sigma = Math.sinh(eatanhe(tau / tau1));
        return Math.hypot(1, sigma) * tau - sigma * tau1;
    }

    /**
     * Inverse of {@link #conformalTangent}: tan(φ) from tan(χ) by Newton's
     * method (same iteration as GeographicLib Math::tauf).
     */
    public static double inverseConformalTangent(double taup) {
        double e2m = 1 - ECCENTRICITY_SQUARED;
        double epsilon = Math.ulp(1.0);
        double tolerance = Math.sqrt(epsilon) / 10;
        double tauMaximum = 2 / Math.sqrt(epsilon);
        double tau = Math.abs(taup) > 70
                ? taup * Math.exp(eatanhe(1))
                : taup / e2m;
        double stepTolerance = tolerance * Math.max(1, Math.abs(taup));
        if (!(Math.abs(tau) < tauMaximum)) {
            return tau;
        }
        for (int iteration = 0; iteration < 5; iteration++) {
            double estimate = conformalTangent(tau);
            double delta = (taup - estimate) * (1 + e2m * tau * tau)
                    / (e2m * Math.hypot(1, tau) * Math.hypot(1, estimate));
            tau += delta;
            if (!(Math.abs(delta) >= stepTolerance)) {
                break;
            }
        }
        return tau;
    }

    private static double eatanhe(double x) {
        return ECCENTRICITY * Angles.atanh(ECCENTRICITY * x);
    }
}
