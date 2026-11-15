package io.github.mertc0604.converttools;

import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic;
import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic.Axes;
import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic.Cartesian;
import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic.Point;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.IntStream;

/**
 * Runs the Java triaxial solver over Karney's Geod3Test data set
 * (https://doi.org/10.5281/zenodo.12510796, rows
 * {@code bet1 omg1 alp1 bet2 omg2 alp2 s12 m12 M12 M21} on a = sqrt(2),
 * b = 1, c = 1/sqrt(2)) and prints, per block and overall, the maxima that
 * contracts/tools/validate-geod3test.mjs judges, as lines
 * {@code MAX <block> <measure> <value> <row> <count>}. It judges nothing
 * itself. Blocks, measures and the rule for point pairs listed more than once
 * are those of validate-geod3test.mjs (see its header comment). Rows run in
 * parallel; the output does not depend on the thread count.
 *
 * <p>Usage: {@code java ... Geod3TestFullSet /path/to/Geod3Test-v1.txt}
 */
public final class Geod3TestFullSet {
    private static final Axes AXES = new Axes(Math.sqrt(2), 1, Math.sqrt(0.5));
    private static final String[] BLOCKS = {"umbilical", "ellipse", "near-umbilic", "general"};
    private static final String[] MEASURES = {"inv-distance", "inv-azimuth", "dir-position", "m12", "M12", "M21"};
    private static final int OUTPUTS = 9;

    private Geod3TestFullSet() {
    }

    public static void main(String[] args) throws IOException {
        if (args.length != 1) {
            System.err.println("usage: Geod3TestFullSet /path/to/Geod3Test-v1.txt");
            System.exit(2);
        }
        List<String[]> text = new ArrayList<>();
        for (String line : Files.readAllLines(Path.of(args[0]), StandardCharsets.UTF_8)) {
            if (!line.isBlank()) {
                text.add(line.trim().split("\\s+"));
            }
        }
        int n = text.size();
        double[][] rows = new double[n][];
        for (int i = 0; i < n; i++) {
            if (text.get(i).length != 10) {
                throw new IllegalArgumentException("row " + i + " does not have ten numbers");
            }
            rows[i] = new double[10];
            for (int j = 0; j < 10; j++) {
                rows[i][j] = Double.parseDouble(text.get(i)[j]);
            }
        }
        long started = System.nanoTime();
        double[] outputs = new double[n * OUTPUTS];
        java.util.Arrays.fill(outputs, Double.NaN);
        IntStream.range(0, n).parallel().forEach(i -> solve(rows[i], outputs, i * OUTPUTS));
        System.out.printf(Locale.ROOT, "Java seconds: %.1f%n", (System.nanoTime() - started) / 1e9);
        int failed = 0;
        for (int i = 0; i < n; i++) {
            for (int k = 0; k < OUTPUTS; k++) {
                if (Double.isNaN(outputs[i * OUTPUTS + k])) {
                    failed++;
                    break;
                }
            }
        }
        System.out.println("rows: " + n + ", rows with exceptions or missing headings: " + failed);

        Map<String, List<Integer>> groups = new LinkedHashMap<>();
        for (int i = 0; i < n; i++) {
            String[] t = text.get(i);
            groups.computeIfAbsent(t[0] + " " + t[1] + " " + t[3] + " " + t[4], key -> new ArrayList<>()).add(i);
        }
        Map<String, double[][]> maxima = new LinkedHashMap<>();
        for (String block : BLOCKS) {
            maxima.put(block, emptyMaxima());
        }
        maxima.put("ALL", emptyMaxima());
        for (int i = 0; i < n; i++) {
            double[] v = rows[i];
            int o = i * OUTPUTS;
            String block = blockOf(v);
            String[] t = text.get(i);
            double[] best = null;
            double bestScore = 0;
            for (int j : groups.get(t[0] + " " + t[1] + " " + t[3] + " " + t[4])) {
                double score = Math.max(headingDifference(outputs[o + 1], rows[j][2]),
                        headingDifference(outputs[o + 2], rows[j][5]));
                if (best == null || score < bestScore || Double.isNaN(score)) {
                    best = rows[j];
                    bestScore = score;
                }
            }
            Cartesian expected = TriaxialGeodesic.toCartesian(new Point(v[3], v[4]), AXES);
            double[] values = {
                Math.abs(outputs[o] - v[6]),
                headingDifference(outputs[o + 1], best[2]) * Math.abs(best[7]),
                Math.sqrt(sq(outputs[o + 3] - expected.x()) + sq(outputs[o + 4] - expected.y())
                        + sq(outputs[o + 5] - expected.z())),
                Math.abs(outputs[o + 6] - v[7]),
                Math.abs(outputs[o + 7] - v[8]),
                Math.abs(outputs[o + 8] - v[9]),
            };
            for (int k = 0; k < MEASURES.length; k++) {
                record(maxima.get(block)[k], values[k], i);
                record(maxima.get("ALL")[k], values[k], i);
            }
        }
        for (Map.Entry<String, double[][]> entry : maxima.entrySet()) {
            for (int k = 0; k < MEASURES.length; k++) {
                double[] m = entry.getValue()[k];
                System.out.printf(Locale.ROOT, "MAX %s %s %.17g %d %d%n",
                        entry.getKey(), MEASURES[k], m[0], (long) m[1], (long) m[2]);
            }
        }
    }

