package io.github.mertc0604.converttools;

import io.github.mertc0604.converttools.geodesy.DirectResult;
import io.github.mertc0604.converttools.geodesy.Ellipsoid;
import io.github.mertc0604.converttools.geodesy.GeoPoint;
import io.github.mertc0604.converttools.geodesy.Geodesic;
import io.github.mertc0604.converttools.geodesy.GeodesicResult;
import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic;
import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic.Axes;
import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic.Cartesian;
import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic.Point;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The Java mirror of packages/core-js/test/triaxial-geodesic.test.mjs:
 * Geod3Solve vectors, symmetry and closure, finite differences of m12 and
 * M21, the oblate (a = b) and prolate (b = c) limits against the biaxial
 * solver with near-antipodal pairs, the sphere, coordinate round trips and
 * coded errors.
 */
public final class TriaxialGeodesicTest {
    private static final Axes CAYLEY = new Axes(Math.sqrt(2), 1, Math.sqrt(0.5));
    private static final Axes EARTH3 = new Axes(6378172, 6378102, 6356752);
    private static final Axes MILD = new Axes(1.2, 1.1, 1);

    private TriaxialGeodesicTest() {
    }

    public static void main(String[] args) throws IOException {
        Path vectors = Path.of(args.length > 0 ? args[0] : "contracts/test-vectors");
        inverseVectors(vectors);
        shortestVectors(vectors);
        causticVectors(vectors);
        cutLocusVectors(vectors);
        conventionVectors(vectors);
        umbilicFarVectors(vectors);
        antipodalUmbilics();
        genericNotAmbiguous();
        coincidentAndAntipodes();
        directVectors(vectors);
        directAccuracyVectors(vectors);
        symmetryAndClosure();
        finiteDifferences();
        oblateLimit();
        prolateLimit();
        sphere();
        roundTripAndZero();
        errors();
        System.out.println("Java triaxial geodesic tests passed.");
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static List<Map<String, String>> read(Path dir, String name) throws IOException {
        List<String> lines = Files.readAllLines(dir.resolve(name), StandardCharsets.UTF_8);
        String[] keys = lines.get(0).split(",");
        List<Map<String, String>> rows = new ArrayList<>();
        for (String line : lines.subList(1, lines.size())) {
            if (line.isEmpty()) {
                continue;
            }
            String[] values = line.split(",", -1);
            Map<String, String> row = new HashMap<>();
            for (int i = 0; i < keys.length; i++) {
                row.put(keys[i], values[i]);
            }
            rows.add(row);
        }
        return rows;
    }

    private static double num(Map<String, String> row, String key) {
        return Double.parseDouble(row.get(key));
    }

    /** Absolute difference of two headings in radians. */
    private static double headingDifference(double x, double y) {
        double degrees = (((x - y) % 360) + 540) % 360 - 180;
        return Math.toRadians(Math.abs(degrees));
    }

    private static double distance(Cartesian p, Cartesian q) {
        return Math.sqrt((p.x() - q.x()) * (p.x() - q.x()) + (p.y() - q.y()) * (p.y() - q.y())
                + (p.z() - q.z()) * (p.z() - q.z()));
    }

    private static List<Point> pointsOn(int count, long seed) {
        long[] state = {seed};
        List<Point> points = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            state[0] = state[0] * 48271 % 2147483647;
            double u = state[0] / 2147483647.0;
            state[0] = state[0] * 48271 % 2147483647;
            double v = state[0] / 2147483647.0;
            points.add(new Point(Math.toDegrees(Math.asin(2 * u - 1)), 360 * v - 180));
        }
        return points;
    }

