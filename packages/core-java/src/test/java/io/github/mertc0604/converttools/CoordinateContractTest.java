package io.github.mertc0604.converttools;

import io.github.mertc0604.converttools.coordinates.Coordinates;
import io.github.mertc0604.converttools.coordinates.format.CoordinateAxis;
import io.github.mertc0604.converttools.coordinates.format.DmsFormat;
import io.github.mertc0604.converttools.coordinates.grid.Gars;
import io.github.mertc0604.converttools.coordinates.grid.Georef;
import io.github.mertc0604.converttools.coordinates.grid.Mgrs;
import io.github.mertc0604.converttools.coordinates.model.AngularCell;
import io.github.mertc0604.converttools.coordinates.model.CoordinateFormat;
import io.github.mertc0604.converttools.coordinates.model.CoordinatePoint;
import io.github.mertc0604.converttools.coordinates.model.CoordinateResolution;
import io.github.mertc0604.converttools.coordinates.model.CoordinateResult;
import io.github.mertc0604.converttools.coordinates.model.CoordinateSource;
import io.github.mertc0604.converttools.coordinates.model.CrsTransformation;
import io.github.mertc0604.converttools.coordinates.model.GridCell;
import io.github.mertc0604.converttools.coordinates.model.GridCoordinate;
import io.github.mertc0604.converttools.coordinates.projection.CrsTransformer;
import io.github.mertc0604.converttools.coordinates.projection.UtmUps;
import io.github.mertc0604.converttools.geodesy.GeoPoint;
import io.github.mertc0604.converttools.geodesy.Geodesic;
import io.github.mertc0604.converttools.geodesy.GeodesicResult;

import java.io.IOException;
import java.nio.file.Path;

public final class CoordinateContractTest {
    private static final CoordinatePoint ANKARA =
            new CoordinatePoint(39.933365, 32.859742);

    private CoordinateContractTest() {
    }

    public static void main(String[] args) throws IOException {
        if (args.length > 1) {
            throw new IllegalArgumentException(
                    "Use at most one test-vector directory argument."
            );
        }
        Path vectorDirectory = args.length == 1
                ? Path.of(args[0])
                : Path.of("contracts", "test-vectors");
        testDmsAndDdm();
        testAnkaraUtmRoundTrip();
        testRamadiMgrs();
        testPolarUpsAndMgrs();
        testAntimeridian();
        testGars();
        testGeoref();
        testCrsTransformations();
        testCoordinateFacadeAndResolution();
        testGeodesicAdapter();
        testValidation();
        testGeographicLibBoundaryCases();
        System.out.println("Java coordinate contract tests passed.");
    }

    private static void testDmsAndDdm() {
        CoordinatePoint parsed = DmsFormat.parsePair(
                "39°56'00.114\"N",
                "032°51'35.0712\"E"
        );
        closeTo(parsed.latitude(), ANKARA.latitude(), 1e-12, "DMS latitude");
        closeTo(
                parsed.longitude(),
                ANKARA.longitude(),
                1e-12,
                "DMS longitude"
        );
        require(
                DmsFormat.formatDms(
                        ANKARA.latitude(),
                        CoordinateAxis.LATITUDE,
                        5
                ).equals("39°56'00.11400\"N"),
                "DMS formatting mismatch"
        );
        CoordinatePoint ddm = DmsFormat.parsePair(
                "39°56.0019'N",
                "032°51.58452'E"
        );
        closeTo(ddm.latitude(), ANKARA.latitude(), 1e-12, "DDM latitude");
        closeTo(ddm.longitude(), ANKARA.longitude(), 1e-12, "DDM longitude");
        require(
                DmsFormat.formatDdm(
                        ANKARA.longitude(),
                        CoordinateAxis.LONGITUDE,
                        7
                ).equals("032°51.5845200'E"),
                "DDM formatting mismatch"
        );
        expectFailure(
                () -> DmsFormat.parse(
                        "39d56m00.114s",
                        CoordinateAxis.LATITUDE
                ),
                "Ambiguous lowercase seconds/South marker was accepted"
        );
        expectFailure(
                () -> DmsFormat.parse(
                        "39d56m00.114sN",
                        CoordinateAxis.LATITUDE
                ),
                "Multiple hemisphere markers were accepted"
        );
        closeTo(
                DmsFormat.parse(
                        "39°56'00.114\"S",
                        CoordinateAxis.LATITUDE
                ),
                -ANKARA.latitude(),
                1e-12,
                "Explicit south DMS latitude"
        );
    }

