package io.github.mertc0604.converttools;

import io.github.mertc0604.converttools.geodesy.DirectResult;
import io.github.mertc0604.converttools.geodesy.GeoPoint;
import io.github.mertc0604.converttools.geodesy.Geodesic;
import io.github.mertc0604.converttools.geodesy.GeodesicResult;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Measures the Java solver against Karney's GeodTest set and prints the same
 * per-block table as the JavaScript measurement script, followed by one
 * machine-readable line per block and measure:
 * {@code MAX <block> <measure> <value> <row> <count>}, where the measures are
 * those of {@code contracts/tools/validate-geodtest.mjs} (inverseDistance,
 * azimuthOffset, inverseA12, inverseM12, inverseS12, directPosition,
 * directA12, directM12, directS12) and {@code row} is the 0-based data row of
 * the maximum. That script reads these lines with {@code --java-output} and
 * applies the fixed limits; this class judges nothing itself.
 *
 * <p>Several shortest geodesics: where more than one row lists the same point
 * pair (compared as written in the file), the route-dependent measures of an
 * inverse answer (azimuth offset, a12, m12, S12) are taken against the row of
 * that pair whose azimuths it matches best, exactly as in the JavaScript
 * validator. The legacy table above the MAX lines uses each row's own values.
 *
 * <p>Usage:
 * {@code java -cp <classes> io.github.mertc0604.converttools.GeodTestFullSet
 * /path/to/GeodTest.dat [--synthetic]}. {@code --synthetic} divides every
 * block size by 500, for testing on a small file in the data-set layout. This
 * class is a manual measurement tool; it is not part of
 * {@code scripts/test.sh}.
 */
public final class GeodTestFullSet {
    private static final double SEMI_MAJOR_AXIS = 6_378_137;
    private static final double RADIAN = Math.PI / 180;
    private static final String[] CATEGORIES = {
            "random",
            "antipodal",
            "short",
            "one-pole",
            "opposite-poles",
            "meridional",
            "equatorial",
            "vertex-to-vertex",
            "near-vertex",
    };
    private static final int[] SIZES = {
            100_000,
            50_000,
            50_000,
            50_000,
            50_000,
            50_000,
            50_000,
            50_000,
            50_000,
    };

    private static final String[] MEASURES = {
            "inverseDistance", "azimuthOffset", "inverseA12", "inverseM12",
            "inverseS12", "directPosition", "directA12", "directM12",
            "directS12",
    };
    private static int blockScale = 1;

    private GeodTestFullSet() {
    }

