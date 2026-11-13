package io.github.mertc0604.converttools;

import io.github.mertc0604.converttools.geodesy.DirectResult;
import io.github.mertc0604.converttools.geodesy.GeoPoint;
import io.github.mertc0604.converttools.geodesy.Geodesic;
import io.github.mertc0604.converttools.geodesy.GeodesicPath;
import io.github.mertc0604.converttools.geodesy.GeodesicResult;
import io.github.mertc0604.converttools.geodesy.PolylineMeasurement;
import io.github.mertc0604.converttools.units.LengthConverter;
import io.github.mertc0604.converttools.units.Rational;
import io.github.mertc0604.converttools.units.UnitCatalog;
import io.github.mertc0604.converttools.units.UnitConversion;
import io.github.mertc0604.converttools.units.UnitConverter;
import io.github.mertc0604.converttools.units.UnitDefinition;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

public final class ContractTest {
    private ContractTest() {
    }

    public static void main(String[] args) throws IOException {
        if (args.length != 1) {
            throw new IllegalArgumentException(
                    "Pass the contracts/test-vectors directory."
            );
        }

        Path vectors = Path.of(args[0]);
        testUnits(vectors.resolve("unit-conversions.csv"));
        testAllLengthRoundTrips();
        testLengthContractLimits();
        testGeodesics(vectors.resolve("geodesic-wgs84.csv"));
        testSubMillimetreGeodesic();
        testCutLocusAmbiguity();
        testVincentyCutLocusSensitivity();
        testPolarGeodesicSemantics();
        testPolyline();
        testGeodesicPath();
        System.out.println("Java contract tests passed.");
    }

    private static void testAllLengthRoundTrips() {
        List<String> inputs = List.of(
                "0",
                "1",
                "-1",
                "0.1",
                "123.456789012345678901234",
                "9.87654321e-12",
                "98765432101234567890.123456789"
        );

        for (UnitDefinition from : UnitCatalog.length().units()) {
            for (UnitDefinition to : UnitCatalog.length().units()) {
                for (String input : inputs) {
                    Rational expected = Rational.parse(input);
                    UnitConversion forward = LengthConverter.convert(
                            input,
                            from.id(),
                            to.id(),
                            24
                    );
                    UnitConversion reverse = LengthConverter.convert(
                            forward.exactValue(),
                            to.id(),
                            from.id(),
                            24
                    );
                    require(
                            reverse.exactValue().equals(expected),
                            "Length round trip mismatch: "
                                    + input
                                    + " "
                                    + from.id()
                                    + " -> "
                                    + to.id()
                    );
                    require(
                            forward.exactMetres().equals(
                                    expected.multiply(from.metresPerUnit())
                            ),
                            "Canonical metre value mismatch."
                    );
                }
            }
        }

        UnitConversion metres = LengthConverter.convert(
                "1",
                "nautical-mile",
                "metre",
                24
        );
        UnitConversion nauticalMiles = LengthConverter.convert(
                metres.exactValue(),
                "metre",
                "nautical-mile",
                24
        );
        require(metres.value().equals("1852"), "1 NM must equal 1852 m.");
        require(
                nauticalMiles.value().equals("1"),
                "1 NM -> m -> NM must return exactly 1."
        );
    }

    private static void testLengthContractLimits() {
        require(
                UnitCatalog.categories().size() == 1
                        && UnitCatalog.categories().get(0).id()
                        .equals("length"),
                "Only the length category must be public."
        );
        requireThrows(
                () -> UnitCatalog.category("speed"),
                "Non-length categories must be rejected."
        );
        requireThrows(
                () -> Rational.parse("1e1001"),
                "Exponent greater than 1000 must be rejected."
        );
        requireThrows(
                () -> Rational.parse("9".repeat(4097)),
                "More than 4096 input digits must be rejected."
        );
        requireThrows(
                () -> Rational.parse("0".repeat(4096) + "1"),
                "Leading zeroes must count toward the input limit."
        );

        String maximumInteger = "9".repeat(4096);
        UnitConversion expanded = LengthConverter.convert(
                maximumInteger,
                "kilometre",
                "millimetre",
                24
        );
        require(
                expanded.exactValue().numerator().toString().length() == 4102,
                "A valid maximum-length input must survive result growth."
        );

        String fractional = "." + "0".repeat(4095) + "1";
        UnitConversion fractionalForward = LengthConverter.convert(
                fractional,
                "nautical-mile",
                "metre",
                24
        );
        UnitConversion fractionalBack = LengthConverter.convert(
                fractionalForward.exactValue(),
                "metre",
                "nautical-mile",
                24
        );
        require(
                fractionalBack.exactValue().equals(Rational.parse(fractional)),
                "4096 fractional digits must survive an exact round trip."
        );

        UnitConversion repeating = LengthConverter.convert(
                "1",
                "metre",
                "nautical-mile",
                24
        );
        require(!repeating.exactDecimal(), "m -> NM must repeat.");
        require(repeating.rounded(), "Repeating display must be marked rounded.");
    }