    private static void testAnkaraUtmRoundTrip() {
        GridCoordinate grid = UtmUps.forward(
                ANKARA.latitude(),
                ANKARA.longitude()
        );
        require(grid.zone() == 36, "Ankara must use UTM zone 36");
        require(grid.north(), "Ankara must use the northern hemisphere");
        closeTo(grid.easting(), 488015.98778223846, 0.001, "UTM easting");
        closeTo(grid.northing(), 4420370.843637543, 0.001, "UTM northing");

        CoordinatePoint restored = UtmUps.inverse(
                grid.zone(),
                grid.north(),
                grid.easting(),
                grid.northing()
        );
        closeTo(
                restored.latitude(),
                ANKARA.latitude(),
                1e-10,
                "UTM reverse latitude"
        );
        closeTo(
                restored.longitude(),
                ANKARA.longitude(),
                1e-10,
                "UTM reverse longitude"
        );
        require(
                UtmUps.standardUtmZone(60, 6) == 32,
                "Norway special UTM zone mismatch"
        );
        require(
                UtmUps.standardUtmZone(72, 21) == 35,
                "Svalbard special UTM zone mismatch"
        );
    }

    private static void testRamadiMgrs() {
        CoordinatePoint ramadi = new CoordinatePoint(33.44, 43.27);
        String encoded = Mgrs.encode(ramadi, 5);
        require(
                encoded.equals("38SLC3918701405"),
                "Ramadi MGRS mismatch: " + encoded
        );
        require(
                Mgrs.format(encoded).equals("38 S LC 39187 01405"),
                "Formatted MGRS mismatch"
        );
        GridCell decoded = Mgrs.decode(encoded);
        require(decoded.precision() == 5, "MGRS precision mismatch");
        closeTo(decoded.cellMetres(), 1, 0, "MGRS cell size");
        require(decoded.decodedAtCellCenter(), "MGRS must decode at center");
        require(
                Mgrs.encode(decoded.point(), 5).equals(encoded),
                "MGRS cell did not survive decode/encode"
        );

        for (int precision = 0; precision <= 5; precision++) {
            String cell = Mgrs.encode(ramadi, precision);
            require(
                    Mgrs.encode(Mgrs.decode(cell).point(), precision)
                            .equals(cell),
                    "MGRS round trip mismatch at precision " + precision
            );
        }
    }

    private static void testPolarUpsAndMgrs() {
        for (CoordinatePoint point : new CoordinatePoint[]{
                new CoordinatePoint(85, 0),
                new CoordinatePoint(-85, 30)
        }) {
            GridCoordinate grid = UtmUps.forward(
                    point.latitude(),
                    point.longitude()
            );
            require(grid.zone() == 0, "Polar point must use UPS");
            require(
                    grid.north() == (point.latitude() >= 0),
                    "UPS hemisphere mismatch"
            );
            CoordinatePoint restored = UtmUps.inverse(
                    0,
                    grid.north(),
                    grid.easting(),
                    grid.northing()
            );
            closeTo(
                    restored.latitude(),
                    point.latitude(),
                    1e-10,
                    "UPS reverse latitude"
            );
            closeLongitude(
                    restored.longitude(),
                    point.longitude(),
                    1e-10,
                    "UPS reverse longitude"
            );
            String mgrs = Mgrs.encode(point, 5);
            require(
                    Mgrs.encode(Mgrs.decode(mgrs).point(), 5).equals(mgrs),
                    "Polar MGRS round trip mismatch"
            );
        }
        require(
                Mgrs.encode(new CoordinatePoint(85, 0), 5)
                        .equals("ZAB0000044542"),
                "North polar MGRS parity mismatch"
        );
        require(
                Mgrs.encode(new CoordinatePoint(-85, 30), 5)
                        .equals("BCS7772881040"),
                "South polar MGRS parity mismatch"
        );
    }