    private static void inverseVectors(Path dir) throws IOException {
        List<Map<String, String>> rows = read(dir, "triaxial-inverse.csv");
        check(rows.size() == 70, "triaxial-inverse.csv rows " + rows.size());
        double worst = 0;
        for (Map<String, String> row : rows) {
            Axes axes = new Axes(num(row, "a"), num(row, "b"), num(row, "c"));
            TriaxialGeodesic.InverseResult result = TriaxialGeodesic.inverse(
                    new Point(num(row, "bet1"), num(row, "omg1")), new Point(num(row, "bet2"), num(row, "omg2")), axes);
            double tolerance = num(row, "tolerance");
            double m12 = Math.abs(result.reducedLength());
            double ds = Math.abs(result.distance() - num(row, "expected_s12"));
            worst = Math.max(worst, ds / axes.b());
            check(ds <= tolerance, row.get("id") + ": distance " + result.distance());
            check(headingDifference(result.initialAzimuthDegrees(), num(row, "expected_alp1")) * m12 <= tolerance,
                    row.get("id") + ": alp1");
            check(headingDifference(result.finalAzimuthDegrees(), num(row, "expected_alp2")) * m12 <= tolerance,
                    row.get("id") + ": alp2");
        }
        System.out.printf(Locale.ROOT, "triaxial-inverse.csv distance: max %.3e b over %d rows%n", worst, rows.size());
    }

    private static void shortestVectors(Path dir) throws IOException {
        List<Map<String, String>> rows = read(dir, "triaxial-shortest.csv");
        check(rows.size() >= 3, "triaxial-shortest.csv rows " + rows.size());
        for (Map<String, String> row : rows) {
            Axes axes = new Axes(num(row, "a"), num(row, "b"), num(row, "c"));
            TriaxialGeodesic.InverseResult result = TriaxialGeodesic.inverse(
                    new Point(num(row, "bet1"), num(row, "omg1")), new Point(num(row, "bet2"), num(row, "omg2")), axes);
            check(result.distance() - num(row, "expected_s12") <= 1e-13,
                    row.get("id") + ": distance " + result.distance());
        }
    }

    private static void causticVectors(Path dir) throws IOException {
        List<Map<String, String>> rows = read(dir, "triaxial-caustic.csv");
        check(rows.size() == 16, "triaxial-caustic.csv rows " + rows.size());
        for (Map<String, String> row : rows) {
            Axes axes = new Axes(num(row, "a"), num(row, "b"), num(row, "c"));
            TriaxialGeodesic.InverseResult result = TriaxialGeodesic.inverse(
                    new Point(num(row, "bet1"), num(row, "omg1")), new Point(num(row, "bet2"), num(row, "omg2")), axes);
            double tolerance = num(row, "tolerance");
            double m12 = Math.abs(result.reducedLength());
            check(Math.abs(result.distance() - num(row, "expected_s12")) <= tolerance,
                    row.get("id") + ": distance " + result.distance());
            check(headingDifference(result.initialAzimuthDegrees(), num(row, "expected_alp1")) * m12 <= tolerance,
                    row.get("id") + ": alp1");
            check(headingDifference(result.finalAzimuthDegrees(), num(row, "expected_alp2")) * m12 <= tolerance,
                    row.get("id") + ": alp2");
        }
    }

    private static void cutLocusVectors(Path dir) throws IOException {
        List<Map<String, String>> rows = read(dir, "triaxial-cut-locus.csv");
        check(rows.size() == 32, "triaxial-cut-locus.csv rows " + rows.size());
        for (Map<String, String> row : rows) {
            Axes axes = new Axes(num(row, "a"), num(row, "b"), num(row, "c"));
            TriaxialGeodesic.InverseResult result = TriaxialGeodesic.inverse(
                    new Point(num(row, "bet1"), num(row, "omg1")), new Point(num(row, "bet2"), num(row, "omg2")), axes);
            double tolerance = num(row, "tolerance");
            double m12 = Math.abs(result.reducedLength());
            double alp1 = num(row, "expected_alp1");
            double alp2 = num(row, "expected_alp2");
            check(Math.abs(result.distance() - num(row, "expected_s12")) <= tolerance,
                    row.get("id") + ": distance " + result.distance());
            // The other shortest line leaves with heading 180 - alp1.
            boolean same = headingDifference(result.initialAzimuthDegrees(), alp1) * m12 <= tolerance
                    && headingDifference(result.finalAzimuthDegrees(), alp2) * m12 <= tolerance;
            boolean mirror = headingDifference(result.initialAzimuthDegrees(), 180 - alp1) * m12 <= tolerance
                    && headingDifference(result.finalAzimuthDegrees(), 180 - alp2) * m12 <= tolerance;
            check(same || mirror, row.get("id") + ": alp1 " + result.initialAzimuthDegrees());
            check(result.ambiguous(), row.get("id") + ": ambiguous");
        }
    }