    private static void testUnits(Path file) throws IOException {
        List<String> lines = Files.readAllLines(file);
        for (String line : lines.subList(1, lines.size())) {
            String[] columns = line.split(",", -1);
            UnitConversion result = UnitConverter.convert(
                    columns[2],
                    columns[1],
                    columns[3],
                    columns[4],
                    Integer.parseInt(columns[5])
            );
            require(
                    result.value().equals(columns[6]),
                    columns[0] + ": " + result.value() + " != " + columns[6]
            );
            if (columns.length >= 13 && !columns[7].isEmpty()) {
                require(
                        result.exactValue().numerator().toString()
                                .equals(columns[7])
                                && result.exactValue().denominator().toString()
                                .equals(columns[8]),
                        columns[0] + ": exact value mismatch"
                );
                require(
                        result.exactMetres().numerator().toString()
                                .equals(columns[9])
                                && result.exactMetres().denominator().toString()
                                .equals(columns[10]),
                        columns[0] + ": exact metre value mismatch"
                );
                require(
                        result.exactFactor().numerator().toString()
                                .equals(columns[11])
                                && result.exactFactor().denominator().toString()
                                .equals(columns[12]),
                        columns[0] + ": exact factor mismatch"
                );
            }
        }
    }

    /**
     * Inverse followed by direct must close on the target. Agreement with the
     * reference values themselves is checked in ReferenceVectorTest.
     */
    private static void testGeodesics(Path file) throws IOException {
        List<String> lines = Files.readAllLines(file);
        for (String line : lines.subList(1, lines.size())) {
            String[] columns = line.split(",", -1);
            if (columns[6].isEmpty()) {
                continue;
            }
            GeoPoint start = new GeoPoint(
                    Double.parseDouble(columns[1]),
                    Double.parseDouble(columns[2])
            );
            GeoPoint end = new GeoPoint(
                    Double.parseDouble(columns[3]),
                    Double.parseDouble(columns[4])
            );
            GeodesicResult result = Geodesic.inverse(start, end);
            DirectResult destination = Geodesic.direct(
                    start,
                    result.initialBearingDegrees(),
                    result.distanceMetres()
            );
            require(
                    Math.abs(
                            destination.destination().latitude()
                                    - end.latitude()
                    ) <= 1e-9,
                    columns[0] + ": direct latitude mismatch"
            );
            require(
                    angularDifference(
                            destination.destination().longitude(),
                            end.longitude()
                    ) <= 1e-9,
                    columns[0] + ": direct longitude mismatch"
            );
        }
    }

    private static void testSubMillimetreGeodesic() {
        GeoPoint start = new GeoPoint(0, 0);
        GeoPoint end = new GeoPoint(0, 1e-9);
        GeodesicResult inverse = Geodesic.inverse(start, end);
        double expected = 6_378_137 * 1e-9 * Math.PI / 180;
        require(
                Math.abs(inverse.distanceMetres() - expected) <= 1e-15,
                "Sub-millimetre inverse precision mismatch."
        );

        DirectResult destination = Geodesic.direct(
                start,
                inverse.initialBearingDegrees(),
                inverse.distanceMetres()
        );
        require(
                Math.abs(destination.destination().latitude()) <= 1e-18,
                "Sub-millimetre direct latitude mismatch."
        );
        require(
                Math.abs(
                        destination.destination().longitude()
                                - end.longitude()
                ) <= 1e-18,
                "Sub-millimetre direct longitude mismatch."
        );
    }

    private static void testCutLocusAmbiguity() {
        GeoPoint start = new GeoPoint(43.139205363724, 0);
        GeoPoint end = new GeoPoint(
                -43.13920536372438,
                179.55910699284908
        );
        GeodesicResult inverse = Geodesic.inverse(start, end);
        DirectResult destination = Geodesic.direct(
                start,
                inverse.initialBearingDegrees(),
                inverse.distanceMetres()
        );

        require(
                inverse.ambiguous(),
                "Near-antipodal route ambiguity must be explicit."
        );
        require(
                Math.abs(
                        destination.destination().latitude()
                                - end.latitude()
                ) <= 1e-12,
                "Ambiguous route latitude closure mismatch."
        );
        require(
                angularDifference(
                        destination.destination().longitude(),
                        end.longitude()
                ) <= 1e-12,
                "Ambiguous route longitude closure mismatch."
        );
    }

