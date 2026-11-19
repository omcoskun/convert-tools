/*
 * Karney geodesic calculations on an ellipsoid of revolution.
 *
 * Copyright (c) Charles Karney (2013-2022) <charles@karney.com> and licensed
 * under the MIT/X11 License. For more information, see
 * https://geographiclib.sourceforge.io/
 *
 * This class adapts the algorithms of GeographicLib's Geodesic and
 * GeodesicLine classes to the Convert Tools public API.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

package io.github.omcoskun.converttools.geodesy;

import io.github.omcoskun.converttools.ConvertToolsException;
import io.github.omcoskun.converttools.ErrorCode;
import io.github.omcoskun.converttools.coordinates.core.Angles;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Geodesic calculations on an ellipsoid of revolution.
 *
 * <p>The inverse and direct problems use C. F. F. Karney's algorithm
 * ("Algorithms for geodesics", J. Geodesy <b>87</b>, 43-55, 2013), the method
 * of GeographicLib's {@code Geodesic} and {@code GeodesicLine} classes with
 * series truncated at sixth order in the flattening. The legacy iterative
 * solver and the shooting fallback are gone.
 *
 * <p>The {@code ambiguous} flag of an inverse result is exact:
 * {@code lat1 + lat2 == 0} must hold exactly and at least one of these must
 * also hold:
 * <ul>
 *   <li>both points are opposite poles ({@code |lat1| == 90});</li>
 *   <li>{@code |lon12| == 180°}; or</li>
 *   <li>for an oblate ellipsoid ({@code f > 0}),
 *       {@code |lon12| - lonCut > 1e-9°}, where
 *       {@code lonCut = 180° · (1 - f · A3(eps) · cos(beta1))},
 *       {@code beta1} is the reduced latitude of point 1,
 *       {@code k2 = ep2 · sin²(beta1)}, {@code ep2 = e2 / (1 - e2)},
 *       {@code e2 = f(2 - f)}, {@code eps = k2 / (2(1 + sqrt(1 + k2)) + k2)}
 *       and {@code A3} is Karney's A3 series. On the equator this reduces to
 *       {@code |lon12| > (1 - f) · 180°}.</li>
 * </ul>
 * A nearly antipodal pair with a unique route is not ambiguous. For a prolate
 * ellipsoid ({@code f < 0}) only the opposite-pole and
 * {@code |lon12| == 180°} cases apply; the cut-locus test is defined for
 * {@code f > 0} only.
 *
 * <p>Exact antipodes ({@code lat1 == -lat2} with {@code |lon12| == 180°}, or
 * opposite poles) return the canonical route over the north pole: initial
 * bearing 0°, final bearing 180°. On a prolate ellipsoid ({@code f < 0}) that
 * route is not a shortest one, so, except for opposite poles, the solved
 * azimuths are returned instead.
 *
 * <p>The legacy {@code tolerance} and {@code maxIterations} options of the
 * JavaScript API are accepted, validated, and ignored by this algorithm;
 * they are deprecated. The Java API has no such options. Inverse
 * {@code iterations} counts the Newton/bisection longitude evaluations
 * actually used (0 for the closed-form paths); direct {@code iterations} is
 * always 0.
 */
public final class Geodesic {
    private static final double DEFAULT_PATH_SEGMENT_METRES = 25_000;
    private static final int DEFAULT_PATH_MAX_POINTS = 2_049;
    private static final int PATH_MAX_POINTS_LIMIT = 10_001;
    private static final String INVERSE_SOLVER = "karney-inverse";
    private static final String INVERSE_ALGORITHM = "ellipsoidal";
    private static final String DIRECT_ALGORITHM = "karney-direct";

    private Geodesic() {
    }

    /**
     * Solves the inverse problem on WGS 84. See the class documentation for
     * the exact {@code ambiguous} rule and the antipodal convention.
     */
    public static GeodesicResult inverse(GeoPoint start, GeoPoint end) {
        return inverse(start, end, Ellipsoid.WGS84);
    }

    /**
     * Solves the inverse problem on the given ellipsoid. See the class
     * documentation for the exact {@code ambiguous} rule and the antipodal
     * convention.
     */
    public static GeodesicResult inverse(
            GeoPoint start,
            GeoPoint end,
            Ellipsoid ellipsoid
    ) {
        Objects.requireNonNull(start, "start");
        Objects.requireNonNull(end, "end");
        Objects.requireNonNull(ellipsoid, "ellipsoid");
        return inverse(start, end, ellipsoid, new GeodesicEngine(
                ellipsoid.semiMajorAxisMetres(),
                ellipsoid.flattening()
        ));
    }