    private static void testAntimeridian() {
        require(
                UtmUps.standardUtmZone(0, 180) == 1,
                "+180° must use UTM zone 1 (GeographicLib UTMUPS::StandardZone)"
        );
        require(
                UtmUps.standardUtmZone(0, -180) == 1,
                "-180° must use UTM zone 1"
        );
        for (CoordinatePoint point : new CoordinatePoint[]{
                new CoordinatePoint(0, 180),
                new CoordinatePoint(0, -180),
                new CoordinatePoint(10, 179.999999),
                new CoordinatePoint(10, -179.999999)
        }) {
            GridCoordinate grid = UtmUps.forward(
                    point.latitude(),
                    point.longitude()
            );
            CoordinatePoint restored = UtmUps.inverse(
                    grid.zone(),
                    grid.north(),
                    grid.easting(),
                    grid.northing()
            );
            closeTo(
                    restored.latitude(),
                    point.latitude(),
                    1e-9,
                    "Antimeridian latitude"
            );
            closeLongitude(
                    restored.longitude(),
                    point.longitude(),
                    1e-9,
                    "Antimeridian longitude"
            );
        }
    }

    private static void testGars() {
        CoordinatePoint reference =
                new CoordinatePoint(10.775276, 106.706797);
        String encoded = Gars.encode(reference);
        require(encoded.equals("574JK19"), "GARS reference mismatch");
        AngularCell cell = Gars.decode(encoded);
        closeTo(
                cell.center().latitude(),
                10.791666666666666,
                1e-12,
                "GARS center latitude"
        );
        closeTo(
                cell.center().longitude(),
                106.70833333333333,
                1e-12,
                "GARS center longitude"
        );
        require(
                Gars.encode(cell.center()).equals(encoded),
                "GARS cell did not survive decode/encode"
        );
        require(
                // GeographicLib GARS::Forward: +180° wraps to band 001
                // (contract row edge-90-180-p2).
                Gars.encode(new CoordinatePoint(90, 180))
                        .equals("001QZ11"),
                "GARS northeast boundary mismatch"
        );
        require(
                Gars.encode(new CoordinatePoint(-90, -180))
                        .equals("001AA37"),
                "GARS southwest boundary mismatch"
        );

        for (CoordinatePoint boundary : new CoordinatePoint[]{
                new CoordinatePoint(-90, -180),
                new CoordinatePoint(-90, 180),
                new CoordinatePoint(90, -180),
                new CoordinatePoint(90, 180)
        }) {
            String code = Gars.encode(boundary);
            require(
                    Gars.encode(Gars.decode(code).center()).equals(code),
                    "GARS boundary cell round trip mismatch"
            );
        }
    }

    private static void testGeoref() {
        CoordinatePoint reference =
                new CoordinatePoint(10.775276, 106.706797);
        String encoded = Georef.encode(reference, 4);
        require(
                encoded.equals("VGBL42404651"),
                "GEOREF reference mismatch: " + encoded
        );
        require(
                Georef.encode(Georef.decode(encoded).center(), 4)
                        .equals(encoded),
                "GEOREF cell did not survive decode/encode"
        );
        require(
                Georef.encode(new CoordinatePoint(0, 180), 4)
                        .equals(
                                Georef.encode(
                                        new CoordinatePoint(0, -180),
                                        4
                                )
                        ),
                "GEOREF antimeridian wrap mismatch"
        );
        require(
                Georef.encode(new CoordinatePoint(90, 180), 4)
                        .equals("AMAQ00005999"),
                "GEOREF northeast boundary mismatch"
        );
        require(
                Georef.encode(new CoordinatePoint(-90, -180), 4)
                        .equals("AAAA00000000"),
                "GEOREF southwest boundary mismatch"
        );
        for (CoordinatePoint boundary : new CoordinatePoint[]{
                new CoordinatePoint(-90, -180),
                new CoordinatePoint(90, -180),
                new CoordinatePoint(90, 180)
        }) {
            String code = Georef.encode(boundary, 4);
            require(
                    Georef.encode(Georef.decode(code).center(), 4)
                            .equals(code),
                    "GEOREF boundary cell round trip mismatch"
            );
        }
    }

