package io.github.mertc0604.converttools.coordinates.core;

/**
 * Angle helpers that work in degrees and are exact at multiples of 90°.
 * Same algorithms as GeographicLib's Math class (Karney) and as the
 * JavaScript core's {@code geodesy/core/angles.js}.
 */
public final class Angles {
    private static final double OVERFLOW = 1 / (Math.ulp(1.0) * Math.ulp(1.0));

    private Angles() {
    }

    private static boolean isNegative(double value) {
        return Double.doubleToRawLongBits(value) < 0;
    }

    private static double remainder360(double x) {
        double r = x % 360;
        if (r > 180) {
            r -= 360;
        } else if (r < -180) {
            r += 360;
        }
        return r;
    }

    /** Longitude reduced to [-180, 180]; ±180 keeps the sign of the input. */
    public static double angNormalize(double x) {
        double y = remainder360(x);
        return Math.abs(y) == 180 ? Math.copySign(180, x) : y;
    }

    /** y − x reduced to [-180, 180], computed without losing precision. */
    public static double angDiff(double x, double y) {
        double[] first = sumWithError(remainder360(-x), remainder360(y));
        double[] second = sumWithError(remainder360(first[0]), first[1]);
        double d = second[0];
        double e = second[1];
        if (d == 0 || Math.abs(d) == 180) {
            d = Math.copySign(d, e == 0 ? y - x : -e);
        }
        return d;
    }

    private static double[] sumWithError(double u, double v) {
        double s = u + v;
        double up = s - v;
        double vpp = s - up;
        up -= u;
        vpp -= v;
        double t = s != 0 ? 0 - (up + vpp) : s;
        return new double[]{s, t};
    }

    /** {sin x, cos x} for x in degrees, exact at multiples of 90°. */
    public static double[] sincosd(double x) {
        double r = x % 360;
        double q = Math.rint(r / 90); // ties to even, like remquo
        r -= 90 * q;
        r *= CoordinateMath.DEGREE;
        double s = Math.sin(r);
        double c = Math.cos(r);
        double sinx;
        double cosx;
        switch ((((int) q % 4) + 4) % 4) {
            case 0 -> {
                sinx = s;
                cosx = c;
            }
            case 1 -> {
                sinx = c;
                cosx = -s;
            }
            case 2 -> {
                sinx = -s;
                cosx = -c;
            }
            default -> {
                sinx = -c;
                cosx = s;
            }
        }
        cosx += 0.0;
        if (sinx == 0) {
            sinx = Math.copySign(0.0, x);
        }
        return new double[]{sinx, cosx};
    }

    /** tan x for x in degrees, clamped to ±1/ε² at ±90°. */
    public static double tand(double x) {
        double[] sc = sincosd(x);
        double r = sc[0] / sc[1];
        return Math.min(Math.max(r, -OVERFLOW), OVERFLOW);
    }

    /** atan2(y, x) in degrees with the result reduced before conversion. */
    public static double atan2d(double y, double x) {
        int q = 0;
        double yy = y;
        double xx = x;
        if (Math.abs(yy) > Math.abs(xx)) {
            double swap = xx;
            xx = yy;
            yy = swap;
            q = 2;
        }
        if (isNegative(xx)) {
            xx = -xx;
            q += 1;
        }
        double angle = Math.atan2(yy, xx) / CoordinateMath.DEGREE;
        return switch (q) {
            case 1 -> Math.copySign(180, yy) - angle;
            case 2 -> 90 - angle;
            case 3 -> -90 + angle;
            default -> angle;
        };
    }

    /** atan x in degrees. */
    public static double atand(double x) {
        return atan2d(x, 1);
    }

    /** Inverse hyperbolic sine, accurate near zero. */
    public static double asinh(double x) {
        double y = Math.abs(x);
        y = Math.log1p(y * (1 + y / (Math.hypot(1, y) + 1)));
        return x > 0 ? y : x < 0 ? -y : x;
    }

    /** Inverse hyperbolic tangent, accurate near zero. */
    public static double atanh(double x) {
        double y = Math.abs(x);
        y = Math.log1p(2 * y / (1 - y)) / 2;
        return x > 0 ? y : x < 0 ? -y : x;
    }
}
