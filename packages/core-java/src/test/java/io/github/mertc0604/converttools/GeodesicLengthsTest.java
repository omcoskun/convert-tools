package io.github.mertc0604.converttools;

import io.github.mertc0604.converttools.geodesy.DirectResult;
import io.github.mertc0604.converttools.geodesy.Ellipsoid;
import io.github.mertc0604.converttools.geodesy.GeoPoint;
import io.github.mertc0604.converttools.geodesy.Geodesic;
import io.github.mertc0604.converttools.geodesy.GeodesicPath;
import io.github.mertc0604.converttools.geodesy.GeodesicResult;
import io.github.mertc0604.converttools.geodesy.PolylineMeasurement;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/**
 * Properties of the arc length, reduced length, geodesic scales and area,
 * the Java mirror of packages/core-js/test/geodesic-lengths-area.test.mjs:
 * sphere closed forms, reciprocity, inverse/direct closure, exact antipodes,
 * coincident points and zero distance, path and polyline carry-through, and a
 * finite-difference check of m12.
 */
public final class GeodesicLengthsTest {
    private static final Ellipsoid SPHERE = new Ellipsoid("SPHERE", 6371000, 0, 6371000);
    private static final Ellipsoid OBLATE_50 = ellipsoid("OBLATE-1/50", 6378137, 0.02);
    private static final Ellipsoid PROLATE_50 = ellipsoid("PROLATE-1/50", 6378137, -0.02);

    private GeodesicLengthsTest() {
    }

    public static void main(String[] args) {
        sphereClosedForms();
        reciprocity();
        closure();
        exactAntipodes();
        coincidentAndZeroDistance();
        pathAndPolyline();
        reducedLengthFiniteDifference();
        uncertainties();
        System.out.println("Java geodesic length and area tests passed.");
    }

    private static Ellipsoid ellipsoid(String id, double a, double f) {
        return new Ellipsoid(id, a, f, a * (1 - f));
    }

    private static double authalicRadiusSquared(Ellipsoid ellipsoid) {
        double a = ellipsoid.semiMajorAxisMetres();
        double f = ellipsoid.flattening();
        double b = a * (1 - f);
        double e2 = f * (2 - f);
        if (e2 == 0) {
            return a * a;
        }
        double e = Math.sqrt(Math.abs(e2));
        double ratio = e2 > 0 ? 0.5 * Math.log((1 + e) / (1 - e)) / e : Math.atan(e) / e;
        return (a * a + b * b * ratio) / 2;
    }

    private static GeoPoint randomPoint(Random random) {
        return new GeoPoint(Math.toDegrees(Math.asin(2 * random.nextDouble() - 1)),
                360 * random.nextDouble() - 180);
    }

    /** On a sphere a12 = s12 / R, m12 = R sin(sigma), M12 = M21 = cos(sigma). */
    private static void sphereClosedForms() {
        Random random = new Random(20261115L);
        double radius = SPHERE.semiMajorAxisMetres();
        double worstArc = 0;
        double worstReduced = 0;
        double worstScale = 0;
        for (int i = 0; i < 2000; i++) {
            GeodesicResult result = Geodesic.inverse(randomPoint(random), randomPoint(random), SPHERE);
            double sigma = result.distanceMetres() / radius;
            if (sigma > Math.PI - 1e-3) {
                continue; // nearly antipodal: the route, not the length, is ill-conditioned
            }
            double arc = Math.abs(result.arcDegrees() - Math.toDegrees(sigma));
            double reduced = Math.abs(result.reducedLengthMetres() - radius * Math.sin(sigma));
            double scale = Math.max(Math.abs(result.geodesicScale12() - Math.cos(sigma)),
                    Math.abs(result.geodesicScale21() - Math.cos(sigma)));
            worstArc = Math.max(worstArc, arc);
            worstReduced = Math.max(worstReduced, reduced);
            worstScale = Math.max(worstScale, scale);
        }
        System.out.println(String.format(Locale.ROOT,
                "  sphere closed forms: a12 %.3e deg, m12 %.3e m, M %.3e", worstArc, worstReduced, worstScale));
        require(worstArc <= 1e-7 / (radius * Math.PI / 180), "sphere a12 off by " + worstArc);
        require(worstReduced <= 1e-7, "sphere m12 off by " + worstReduced);
        require(worstScale <= 1e-7 / radius, "sphere M12/M21 off by " + worstScale);
    }

