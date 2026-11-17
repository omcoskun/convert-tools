package io.github.mertc0604.converttools;

import io.github.mertc0604.converttools.geodesy.DirectResult;
import io.github.mertc0604.converttools.geodesy.GeoPoint;
import io.github.mertc0604.converttools.geodesy.Geodesic;
import io.github.mertc0604.converttools.geodesy.GeodesicResult;
import io.github.mertc0604.converttools.geodesy.TriaxialGeodesic;
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
 * Hold-out checks, gated by {@code holdout.txt} in the test-vector directory
 * (the first argument). The Java mirror of
 * packages/core-js/test/holdout.test.mjs, with the same rules and limits.
 * While the file says {@code disabled} (the state in the repository) this
 * class prints one line and checks nothing else. With {@code enabled}:
 * (a) a12, m12 and S12 of the inverse and direct solvers against the
 * {@code geodtest-sample.csv} columns: a12 1e-7 m / (a * 1 degree), m12
 * 1e-7 m, S12 0.25 m^2 + c^2 * 1e-8 m * (1 / (a cos(lat1)) +
 * 1 / (a cos(lat2)), plus 1 / |m12| for the inverse); (b) the triaxial
 * inverse and direct solvers against {@code geod3test-sample.csv}: inverse
 * distance, direct position and inverse |dalp1| * |m12*| 1e-13, direct m12,
 * M12, M21 1e-11; a point pair listed more than once is judged against its
 * best-matching row, and a pair whose other shortest lines are not in the
 * sample passes the azimuth check when the line of our azimuth and length
 * reaches point 2 within 1e-13. The inverse a12 and m12 limits follow the
 * rule of docs/GEODESIC_VALIDATION.md, ours &lt;= max(2 * reference-binary
 * maximum in the row's GeodTest block, floor), with the GeodSolve maxima of
 * {@link #REFERENCE_INVERSE}; only the near-vertex block lifts a limit above
 * its floor.
 */
public final class HoldoutTest {
    private static final double A = 6378137;
    private static final double F = 1 / 298.257223563;
    private static final double AREA_FLOOR = 0.25;
    private static final double AREA_AZIMUTH_NOISE = 1e-8;
    /**
     * GeodTest blocks in line order (contracts/tools/validate-geodtest.mjs):
     * line count, GeodSolve's largest inverse a12 (deg) and m12 (m) error in
     * the block over all 500000 lines (GeographicLib 2.7, run of 2026-11-17;
     * near-vertex recomputed at its worst line 459433, the others as printed
     * to three digits). Blocks: random, antipodal, short, one-pole,
     * opposite-poles, meridional, equatorial, vertex-to-vertex, near-vertex.
     */
    private static final double[][] REFERENCE_INVERSE = {
            {100000, 5.68e-14, 4.19e-9},
            {50000, 1.14e-13, 2.66e-8},
            {50000, 2.59e-14, 3.2e-9},
            {50000, 5.68e-14, 3.73e-9},
            {50000, 2.84e-14, 1.97e-9},
            {50000, 2.84e-14, 3.73e-9},
            {50000, 5.68e-14, 4.66e-9},
            {50000, 0, 3e-9},
            {50000, 1.3617e-10, 4.537e-5},
    };

    private HoldoutTest() {
    }

    /** The {@link #REFERENCE_INVERSE} entry of the block holding GeodTest line {@code index}. */
    private static double[] referenceBlock(int index) {
        int first = 0;
        for (double[] block : REFERENCE_INVERSE) {
            if (index < first + block[0]) {
                return block;
            }
            first += (int) block[0];
        }
        throw new IllegalArgumentException("GeodTest line " + index + " is past the last block");
    }

    public static void main(String[] args) throws IOException {
        Path directory = Path.of(args.length == 1 ? args[0] : "contracts/test-vectors");
        String state = Files.readString(directory.resolve("holdout.txt"), StandardCharsets.UTF_8).trim();
        if (!state.equals("enabled") && !state.equals("disabled")) {
            throw new AssertionError("holdout.txt says \"" + state + "\"");
        }
        if (state.equals("disabled")) {
            System.out.println("hold-out disabled: a12/m12/S12 of geodtest-sample.csv and Geod3Test not checked");
            return;
        }
        double b = A * (1 - F);
        double e = Math.sqrt(F * (2 - F));
        double c2 = (A * A + b * b * 0.5 * Math.log((1 + e) / (1 - e)) / e) / 2;
        List<String> lines = Files.readAllLines(directory.resolve("geodtest-sample.csv"), StandardCharsets.UTF_8);
        List<String> failures = new ArrayList<>();
        String[] names = {"inverseA12", "inverseM12", "inverseS12", "directA12", "directM12", "directS12"};
        double[] maxima = new double[names.length];
        String[] where = new String[names.length];
        for (String line : lines.subList(1, lines.size())) {
            if (line.isBlank()) {
                continue;
            }
            String[] v = line.split(",");
            String id = v[0];
            double lat1 = Double.parseDouble(v[1]);
            double lat2 = Double.parseDouble(v[4]);
            double m12 = Double.parseDouble(v[9]);
            GeoPoint start = new GeoPoint(lat1, Double.parseDouble(v[2]));
            GeodesicResult inverse = Geodesic.inverse(start, new GeoPoint(lat2, Double.parseDouble(v[5])));
            DirectResult direct = Geodesic.direct(start, Double.parseDouble(v[3]), Double.parseDouble(v[7]));
            if (inverse.azimuthDefined() && !inverse.ambiguous()) {
                // The reported uncertainties hold (an ambiguous pair may list another route).
                double azimuth = Math.max(
                        Math.toDegrees(heading(inverse.initialBearingDegrees(), Double.parseDouble(v[3]))),
                        Math.toDegrees(heading(inverse.finalBearingDegrees(), Double.parseDouble(v[6]))));
                if (!(azimuth <= inverse.bearingUncertaintyDegrees())) {
                    failures.add(id + ": azimuth off by " + azimuth + " deg > " + inverse.bearingUncertaintyDegrees());
                }
                double area = Math.abs(inverse.areaSquareMetres() - Double.parseDouble(v[10]));
                if (!(area <= inverse.areaUncertaintySquareMetres())) {
                    failures.add(id + ": S12 off by " + area + " m^2 > " + inverse.areaUncertaintySquareMetres());
                }
            }
            double polar = 1 / (A * Math.cos(Math.toRadians(lat1))) + 1 / (A * Math.cos(Math.toRadians(lat2)));
            double[] actual = {
                    inverse.arcDegrees(), inverse.reducedLengthMetres(), inverse.areaSquareMetres(),
                    direct.arcDegrees(), direct.reducedLengthMetres(), direct.areaSquareMetres(),
            };
            double[] expected = {
                    Double.parseDouble(v[8]), m12, Double.parseDouble(v[10]),
                    Double.parseDouble(v[8]), m12, Double.parseDouble(v[10]),
            };
            double[] reference = referenceBlock(Integer.parseInt(id.replaceFirst("^geodtest-", "")));
            double[] limits = {
                    Math.max(2 * reference[1], 1e-7 / (A * Math.PI / 180)), Math.max(2 * reference[2], 1e-7),
                    AREA_FLOOR + c2 * AREA_AZIMUTH_NOISE * (polar + 1 / Math.abs(m12)),
                    1e-7 / (A * Math.PI / 180), 1e-7, AREA_FLOOR + c2 * AREA_AZIMUTH_NOISE * polar,
            };
            for (int k = 0; k < names.length; k++) {
                double error = Math.abs(actual[k] - expected[k]);
                if (!(error <= maxima[k])) {
                    maxima[k] = error;
                    where[k] = id;
                }
                if (!(error <= limits[k])) {
                    failures.add(id + ": " + names[k] + " off by " + error + " (limit " + limits[k] + ")");
                }
            }
        }
        for (int k = 0; k < names.length; k++) {
            System.out.println(String.format(Locale.ROOT, "  GeodTest sample %s: max %.3e (%s)", names[k], maxima[k], where[k]));
        }
        if (!Files.exists(directory.resolve("geod3test-sample.csv"))) {
            failures.add("geod3test-sample.csv is missing");
        } else {
            geod3test(directory, failures);
        }
        if (!failures.isEmpty()) {
            throw new AssertionError(failures.size() + " hold-out checks failed:\n  "
                    + String.join("\n  ", failures.subList(0, Math.min(15, failures.size()))));
        }
        System.out.println("Java hold-out tests passed.");
    }

    private static double heading(double x, double y) {
        return Math.toRadians(Math.abs((((x - y) % 360) + 540) % 360 - 180));
    }

    private static double apart(TriaxialGeodesic.Cartesian p, TriaxialGeodesic.Cartesian q) {
        double dx = p.x() - q.x();
        double dy = p.y() - q.y();
        double dz = p.z() - q.z();
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    private static void geod3test(Path directory, List<String> failures) throws IOException {
        TriaxialGeodesic.Axes axes = new TriaxialGeodesic.Axes(Math.sqrt(2), 1, Math.sqrt(0.5));
        List<String[]> rows = new ArrayList<>();
        List<String> lines = Files.readAllLines(directory.resolve("geod3test-sample.csv"), StandardCharsets.UTF_8);
        for (String line : lines.subList(1, lines.size())) {
            if (!line.isBlank()) {
                rows.add(line.split(","));
            }
        }
        Map<String, List<String[]>> pairs = new HashMap<>();
        for (String[] v : rows) {
            pairs.computeIfAbsent(v[1] + " " + v[2] + " " + v[4] + " " + v[5], key -> new ArrayList<>()).add(v);
        }
        String[] names = {"inverse distance", "inverse |dalp1|*|m12|", "direct position", "direct m12", "direct M12", "direct M21"};
        double[] limits = {1e-13, 1e-13, 1e-13, 1e-11, 1e-11, 1e-11};
        double[] maxima = new double[names.length];
        String[] where = new String[names.length];
        for (String[] v : rows) {
            double[] x = new double[11];
            for (int k = 1; k < 11; k++) {
                x[k] = Double.parseDouble(v[k]);
            }
            TriaxialGeodesic.Point start = new TriaxialGeodesic.Point(x[1], x[2]);
            TriaxialGeodesic.Point end = new TriaxialGeodesic.Point(x[4], x[5]);
            TriaxialGeodesic.Cartesian target = TriaxialGeodesic.toCartesian(end, axes);
            TriaxialGeodesic.InverseResult inverse = TriaxialGeodesic.inverse(start, end, axes);
            String[] best = null;
            double bestScore = 0;
            for (String[] other : pairs.get(v[1] + " " + v[2] + " " + v[4] + " " + v[5])) {
                double score = Math.max(heading(inverse.initialAzimuthDegrees(), Double.parseDouble(other[3])),
                        heading(inverse.finalAzimuthDegrees(), Double.parseDouble(other[6])));
                if (best == null || score < bestScore) {
                    best = other;
                    bestScore = score;
                }
            }
            double offset = heading(inverse.initialAzimuthDegrees(), Double.parseDouble(best[3]))
                    * Math.abs(Double.parseDouble(best[8]));
            if (!(offset <= 1e-13)) {
                TriaxialGeodesic.DirectResult line = TriaxialGeodesic.direct(
                        start, inverse.initialAzimuthDegrees(), inverse.distance(), axes);
                double reach = apart(TriaxialGeodesic.toCartesian(
                        new TriaxialGeodesic.Point(line.beta(), line.omega()), axes), target);
                if (reach <= 1e-13) {
                    offset = reach;
                }
            }
            TriaxialGeodesic.DirectResult direct = TriaxialGeodesic.direct(start, x[3], x[7], axes);
            double[] errors = {
                Math.abs(inverse.distance() - x[7]),
                offset,
                apart(TriaxialGeodesic.toCartesian(new TriaxialGeodesic.Point(direct.beta(), direct.omega()), axes), target),
                Math.abs(direct.reducedLength() - x[8]),
                Math.abs(direct.geodesicScale12() - x[9]),
                Math.abs(direct.geodesicScale21() - x[10]),
            };
            for (int k = 0; k < names.length; k++) {
                if (where[k] == null || errors[k] > maxima[k]) {
                    maxima[k] = errors[k];
                    where[k] = v[0];
                }
                if (!(errors[k] <= limits[k])) {
                    failures.add(v[0] + ": Geod3Test " + names[k] + " off by " + errors[k] + " (limit " + limits[k] + ")");
                }
            }
        }
        for (int k = 0; k < names.length; k++) {
            System.out.println(String.format(Locale.ROOT, "  Geod3Test sample %s: max %.3e (%s)", names[k], maxima[k], where[k]));
        }
    }
}
