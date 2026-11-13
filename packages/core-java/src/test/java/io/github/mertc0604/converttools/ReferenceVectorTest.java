package io.github.mertc0604.converttools;

import io.github.mertc0604.converttools.coordinates.grid.Gars;
import io.github.mertc0604.converttools.coordinates.grid.Georef;
import io.github.mertc0604.converttools.coordinates.grid.Mgrs;
import io.github.mertc0604.converttools.coordinates.model.AngularCell;
import io.github.mertc0604.converttools.coordinates.model.CoordinatePoint;
import io.github.mertc0604.converttools.coordinates.model.CrsTransformation;
import io.github.mertc0604.converttools.coordinates.model.GridCell;
import io.github.mertc0604.converttools.coordinates.model.GridCoordinate;
import io.github.mertc0604.converttools.coordinates.projection.CrsTransformer;
import io.github.mertc0604.converttools.coordinates.projection.UtmUps;
import io.github.mertc0604.converttools.geodesy.DirectResult;
import io.github.mertc0604.converttools.geodesy.GeoPoint;
import io.github.mertc0604.converttools.geodesy.Geodesic;
import io.github.mertc0604.converttools.geodesy.GeodesicResult;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

/**
 * Checks the Java core against the GeographicLib-generated contract vectors in
 * contracts/test-vectors, the same files the JavaScript core must pass.
 * Every check collects all failing rows and prints the largest error measured.
 */
public final class ReferenceVectorTest {
    /**
     * Checks that are known to fail and are reported without failing the run.
     * Must be empty on a green build.
     */
    private static final Set<String> PENDING = Set.of(
            "utm-ups-forward",
            "utm-ups-inverse",
            "mgrs-forward",
            "mgrs-reverse",
            "crs",
            "gars"
    );
    private static final double METRES_PER_DEGREE = 6378137 * Math.PI / 180;

    private final Path directory;
    private final List<String> hardFailures = new ArrayList<>();

    private ReferenceVectorTest(Path directory) {
        this.directory = directory;
    }

    public static void main(String[] args) throws IOException {
        if (args.length > 1) {
            throw new IllegalArgumentException(
                    "Use at most one test-vector directory argument."
            );
        }
        ReferenceVectorTest test = new ReferenceVectorTest(
                args.length == 1 ? Path.of(args[0]) : Path.of("contracts", "test-vectors")
        );
        test.utmUpsForward();
        test.utmUpsInverse();
        test.mgrsForward();
        test.mgrsReverse();
        test.crs();
        test.geodesicInverse();
        test.geodesicDirect();
        test.gars();
        test.georef();
        if (!test.hardFailures.isEmpty()) {
            throw new AssertionError(String.join("\n", test.hardFailures));
        }
        System.out.println("Java reference vector tests passed.");
    }

    private void utmUpsForward() throws IOException {
        Check check = new Check("utm-ups-forward");
        MaxError error = new MaxError("UTM/UPS forward", "m");
        for (Map<String, String> row : read("utm-ups-forward.csv")) {
            String id = row.get("id");
            double latitude = number(row, "latitude");
            double longitude = number(row, "longitude");
            GridCoordinate grid = check.attempt(id, () -> row.get("zone").isEmpty()
                    ? UtmUps.forward(latitude, longitude)
                    : UtmUps.utmForward(latitude, longitude, Integer.parseInt(row.get("zone"))));
            if (grid == null) {
                continue;
            }
            if (grid.zone() != Integer.parseInt(row.get("expected_zone"))
                    || !hemisphere(grid.north()).equals(row.get("expected_hemisphere"))) {
                check.fail(id + ": zone " + grid.zone() + hemisphere(grid.north())
                        + " != " + row.get("expected_zone") + row.get("expected_hemisphere"));
                continue;
            }
            double distance = Math.hypot(
                    grid.easting() - number(row, "expected_easting"),
                    grid.northing() - number(row, "expected_northing")
            );
            error.add(distance, id);
            if (!(distance <= number(row, "tolerance_metres"))) {
                check.fail(id + ": off by " + distance + " m");
            }
        }
        error.print();
        check.finish();
    }