    private static void testCrsTransformations() {
        CrsTransformation projected = CrsTransformer.transform(
                "EPSG:4326",
                "EPSG:3857",
                ANKARA.longitude(),
                ANKARA.latitude()
        );
        closeTo(
                projected.x(),
                3657929.7470383444,
                1e-6,
                "Web Mercator X"
        );
        closeTo(
                projected.y(),
                4856263.78244475,
                1e-6,
                "Web Mercator Y"
        );
        CrsTransformation restored = CrsTransformer.transform(
                "3857",
                "4326",
                projected.x(),
                projected.y()
        );
        closeLongitude(
                restored.x(),
                ANKARA.longitude(),
                1e-10,
                "Web Mercator reverse longitude"
        );
        closeTo(
                restored.y(),
                ANKARA.latitude(),
                1e-10,
                "Web Mercator reverse latitude"
        );
        double maximumMercatorLatitude = 85.0511287798066;
        for (double longitude : new double[]{-180, 180}) {
            for (double latitude : new double[]{
                    -maximumMercatorLatitude,
                    maximumMercatorLatitude
            }) {
                CrsTransformation boundaryProjected =
                        CrsTransformer.transform(
                                "EPSG:4326",
                                "EPSG:3857",
                                longitude,
                                latitude
                        );
                CrsTransformation boundaryRestored =
                        CrsTransformer.transform(
                                "EPSG:3857",
                                "EPSG:4326",
                                boundaryProjected.x(),
                                boundaryProjected.y()
                        );
                closeLongitude(
                        boundaryRestored.x(),
                        longitude,
                        1e-12,
                        "Web Mercator boundary longitude"
                );
                closeTo(
                        boundaryRestored.y(),
                        latitude,
                        1e-12,
                        "Web Mercator boundary latitude"
                );
            }
        }

        CrsTransformation utm = CrsTransformer.transform(
                "EPSG:4326",
                "EPSG:32636",
                ANKARA.longitude(),
                ANKARA.latitude()
        );
        CrsTransformation utmRestored = CrsTransformer.transform(
                "EPSG:32636",
                "EPSG:4326",
                utm.x(),
                utm.y()
        );
        closeLongitude(
                utmRestored.x(),
                ANKARA.longitude(),
                1e-10,
                "CRS UTM reverse longitude"
        );
        closeTo(
                utmRestored.y(),
                ANKARA.latitude(),
                1e-10,
                "CRS UTM reverse latitude"
        );

        CoordinatePoint pole = new CoordinatePoint(85, 0);
        CrsTransformation ups = CrsTransformer.transform(
                "EPSG:4326",
                "EPSG:5041",
                pole.longitude(),
                pole.latitude()
        );
        CrsTransformation upsRestored = CrsTransformer.transform(
                "EPSG:5041",
                "EPSG:4326",
                ups.x(),
                ups.y()
        );
        closeLongitude(
                upsRestored.x(),
                pole.longitude(),
                1e-10,
                "CRS UPS reverse longitude"
        );
        closeTo(
                upsRestored.y(),
                pole.latitude(),
                1e-10,
                "CRS UPS reverse latitude"
        );
    }