    private static void testVincentyCutLocusSensitivity() {
        GeodesicResult result = Geodesic.inverse(
                new GeoPoint(86.890600409059, 0),
                new GeoPoint(
                        -86.89060040905908,
                        179.9671819225338
                )
        );
        require(
                result.solver().equals("vincenty-inverse"),
                "Cut-locus regression must exercise Vincenty inverse."
        );
        require(
                result.ambiguous(),
                "Low bearing sensitivity must be marked ambiguous."
        );
    }

    private static void testPolyline() {
        PolylineMeasurement result = Geodesic.measurePolyline(List.of(
                new GeoPoint(0, 0),
                new GeoPoint(0, 1),
                new GeoPoint(1, 1)
        ));
        require(result.segmentCount() == 2, "Polyline segment count mismatch");
        require(
                Math.abs(result.distanceMetres() - 221893.87935107236)
                        <= 0.001,
                "Polyline distance mismatch"
        );
    }

    private static void testGeodesicPath() {
        GeoPoint start = new GeoPoint(39.933365, 32.859742);
        GeoPoint end = new GeoPoint(41.008238, 28.978359);
        GeodesicPath path = Geodesic.samplePath(
                start,
                end,
                50_000,
                100
        );
        require(path.points().get(0).equals(start), "Path start mismatch.");
        require(
                path.points().get(path.points().size() - 1).equals(end),
                "Path end mismatch."
        );
        require(
                path.points().size() == path.segmentCount() + 1,
                "Path point count mismatch."
        );
        require(
                path.sampledMaximumSegmentMetres() <= 50_000,
                "Path segment target was not respected."
        );

        for (int index = 1; index < path.points().size(); index++) {
            double segment = Geodesic.inverse(
                    path.points().get(index - 1),
                    path.points().get(index)
            ).distanceMetres();
            require(
                    Math.abs(
                            segment - path.sampledMaximumSegmentMetres()
                    ) < 0.001,
                    "Path sampling is not equal-distance."
            );
        }

        GeodesicPath capped = Geodesic.samplePath(
                new GeoPoint(0, 0),
                new GeoPoint(90, 120),
                1_000,
                3
        );
        require(capped.points().size() == 3, "Path cap mismatch.");
        require(
                capped.sampledMaximumSegmentMetres() > 1_000,
                "Path cap must report the effective segment length."
        );

        GeodesicPath identity = Geodesic.samplePath(
                new GeoPoint(90, -135),
                new GeoPoint(90, 77)
        );
        require(identity.distanceMetres() == 0, "Pole identity mismatch.");
        require(
                identity.points().size() == 1
                        && identity.segmentCount() == 0,
                "Zero-length path must contain one marker."
        );
    }

    private static void testPolarGeodesicSemantics() {
        for (double latitude : List.of(-90.0, 90.0)) {
            GeodesicResult result = Geodesic.inverse(
                    new GeoPoint(latitude, -135),
                    new GeoPoint(latitude, 77)
            );
            require(
                    result.distanceMetres() == 0,
                    "A pole must be coincident regardless of longitude."
            );
            require(
                    !result.azimuthDefined()
                            && result.initialBearingDegrees() == null
                            && result.finalBearingDegrees() == null,
                    "A coincident pole must not define an azimuth."
            );
            require(
                    !result.ambiguous()
                            && result.solver().equals("identity"),
                    "A coincident pole must use identity semantics."
            );
        }

        GeodesicResult antipodal = Geodesic.inverse(
                new GeoPoint(90, 10),
                new GeoPoint(-90, 80)
        );
        require(
                Math.abs(
                        antipodal.distanceMetres()
                                - 20_003_931.458625447
                ) <= 0.001,
                "Opposite-pole distance mismatch."
        );
        require(
                antipodal.azimuthDefined()
                        && antipodal.ambiguous()
                        && antipodal.initialBearingDegrees() == 0
                        && antipodal.finalBearingDegrees() == 180,
                "Opposite poles must expose canonical ambiguous azimuths."
        );
    }

    private static double angularDifference(double actual, double expected) {
        double difference = Math.abs(actual - expected) % 360;
        return Math.min(difference, 360 - difference);
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static void requireThrows(Runnable operation, String message) {
        try {
            operation.run();
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError(message);
    }
}