    private static void conventionVectors(Path dir) throws IOException {
        List<Map<String, String>> rows = read(dir, "triaxial-conventions.csv");
        double degree = Math.toRadians(1e-7);
        for (Map<String, String> row : rows) {
            Axes axes = new Axes(num(row, "a"), num(row, "b"), num(row, "c"));
            TriaxialGeodesic.InverseResult result = TriaxialGeodesic.inverse(
                    new Point(num(row, "bet1"), num(row, "omg1")), new Point(num(row, "bet2"), num(row, "omg2")), axes);
            check(Math.abs(result.distance() - num(row, "expected_s12")) <= 1e-13 * axes.b(),
                    row.get("id") + ": distance " + result.distance() + " " + row.get("expected_s12"));
            check(headingDifference(result.initialAzimuthDegrees(), num(row, "expected_alp1")) <= degree,
                    row.get("id") + ": alp1 " + result.initialAzimuthDegrees() + " " + row.get("expected_alp1"));
            check(headingDifference(result.finalAzimuthDegrees(), num(row, "expected_alp2")) <= degree,
                    row.get("id") + ": alp2 " + result.finalAzimuthDegrees() + " " + row.get("expected_alp2"));
            check(result.ambiguous() == row.get("ambiguous").equals("1"), row.get("id") + ": ambiguous");
        }
    }

    private static void umbilicFarVectors(Path dir) throws IOException {
        List<Map<String, String>> rows = read(dir, "triaxial-umbilic-far.csv");
        double worst = 0;
        for (Map<String, String> row : rows) {
            Axes axes = new Axes(num(row, "a"), num(row, "b"), num(row, "c"));
            TriaxialGeodesic.InverseResult result = TriaxialGeodesic.inverse(
                    new Point(num(row, "bet1"), num(row, "omg1")), new Point(num(row, "bet2"), num(row, "omg2")), axes);
            worst = Math.max(worst, Math.abs(result.distance() - num(row, "expected_s12")));
            check(Math.abs(result.distance() - num(row, "expected_s12")) <= 5e-14,
                    row.get("id") + ": distance " + result.distance() + " " + row.get("expected_s12"));
        }
        System.out.printf(Locale.ROOT, "triaxial-umbilic-far.csv distance: max %.3e b over %d rows%n", worst, rows.size());
    }

    private static void antipodalUmbilics() {
        Point[][] pairs = {{new Point(90, 0), new Point(-90, 180)}, {new Point(-90, 180), new Point(90, 0)}};
        for (Point[] pair : pairs) {
            TriaxialGeodesic.InverseResult result = TriaxialGeodesic.inverse(pair[0], pair[1], CAYLEY);
            check(result.ambiguous(), pair[0] + ": ambiguous");
            TriaxialGeodesic.DirectResult reached = TriaxialGeodesic.direct(
                    pair[0], result.initialAzimuthDegrees(), result.distance(), CAYLEY);
            check(distance(TriaxialGeodesic.toCartesian(new Point(reached.beta(), reached.omega()), CAYLEY),
                    TriaxialGeodesic.toCartesian(pair[1], CAYLEY)) <= 1e-12, pair[0] + ": closure");
        }
    }

    private static void genericNotAmbiguous() {
        TriaxialGeodesic.InverseResult result = TriaxialGeodesic.inverse(new Point(30, 40), new Point(-20, 100), CAYLEY);
        check(!result.ambiguous(), "generic pair reported as ambiguous");
    }

    private static void coincidentAndAntipodes() {
        TriaxialGeodesic.InverseResult same = TriaxialGeodesic.inverse(new Point(30, 40), new Point(30, 40), CAYLEY);
        check(same.distance() == 0, "coincident distance " + same.distance());
        TriaxialGeodesic.InverseResult result = TriaxialGeodesic.inverse(
                new Point(30, 40), new Point(-30, -140), CAYLEY);
        TriaxialGeodesic.DirectResult end = TriaxialGeodesic.direct(
                new Point(30, 40), result.initialAzimuthDegrees(), result.distance(), CAYLEY);
        check(distance(TriaxialGeodesic.toCartesian(new Point(end.beta(), end.omega()), CAYLEY),
                TriaxialGeodesic.toCartesian(new Point(-30, -140), CAYLEY)) <= 1e-12, "antipode closure");
    }