    private static void testCoordinateFacadeAndResolution() {
        CoordinateResult result = Coordinates.results(ANKARA, 5);
        require(
                result.mgrs().equals("36 S VK 88015 20370"),
                "Coordinate facade MGRS mismatch"
        );
        require(
                result.dd().equals("39.9333650000, 32.8597420000"),
                "Coordinate facade DD mismatch"
        );
        require(
                result.utmUps()
                        .equals("36N  488015.988 E  4420370.844 N"),
                "Coordinate facade UTM mismatch"
        );
        CoordinateResolution mgrs =
                result.resolution().get(CoordinateFormat.MGRS);
        require(mgrs != null, "MGRS resolution metadata is missing");
        require(
                mgrs.kind() == CoordinateResolution.Kind.CELL
                        && mgrs.unit()
                        == CoordinateResolution.Unit.METRES
                        && mgrs.decodedAtCellCenter(),
                "MGRS resolution semantics mismatch"
        );
        closeTo(mgrs.step(), 1, 0, "MGRS resolution");

        CoordinateSource mgrsSource =
                Coordinates.fromMgrs("36SVK8801520370");
        require(
                mgrsSource.kind() == CoordinateSource.Kind.CELL,
                "MGRS source must be a cell"
        );
        closeTo(
                mgrsSource.cellMetres(),
                1,
                0,
                "MGRS source resolution"
        );
        CoordinateSource garsSource = Coordinates.fromGars("574JK19");
        require(
                garsSource.kind() == CoordinateSource.Kind.AREA,
                "GARS source must be an area"
        );
        closeTo(
                garsSource.cellDegrees(),
                1.0 / 12,
                0,
                "GARS source resolution"
        );
    }

    private static void testGeodesicAdapter() {
        CoordinateSource ankara = Coordinates.fromMgrs("36SVK8801520370");
        CoordinateSource ramadi = Coordinates.fromMgrs("38SLC3918701405");
        GeoPoint start = Coordinates.toGeoPoint(ankara);
        GeoPoint end = Coordinates.toGeoPoint(ramadi);
        GeodesicResult measured = Geodesic.inverse(start, end);
        require(
                measured.distanceMetres() > 1_000_000
                        && measured.distanceMetres() < 1_300_000,
                "Decoded coordinate sources must be measurable."
        );
        require(
                Coordinates.fromGeoPoint(start).equals(ankara.point()),
                "Coordinate/geodesic point adapter must preserve the point."
        );
    }

    private static void testValidation() {
        expectFailure(
                () -> Mgrs.encode(ANKARA, -1),
                "Negative MGRS precision was accepted"
        );
        expectFailure(
                () -> Mgrs.encode(ANKARA, 6),
                "MGRS precision greater than five was accepted"
        );
        expectFailure(
                () -> Georef.encode(ANKARA, 6),
                "GEOREF precision greater than five was accepted"
        );
        expectFailure(
                () -> CrsTransformer.transform(
                        "EPSG:4326",
                        "EPSG:999999",
                        0,
                        0
                ),
                "Unsupported EPSG code was accepted"
        );
        expectFailure(
                () -> DmsFormat.parse(
                        "39°N",
                        CoordinateAxis.LONGITUDE
                ),
                "Latitude hemisphere was accepted for longitude"
        );
    }