    /**
     * Solves the direct problem on WGS 84. Distances are metres and azimuths
     * degrees; the distance must be finite and non-negative.
     */
    public static DirectResult direct(
            GeoPoint start,
            double initialBearingDegrees,
            double distanceMetres
    ) {
        return direct(
                start,
                initialBearingDegrees,
                distanceMetres,
                Ellipsoid.WGS84
        );
    }

    /**
     * Solves the direct problem on the given ellipsoid. Distances are metres
     * and azimuths degrees; the distance must be finite and non-negative.
     */
    public static DirectResult direct(
            GeoPoint start,
            double initialBearingDegrees,
            double distanceMetres,
            Ellipsoid ellipsoid
    ) {
        Objects.requireNonNull(start, "start");
        Objects.requireNonNull(ellipsoid, "ellipsoid");
        if (!Double.isFinite(initialBearingDegrees)) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "initialBearingDegrees must be finite."
            );
        }
        if (!Double.isFinite(distanceMetres) || distanceMetres < 0) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "distanceMetres must be finite and non-negative."
            );
        }
        double bearing = normalizeBearing(initialBearingDegrees);
        if (distanceMetres == 0) {
            return new DirectResult(
                    start,
                    bearing,
                    ellipsoid.id(),
                    DIRECT_ALGORITHM,
                    0,
                    0,
                    0,
                    1,
                    1,
                    0
            );
        }
        GeodesicEngine engine = new GeodesicEngine(
                ellipsoid.semiMajorAxisMetres(),
                ellipsoid.flattening()
        );
        // The engine normalizes the azimuth itself, exactly (AngNormalize);
        // ((x % 360) + 360) % 360 would round it by up to one unit in the
        // last place, which the area of a long line can amplify. Same as the
        // JavaScript core.
        return direct(
                start, initialBearingDegrees, distanceMetres, ellipsoid, engine
        );
    }

    /**
     * Measures a polyline on WGS 84. Each segment is a shortest geodesic.
     */
    public static PolylineMeasurement measurePolyline(List<GeoPoint> points) {
        return measurePolyline(points, Ellipsoid.WGS84);
    }

    /**
     * Measures a polyline on the given ellipsoid. Each segment is a shortest
     * geodesic.
     */
    public static PolylineMeasurement measurePolyline(
            List<GeoPoint> points,
            Ellipsoid ellipsoid
    ) {
        Objects.requireNonNull(points, "points");
        Objects.requireNonNull(ellipsoid, "ellipsoid");
        if (points.size() < 2) {
            return new PolylineMeasurement(
                    0,
                    0,
                    ellipsoid.id(),
                    "ellipsoidal-segments",
                    List.of()
            );
        }

        GeodesicEngine engine = new GeodesicEngine(
                ellipsoid.semiMajorAxisMetres(),
                ellipsoid.flattening()
        );
        List<GeodesicResult> segments = new ArrayList<>();
        double sum = 0;
        double compensation = 0;
        for (int index = 1; index < points.size(); index++) {
            GeodesicResult segment = inverse(
                    points.get(index - 1),
                    points.get(index),
                    ellipsoid,
                    engine
            );
            segments.add(segment);
            double value = segment.distanceMetres();
            double next = sum + value;
            compensation += Math.abs(sum) >= Math.abs(value)
                    ? sum - next + value
                    : value - next + sum;
            sum = next;
        }

        return new PolylineMeasurement(
                sum + compensation,
                segments.size(),
                ellipsoid.id(),
                "ellipsoidal-segments",
                segments
        );
    }

    /**
     * Samples a geodesic on WGS 84 with default spacing.
     */
    public static GeodesicPath samplePath(GeoPoint start, GeoPoint end) {
        return samplePath(
                start,
                end,
                DEFAULT_PATH_SEGMENT_METRES,
                DEFAULT_PATH_MAX_POINTS,
                Ellipsoid.WGS84
        );
    }

    /**
     * Samples a geodesic on WGS 84.
     */
    public static GeodesicPath samplePath(
            GeoPoint start,
            GeoPoint end,
            double maxSegmentMetres,
            int maxPoints
    ) {
        return samplePath(
                start,
                end,
                maxSegmentMetres,
                maxPoints,
                Ellipsoid.WGS84
        );
    }

    /**
     * Samples a geodesic on the given ellipsoid. Interior points lie on the
     * same shortest geodesic returned by {@link #inverse}.
     */
    public static GeodesicPath samplePath(
            GeoPoint start,
            GeoPoint end,
            double maxSegmentMetres,
            int maxPoints,
            Ellipsoid ellipsoid
    ) {
        Objects.requireNonNull(start, "start");
        Objects.requireNonNull(end, "end");
        Objects.requireNonNull(ellipsoid, "ellipsoid");
        if (!Double.isFinite(maxSegmentMetres) || maxSegmentMetres <= 0) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "maxSegmentMetres must be finite and greater than zero."
            );
        }
        if (maxPoints < 2 || maxPoints > PATH_MAX_POINTS_LIMIT) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "maxPoints must be between 2 and "
                            + PATH_MAX_POINTS_LIMIT
                            + "."
            );
        }

        GeodesicEngine engine = new GeodesicEngine(
                ellipsoid.semiMajorAxisMetres(),
                ellipsoid.flattening()
        );
        GeodesicResult measurement = inverse(start, end, ellipsoid, engine);
        if (measurement.distanceMetres() == 0) {
            return GeodesicPath.from(
                    measurement,
                    List.of(start),
                    0,
                    0
            );
        }

        long requestedSegments = Math.max(
                1,
                (long) Math.ceil(
                        measurement.distanceMetres() / maxSegmentMetres
                )
        );
        int segmentCount = (int) Math.min(
                requestedSegments,
                (long) maxPoints - 1
        );
        List<GeoPoint> points = new ArrayList<>(segmentCount + 1);
        points.add(start);
        for (int index = 1; index < segmentCount; index++) {
            points.add(direct(
                    start,
                    measurement.initialBearingDegrees(),
                    measurement.distanceMetres() * index / segmentCount,
                    ellipsoid,
                    engine
            ).destination());
        }
        points.add(end);

        return GeodesicPath.from(
                measurement,
                points,
                segmentCount,
                measurement.distanceMetres() / segmentCount
        );
    }

    private static GeodesicResult inverse(
            GeoPoint start,
            GeoPoint end,
            Ellipsoid ellipsoid,
            GeodesicEngine engine
    ) {
        Objects.requireNonNull(start, "start");
        Objects.requireNonNull(end, "end");
        Objects.requireNonNull(ellipsoid, "ellipsoid");
        Objects.requireNonNull(engine, "engine");

        if (coincident(start, end)) {
            return new GeodesicResult(
                    0,
                    null,
                    null,
                    false,
                    false,
                    ellipsoid.id(),
                    INVERSE_ALGORITHM,
                    "identity",
                    0,
                    0,
                    0,
                    1,
                    1,
                    0,
                    null,
                    null
            );
        }

        GeodesicEngine.InverseSolution solution = engine.inverse(
                start.latitude(),
                start.longitude(),
                end.latitude(),
                end.longitude()
        );
        boolean antipodal = exactAntipodes(start, end, ellipsoid);
        boolean ambiguous = ambiguous(start, end, ellipsoid, engine);
        // Exact antipodes take the route over the north pole (contract);
        // every route-dependent output describes that route, whichever
        // equally short route the solver found.
        double arcDegrees = solution.arcDegrees();
        double reducedLength = solution.reducedLengthMetres();
        double scale12 = solution.geodesicScale12();
        double scale21 = solution.geodesicScale21();
        double area = solution.areaSquareMetres();
        if (antipodal) {
            GeodesicEngine.PoleRoute route =
                    engine.northPoleRoute(start.latitude());
            arcDegrees = 180;
            reducedLength = route.reducedLengthMetres();
            scale12 = route.geodesicScale12();
            scale21 = route.geodesicScale21();
            area = route.areaSquareMetres();
        }
        return new GeodesicResult(
                solution.distanceMetres(),
                antipodal ? 0.0 : normalizeBearing(
                        solution.initialBearingDegrees()
                ),
                antipodal ? 180.0 : normalizeBearing(
                        solution.finalBearingDegrees()
                ),
                true,
                ambiguous,
                ellipsoid.id(),
                INVERSE_ALGORITHM,
                INVERSE_SOLVER,
                solution.iterations(),
                arcDegrees,
                reducedLength,
                scale12,
                scale21,
                area,
                bearingUncertainty(reducedLength),
                areaUncertainty(reducedLength, solution.distanceMetres(), engine.authalicRadiusSquared())
        );
    }

    // The contract's azimuth tolerance as an endpoint offset, |delta azi| *
    // |m12| (all 500000 GeodTest rows meet it; the largest is 7.53e-8 m).
    private static final double AZIMUTH_ENDPOINT_TOLERANCE = 1e-7;
    // Round-off of a well-conditioned azimuth (GeodTest: at most 1.6e-12 deg).
    private static final double BEARING_UNCERTAINTY_FLOOR = 1e-11;
    // Round-off of S12, as a fraction of c^2 (0.41 m^2 on WGS 84).
    private static final double AREA_ROUND_OFF = 1e-14;

    /**
     * How far the azimuths of an inverse result may be from the exact ones:
     * nearly antipodal (small |m12|) an endpoint offset e turns them by about
     * e / |m12|. Never more than a half turn.
     */
    private static double bearingUncertainty(double reducedLengthMetres) {
        double spread = Math.toDegrees(AZIMUTH_ENDPOINT_TOLERANCE / Math.abs(reducedLengthMetres));
        return Math.min(180, Math.max(BEARING_UNCERTAINTY_FLOOR, spread));
    }

    /**
     * How far S12 may be from the exact value: the area swept between the two
     * geodesics, the turn in radians times the integral of m(t) dt along the
     * line, at most s12^2 / 2 (m(t) <= t on an ellipsoid) and about 2 c^2 for
     * a half meridian; plus round-off. Over all 500000 GeodTest rows, the S12
     * error is at most 0.083 of this bound.
     */
    private static double areaUncertainty(double reducedLengthMetres, double distanceMetres, double c2) {
        double swept = Math.min(2 * c2, distanceMetres * distanceMetres / 2);
        return Math.toRadians(bearingUncertainty(reducedLengthMetres)) * swept + AREA_ROUND_OFF * c2;
    }

    private static DirectResult direct(
            GeoPoint start,
            double initialBearingDegrees,
            double distanceMetres,
            Ellipsoid ellipsoid,
            GeodesicEngine engine
    ) {
        GeodesicEngine.DirectSolution solution = engine.direct(
                start.latitude(),
                start.longitude(),
                initialBearingDegrees,
                distanceMetres
        );
        return new DirectResult(
                new GeoPoint(
                        solution.latitudeDegrees(),
                        GeoPoint.normalizeLongitude(
                                solution.longitudeDegrees()
                        )
                ),
                normalizeBearing(solution.finalBearingDegrees()),
                ellipsoid.id(),
                DIRECT_ALGORITHM,
                0,
                solution.arcDegrees(),
                0 + solution.reducedLengthMetres(),
                solution.geodesicScale12(),
                solution.geodesicScale21(),
                0 + solution.areaSquareMetres()
        );
    }

    /**
     * Whether a second shortest route of the same length exists: opposite
     * latitudes, plus opposite poles, a 180° longitude difference, or a
     * longitude beyond the cut locus on an oblate ellipsoid.
     */
    private static boolean ambiguous(
            GeoPoint start,
            GeoPoint end,
            Ellipsoid ellipsoid,
            GeodesicEngine engine
    ) {
        if (start.latitude() + end.latitude() != 0) {
            return false;
        }
        if (Math.abs(start.latitude()) == 90) {
            return true;
        }
        double longitudeDifference = Math.abs(Angles.angDiff(
                start.longitude(),
                end.longitude()
        ));
        if (longitudeDifference == 180) {
            return true;
        }
        if (ellipsoid.flattening() <= 0) {
            return false;
        }
        return longitudeDifference - engine.lonCut(start.latitude()) > 1e-9;
    }

    private static boolean coincident(GeoPoint start, GeoPoint end) {
        return start.latitude() == end.latitude()
                && (Math.abs(start.latitude()) == 90
                        || Math.abs(
                                GeoPoint.normalizeLongitude(
                                        start.longitude() - end.longitude()
                                )
                        ) == 0
                );
    }

    /**
     * Antipodes that are reported with the route over the north pole:
     * opposite poles, or exactly opposite latitudes with a longitude
     * difference of exactly 180° on an oblate ellipsoid or a sphere. On a
     * prolate ellipsoid that route is not a shortest one, so the solved
     * azimuths stand.
     */
    private static boolean exactAntipodes(
            GeoPoint start,
            GeoPoint end,
            Ellipsoid ellipsoid
    ) {
        boolean oppositePoles = Math.abs(start.latitude()) == 90
                && end.latitude() == -start.latitude();
        if (oppositePoles) {
            return true;
        }
        if (ellipsoid.flattening() < 0) {
            return false;
        }
        double longitudeDifference = Math.abs(Angles.angDiff(
                start.longitude(),
                end.longitude()
        ));
        return start.latitude() == -end.latitude()
                && longitudeDifference == 180;
    }

    private static double normalizeBearing(double degrees) {
        return ((degrees % 360) + 360) % 360;
    }
}