    private static void directVectors(Path dir) throws IOException {
        List<Map<String, String>> rows = read(dir, "triaxial-direct.csv");
        check(rows.size() == 80, "triaxial-direct.csv rows " + rows.size());
        double worst = 0;
        for (Map<String, String> row : rows) {
            Axes axes = new Axes(num(row, "a"), num(row, "b"), num(row, "c"));
            TriaxialGeodesic.DirectResult result = TriaxialGeodesic.direct(
                    new Point(num(row, "bet1"), num(row, "omg1")), num(row, "alp1"), num(row, "s12"), axes);
            double tolerance = num(row, "tolerance");
            Cartesian reached = TriaxialGeodesic.toCartesian(new Point(result.beta(), result.omega()), axes);
            Cartesian expected = TriaxialGeodesic.toCartesian(
                    new Point(num(row, "expected_bet2"), num(row, "expected_omg2")), axes);
            double miss = distance(reached, expected);
            worst = Math.max(worst, miss / axes.b());
            check(miss <= tolerance, row.get("id") + ": position");
            check(headingDifference(result.finalAzimuthDegrees(), num(row, "expected_alp2")) * axes.b() <= tolerance,
                    row.get("id") + ": alp2");
        }
        System.out.printf(Locale.ROOT, "triaxial-direct.csv position: max %.3e b over %d rows%n", worst, rows.size());
    }

    private static void directAccuracyVectors(Path dir) throws IOException {
        List<Map<String, String>> rows = read(dir, "triaxial-direct-accuracy.csv");
        check(rows.size() == 500, "triaxial-direct-accuracy.csv rows " + rows.size());
        double worst = 0;
        String worstId = "";
        for (Map<String, String> row : rows) {
            Axes axes = new Axes(num(row, "a"), num(row, "b"), num(row, "c"));
            TriaxialGeodesic.DirectResult result = TriaxialGeodesic.direct(
                    new Point(num(row, "bet1"), num(row, "omg1")), num(row, "alp1"), num(row, "s12"), axes);
            Cartesian reached = TriaxialGeodesic.toCartesian(new Point(result.beta(), result.omega()), axes);
            Cartesian expected = TriaxialGeodesic.toCartesian(
                    new Point(num(row, "expected_bet2"), num(row, "expected_omg2")), axes);
            double miss = distance(reached, expected);
            if (miss > worst) {
                worst = miss;
                worstId = row.get("id");
            }
        }
        check(worst <= 5e-14, "direct position: max " + worst + " at " + worstId + " over " + rows.size() + " rows");
        System.out.printf(Locale.ROOT, "triaxial-direct-accuracy.csv position: max %.3e b over %d rows%n",
                worst, rows.size());
    }

    private static void symmetryAndClosure() {
        for (Axes axes : List.of(CAYLEY, EARTH3, MILD)) {
            List<Point> points = pointsOn(8, 1234);
            for (int i = 0; i + 1 < points.size(); i += 2) {
                Point p = points.get(i);
                Point q = points.get(i + 1);
                TriaxialGeodesic.InverseResult forward = TriaxialGeodesic.inverse(p, q, axes);
                TriaxialGeodesic.InverseResult backward = TriaxialGeodesic.inverse(q, p, axes);
                double scale = axes.b();
                check(Math.abs(forward.distance() - backward.distance()) <= 1e-13 * scale, "distance symmetry");
                check(Math.abs(forward.reducedLength() - backward.reducedLength()) <= 1e-12 * scale, "m12 symmetry");
                check(Math.abs(forward.geodesicScale12() - backward.geodesicScale21()) <= 1e-12, "M12 = reversed M21");
                check(Math.abs(forward.geodesicScale21() - backward.geodesicScale12()) <= 1e-12, "M21 = reversed M12");
                TriaxialGeodesic.DirectResult end = TriaxialGeodesic.direct(
                        p, forward.initialAzimuthDegrees(), forward.distance(), axes);
                check(distance(TriaxialGeodesic.toCartesian(new Point(end.beta(), end.omega()), axes),
                        TriaxialGeodesic.toCartesian(q, axes)) <= 1e-13 * scale, "closure");
                check(headingDifference(end.finalAzimuthDegrees(), forward.finalAzimuthDegrees()) <= 1e-12,
                        "final heading");
            }
        }
    }