    /** Swapping the endpoints keeps a12 and m12, swaps M12 and M21 and negates S12. */
    private static void reciprocity() {
        Random random = new Random(7L);
        for (Ellipsoid ellipsoid : List.of(Ellipsoid.WGS84, SPHERE, OBLATE_50, PROLATE_50)) {
            double radius = ellipsoid.semiMajorAxisMetres();
            for (int i = 0; i < 300; i++) {
                GeoPoint first = randomPoint(random);
                GeoPoint second = randomPoint(random);
                GeodesicResult forward = Geodesic.inverse(first, second, ellipsoid);
                GeodesicResult backward = Geodesic.inverse(second, first, ellipsoid);
                if (forward.ambiguous() || Math.abs(forward.reducedLengthMetres()) < 1000) {
                    continue; // the route may change with the direction
                }
                String where = ellipsoid.id() + " " + first + " " + second;
                require(Math.abs(forward.arcDegrees() - backward.arcDegrees()) <= 1e-7 / radius * 180 / Math.PI,
                        "a12 not reciprocal: " + where);
                require(Math.abs(forward.reducedLengthMetres() - backward.reducedLengthMetres()) <= 1e-7,
                        "m12 not reciprocal: " + where);
                require(Math.abs(forward.geodesicScale12() - backward.geodesicScale21()) <= 1e-7 / radius
                        && Math.abs(forward.geodesicScale21() - backward.geodesicScale12()) <= 1e-7 / radius,
                        "M12/M21 not swapped: " + where);
                double areaTolerance = 0.25 + authalicRadiusSquared(ellipsoid) * 1e-8
                        / Math.abs(forward.reducedLengthMetres());
                require(Math.abs(forward.areaSquareMetres() + backward.areaSquareMetres()) <= areaTolerance,
                        "S12 not antisymmetric: " + where);
            }
        }
    }

    /** The direct problem along the inverse azimuth reproduces every length. */
    private static void closure() {
        Random random = new Random(11L);
        for (Ellipsoid ellipsoid : List.of(Ellipsoid.WGS84, SPHERE, OBLATE_50, PROLATE_50)) {
            double radius = ellipsoid.semiMajorAxisMetres();
            for (int i = 0; i < 300; i++) {
                GeoPoint start = randomPoint(random);
                GeodesicResult inverse = Geodesic.inverse(start, randomPoint(random), ellipsoid);
                if (Math.abs(inverse.reducedLengthMetres()) < 1000) {
                    continue;
                }
                DirectResult direct = Geodesic.direct(start, inverse.initialBearingDegrees(),
                        inverse.distanceMetres(), ellipsoid);
                String where = ellipsoid.id() + " " + start + " " + inverse.initialBearingDegrees();
                require(Math.abs(direct.arcDegrees() - inverse.arcDegrees()) <= 1e-7 / radius * 180 / Math.PI,
                        "a12 closure: " + where);
                require(Math.abs(direct.reducedLengthMetres() - inverse.reducedLengthMetres()) <= 1e-7,
                        "m12 closure: " + where);
                require(Math.abs(direct.geodesicScale12() - inverse.geodesicScale12()) <= 1e-7 / radius
                        && Math.abs(direct.geodesicScale21() - inverse.geodesicScale21()) <= 1e-7 / radius,
                        "M12/M21 closure: " + where);
                double areaTolerance = 0.25 + authalicRadiusSquared(ellipsoid) * 1e-8
                        / Math.abs(inverse.reducedLengthMetres());
                require(Math.abs(direct.areaSquareMetres() - inverse.areaSquareMetres()) <= areaTolerance,
                        "S12 closure: " + where);
            }
        }
    }