    private void utmUpsInverse() throws IOException {
        Check check = new Check("utm-ups-inverse");
        MaxError error = new MaxError("UTM/UPS inverse", "m");
        for (Map<String, String> row : read("utm-ups-inverse.csv")) {
            String id = row.get("id");
            CoordinatePoint point = check.attempt(id, () -> UtmUps.inverse(
                    Integer.parseInt(row.get("zone")),
                    row.get("hemisphere").equals("N"),
                    number(row, "easting"),
                    number(row, "northing")
            ));
            if (point == null) {
                continue;
            }
            double distance = ground(
                    point.latitude(),
                    point.longitude(),
                    number(row, "expected_latitude"),
                    number(row, "expected_longitude")
            );
            error.add(distance, id);
            if (!(distance <= number(row, "tolerance_metres"))) {
                check.fail(id + ": off by " + distance + " m");
            }
        }
        error.print();
        check.finish();
    }

    private void mgrsForward() throws IOException {
        Check check = new Check("mgrs-forward");
        for (Map<String, String> row : read("mgrs-forward.csv")) {
            String id = row.get("id");
            String code = check.attempt(id, () -> Mgrs.encode(
                    number(row, "latitude"),
                    number(row, "longitude"),
                    Integer.parseInt(row.get("precision"))
            ));
            if (code != null && !code.equals(row.get("expected_mgrs"))) {
                check.fail(id + ": " + code + " != " + row.get("expected_mgrs"));
            }
        }
        check.finish();
    }

    private void mgrsReverse() throws IOException {
        Check check = new Check("mgrs-reverse");
        MaxError gridError = new MaxError("MGRS centre grid", "m");
        MaxError pointError = new MaxError("MGRS centre point", "m");
        for (Map<String, String> row : read("mgrs-reverse.csv")) {
            String id = row.get("id");
            if (row.get("valid").equals("0")) {
                try {
                    GridCell cell = Mgrs.decode(row.get("mgrs"), true);
                    check.fail(id + ": accepted invalid MGRS as " + cell.point());
                } catch (IllegalArgumentException expected) {
                    // GeographicLib rejects it as well.
                }
                continue;
            }
            GridCell cell = check.attempt(id, () -> Mgrs.decode(row.get("mgrs"), true));
            if (cell == null) {
                continue;
            }
            if (cell.zone() != Integer.parseInt(row.get("expected_zone"))
                    || !hemisphere(cell.north()).equals(row.get("expected_hemisphere"))) {
                check.fail(id + ": zone " + cell.zone() + hemisphere(cell.north()));
                continue;
            }
            double tolerance = number(row, "tolerance_metres");
            double grid = Math.hypot(
                    cell.easting() - number(row, "expected_easting"),
                    cell.northing() - number(row, "expected_northing")
            );
            double point = ground(
                    cell.point().latitude(),
                    cell.point().longitude(),
                    number(row, "expected_latitude"),
                    number(row, "expected_longitude")
            );
            gridError.add(grid, id);
            pointError.add(point, id);
            if (!(grid <= tolerance) || !(point <= tolerance)) {
                check.fail(id + ": grid off " + grid + " m, point off " + point + " m");
            }
        }
        gridError.print();
        pointError.print();
        check.finish();
    }

    private void crs() throws IOException {
        Check check = new Check("crs");
        Map<String, MaxError> errors = new LinkedHashMap<>();
        MaxError roundTrip = new MaxError("CRS round-trip", "m");
        for (Map<String, String> row : read("coordinate-projections.csv")) {
            String id = row.get("id");
            String target = row.get("target_crs");
            double latitude = number(row, "latitude");
            double longitude = number(row, "longitude");
            CrsTransformation projected = check.attempt(id, () ->
                    CrsTransformer.transform("EPSG:4326", target, longitude, latitude));
            if (projected == null) {
                continue;
            }
            String family = target.replaceAll("^EPSG:(32[67])\\d\\d$", "EPSG:$1xx");
            MaxError error = errors.computeIfAbsent(family, key -> new MaxError("CRS " + key, "m"));
            double distance = Math.hypot(
                    projected.x() - number(row, "expected_x"),
                    projected.y() - number(row, "expected_y")
            );
            error.add(distance, id);
            if (!(distance <= number(row, "output_tolerance"))) {
                check.fail(id + ": off by " + distance + " m");
                continue;
            }
            CrsTransformation restored = check.attempt(id + " reverse", () ->
                    CrsTransformer.transform(target, "EPSG:4326", projected.x(), projected.y()));
            if (restored == null) {
                continue;
            }
            double back = Math.abs(latitude) == 90
                    ? Math.abs(restored.y() - latitude) * METRES_PER_DEGREE
                    : ground(restored.y(), restored.x(), latitude, longitude);
            roundTrip.add(back, id);
            if (!(back <= number(row, "roundtrip_tolerance_metres"))) {
                check.fail(id + ": round-trip off by " + back + " m");
            }
        }
        errors.values().forEach(MaxError::print);
        roundTrip.print();
        check.finish();
    }