    private static void finiteDifferences() {
        double[][] lines = {{12, -40, 63, 1.3}, {-50, 100, 200, 2.6}, {89, 3, 300, 0.7}};
        for (Axes axes : List.of(CAYLEY, EARTH3, MILD)) {
            double scale = axes.b();
            for (double[] line : lines) {
                Point start = new Point(line[0], line[1]);
                double azimuth = line[2];
                double s = line[3] * scale;
                TriaxialGeodesic.DirectResult centre = TriaxialGeodesic.direct(start, azimuth, s, axes);
                double h = 1e-4;
                TriaxialGeodesic.DirectResult plus = TriaxialGeodesic.direct(start, azimuth + h, s, axes);
                TriaxialGeodesic.DirectResult minus = TriaxialGeodesic.direct(start, azimuth - h, s, axes);
                double spread = distance(TriaxialGeodesic.toCartesian(new Point(plus.beta(), plus.omega()), axes),
                        TriaxialGeodesic.toCartesian(new Point(minus.beta(), minus.omega()), axes))
                        / Math.toRadians(2 * h);
                check(Math.abs(spread - Math.abs(centre.reducedLength())) <= 1e-6 * scale,
                        "m12 " + spread + " " + centre.reducedLength());
                double ds = 1e-4 * scale;
                double longer = TriaxialGeodesic.direct(start, azimuth, s + ds, axes).reducedLength();
                double shorter = TriaxialGeodesic.direct(start, azimuth, s - ds, axes).reducedLength();
                check(Math.abs((longer - shorter) / (2 * ds) - centre.geodesicScale21()) <= 1e-7, "M21 = dm12/ds");
            }
            TriaxialGeodesic.InverseResult shortLine = TriaxialGeodesic.inverse(
                    new Point(20, 30), new Point(20.01, 30.01), axes);
            check(Math.abs(shortLine.reducedLength() / shortLine.distance() - 1) <= 1e-3, "m12 ~ s12 for short lines");
            check(Math.abs(shortLine.geodesicScale12() - 1) <= 1e-3 && Math.abs(shortLine.geodesicScale21() - 1) <= 1e-3,
                    "M ~ 1 for short lines");
        }
    }

    private static double wrap(double degrees) {
        return (((degrees + 180) % 360) + 360) % 360 - 180;
    }

    /** Random pairs and near-antipodal pairs (offsets of a few tenths of a degree). */
    private static List<Point[]> biaxialPairs() {
        List<Point[]> pairs = new ArrayList<>();
        List<Point> points = pointsOn(10, 99);
        for (int i = 0; i + 1 < points.size(); i += 2) {
            pairs.add(new Point[] {points.get(i), points.get(i + 1)});
        }
        List<Point> starts = pointsOn(4, 5);
        for (int k = 0; k < starts.size(); k++) {
            Point p = starts.get(k);
            Point near = new Point(Math.max(-89, Math.min(89, -p.beta() + 0.3 - 0.2 * k)),
                    wrap(p.omega() + 180 - 0.7 + 0.4 * k));
            pairs.add(new Point[] {p, near});
        }
        return pairs;
    }

    /** Maps a triaxial point to the biaxial one and gives the azimuth turn there. */
    private interface Limit {
        GeoPoint geographic(Point point);

        double turn(Point point);
    }