    /**
     * Exact antipodes return the route over the north pole; every length
     * describes that route, so the direct problem along azimuth 0 gives the
     * same values, and S12 = c^2 pi.
     */
    private static void exactAntipodes() {
        for (Ellipsoid ellipsoid : List.of(Ellipsoid.WGS84, SPHERE, OBLATE_50)) {
            double c2pi = authalicRadiusSquared(ellipsoid) * Math.PI;
            double radius = ellipsoid.semiMajorAxisMetres();
            for (double latitude : new double[]{-60, -30, -1, 0, 1, 30, 60, 89.5}) {
                GeoPoint start = new GeoPoint(latitude, 20);
                GeodesicResult inverse = Geodesic.inverse(start, new GeoPoint(-latitude, -160), ellipsoid);
                String where = ellipsoid.id() + " latitude " + latitude;
                require(inverse.initialBearingDegrees() == 0 && inverse.finalBearingDegrees() == 180,
                        "antipodal azimuths: " + where);
                require(inverse.arcDegrees() == 180, "antipodal a12: " + where);
                require(Math.abs(inverse.areaSquareMetres() - c2pi) <= 1e-12 * c2pi, "antipodal S12: " + where);
                DirectResult direct = Geodesic.direct(start, 0, inverse.distanceMetres(), ellipsoid);
                require(Math.abs(direct.reducedLengthMetres() - inverse.reducedLengthMetres()) <= 1e-7,
                        "antipodal m12 vs direct: " + where);
                require(Math.abs(direct.geodesicScale12() - inverse.geodesicScale12()) <= 1e-7 / radius
                        && Math.abs(direct.geodesicScale21() - inverse.geodesicScale21()) <= 1e-7 / radius,
                        "antipodal M12/M21 vs direct: " + where);
                require(Math.abs(direct.areaSquareMetres() - inverse.areaSquareMetres()) <= 0.25,
                        "antipodal S12 vs direct: " + where);
            }
            GeodesicResult poles = Geodesic.inverse(new GeoPoint(90, 0), new GeoPoint(-90, 0), ellipsoid);
            require(Math.abs(poles.areaSquareMetres() - c2pi) <= 1e-12 * c2pi, "pole-to-pole S12 " + ellipsoid.id());
        }
    }

    private static void coincidentAndZeroDistance() {
        GeoPoint point = new GeoPoint(41.0, 29.0);
        GeodesicResult identity = Geodesic.inverse(point, point);
        require(identity.arcDegrees() == 0 && identity.reducedLengthMetres() == 0
                && identity.geodesicScale12() == 1 && identity.geodesicScale21() == 1
                && identity.areaSquareMetres() == 0, "coincident points: 0, 0, 1, 1, 0");
        DirectResult zero = Geodesic.direct(point, 45, 0);
        require(zero.arcDegrees() == 0 && zero.reducedLengthMetres() == 0
                && zero.geodesicScale12() == 1 && zero.geodesicScale21() == 1
                && zero.areaSquareMetres() == 0, "zero distance: 0, 0, 1, 1, 0");
    }

    private static void pathAndPolyline() {
        GeoPoint start = new GeoPoint(41.0, 29.0);
        GeoPoint end = new GeoPoint(-33.9, 151.2);
        GeodesicResult result = Geodesic.inverse(start, end);
        GeodesicPath path = Geodesic.samplePath(start, end);
        require(path.arcDegrees() == result.arcDegrees()
                && path.reducedLengthMetres() == result.reducedLengthMetres()
                && path.geodesicScale12() == result.geodesicScale12()
                && path.geodesicScale21() == result.geodesicScale21()
                && path.areaSquareMetres() == result.areaSquareMetres(), "path carries the lengths and area");
        PolylineMeasurement polyline = Geodesic.measurePolyline(List.of(start, end, start));
        require(polyline.segments().get(0).areaSquareMetres() == result.areaSquareMetres()
                && polyline.segments().get(1).reducedLengthMetres()
                == Geodesic.inverse(end, start).reducedLengthMetres(), "polyline segments carry the lengths and area");
    }

    /**
     * m12 is the derivative of the end point with respect to the initial
     * azimuth: |m12| ~ |P2(azi1 + d) - P2(azi1 - d)| / (2 d).
     */
    private static void reducedLengthFiniteDifference() {
        Random random = new Random(3L);
        double delta = 1e-6; // radians
        double worst = 0;
        for (int i = 0; i < 200; i++) {
            GeoPoint start = randomPoint(random);
            double azimuth = 360 * random.nextDouble();
            double distance = 1e5 + 1.8e7 * random.nextDouble();
            DirectResult centre = Geodesic.direct(start, azimuth, distance);
            DirectResult plus = Geodesic.direct(start, azimuth + Math.toDegrees(delta), distance);
            DirectResult minus = Geodesic.direct(start, azimuth - Math.toDegrees(delta), distance);
            double separation = Geodesic.inverse(minus.destination(), plus.destination()).distanceMetres();
            double estimate = separation / (2 * delta);
            double m12 = Math.abs(centre.reducedLengthMetres());
            if (m12 < 1e5) {
                continue; // near a conjugate point the second-order term dominates
            }
            worst = Math.max(worst, Math.abs(estimate - m12) / m12);
        }
        System.out.println(String.format(Locale.ROOT, "  m12 finite difference: max relative %.3e", worst));
        require(worst <= 1e-6, "m12 disagrees with the finite difference by " + worst);
    }