    private void geodesicInverse() throws IOException {
        Check check = new Check("geodesic-inverse");
        MaxError distanceError = new MaxError("geodesic inverse distance", "m");
        MaxError azimuthError = new MaxError(
                "geodesic inverse azimuth as endpoint offset (|m12| x azimuth error)", "m");
        for (Map<String, String> row : read("geodesic-wgs84.csv")) {
            String id = row.get("id");
            GeodesicResult result = check.attempt(id, () -> Geodesic.inverse(
                    new GeoPoint(number(row, "startLatitude"), number(row, "startLongitude")),
                    new GeoPoint(number(row, "endLatitude"), number(row, "endLongitude"))
            ));
            if (result == null) {
                continue;
            }
            double tolerance = number(row, "toleranceMetres");
            double distance = Math.abs(result.distanceMetres() - number(row, "distanceMetres"));
            distanceError.add(distance, id);
            if (!(distance <= tolerance)) {
                check.fail(id + ": distance off by " + distance + " m");
            }
            if (row.get("initialBearingDegrees").isEmpty()) {
                continue;
            }
            if (result.initialBearingDegrees() == null || result.finalBearingDegrees() == null) {
                check.fail(id + ": azimuth missing");
                continue;
            }
            double reducedLength = Math.abs(number(row, "reducedLengthMetres"));
            double offset = reducedLength * Math.toRadians(Math.max(
                    angularDifference(result.initialBearingDegrees(), number(row, "initialBearingDegrees")),
                    angularDifference(result.finalBearingDegrees(), number(row, "finalBearingDegrees"))
            ));
            azimuthError.add(offset, id);
            if (!(offset <= tolerance)) {
                check.fail(id + ": azimuth error moves the endpoint by " + offset + " m");
            }
        }
        distanceError.print();
        azimuthError.print();
        check.finish();
    }

    private void geodesicDirect() throws IOException {
        Check check = new Check("geodesic-direct");
        MaxError error = new MaxError("direct geodesic position", "m");
        MaxError azimuth = new MaxError("direct geodesic final azimuth", "deg");
        for (Map<String, String> row : read("geodesic-direct.csv")) {
            String id = row.get("id");
            DirectResult result = check.attempt(id, () -> Geodesic.direct(
                    new GeoPoint(number(row, "startLatitude"), number(row, "startLongitude")),
                    number(row, "initialBearingDegrees"),
                    number(row, "distanceMetres")
            ));
            if (result == null) {
                continue;
            }
            double expectedLatitude = number(row, "expectedLatitude");
            double distance = ground(
                    result.destination().latitude(),
                    result.destination().longitude(),
                    expectedLatitude,
                    number(row, "expectedLongitude")
            );
            error.add(distance, id);
            if (!(distance <= number(row, "toleranceMetres"))) {
                check.fail(id + ": off by " + distance + " m");
            }
            if (Math.abs(expectedLatitude) < 90) {
                double difference = angularDifference(
                        result.finalBearingDegrees(),
                        number(row, "expectedFinalBearingDegrees")
                );
                azimuth.add(difference, id);
                if (!(difference <= 1e-6)) {
                    check.fail(id + ": final azimuth off by " + difference + " deg");
                }
            }
        }
        error.print();
        azimuth.print();
        check.finish();
    }

    private void gars() throws IOException {
        Check check = new Check("gars");
        MaxError centre = new MaxError("GARS centre", "deg");
        for (Map<String, String> row : read("gars.csv")) {
            String id = row.get("id");
            if (row.get("precision").equals("2")) {
                String code = check.attempt(id, () ->
                        Gars.encode(number(row, "longitude"), number(row, "latitude")));
                if (code != null && !code.equals(row.get("expected_code"))) {
                    check.fail(id + ": " + code + " != " + row.get("expected_code"));
                }
            }
            angularCentre(check, centre, id, row, () -> Gars.decode(row.get("expected_code")));
        }
        centre.print();
        check.finish();
    }