    private static void compareWithBiaxial(Axes axes, Ellipsoid biaxial, Limit limit, List<Point[]> pairs) {
        // The integrator's accuracy is about 5e-14 of the axes.
        double length = 1e-13 * axes.a();
        for (Point[] pair : pairs) {
            Point p = pair[0];
            Point q = pair[1];
            String label = p + " " + q;
            TriaxialGeodesic.InverseResult tri = TriaxialGeodesic.inverse(p, q, axes);
            GeodesicResult bi = Geodesic.inverse(limit.geographic(p), limit.geographic(q), biaxial);
            double m12 = Math.abs(bi.reducedLengthMetres());
            check(Math.abs(tri.distance() - bi.distanceMetres()) <= length, "distance " + label);
            check(headingDifference(tri.initialAzimuthDegrees() + limit.turn(p), bi.initialBearingDegrees()) * m12
                    <= length, "azimuth 1 " + label);
            check(headingDifference(tri.finalAzimuthDegrees() + limit.turn(q), bi.finalBearingDegrees()) * m12
                    <= length, "azimuth 2 " + label);
            check(Math.abs(tri.reducedLength() - bi.reducedLengthMetres()) <= length, "m12 " + label);
            check(Math.abs(tri.geodesicScale12() - bi.geodesicScale12()) <= 1e-13, "M12 " + label);
            check(Math.abs(tri.geodesicScale21() - bi.geodesicScale21()) <= 1e-13, "M21 " + label);
            TriaxialGeodesic.DirectResult direct = TriaxialGeodesic.direct(p, 37, 15e6, axes);
            DirectResult reference = Geodesic.direct(limit.geographic(p), 37 + limit.turn(p), 15e6, biaxial);
            check(Math.abs(direct.reducedLength() - reference.reducedLengthMetres()) <= length, "direct m12 " + label);
            check(Math.abs(direct.geodesicScale12() - reference.geodesicScale12()) <= 1e-13, "direct M12 " + label);
            check(Math.abs(direct.geodesicScale21() - reference.geodesicScale21()) <= 1e-13, "direct M21 " + label);
        }
    }

    /** a = b: beta is the parametric latitude (tan(phi) = (a/c) tan(beta)), omega the longitude. */
    private static void oblateLimit() {
        double a = 6378137;
        double c = 6356752.314245;
        compareWithBiaxial(new Axes(a, a, c), new Ellipsoid("OBLATE", a, (a - c) / a, c), new Limit() {
            @Override
            public GeoPoint geographic(Point point) {
                return new GeoPoint(Math.toDegrees(Math.atan(a / c * Math.tan(Math.toRadians(point.beta())))),
                        point.omega());
            }

            @Override
            public double turn(Point point) {
                return 0;
            }
        }, biaxialPairs());
    }

    /**
     * b = c: the symmetry axis is X, 90 - |omega| is the parametric latitude
     * (tan(phi) = (b/a) tan(psi)), the longitude is beta for omega &gt; 0 and
     * 180 - beta for omega &lt; 0, and the biaxial azimuth is the heading plus
     * 90 degrees (omega &gt; 0) or minus 90 degrees (omega &lt; 0).
     */
    private static void prolateLimit() {
        double a = 6420000;
        double b = 6378137;
        List<Point[]> pairs = new ArrayList<>();
        for (Point[] pair : biaxialPairs()) {
            Point[] moved = new Point[2];
            for (int k = 0; k < 2; k++) {
                double omega = pair[k].omega();
                moved[k] = new Point(pair[k].beta(), Math.abs(omega) < 1 || Math.abs(omega) > 179 ? omega + 2 : omega);
            }
            pairs.add(moved);
        }
        compareWithBiaxial(new Axes(a, b, b), new Ellipsoid("PROLATE", b, (b - a) / b, a), new Limit() {
            @Override
            public GeoPoint geographic(Point point) {
                return new GeoPoint(
                        Math.toDegrees(Math.atan(b / a * Math.tan(Math.toRadians(90 - Math.abs(point.omega()))))),
                        wrap(point.omega() > 0 ? point.beta() : 180 - point.beta()));
            }

            @Override
            public double turn(Point point) {
                return point.omega() > 0 ? 90 : -90;
            }
        }, pairs);
    }