    private static void solve(double[] v, double[] outputs, int o) {
        try {
            TriaxialGeodesic.InverseResult inverse = TriaxialGeodesic.inverse(new Point(v[0], v[1]), new Point(v[3], v[4]), AXES);
            outputs[o] = inverse.distance();
            outputs[o + 1] = inverse.initialAzimuthDegrees() == null ? Double.NaN : inverse.initialAzimuthDegrees();
            outputs[o + 2] = inverse.finalAzimuthDegrees() == null ? Double.NaN : inverse.finalAzimuthDegrees();
        } catch (RuntimeException error) {
            // stays NaN and fails every limit
        }
        try {
            TriaxialGeodesic.DirectResult direct = TriaxialGeodesic.direct(new Point(v[0], v[1]), v[2], v[6], AXES);
            Cartesian end = TriaxialGeodesic.toCartesian(new Point(direct.beta(), direct.omega()), AXES);
            outputs[o + 3] = end.x();
            outputs[o + 4] = end.y();
            outputs[o + 5] = end.z();
            outputs[o + 6] = direct.reducedLength();
            outputs[o + 7] = direct.geodesicScale12();
            outputs[o + 8] = direct.geodesicScale21();
        } catch (RuntimeException error) {
            // stays NaN
        }
    }

    private static double sq(double x) {
        return x * x;
    }

    private static double[][] emptyMaxima() {
        double[][] m = new double[MEASURES.length][];
        for (int k = 0; k < MEASURES.length; k++) {
            m[k] = new double[] {0, -1, 0};
        }
        return m;
    }

    /** {value, row, count}; a NaN is kept once seen. */
    private static void record(double[] m, double value, int row) {
        m[2] += 1;
        if (m[1] < 0 || Double.isNaN(value) || (!Double.isNaN(m[0]) && value > m[0])) {
            m[0] = value;
            m[1] = row;
        }
    }

    private static double headingDifference(double x, double y) {
        double degrees = (((x - y) % 360) + 540) % 360 - 180;
        return Math.toRadians(Math.abs(degrees));
    }

    private static boolean umbilic(double bet, double omg) {
        return Math.abs(bet) == 90 && (omg == 0 || Math.abs(omg) == 180);
    }

    private static boolean ellipse(double bet, double omg) {
        double w = Math.abs(omg);
        return bet == 0 || Math.abs(bet) == 90 || w == 0 || w == 90 || w == 180;
    }

    private static boolean near(double bet, double omg) {
        return 90 - Math.abs(bet) < 1 && Math.min(Math.abs(omg), 180 - Math.abs(omg)) < 1;
    }

    private static String blockOf(double[] v) {
        if (umbilic(v[0], v[1]) || umbilic(v[3], v[4])) {
            return "umbilical";
        }
        if (ellipse(v[0], v[1]) || ellipse(v[3], v[4])) {
            return "ellipse";
        }
        if (near(v[0], v[1]) || near(v[3], v[4])) {
            return "near-umbilic";
        }
        return "general";
    }
}