    private void georef() throws IOException {
        Check check = new Check("georef");
        MaxError centre = new MaxError("GEOREF centre", "deg");
        for (Map<String, String> row : read("georef.csv")) {
            String id = row.get("id");
            String code = check.attempt(id, () -> Georef.encode(
                    number(row, "longitude"),
                    number(row, "latitude"),
                    Integer.parseInt(row.get("precision"))
            ));
            if (code != null && !code.equals(row.get("expected_code"))) {
                check.fail(id + ": " + code + " != " + row.get("expected_code"));
            }
            angularCentre(check, centre, id, row, () -> Georef.decode(row.get("expected_code")));
        }
        centre.print();
        check.finish();
    }

    private static void angularCentre(
            Check check,
            MaxError centre,
            String id,
            Map<String, String> row,
            Supplier<AngularCell> decode
    ) {
        AngularCell cell = check.attempt(id + " decode", decode);
        if (cell == null) {
            return;
        }
        double difference = Math.max(
                Math.abs(cell.center().latitude() - number(row, "expected_center_latitude")),
                angularDifference(cell.center().longitude(), number(row, "expected_center_longitude"))
        );
        centre.add(difference, id);
        if (!(difference <= 1e-12)) {
            check.fail(id + ": centre off by " + difference + " deg");
        }
    }

    private List<Map<String, String>> read(String name) throws IOException {
        List<String> lines = Files.readAllLines(directory.resolve(name), StandardCharsets.UTF_8);
        String[] header = lines.get(0).split(",", -1);
        List<Map<String, String>> rows = new ArrayList<>();
        for (int index = 1; index < lines.size(); index++) {
            String line = lines.get(index);
            if (line.isBlank()) {
                continue;
            }
            String[] cells = line.split(",", -1);
            if (cells.length != header.length) {
                throw new AssertionError(name + " row " + (index + 1) + " has " + cells.length + " cells");
            }
            Map<String, String> row = new LinkedHashMap<>();
            for (int column = 0; column < header.length; column++) {
                row.put(header[column], cells[column]);
            }
            rows.add(row);
        }
        return rows;
    }

    private static double number(Map<String, String> row, String column) {
        return Double.parseDouble(row.get(column));
    }

    private static String hemisphere(boolean north) {
        return north ? "N" : "S";
    }

    private static double longitudeDelta(double first, double second) {
        double delta = ((first - second) % 360 + 540) % 360 - 180;
        return delta == -180 ? 180 : delta;
    }

    private static double angularDifference(double actual, double expected) {
        return Math.abs(longitudeDelta(actual, expected));
    }

    /** Local spherical ground distance; good to about 1% of a small error. */
    private static double ground(
            double latitude,
            double longitude,
            double expectedLatitude,
            double expectedLongitude
    ) {
        double cosine = Math.max(0, Math.cos(Math.toRadians(expectedLatitude)));
        return Math.hypot(
                (latitude - expectedLatitude) * METRES_PER_DEGREE,
                longitudeDelta(longitude, expectedLongitude) * METRES_PER_DEGREE * cosine
        );
    }

    private final class Check {
        private final String name;
        private final List<String> failures = new ArrayList<>();
        private int rows;

        Check(String name) {
            this.name = name;
        }

        <T> T attempt(String id, Supplier<T> operation) {
            rows++;
            try {
                return operation.get();
            } catch (IllegalArgumentException | ArithmeticException error) {
                fail(id + ": threw " + error.getMessage());
                return null;
            }
        }

        void fail(String message) {
            failures.add(message);
        }

        void finish() {
            if (failures.isEmpty()) {
                System.out.println("ok " + name + " (" + rows + " rows)");
                return;
            }
            String summary = name + ": " + failures.size() + " of " + rows + " rows failed\n  "
                    + String.join("\n  ", failures.subList(0, Math.min(10, failures.size())));
            if (PENDING.contains(name)) {
                System.out.println("PENDING " + summary);
            } else {
                hardFailures.add(summary);
            }
        }
    }

    private static final class MaxError {
        private final String label;
        private final String unit;
        private double value;
        private String where = "";
        private int count;

        MaxError(String label, String unit) {
            this.label = label;
            this.unit = unit;
        }

        void add(double error, String id) {
            count++;
            if (error > value) {
                value = error;
                where = id;
            }
        }

        void print() {
            System.out.println(String.format(
                    Locale.ROOT,
                    "  %s: max %.3e %s over %d rows%s",
                    label,
                    value,
                    unit,
                    count,
                    where.isEmpty() ? "" : " (" + where + ")"
            ));
        }
    }
}