    public static void main(String[] args) throws IOException {
        if (args.length < 1 || args.length > 2
                || (args.length == 2 && !args[1].equals("--synthetic"))) {
            throw new IllegalArgumentException(
                    "Pass the path of GeodTest.dat, optionally --synthetic."
            );
        }
        if (args.length == 2) {
            blockScale = 500;
            System.out.println("SYNTHETIC INPUT: block sizes divided by 500");
        }
        Map<String, Stats> stats = new LinkedHashMap<>();
        Stats all = new Stats();
        List<String> firstErrors = new ArrayList<>();
        List<Integer> firstAmbiguous = new ArrayList<>();
        List<String[]> table = readRows(Path.of(args[0]));
        Map<Integer, List<Integer>> groups = groupsOf(table);
        Map<String, Map<String, double[]>> maxima = newMaxima();
        long started = System.nanoTime();

        { // one pass over every data row
            for (int index = 0; index < table.size(); index++) {
                String[] parts = table.get(index);
                double lat1 = Double.parseDouble(parts[0]);
                double lon1 = Double.parseDouble(parts[1]);
                double azi1 = Double.parseDouble(parts[2]);
                double lat2 = Double.parseDouble(parts[3]);
                double lon2 = Double.parseDouble(parts[4]);
                double azi2 = Double.parseDouble(parts[5]);
                double s12 = Double.parseDouble(parts[6]);
                double m12 = Double.parseDouble(parts[8]);
                double a12 = Double.parseDouble(parts[7]);
                double area = Double.parseDouble(parts[9]);
                String name = categoryOf(index);
                Stats bucket = stats.computeIfAbsent(name, key -> new Stats());
                for (Stats target : List.of(bucket, all)) {
                    target.rows += 1;
                }

                GeodesicResult inverse = null;
                try {
                    inverse = Geodesic.inverse(
                            new GeoPoint(lat1, lon1),
                            new GeoPoint(lat2, lon2)
                    );
                } catch (RuntimeException error) {
                    for (Stats target : List.of(bucket, all)) {
                        target.inverseErrors += 1;
                    }
                    if (firstErrors.size() < 5) {
                        firstErrors.add(
                                index + " inverse " + error.getMessage()
                        );
                    }
                }
                if (inverse != null) {
                    double distanceError = Math.abs(
                            inverse.distanceMetres() - s12
                    );
                    Double azimuth1Error = inverse.initialBearingDegrees()
                            == null
                            ? null
                            : angleDiff(
                                    inverse.initialBearingDegrees(),
                                    azi1
                            );
                    Double azimuth2Error = inverse.finalBearingDegrees()
                            == null
                            ? null
                            : angleDiff(
                                    inverse.finalBearingDegrees(),
                                    azi2
                            );
                    for (Stats target : List.of(bucket, all)) {
                        target.s12.add(distanceError);
                        if (azimuth1Error != null) {
                            target.azi1Deg.add(azimuth1Error);
                            target.azi1Position.add(
                                    azimuth1Error * RADIAN * Math.abs(m12)
                            );
                        }
                        if (azimuth2Error != null) {
                            target.azi2Deg.add(azimuth2Error);
                        }
                        if (inverse.ambiguous()) {
                            target.ambiguous += 1;
                        }
                        String solver = inverse.solver() == null
                                ? "?"
                                : inverse.solver();
                        target.solvers.merge(solver, 1, Integer::sum);
                        if (target.worstS12 == null
                                || distanceError > target.worstS12.value) {
                            target.worstS12 = new Worst(
                                    distanceError, index, 0
                            );
                        }
                        if (azimuth1Error != null) {
                            double position = azimuth1Error
                                    * RADIAN
                                    * Math.abs(m12);
                            if (target.worstAzi1Position == null
                                    || position
                                    > target.worstAzi1Position.value) {
                                target.worstAzi1Position = new Worst(
                                        position, index, azimuth1Error
                                );
                            }
                        }
                    }
                    // Judge the route against the best-matching row of the
                    // same point pair.
                    int best = index;
                    List<Integer> candidates = groups.get(index);
                    if (candidates != null && azimuth1Error != null
                            && azimuth2Error != null) {
                        double bestError = Double.POSITIVE_INFINITY;
                        for (int candidate : candidates) {
                            String[] row = table.get(candidate);
                            double error = Math.max(
                                    angleDiff(inverse.initialBearingDegrees(),
                                            Double.parseDouble(row[2])),
                                    angleDiff(inverse.finalBearingDegrees(),
                                            Double.parseDouble(row[5])));
                            if (error < bestError) {
                                bestError = error;
                                best = candidate;
                            }
                        }
                    }
                    String[] reference = table.get(best);
                    double referenceM12 = Double.parseDouble(reference[8]);
                    record(maxima, name, "inverseDistance", distanceError, index);
                    if (azimuth1Error != null) {
                        record(maxima, name, "azimuthOffset",
                                angleDiff(inverse.initialBearingDegrees(),
                                        Double.parseDouble(reference[2]))
                                        * RADIAN * Math.abs(referenceM12),
                                index);
                    }
                    record(maxima, name, "inverseA12", Math.abs(
                            inverse.arcDegrees()
                                    - Double.parseDouble(reference[7])), index);
                    record(maxima, name, "inverseM12", Math.abs(
                            inverse.reducedLengthMetres() - referenceM12), index);
                    record(maxima, name, "inverseS12", Math.abs(
                            inverse.areaSquareMetres()
                                    - Double.parseDouble(reference[9])), index);
                    if (inverse.ambiguous() && firstAmbiguous.size() < 5) {
                        firstAmbiguous.add(index);
                    }
                }

                try {
                    DirectResult direct = Geodesic.direct(
                            new GeoPoint(lat1, lon1),
                            azi1,
                            s12
                    );
                    double latitudeError = (
                            direct.destination().latitude() - lat2
                    ) * RADIAN;
                    double longitudeError = angleDiff(
                            direct.destination().longitude(),
                            lon2
                    ) * RADIAN * Math.cos(lat2 * RADIAN);
                    double position = SEMI_MAJOR_AXIS * Math.hypot(
                            latitudeError,
                            longitudeError
                    );
                    double azimuthError = angleDiff(
                            direct.finalBearingDegrees(),
                            azi2
                    );
                    record(maxima, name, "directPosition", position, index);
                    record(maxima, name, "directA12",
                            Math.abs(direct.arcDegrees() - a12), index);
                    record(maxima, name, "directM12",
                            Math.abs(direct.reducedLengthMetres() - m12), index);
                    record(maxima, name, "directS12",
                            Math.abs(direct.areaSquareMetres() - area), index);
                    for (Stats target : List.of(bucket, all)) {
                        target.directPosition.add(position);
                        target.directAzi2Deg.add(azimuthError);
                        if (target.worstDirectPosition == null
                                || position
                                > target.worstDirectPosition.value) {
                            target.worstDirectPosition = new Worst(
                                    position, index, 0
                            );
                        }
                    }
                } catch (RuntimeException error) {
                    for (Stats target : List.of(bucket, all)) {
                        target.directErrors += 1;
                    }
                    if (firstErrors.size() < 5) {
                        firstErrors.add(
                                index + " direct " + error.getMessage()
                        );
                    }
                }
            }
        }

        for (String category : CATEGORIES) {
            Stats bucket = stats.get(category);
            if (bucket != null) {
                report(category, bucket);
            }
        }
        report("ALL", all);
        System.out.println("solvers: " + solversJson(all));
        System.out.println("worst: " + worstJson(all));
        System.out.println(
                "ambiguous: " + all.ambiguous
                        + " first indexes: " + firstAmbiguous
        );
        if (!firstErrors.isEmpty()) {
            System.out.println("first errors: " + firstErrors);
        }
        double seconds = (System.nanoTime() - started) / 1e9;
        System.out.println(String.format(Locale.ROOT, "seconds: %.1f", seconds));
        for (Map.Entry<String, Map<String, double[]>> block : maxima.entrySet()) {
            for (String measure : MEASURES) {
                double[] entry = block.getValue().get(measure);
                if (entry[2] > 0) {
                    System.out.println("MAX " + block.getKey() + " " + measure
                            + " " + entry[0] + " " + (long) entry[1]
                            + " " + (long) entry[2]);
                }
            }
        }
    }