    /** Same boundary cases as the JavaScript coordinate-engine tests. */
    private static void testGeographicLibBoundaryCases() {
        // Longitude +180° belongs to zone 1 in the standard zone; GARS wraps.
        require(UtmUps.forward(0, 180).zone() == 1, "+180° UTM zone");
        require(UtmUps.forward(0, 179.999999999).zone() == 60, "179.999…° zone");
        require(Mgrs.encode(0, 180, 0).equals("01NAA"), "+180° MGRS square");
        require(
                Gars.encode(180, 0).equals(Gars.encode(-180, 0)),
                "GARS ±180° must share a band"
        );

        // Two-digit zone (GeoConvert -m -p -5); one-digit input still decodes.
        require(Mgrs.encode(-37.25, -177, 0).equals("01HEU"), "two-digit zone");
        GridCell padded = Mgrs.decode("01HEU");
        GridCell bare = Mgrs.decode("1HEU");
        require(
                padded.point().equals(bare.point()),
                "01HEU and 1HEU must decode to the same square"
        );

        // Squares GeoConvert rejects for their latitude band.
        for (String code : new String[]{"32NQQ7070975688", "26PJD", "54JSV20"}) {
            expectFailureMessage(
                    () -> Mgrs.decode(code),
                    "not in its zone and latitude band",
                    code + " was accepted"
            );
        }
        Mgrs.decode("57CTL19");

        // UPS at the 60° boundary survives its own round trip; beyond it fails.
        for (double[] point : new double[][]{{60, 45}, {-60, -135}, {60, 180}}) {
            String target = point[0] > 0 ? "EPSG:5041" : "EPSG:5042";
            CrsTransformation grid = CrsTransformer.transform(
                    "EPSG:4326", target, point[1], point[0]
            );
            CrsTransformation back = CrsTransformer.transform(
                    target, "EPSG:4326", grid.x(), grid.y()
            );
            closeTo(back.y(), point[0], 1e-12, "UPS boundary latitude");
            closeTo(back.x(), point[1], 1e-12, "UPS boundary longitude");
        }
        expectFailureMessage(
                () -> CrsTransformer.transform(
                        "EPSG:5041", "EPSG:4326", 5500000, 2000000
                ),
                "outside the supported range",
                "UPS point beyond 60° was accepted"
        );

        // sin(-180°) is exactly zero: the point is on the east/west split.
        require(Mgrs.encode(-80.5, -180, 0).equals("BAB"), "UPS antimeridian band");
        require(
                UtmUps.forward(-85, -180).easting() == 2000000,
                "UPS antimeridian easting"
        );

        // GEOREF: 1e-12° below the 1' line is still minute 00
        // (GeographicLib Georef::Forward, contract rows cell-1m-*-p2).
        require(
                Georef.encode(32.016666666665664, 39.016666666665664, 2)
                        .equals("QJCK0000"),
                "GEOREF just below a minute line"
        );
        require(
                Georef.encode(32.016666666666666, 39.016666666666666, 2)
                        .equals("QJCK0101"),
                "GEOREF on a minute line"
        );
        require(
                Georef.encode(-32.016666666667668, -39.016666666667668, 2)
                        .equals("KDNF5858"),
                "GEOREF just below a minute line, south-west"
        );

        // By definition the central meridian at the equator is (500 000, 0) in
        // the northern CRS and (500 000, 10 000 000) in the southern CRS.
        CrsTransformation south = CrsTransformer.transform(
                "EPSG:4326", "EPSG:32735", 27, 0
        );
        require(
                south.x() == 500000 && south.y() == 10000000,
                "southern UTM CRS at the equator: " + south.x() + ", " + south.y()
        );
        CrsTransformation north = CrsTransformer.transform(
                "EPSG:4326", "EPSG:32635", 27, 0
        );
        require(
                north.x() == 500000 && north.y() == 0,
                "northern UTM CRS at the equator"
        );
        CrsTransformation back = CrsTransformer.transform(
                "EPSG:32735", "EPSG:4326", 500000, 10000000
        );
        require(
                back.x() == 27 && Math.abs(back.y()) == 0,
                "southern UTM CRS equator inverse"
        );
    }

    private static void expectFailureMessage(
            Runnable operation,
            String fragment,
            String message
    ) {
        try {
            operation.run();
        } catch (IllegalArgumentException expected) {
            if (expected.getMessage() == null
                    || !expected.getMessage().contains(fragment)) {
                throw new AssertionError(
                        message + ": unexpected message " + expected.getMessage()
                );
            }
            return;
        }
        throw new AssertionError(message);
    }

    private static void closeLongitude(
            double actual,
            double expected,
            double tolerance,
            String message
    ) {
        double difference = Math.abs(actual - expected) % 360;
        closeTo(
                Math.min(difference, 360 - difference),
                0,
                tolerance,
                message
        );
    }

    private static void closeTo(
            double actual,
            double expected,
            double tolerance,
            String message
    ) {
        if (Math.abs(actual - expected) > tolerance) {
            throw new AssertionError(
                    message + ": " + actual + " != " + expected
            );
        }
    }

    private static void expectFailure(
            Runnable operation,
            String message
    ) {
        try {
            operation.run();
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError(message);
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }
}
