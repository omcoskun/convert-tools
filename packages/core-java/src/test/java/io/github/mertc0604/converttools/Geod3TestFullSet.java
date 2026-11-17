package io.github.mertc0604.converttools;

import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic;
import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic.Axes;
import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic.Cartesian;
import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic.Point;
import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.IntStream;

/**
 * Runs the Java triaxial solver over Karney's Geod3Test data set
 * (https://doi.org/10.5281/zenodo.12510796, rows
 * {@code bet1 omg1 alp1 bet2 omg2 alp2 s12 m12 M12 M21} on a = sqrt(2),
 * b = 1, c = 1/sqrt(2)) and writes one line per row to a tab-separated
 * file: the inverse solution, a closure test and the direct solution. It
 * judges nothing itself; contracts/tools/validate-geod3test.mjs reads the
 * file with {@code --java-rows} and judges it with the same code as its
 * JavaScript rows. Rows run in parallel; the output does not depend on the
 * thread count.
 *
 * <p>Usage: {@code java ... Geod3TestFullSet /path/to/data.txt rows-out.tsv}
 */
public final class Geod3TestFullSet {
    private static final Axes AXES = new Axes(Math.sqrt(2), 1, Math.sqrt(0.5));
    private static final String[] COLUMNS = {
        "row", "s12", "alp1", "alp2", "ambiguous", "closure", "x", "y", "z", "m12", "M12", "M21"};
    private static final int OUTPUTS = COLUMNS.length - 1;

    private Geod3TestFullSet() {
    }

    public static void main(String[] args) throws IOException {
        if (args.length != 2) {
            System.err.println("usage: Geod3TestFullSet <data> <rows-out.tsv>");
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
        int exceptions = 0;
        for (int i = 0; i < n; i++) {
            for (int k = 0; k < OUTPUTS; k++) {
                if (Double.isNaN(outputs[i * OUTPUTS + k])) {
                    exceptions++;
                    break;
                }
            }
        }
        try (BufferedWriter writer = Files.newBufferedWriter(Path.of(args[1]), StandardCharsets.UTF_8)) {
            writer.write(String.join("\t", COLUMNS));
            writer.newLine();
            for (int i = 0; i < n; i++) {
                writer.write(Integer.toString(i));
                for (int k = 0; k < OUTPUTS; k++) {
                    writer.write('\t');
                    writer.write(String.format(Locale.ROOT, "%.17g", outputs[i * OUTPUTS + k]));
                }
                writer.newLine();
            }
        }
        double seconds = (System.nanoTime() - started) / 1e9;
        System.out.println("rows: " + n);
        System.out.println("exceptions: " + exceptions);
        System.out.printf(Locale.ROOT, "seconds: %.1f%n", seconds);
    }

    private static void solve(double[] v, double[] outputs, int o) {
        Cartesian target = TriaxialGeodesic.toCartesian(new Point(v[3], v[4]), AXES);
        try {
            TriaxialGeodesic.InverseResult inverse = TriaxialGeodesic.inverse(new Point(v[0], v[1]), new Point(v[3], v[4]), AXES);
            double distance = inverse.distance();
            Double initial = inverse.initialAzimuthDegrees();
            outputs[o] = distance;
            outputs[o + 1] = initial == null ? Double.NaN : initial;
            outputs[o + 2] = inverse.finalAzimuthDegrees() == null ? Double.NaN : inverse.finalAzimuthDegrees();
            outputs[o + 3] = inverse.ambiguous() ? 1 : 0;
            // Closure: where the reported line really ends, compared with point 2.
            Cartesian end = TriaxialGeodesic.toCartesian(new Point(v[0], v[1]), AXES);
            if (initial != null) {
                TriaxialGeodesic.DirectResult line = TriaxialGeodesic.direct(new Point(v[0], v[1]), initial, distance, AXES);
                end = TriaxialGeodesic.toCartesian(new Point(line.beta(), line.omega()), AXES);
            }
            outputs[o + 4] = Math.sqrt(sq(end.x() - target.x()) + sq(end.y() - target.y())
                    + sq(end.z() - target.z()));
        } catch (RuntimeException error) {
            // stays NaN and fails every inverse measure
        }
        try {
            TriaxialGeodesic.DirectResult direct = TriaxialGeodesic.direct(new Point(v[0], v[1]), v[2], v[6], AXES);
            Cartesian end = TriaxialGeodesic.toCartesian(new Point(direct.beta(), direct.omega()), AXES);
            outputs[o + 5] = end.x();
            outputs[o + 6] = end.y();
            outputs[o + 7] = end.z();
            outputs[o + 8] = direct.reducedLength();
            outputs[o + 9] = direct.geodesicScale12();
            outputs[o + 10] = direct.geodesicScale21();
        } catch (RuntimeException error) {
            // stays NaN
        }
    }

    private static double sq(double x) {
        return x * x;
    }
}