    /**
     * bearingUncertaintyDegrees = min(180, max(1e-11, deg(1e-7 m / |m12|))) and
     * areaUncertaintySquareMetres = rad(bearingUncertainty) min(2 c^2, s12^2 / 2)
     * + 1e-14 c^2, the area swept between the two geodesics plus round-off;
     * both null without an azimuth (the mirror of geodesic-uncertainty.test.mjs).
     */
    private static void uncertainties() {
        GeodesicResult ordinary = Geodesic.inverse(new GeoPoint(39.933365, 32.859742),
                new GeoPoint(41.008238, 28.978359));
        require(ordinary.bearingUncertaintyDegrees() > 1e-11
                && ordinary.bearingUncertaintyDegrees() < 2e-11, "Ankara - Istanbul azimuth uncertainty "
                + ordinary.bearingUncertaintyDegrees());
        require(ordinary.areaUncertaintySquareMetres() > 0.4
                && ordinary.areaUncertaintySquareMetres() < 0.45, "Ankara - Istanbul area uncertainty "
                + ordinary.areaUncertaintySquareMetres());
        GeodesicResult shortLine = Geodesic.inverse(new GeoPoint(39.9, 32.8), new GeoPoint(39.9, 32.8586));
        require(shortLine.distanceMetres() > 4900 && shortLine.distanceMetres() < 5100
                && shortLine.areaUncertaintySquareMetres() < 0.42, "5 km line area uncertainty "
                + shortLine.areaUncertaintySquareMetres());
        GeodesicResult identity = Geodesic.inverse(new GeoPoint(10, 20), new GeoPoint(10, 20));
        require(identity.bearingUncertaintyDegrees() == null
                && identity.areaUncertaintySquareMetres() == null, "coincident points: no uncertainty");
        GeodesicResult nearVertex = Geodesic.inverse(new GeoPoint(56.796245515064, 0),
                new GeoPoint(-56.796245515064519948, 179.668926360912281556));
        double expected = Math.max(1e-11, Math.toDegrees(1e-7 / Math.abs(nearVertex.reducedLengthMetres())));
        require(Math.abs(nearVertex.reducedLengthMetres()) < 1
                && Math.abs(nearVertex.bearingUncertaintyDegrees() - expected) <= 1e-12 * Math.max(1, expected)
                && nearVertex.areaUncertaintySquareMetres() > 1, "near-vertex uncertainty "
                + nearVertex.bearingUncertaintyDegrees());
        GeodesicResult poles = Geodesic.inverse(new GeoPoint(90, 0), new GeoPoint(-90, 0));
        require(poles.bearingUncertaintyDegrees() == 180
                && Double.isFinite(poles.areaUncertaintySquareMetres()), "opposite poles: a half turn");
        double c2 = authalicRadiusSquared(OBLATE_50);
        for (GeoPoint end : List.of(new GeoPoint(10, 30), new GeoPoint(-9.9, 179.5))) {
            GeodesicResult oblate = Geodesic.inverse(new GeoPoint(10, 0), end, OBLATE_50);
            double s12 = oblate.distanceMetres();
            double swept = Math.toRadians(oblate.bearingUncertaintyDegrees()) * Math.min(2 * c2, s12 * s12 / 2)
                    + 1e-14 * c2;
            require(Math.abs(oblate.areaUncertaintySquareMetres() - swept) <= 1e-9 * swept,
                    "area uncertainty is the swept area on the ellipsoid: " + oblate.areaUncertaintySquareMetres()
                    + " vs " + swept);
        }
        PolylineMeasurement polyline = Geodesic.measurePolyline(List.of(new GeoPoint(10, 0),
                new GeoPoint(-10, 179), new GeoPoint(5, 5)));
        for (GeodesicResult segment : polyline.segments()) {
            require(segment.bearingUncertaintyDegrees() != null
                    && segment.areaUncertaintySquareMetres() != null, "route segments report uncertainties");
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

}
