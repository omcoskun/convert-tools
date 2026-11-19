package io.github.omcoskun.converttools;

import io.github.omcoskun.converttools.coordinates.Coordinates;
import io.github.omcoskun.converttools.coordinates.grid.Georef;
import io.github.omcoskun.converttools.coordinates.grid.Mgrs;
import io.github.omcoskun.converttools.coordinates.projection.CrsTransformer;
import io.github.omcoskun.converttools.geodesy.GeoPoint;
import io.github.omcoskun.converttools.geodesy.Geodesic;
import io.github.omcoskun.converttools.geodesy.TriaxialGeodesic;
import io.github.omcoskun.converttools.units.LengthConverter;
import io.github.omcoskun.converttools.units.UnitConverter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Error codes are part of the contract: the same invalid input must fail with
 * the same code in Java and JavaScript. Reads contracts/error-codes.json and
 * contracts/error-cases.csv, the files the JavaScript core also checks.
 */
public final class ErrorContractTest {
    private static final Pattern CODE = Pattern.compile("\"code\"\\s*:\\s*\"([A-Z_]+)\"");

    private ErrorContractTest() {
    }

    public static void main(String[] args) throws IOException {
        Path vectors = Path.of(args.length > 0 ? args[0] : "contracts/test-vectors");
        Path contracts = vectors.toAbsolutePath().getParent();
        checkCodeList(contracts.resolve("error-codes.json"));
        checkCases(contracts.resolve("error-cases.csv"));
        System.out.println("Java error contract tests passed.");
    }

    private static void checkCodeList(Path file) throws IOException {
        String json = Files.readString(file, StandardCharsets.UTF_8);
        List<String> expected = new ArrayList<>();
        Matcher matcher = CODE.matcher(json);
        while (matcher.find()) {
            expected.add(matcher.group(1));
        }
        List<String> actual = Arrays.stream(ErrorCode.values()).map(Enum::name).toList();
        if (!actual.equals(expected)) {
            throw new AssertionError("ErrorCode differs from error-codes.json:\n  java: "
                    + actual + "\n  json: " + expected);
        }
    }

    private static final Map<String, Consumer<String[]>> OPERATIONS = Map.ofEntries(
            Map.entry("decimal-degrees", v -> Coordinates.fromDecimalDegrees(v[0], v[1])),
            Map.entry("dms", v -> Coordinates.fromDms(v[0], v[1])),
            Map.entry("utm-ups", v -> Coordinates.fromUtmUps(v[0], v[1], v[2], v[3])),
            Map.entry("mgrs", v -> Coordinates.fromMgrs(v[0])),
            Map.entry("mgrs-encode", v -> Mgrs.encode(
                    Double.parseDouble(v[0]), Double.parseDouble(v[1]), Integer.parseInt(v[2]))),
            Map.entry("gars", v -> Coordinates.fromGars(v[0])),
            Map.entry("georef", v -> Coordinates.fromGeoref(v[0])),
            Map.entry("georef-encode", v -> Georef.encode(
                    Double.parseDouble(v[1]), Double.parseDouble(v[0]), Integer.parseInt(v[2]))),
            Map.entry("crs", v -> CrsTransformer.transform(v[0], v[1], v[2], v[3])),
            Map.entry("length", v -> LengthConverter.convert(v[0], v[1], v[2], 24)),
            Map.entry("units", v -> UnitConverter.convert(v[0], v[1], v[2], v[3], 24)),
            Map.entry("geodesic-inverse", v -> Geodesic.inverse(
                    new GeoPoint(Double.parseDouble(v[0]), Double.parseDouble(v[1])),
                    new GeoPoint(Double.parseDouble(v[2]), Double.parseDouble(v[3])))),
            Map.entry("geodesic-direct", v -> Geodesic.direct(
                    new GeoPoint(Double.parseDouble(v[0]), Double.parseDouble(v[1])),
                    Double.parseDouble(v[2]),
                    Double.parseDouble(v[3]))),
            Map.entry("triaxial-direct", v -> TriaxialGeodesic.direct(
                    triaxialPoint(v[1]), Double.parseDouble(v[2]), Double.parseDouble(v[3]), triaxialAxes(v[0]))),
            Map.entry("triaxial-inverse", v -> TriaxialGeodesic.inverse(
                    triaxialPoint(v[1]), triaxialPoint(v[2]), triaxialAxes(v[0])))
    );

    /** Triaxial cells hold space-separated numbers: semiaxes "a b c". */
    private static TriaxialGeodesic.Axes triaxialAxes(String cell) {
        String[] parts = cell.split(" ");
        return new TriaxialGeodesic.Axes(
                Double.parseDouble(parts[0]), Double.parseDouble(parts[1]), Double.parseDouble(parts[2]));
    }

    /** A triaxial point cell: "beta omega". */
    private static TriaxialGeodesic.Point triaxialPoint(String cell) {
        String[] parts = cell.split(" ");
        return new TriaxialGeodesic.Point(Double.parseDouble(parts[0]), Double.parseDouble(parts[1]));
    }

    private static void checkCases(Path file) throws IOException {
        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        String header = "id,operation,a,b,c,d,expected_code";
        if (!lines.get(0).equals(header)) {
            throw new AssertionError("error-cases.csv header changed: " + lines.get(0));
        }
        List<String> failures = new ArrayList<>();
        int rows = 0;
        for (String line : lines.subList(1, lines.size())) {
            if (line.isBlank()) {
                continue;
            }
            String[] cells = line.split(",", -1);
            if (cells.length != 7) {
                throw new AssertionError("error-cases.csv bad row: " + line);
            }
            rows++;
            String id = cells[0];
            Consumer<String[]> operation = OPERATIONS.get(cells[1]);
            if (operation == null) {
                throw new AssertionError(id + ": unknown operation " + cells[1]);
            }
            ErrorCode expected = ErrorCode.valueOf(cells[6]);
            try {
                operation.accept(Arrays.copyOfRange(cells, 2, 6));
                failures.add(id + ": no error");
            } catch (ConvertToolsException error) {
                if (error.code() != expected) {
                    failures.add(id + ": " + error.code() + " != " + expected
                            + " (" + error.getMessage() + ")");
                }
            } catch (RuntimeException error) {
                failures.add(id + ": " + error.getClass().getSimpleName() + " " + error.getMessage());
            }
        }
        if (!failures.isEmpty()) {
            throw new AssertionError("error-cases.csv: " + failures.size() + " of " + rows
                    + " rows failed\n  " + String.join("\n  ", failures));
        }
        System.out.println("ok error-cases (" + rows + " rows)");
    }
}