    private static void sphere() {
        double radius = 2;
        Axes axes = new Axes(radius, radius, radius);
        Point[][] pairs = {
            {new Point(10, 20), new Point(-35, 140)},
            {new Point(0, 0), new Point(0, 179)},
            {new Point(60, -170), new Point(61, 170)},
        };
        for (Point[] pair : pairs) {
            double[] u = unit(pair[0]);
            double[] v = unit(pair[1]);
            double[] w = {u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]};
            double sigma = Math.atan2(Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]),
                    u[0] * v[0] + u[1] * v[1] + u[2] * v[2]);
            TriaxialGeodesic.InverseResult result = TriaxialGeodesic.inverse(pair[0], pair[1], axes);
            check(Math.abs(result.distance() - radius * sigma) <= 1e-13 * radius, "sphere distance");
            check(Math.abs(result.reducedLength() - radius * Math.sin(sigma)) <= 1e-13 * radius, "sphere m12");
            check(Math.abs(result.geodesicScale12() - Math.cos(sigma)) <= 1e-13, "sphere M12");
            check(Math.abs(result.geodesicScale21() - Math.cos(sigma)) <= 1e-13, "sphere M21");
        }
    }

    private static double[] unit(Point point) {
        double b = Math.toRadians(point.beta());
        double w = Math.toRadians(point.omega());
        return new double[] {Math.cos(b) * Math.cos(w), Math.cos(b) * Math.sin(w), Math.sin(b)};
    }

    private static void roundTripAndZero() {
        for (Point point : pointsOn(20, 7)) {
            Point back = TriaxialGeodesic.fromCartesian(TriaxialGeodesic.toCartesian(point, CAYLEY), CAYLEY);
            check(Math.abs(back.beta() - point.beta()) <= 1e-12 && Math.abs(back.omega() - point.omega()) <= 1e-12,
                    "round trip");
        }
        Cartesian R = TriaxialGeodesic.toCartesian(new Point(30, 40), CAYLEY);
        Point scaled = TriaxialGeodesic.fromCartesian(new Cartesian(3 * R.x(), 3 * R.y(), 3 * R.z()), CAYLEY);
        check(Math.abs(scaled.beta() - 30) <= 1e-12 && Math.abs(scaled.omega() - 40) <= 1e-12, "scaled point");
        TriaxialGeodesic.InverseResult same = TriaxialGeodesic.inverse(new Point(30, 40), new Point(30, 40), CAYLEY);
        check(same.equals(new TriaxialGeodesic.InverseResult(0, null, null, 0, 1, 1, false)), "coincident " + same);
        TriaxialGeodesic.DirectResult still = TriaxialGeodesic.direct(new Point(30, 40), 25, 0, CAYLEY);
        check(Math.abs(still.beta() - 30) <= 1e-13 && Math.abs(still.omega() - 40) <= 1e-13, "zero distance");
        check(Math.abs(still.finalAzimuthDegrees() - 25) <= 1e-12, "zero distance heading");
        check(still.reducedLength() == 0, "zero distance m12");
    }

    private static void expect(Runnable action, ErrorCode code) {
        try {
            action.run();
        } catch (ConvertToolsException error) {
            check(error.code() == code, "expected " + code + ", got " + error.code());
            return;
        }
        throw new AssertionError("expected " + code);
    }

    private static void errors() {
        expect(() -> new Axes(1, 2, 1), ErrorCode.INVALID_ARGUMENT);
        expect(() -> new Axes(1, 1, 0), ErrorCode.INVALID_ARGUMENT);
        expect(() -> new Axes(Double.NaN, 1, 1), ErrorCode.INVALID_ARGUMENT);
        expect(() -> new Point(91, 0), ErrorCode.LATITUDE_OUT_OF_RANGE);
        expect(() -> new Point(0, 181), ErrorCode.LONGITUDE_OUT_OF_RANGE);
        expect(() -> TriaxialGeodesic.direct(new Point(0, 0), 10, -1, CAYLEY), ErrorCode.INVALID_ARGUMENT);
        expect(() -> TriaxialGeodesic.direct(new Point(0, 0), Double.NaN, 1, CAYLEY), ErrorCode.INVALID_NUMBER);
        expect(() -> TriaxialGeodesic.fromCartesian(new Cartesian(0, 0, 0), CAYLEY), ErrorCode.INVALID_ARGUMENT);
    }
}
