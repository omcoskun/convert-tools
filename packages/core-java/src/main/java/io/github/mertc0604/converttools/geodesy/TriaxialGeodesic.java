package io.github.mertc0604.converttools.geodesy;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import java.util.Objects;

/**
 * Geodesics on a triaxial ellipsoid X²/a² + Y²/b² + Z²/c² = 1
 * (a &ge; b &ge; c &gt; 0); the Java mirror of
 * {@code packages/core-js/src/geodesy/triaxial/index.js}.
 *
 * <p>Positions are Karney's ellipsoidal latitude beta and longitude omega in
 * degrees ("Jacobi's solution for geodesics on a triaxial ellipsoid", 2025,
 * section 2); headings are clockwise from a line of constant omega, in
 * degrees; lengths are in the unit of the semiaxes. The method (integration
 * of the geodesic and Jacobi equations, shortest-line search for the inverse)
 * and its validation are in docs/TRIAXIAL_VALIDATION.md.
 */
public final class TriaxialGeodesic {
    /** Semiaxes of a triaxial ellipsoid, a &ge; b &ge; c &gt; 0. */
    public record Axes(double a, double b, double c) {
        public Axes {
            if (!Double.isFinite(a) || !Double.isFinite(b) || !Double.isFinite(c)) {
                throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                        "ellipsoid semiaxes must be finite numbers.");
            }
            if (!(a >= b && b >= c && c > 0)) {
                throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                        "ellipsoid semiaxes must satisfy a >= b >= c > 0.");
            }
        }
    }

    /** Ellipsoidal latitude beta (-90..90) and longitude omega (-180..180), in degrees. */
    public record Point(double beta, double omega) {
        public Point {
            if (!Double.isFinite(beta) || beta < -90 || beta > 90) {
                throw new ConvertToolsException(ErrorCode.LATITUDE_OUT_OF_RANGE,
                        "beta must be finite and between -90 and 90.");
            }
            if (!Double.isFinite(omega) || omega < -180 || omega > 180) {
                throw new ConvertToolsException(ErrorCode.LONGITUDE_OUT_OF_RANGE,
                        "omega must be finite and between -180 and 180.");
            }
        }
    }

    /** Cartesian position. */
    public record Cartesian(double x, double y, double z) {
    }

    /**
     * Shortest geodesic between two points. Both headings are in [0, 360) and
     * null for coincident points. {@code ambiguous} is true when several
     * shortest geodesics exist and the result is only one of them
     * (docs/TRIAXIAL_VALIDATION.md); it is false for coincident points.
     */
    public record InverseResult(
            double distance,
            Double initialAzimuthDegrees,
            Double finalAzimuthDegrees,
            double reducedLength,
            double geodesicScale12,
            double geodesicScale21,
            boolean ambiguous
    ) {
    }

    /** End of a geodesic: beta in [-90, 90], omega in (-180, 180], heading in [0, 360). */
    public record DirectResult(
            double beta,
            double omega,
            double finalAzimuthDegrees,
            double reducedLength,
            double geodesicScale12,
            double geodesicScale21
    ) {
    }

    private TriaxialGeodesic() {
    }

    private static TriaxialEngine.Shape shape(Axes axes) {
        Objects.requireNonNull(axes, "ellipsoid");
        return TriaxialEngine.Shape.of(axes.a(), axes.b(), axes.c());
    }

    /** The geodesic solvers take a/c up to 10; their work grows with it. */
    private static TriaxialEngine.Shape geodesicShape(Axes axes) {
        TriaxialEngine.Shape model = shape(axes);
        if (axes.a() / axes.c() > TriaxialEngine.MAX_AXIS_RATIO) {
            throw new ConvertToolsException(ErrorCode.INPUT_LIMIT_EXCEEDED, "Geodesics need a/c <= 10.");
        }
        return model;
    }

    private static double heading(double[] pair) {
        double degrees = TriaxialEngine.degreesOf(pair);
        return degrees < 0 ? degrees + 360 : degrees + 0.0;
    }

    /** Cartesian position of (beta, omega). */
    public static Cartesian toCartesian(Point point, Axes ellipsoid) {
        TriaxialEngine.Shape model = shape(ellipsoid);
        Objects.requireNonNull(point, "point");
        double[] R = TriaxialEngine.ellipToCart(model,
                TriaxialEngine.angle(point.beta()), TriaxialEngine.angle(point.omega()));
        return new Cartesian(R[0] + 0.0, R[1] + 0.0, R[2] + 0.0);
    }

    /**
     * (beta, omega) of a Cartesian position; a point off the surface is first
     * moved along the line through the centre onto the surface.
     */
    public static Point fromCartesian(Cartesian point, Axes ellipsoid) {
        TriaxialEngine.Shape model = shape(ellipsoid);
        Objects.requireNonNull(point, "point");
        double x = point.x();
        double y = point.y();
        double z = point.z();
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) {
            throw new ConvertToolsException(ErrorCode.INVALID_NUMBER, "point coordinates must be finite.");
        }
        double scale = Math.hypot(Math.hypot(x / model.a, y / model.b), z / model.c);
        if (!(scale > 0) || !Double.isFinite(scale)) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "point must not be the centre of the ellipsoid.");
        }
        double[][] position = TriaxialEngine.cartToEllip(model, new double[] {x / scale, y / scale, z / scale});
        return new Point(TriaxialEngine.degreesOf(position[0]) + 0.0, TriaxialEngine.degreesOf(position[1]) + 0.0);
    }

    /**
     * Inverse problem: the shortest geodesic from start to end.
     *
     * @throws ConvertToolsException INPUT_LIMIT_EXCEEDED when a/c is above 10,
     *     NO_CONVERGENCE when no geodesic is found
     */
    public static InverseResult inverse(Point start, Point end, Axes ellipsoid) {
        TriaxialEngine.Shape model = geodesicShape(ellipsoid);
        Objects.requireNonNull(start, "start");
        Objects.requireNonNull(end, "end");
        TriaxialEngine.Inverse solution = TriaxialEngine.inverse(model,
                TriaxialEngine.angle(start.beta()), TriaxialEngine.angle(start.omega()),
                TriaxialEngine.angle(end.beta()), TriaxialEngine.angle(end.omega()));
        if (solution == null) {
            throw new ConvertToolsException(ErrorCode.NO_CONVERGENCE, "No geodesic between the points was found.");
        }
        boolean defined = solution.s12() > 0;
        return new InverseResult(
                solution.s12(),
                defined ? heading(solution.alp1()) : null,
                defined ? heading(solution.alp2()) : null,
                solution.m12() + 0.0,
                solution.M12(),
                solution.M21(),
                solution.ambiguous());
    }

    /**
     * Direct problem: the end of the geodesic of the given length and initial heading.
     *
     * @throws ConvertToolsException INPUT_LIMIT_EXCEEDED when a/c is above 10 or
     *     the line is longer than 20000 integration steps of 0.4 c²/a
     */
    public static DirectResult direct(Point start, double azimuthDegrees, double distance, Axes ellipsoid) {
        TriaxialEngine.Shape model = geodesicShape(ellipsoid);
        Objects.requireNonNull(start, "start");
        if (!Double.isFinite(azimuthDegrees)) {
            throw new ConvertToolsException(ErrorCode.INVALID_NUMBER, "azimuthDegrees must be finite.");
        }
        if (!Double.isFinite(distance)) {
            throw new ConvertToolsException(ErrorCode.INVALID_NUMBER, "distance must be finite.");
        }
        if (distance < 0) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT, "distance must not be negative.");
        }
        double longest = TriaxialEngine.maxDirectDistance(model);
        if (distance > longest) {
            throw new ConvertToolsException(ErrorCode.INPUT_LIMIT_EXCEEDED,
                    "distance must be at most " + longest + " on this ellipsoid.");
        }
        TriaxialEngine.Direct solution = TriaxialEngine.direct(model,
                TriaxialEngine.angle(start.beta()), TriaxialEngine.angle(start.omega()),
                TriaxialEngine.angle(azimuthDegrees), distance);
        return new DirectResult(
                TriaxialEngine.degreesOf(solution.bet2()) + 0.0,
                TriaxialEngine.degreesOf(solution.omg2()) + 0.0,
                heading(solution.alp2()),
                solution.m12() + 0.0,
                solution.M12(),
                solution.M21());
    }
}