    private static List<String[]> readRows(Path file) throws IOException {
        List<String[]> rows = new ArrayList<>();
        try (BufferedReader reader = Files.newBufferedReader(
                file,
                StandardCharsets.UTF_8
        )) {
            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.trim().split("\\s+");
                if (parts.length >= 10) {
                    rows.add(parts);
                }
            }
        }
        return rows;
    }

    /** Rows whose point pair (as written) is listed more than once. */
    private static Map<Integer, List<Integer>> groupsOf(List<String[]> table) {
        Map<String, List<Integer>> pairs = new HashMap<>();
        for (int index = 0; index < table.size(); index++) {
            String[] row = table.get(index);
            pairs.computeIfAbsent(
                    row[0] + " " + row[1] + " " + row[3] + " " + row[4],
                    key -> new ArrayList<>()
            ).add(index);
        }
        Map<Integer, List<Integer>> groups = new HashMap<>();
        for (List<Integer> rows : pairs.values()) {
            if (rows.size() > 1) {
                for (int index : rows) {
                    groups.put(index, rows);
                }
            }
        }
        System.out.println("rows: " + table.size()
                + "; rows whose point pair is listed more than once: "
                + groups.size());
        return groups;
    }

    private static Map<String, Map<String, double[]>> newMaxima() {
        Map<String, Map<String, double[]>> maxima = new LinkedHashMap<>();
        List<String> blocks = new ArrayList<>(Arrays.asList(CATEGORIES));
        blocks.add("extra");
        blocks.add("ALL");
        for (String block : blocks) {
            Map<String, double[]> measures = new LinkedHashMap<>();
            for (String measure : MEASURES) {
                measures.put(measure, new double[]{0, -1, 0});
            }
            maxima.put(block, measures);
        }
        return maxima;
    }

    /** value, row, count; a NaN is kept once seen (it fails every limit). */
    private static void record(
            Map<String, Map<String, double[]>> maxima,
            String block,
            String measure,
            double value,
            int row
    ) {
        for (String name : List.of(block, "ALL")) {
            double[] entry = maxima.get(name).get(measure);
            entry[2] += 1;
            if (entry[1] < 0 || Double.isNaN(value)
                    || (!Double.isNaN(entry[0]) && value > entry[0])) {
                entry[0] = value;
                entry[1] = row;
            }
        }
    }

    private static String categoryOf(int index) {
        int end = 0;
        for (int category = 0; category < CATEGORIES.length; category++) {
            end += SIZES[category] / blockScale;
            if (index < end) {
                return CATEGORIES[category];
            }
        }
        return "extra";
    }

    private static void report(String name, Stats stats) {
        Summary distance = summarize(stats.s12);
        Summary azimuthPosition = summarize(stats.azi1Position);
        Summary azimuth1 = summarize(stats.azi1Deg);
        Summary azimuth2 = summarize(stats.azi2Deg);
        Summary directPosition = summarize(stats.directPosition);
        Summary directAzimuth = summarize(stats.directAzi2Deg);
        System.out.println(String.format(
                Locale.ROOT,
                "%-17s %7d invErr=%d dirErr=%d ambig=%d"
                        + " | s12[m] p99=%s max=%s"
                        + " | azi1*m12[m] p99=%s max=%s"
                        + " | azi1[deg] max=%s azi2[deg] max=%s"
                        + " | direct pos[m] p99=%s max=%s"
                        + " azi2[deg] max=%s",
                name,
                stats.rows,
                stats.inverseErrors,
                stats.directErrors,
                stats.ambiguous,
                format(distance.p99),
                format(distance.max),
                format(azimuthPosition.p99),
                format(azimuthPosition.max),
                format(azimuth1.max),
                format(azimuth2.max),
                format(directPosition.p99),
                format(directPosition.max),
                format(directAzimuth.max)
        ));
    }

    private static Summary summarize(DoubleList values) {
        if (values.size == 0) {
            return new Summary(Double.NaN, Double.NaN);
        }
        double[] sorted = Arrays.copyOf(values.values, values.size);
        Arrays.sort(sorted);
        int index = (int) Math.min(
                sorted.length - 1,
                Math.floor(0.99 * sorted.length)
        );
        return new Summary(sorted[index], sorted[sorted.length - 1]);
    }

    private static String format(double value) {
        if (Double.isNaN(value)) {
            return "-";
        }
        if (value == 0) {
            return "0";
        }
        String text = String.format(Locale.ROOT, "%.2e", value);
        int exponent = text.indexOf('e');
        String mantissa = text.substring(0, exponent);
        String power = text.substring(exponent + 1);
        char sign = power.charAt(0);
        String digits = power.substring(1);
        int first = 0;
        while (first < digits.length() - 1 && digits.charAt(first) == '0') {
            first++;
        }
        return mantissa + "e" + sign + digits.substring(first);
    }

    private static String solversJson(Stats stats) {
        StringBuilder result = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Integer> entry : stats.solvers.entrySet()) {
            if (!first) {
                result.append(',');
            }
            first = false;
            result.append('"')
                    .append(entry.getKey())
                    .append("\":")
                    .append(entry.getValue());
        }
        return result.append('}').toString();
    }

    private static String worstJson(Stats stats) {
        StringBuilder result = new StringBuilder("{");
        result.append("\"s12\":").append(worstValue(stats.worstS12, false));
        result.append(",\"azi1Position\":")
                .append(worstValue(stats.worstAzi1Position, true));
        result.append(",\"directPosition\":")
                .append(worstValue(stats.worstDirectPosition, false));
        return result.append('}').toString();
    }

    private static String worstValue(Worst worst, boolean withAzimuth) {
        if (worst == null) {
            return "null";
        }
        StringBuilder result = new StringBuilder("{");
        result.append("\"value\":").append(jsonNumber(worst.value));
        result.append(",\"index\":").append(worst.index);
        if (withAzimuth) {
            result.append(",\"dA1\":").append(jsonNumber(worst.azimuthError));
        }
        return result.append('}').toString();
    }

    private static String jsonNumber(double value) {
        if (value == 0) {
            return "0";
        }
        String text = Double.toString(value).replace('E', 'e');
        int exponent = text.indexOf('e');
        if (exponent < 0) {
            return text.endsWith(".0")
                    ? text.substring(0, text.length() - 2)
                    : text;
        }
        String mantissa = text.substring(0, exponent);
        if (mantissa.endsWith(".0")) {
            mantissa = mantissa.substring(0, mantissa.length() - 2);
        }
        return mantissa + text.substring(exponent);
    }

    private static double angleDiff(double first, double second) {
        double difference = (first - second) % 360;
        if (difference > 180) {
            difference -= 360;
        }
        if (difference < -180) {
            difference += 360;
        }
        return Math.abs(difference);
    }

    private static final class Stats {
        private long rows;
        private int inverseErrors;
        private int directErrors;
        private int ambiguous;
        private final DoubleList s12 = new DoubleList();
        private final DoubleList azi1Position = new DoubleList();
        private final DoubleList azi2Deg = new DoubleList();
        private final DoubleList azi1Deg = new DoubleList();
        private final DoubleList directPosition = new DoubleList();
        private final DoubleList directAzi2Deg = new DoubleList();
        private final Map<String, Integer> solvers = new LinkedHashMap<>();
        private Worst worstS12;
        private Worst worstAzi1Position;
        private Worst worstDirectPosition;
    }

    private record Summary(double p99, double max) {
    }

    private record Worst(double value, int index, double azimuthError) {
    }

    private static final class DoubleList {
        private double[] values = new double[16];
        private int size;

        private void add(double value) {
            if (size == values.length) {
                values = Arrays.copyOf(values, values.length * 2);
            }
            values[size++] = value;
        }
    }
}
