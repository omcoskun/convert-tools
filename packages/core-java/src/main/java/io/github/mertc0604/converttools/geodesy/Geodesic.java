package io.github.mertc0604.converttools.geodesy;

import io.github.mertc0604.converttools.ConvertToolsException;
import io.github.mertc0604.converttools.ErrorCode;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class Geodesic {
    private static final double DEGREE = Math.PI / 180;
    private static final double RADIAN = 180 / Math.PI;
    private static final double TOLERANCE = 1e-13;
    private static final int MAX_ITERATIONS = 200;
    private static final double SHOOTING_TOLERANCE = 2e-15;
    private static final double INVERSE_ENDPOINT_TOLERANCE = 5e-12;
    // Truncated-series noise cannot rank cut-locus routes below 0.1 mm.
    private static final double SHORTEST_DISTANCE_TIE_METRES = 1e-4;
    private static final double AMBIGUOUS_BEARING_SEPARATION_RADIANS = 1e-6;
    private static final double CUT_LOCUS_DERIVATIVE_STEP_RADIANS = 1e-5;
    private static final double CUT_LOCUS_SENSITIVITY_METRES = 1;
    private static final double MAX_DISTANCE_FACTOR = Math.PI * 1.01;
    private static final double DEFAULT_PATH_SEGMENT_METRES = 25_000;
    private static final int DEFAULT_PATH_MAX_POINTS = 2_049;
    private static final int PATH_MAX_POINTS_LIMIT = 10_001;

    private Geodesic() {
    }

    public static GeodesicResult inverse(GeoPoint start, GeoPoint end) {
        return inverse(start, end, Ellipsoid.WGS84);
    }

    public static GeodesicResult inverse(
            GeoPoint start,
            GeoPoint end,
            Ellipsoid ellipsoid
    ) {
        Objects.requireNonNull(start, "start");
        Objects.requireNonNull(end, "end");
        Objects.requireNonNull(ellipsoid, "ellipsoid");

        if (coincident(start, end)) {
            return new GeodesicResult(
                    0,
                    null,
                    null,
                    false,
                    false,
                    ellipsoid.id(),
                    "ellipsoidal",
                    "identity",
                    0
            );
        }

        RawInverse vincentyCandidate = inverseVincenty(
                start,
                end,
                ellipsoid
        );
        RawInverse vincenty = validatedVincentyInverse(
                start,
                end,
                vincentyCandidate,
                ellipsoid
        );
        boolean fallback = vincenty == null;
        RawInverse result = fallback
                ? inverseByShooting(start, end, ellipsoid)
                : vincenty;
        boolean antipodal = exactAntipodes(start, end);
        boolean ambiguous = antipodal
                || result.ambiguous()
                || cutLocusAmbiguous(start, end, result, ellipsoid);

        return new GeodesicResult(
                result.distanceMetres(),
                antipodal ? 0.0 : result.initialBearingDegrees(),
                antipodal ? 180.0 : result.finalBearingDegrees(),
                true,
                ambiguous,
                ellipsoid.id(),
                "ellipsoidal",
                fallback
                        ? "vincenty-direct-shooting"
                        : "vincenty-inverse",
                result.iterations()
        );
    }

    public static DirectResult direct(
            GeoPoint start,
            double initialBearingDegrees,
            double distanceMetres
    ) {
        return direct(
                start,
                initialBearingDegrees,
                distanceMetres,
                Ellipsoid.WGS84
        );
    }

    public static DirectResult direct(
            GeoPoint start,
            double initialBearingDegrees,
            double distanceMetres,
            Ellipsoid ellipsoid
    ) {
        Objects.requireNonNull(start, "start");
        Objects.requireNonNull(ellipsoid, "ellipsoid");
        if (!Double.isFinite(initialBearingDegrees)) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "initialBearingDegrees must be finite."
            );
        }
        if (!Double.isFinite(distanceMetres) || distanceMetres < 0) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "distanceMetres must be finite and non-negative."
            );
        }

        if (distanceMetres == 0) {
            return new DirectResult(
                    start,
                    normalizeBearing(initialBearingDegrees),
                    ellipsoid.id(),
                    "vincenty-direct",
                    0
            );
        }

        RawDirect result = directRaw(
                start,
                normalizeBearing(initialBearingDegrees) * DEGREE,
                distanceMetres,
                ellipsoid
        );
        return new DirectResult(
                new GeoPoint(
                        result.latitudeRadians() * RADIAN,
                        GeoPoint.normalizeLongitude(
                                result.longitudeRadians() * RADIAN
                        )
                ),
                normalizeBearing(result.finalBearingRadians() * RADIAN),
                ellipsoid.id(),
                "vincenty-direct",
                result.iterations()
        );
    }

    public static PolylineMeasurement measurePolyline(List<GeoPoint> points) {
        return measurePolyline(points, Ellipsoid.WGS84);
    }

    public static PolylineMeasurement measurePolyline(
            List<GeoPoint> points,
            Ellipsoid ellipsoid
    ) {
        Objects.requireNonNull(points, "points");
        Objects.requireNonNull(ellipsoid, "ellipsoid");
        if (points.size() < 2) {
            return new PolylineMeasurement(
                    0,
                    0,
                    ellipsoid.id(),
                    "ellipsoidal-segments",
                    List.of()
            );
        }

        List<GeodesicResult> segments = new ArrayList<>();
        double sum = 0;
        double compensation = 0;
        for (int index = 1; index < points.size(); index++) {
            GeodesicResult segment = inverse(
                    points.get(index - 1),
                    points.get(index),
                    ellipsoid
            );
            segments.add(segment);
            double value = segment.distanceMetres();
            double next = sum + value;
            compensation += Math.abs(sum) >= Math.abs(value)
                    ? sum - next + value
                    : value - next + sum;
            sum = next;
        }

        return new PolylineMeasurement(
                sum + compensation,
                segments.size(),
                ellipsoid.id(),
                "ellipsoidal-segments",
                segments
        );
    }

    public static GeodesicPath samplePath(GeoPoint start, GeoPoint end) {
        return samplePath(
                start,
                end,
                DEFAULT_PATH_SEGMENT_METRES,
                DEFAULT_PATH_MAX_POINTS,
                Ellipsoid.WGS84
        );
    }

    public static GeodesicPath samplePath(
            GeoPoint start,
            GeoPoint end,
            double maxSegmentMetres,
            int maxPoints
    ) {
        return samplePath(
                start,
                end,
                maxSegmentMetres,
                maxPoints,
                Ellipsoid.WGS84
        );
    }

    public static GeodesicPath samplePath(
            GeoPoint start,
            GeoPoint end,
            double maxSegmentMetres,
            int maxPoints,
            Ellipsoid ellipsoid
    ) {
        Objects.requireNonNull(start, "start");
        Objects.requireNonNull(end, "end");
        Objects.requireNonNull(ellipsoid, "ellipsoid");
        if (!Double.isFinite(maxSegmentMetres) || maxSegmentMetres <= 0) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "maxSegmentMetres must be finite and greater than zero."
            );
        }
        if (maxPoints < 2 || maxPoints > PATH_MAX_POINTS_LIMIT) {
            throw new ConvertToolsException(ErrorCode.INVALID_ARGUMENT,
                    "maxPoints must be between 2 and "
                            + PATH_MAX_POINTS_LIMIT
                            + "."
            );
        }

        GeodesicResult measurement = inverse(start, end, ellipsoid);
        if (measurement.distanceMetres() == 0) {
            return GeodesicPath.from(
                    measurement,
                    List.of(start),
                    0,
                    0
            );
        }

        long requestedSegments = Math.max(
                1,
                (long) Math.ceil(
                        measurement.distanceMetres() / maxSegmentMetres
                )
        );
        int segmentCount = (int) Math.min(
                requestedSegments,
                (long) maxPoints - 1
        );
        List<GeoPoint> points = new ArrayList<>(segmentCount + 1);
        points.add(start);
        for (int index = 1; index < segmentCount; index++) {
            points.add(direct(
                    start,
                    measurement.initialBearingDegrees(),
                    measurement.distanceMetres() * index / segmentCount,
                    ellipsoid
            ).destination());
        }
        points.add(end);

        return GeodesicPath.from(
                measurement,
                points,
                segmentCount,
                measurement.distanceMetres() / segmentCount
        );
    }

    private static RawInverse inverseVincenty(
            GeoPoint start,
            GeoPoint end,
            Ellipsoid ellipsoid
    ) {
        double a = ellipsoid.semiMajorAxisMetres();
        double b = ellipsoid.semiMinorAxisMetres();
        double f = ellipsoid.flattening();
        double latitude1 = start.latitude() * DEGREE;
        double latitude2 = end.latitude() * DEGREE;
        double longitudeDifference = GeoPoint.normalizeLongitude(
                end.longitude() - start.longitude()
        ) * DEGREE;
        double reducedLatitude1 = Math.atan((1 - f) * Math.tan(latitude1));
        double reducedLatitude2 = Math.atan((1 - f) * Math.tan(latitude2));
        double sinReduced1 = Math.sin(reducedLatitude1);
        double cosReduced1 = Math.cos(reducedLatitude1);
        double sinReduced2 = Math.sin(reducedLatitude2);
        double cosReduced2 = Math.cos(reducedLatitude2);
        double lambda = longitudeDifference;
        double sinSigma = 0;
        double cosSigma = 0;
        double sigma = 0;
        double sinAlpha = 0;
        double cosSquaredAlpha = 0;
        double cosDoubleSigmaMiddle = 0;
        int iterations;

        for (iterations = 0; iterations < MAX_ITERATIONS; iterations++) {
            double sinLambda = Math.sin(lambda);
            double cosLambda = Math.cos(lambda);
            double first = cosReduced2 * sinLambda;
            double second = cosReduced1 * sinReduced2
                    - sinReduced1 * cosReduced2 * cosLambda;
            sinSigma = Math.hypot(first, second);
            if (sinSigma == 0) {
                return null;
            }

            cosSigma = sinReduced1 * sinReduced2
                    + cosReduced1 * cosReduced2 * cosLambda;
            sigma = Math.atan2(sinSigma, cosSigma);
            sinAlpha = cosReduced1 * cosReduced2 * sinLambda / sinSigma;
            cosSquaredAlpha = Math.max(0, 1 - sinAlpha * sinAlpha);
            cosDoubleSigmaMiddle = cosSquaredAlpha <= Math.ulp(1.0)
                    ? 0
                    : cosSigma
                    - 2 * sinReduced1 * sinReduced2 / cosSquaredAlpha;
            double coefficient = f / 16
                    * cosSquaredAlpha
                    * (4 + f * (4 - 3 * cosSquaredAlpha));
            double nextLambda = longitudeDifference
                    + (1 - coefficient)
                    * f
                    * sinAlpha
                    * (
                    sigma
                            + coefficient
                            * sinSigma
                            * (
                            cosDoubleSigmaMiddle
                                    + coefficient
                                    * cosSigma
                                    * (
                                    -1
                                            + 2
                                            * cosDoubleSigmaMiddle
                                            * cosDoubleSigmaMiddle
                            )
                    )
            );
            if (convergedRadians(lambda, nextLambda, TOLERANCE)) {
                lambda = nextLambda;
                break;
            }
            lambda = nextLambda;
        }

        if (iterations >= MAX_ITERATIONS) {
            return null;
        }

        double squaredU = cosSquaredAlpha * (a * a - b * b) / (b * b);
        double coefficientA = 1
                + squaredU
                / 16384
                * (
                4096
                        + squaredU
                        * (-768 + squaredU * (320 - 175 * squaredU))
        );
        double coefficientB = squaredU
                / 1024
                * (
                256
                        + squaredU
                        * (-128 + squaredU * (74 - 47 * squaredU))
        );
        double deltaSigma = coefficientB
                * sinSigma
                * (
                cosDoubleSigmaMiddle
                        + coefficientB
                        / 4
                        * (
                        cosSigma
                                * (
                                -1
                                        + 2
                                        * cosDoubleSigmaMiddle
                                        * cosDoubleSigmaMiddle
                        )
                                - coefficientB
                                / 6
                                * cosDoubleSigmaMiddle
                                * (-3 + 4 * sinSigma * sinSigma)
                                * (
                                -3
                                        + 4
                                        * cosDoubleSigmaMiddle
                                        * cosDoubleSigmaMiddle
                        )
                )
        );
        double sinLambda = Math.sin(lambda);
        double cosLambda = Math.cos(lambda);
        double initialBearing = Math.atan2(
                cosReduced2 * sinLambda,
                cosReduced1 * sinReduced2
                        - sinReduced1 * cosReduced2 * cosLambda
        );
        double finalBearing = Math.atan2(
                cosReduced1 * sinLambda,
                -sinReduced1 * cosReduced2
                        + cosReduced1 * sinReduced2 * cosLambda
        );
        return new RawInverse(
                b * coefficientA * (sigma - deltaSigma),
                normalizeBearing(initialBearing * RADIAN),
                normalizeBearing(finalBearing * RADIAN),
                false,
                iterations + 1
        );
    }

    private static RawDirect directRaw(
            GeoPoint start,
            double initialBearingRadians,
            double distanceMetres,
            Ellipsoid ellipsoid
    ) {
        double a = ellipsoid.semiMajorAxisMetres();
        double b = ellipsoid.semiMinorAxisMetres();
        double f = ellipsoid.flattening();
        double latitude1 = start.latitude() * DEGREE;
        double longitude1 = start.longitude() * DEGREE;
        double reducedLatitude1 = Math.atan((1 - f) * Math.tan(latitude1));
        double sinReduced1 = Math.sin(reducedLatitude1);
        double cosReduced1 = Math.cos(reducedLatitude1);
        double sinBearing = Math.sin(initialBearingRadians);
        double cosBearing = Math.cos(initialBearingRadians);
        double sigma1 = Math.atan2(
                Math.tan(reducedLatitude1),
                cosBearing
        );
        double sinAlpha = cosReduced1 * sinBearing;
        double cosSquaredAlpha = Math.max(0, 1 - sinAlpha * sinAlpha);
        double squaredU = cosSquaredAlpha * (a * a - b * b) / (b * b);
        double coefficientA = 1
                + squaredU
                / 16384
                * (
                4096
                        + squaredU
                        * (-768 + squaredU * (320 - 175 * squaredU))
        );
        double coefficientB = squaredU
                / 1024
                * (
                256
                        + squaredU
                        * (-128 + squaredU * (74 - 47 * squaredU))
        );
        double sigma = distanceMetres / (b * coefficientA);
        double sinSigma = 0;
        double cosSigma = 1;
        double cosDoubleSigmaMiddle = 0;
        int iterations;

        for (iterations = 0; iterations < MAX_ITERATIONS; iterations++) {
            cosDoubleSigmaMiddle = Math.cos(2 * sigma1 + sigma);
            sinSigma = Math.sin(sigma);
            cosSigma = Math.cos(sigma);
            double deltaSigma = coefficientB
                    * sinSigma
                    * (
                    cosDoubleSigmaMiddle
                            + coefficientB
                            / 4
                            * (
                            cosSigma
                                    * (
                                    -1
                                            + 2
                                            * cosDoubleSigmaMiddle
                                            * cosDoubleSigmaMiddle
                            )
                                    - coefficientB
                                    / 6
                                    * cosDoubleSigmaMiddle
                                    * (-3 + 4 * sinSigma * sinSigma)
                                    * (
                                    -3
                                            + 4
                                            * cosDoubleSigmaMiddle
                                            * cosDoubleSigmaMiddle
                            )
                    )
            );
            double previous = sigma;
            sigma = distanceMetres / (b * coefficientA) + deltaSigma;
            if (convergedRadians(previous, sigma, TOLERANCE)) {
                break;
            }
        }
        if (iterations >= MAX_ITERATIONS) {
            throw new ConvertToolsException(ErrorCode.NO_CONVERGENCE,
                    "Direct geodesic calculation did not converge."
            );
        }

        sinSigma = Math.sin(sigma);
        cosSigma = Math.cos(sigma);
        cosDoubleSigmaMiddle = Math.cos(2 * sigma1 + sigma);
        double temporary = sinReduced1 * sinSigma
                - cosReduced1 * cosSigma * cosBearing;
        double latitude2 = Math.atan2(
                sinReduced1 * cosSigma
                        + cosReduced1 * sinSigma * cosBearing,
                (1 - f) * Math.hypot(sinAlpha, temporary)
        );
        double lambda = Math.atan2(
                sinSigma * sinBearing,
                cosReduced1 * cosSigma
                        - sinReduced1 * sinSigma * cosBearing
        );
        double coefficient = f
                / 16
                * cosSquaredAlpha
                * (4 + f * (4 - 3 * cosSquaredAlpha));
        double longitudeCorrection = lambda
                - (1 - coefficient)
                * f
                * sinAlpha
                * (
                sigma
                        + coefficient
                        * sinSigma
                        * (
                        cosDoubleSigmaMiddle
                                + coefficient
                                * cosSigma
                                * (
                                -1
                                        + 2
                                        * cosDoubleSigmaMiddle
                                        * cosDoubleSigmaMiddle
                        )
                )
        );
        double longitude2 = normalizeRadians(
                longitude1 + longitudeCorrection
        );
        double finalBearing = Math.atan2(sinAlpha, -temporary);
        return new RawDirect(
                latitude2,
                longitude2,
                finalBearing,
                iterations + 1
        );
    }

    private static RawInverse inverseByShooting(
            GeoPoint start,
            GeoPoint end,
            Ellipsoid ellipsoid
    ) {
        double targetLatitude = end.latitude() * DEGREE;
        double targetLongitude = end.longitude() * DEGREE;
        SphericalSeed seed = sphericalSeed(start, end, ellipsoid);
        List<Double> bearings = new ArrayList<>();
        bearings.add(seed.bearing());
        boolean nearAntipodal = Math.PI - seed.centralAngle() < 0.15;
        if (nearAntipodal) {
            for (int degree = -180; degree < 180; degree += 15) {
                bearings.add(degree * DEGREE);
            }
            for (double offsetDegrees : List.of(0.01, 0.1, 1.0)) {
                double offset = offsetDegrees * DEGREE;
                bearings.add(seed.bearing() - offset);
                bearings.add(seed.bearing() + offset);
            }
        } else {
            bearings.add(seed.bearing() - Math.PI / 3);
            bearings.add(seed.bearing() + Math.PI / 3);
        }

        List<Double> distances = new ArrayList<>();
        distances.add(seed.scaledDistance());
        distances.add(
                seed.centralAngle()
                        * ellipsoid.semiMinorAxisMetres()
                        / ellipsoid.semiMajorAxisMetres()
        );
        if (nearAntipodal) {
            distances.add(
                    Math.PI
                            * ellipsoid.semiMinorAxisMetres()
                            / ellipsoid.semiMajorAxisMetres()
            );
            distances.add(
                    Math.PI
                            * (
                            ellipsoid.semiMajorAxisMetres()
                                    + ellipsoid.semiMinorAxisMetres()
                    )
                            / (
                            2
                                    * ellipsoid.semiMajorAxisMetres()
                    )
            );
        }

        List<ShootingResult> candidates = new ArrayList<>();
        ShootingResult best = null;
        for (double bearing : bearings) {
            for (double distance : distances) {
                ShootingResult candidate = solveShootingSeed(
                        start,
                        targetLatitude,
                        targetLongitude,
                        ellipsoid,
                        bearing,
                        distance
                );
                if (
                        candidate != null
                                && candidate.residual()
                                <= INVERSE_ENDPOINT_TOLERANCE
                ) {
                    candidates.add(candidate);
                    if (
                            best == null
                                    || preferShootingCandidate(
                                    candidate,
                                    best,
                                    start,
                                    end
                            )
                    ) {
                        best = candidate;
                    }
                }
            }
        }
        if (best == null) {
            throw new ConvertToolsException(ErrorCode.NO_CONVERGENCE,
                    "Ellipsoidal inverse calculation did not converge."
            );
        }

        ShootingResult canonicalVertex = canonicalVertexCandidate(
                start,
                end,
                ellipsoid,
                best
        );
        if (canonicalVertex != null) {
            candidates.add(canonicalVertex);
            best = canonicalVertex;
        }

        ShootingResult selected = best;
        boolean ambiguous = nearAntipodal
                && candidates.stream().anyMatch(
                candidate -> Math.abs(
                        candidate.distanceMetres()
                                - selected.distanceMetres()
                ) <= SHORTEST_DISTANCE_TIE_METRES
                        && Math.abs(
                        normalizeRadians(
                                candidate.bearing()
                                        - selected.bearing()
                        )
                ) > AMBIGUOUS_BEARING_SEPARATION_RADIANS
        );

        return new RawInverse(
                best.distanceMetres(),
                normalizeBearing(best.bearing() * RADIAN),
                normalizeBearing(
                        best.endpoint().finalBearingRadians() * RADIAN
                ),
                ambiguous,
                best.iterations()
        );
    }

    private static ShootingResult canonicalVertexCandidate(
            GeoPoint start,
            GeoPoint end,
            Ellipsoid ellipsoid,
            ShootingResult current
    ) {
        if (end.latitude() != -start.latitude()) {
            return null;
        }

        double longitudeDifference = GeoPoint.normalizeLongitude(
                end.longitude() - start.longitude()
        );
        double bearing = (longitudeDifference < 0 ? 270 : 90) * DEGREE;
        RawDirect endpoint = directRaw(
                start,
                bearing,
                current.distanceMetres(),
                ellipsoid
        );
        double residual = endpointResidual(
                endpoint,
                end.latitude() * DEGREE,
                end.longitude() * DEGREE
        ).norm();
        if (residual > INVERSE_ENDPOINT_TOLERANCE) {
            return null;
        }

        return new ShootingResult(
                endpoint,
                bearing,
                current.distanceMetres(),
                residual,
                current.iterations()
        );
    }

    private static boolean preferShootingCandidate(
            ShootingResult candidate,
            ShootingResult current,
            GeoPoint start,
            GeoPoint end
    ) {
        double distanceDifference = candidate.distanceMetres()
                - current.distanceMetres();
        if (
                Math.abs(distanceDifference)
                        > SHORTEST_DISTANCE_TIE_METRES
        ) {
            return distanceDifference < 0;
        }

        double latitudeBalance = start.latitude() + end.latitude();
        double preferredLatitude = latitudeBalance == 0
                ? start.latitude()
                : latitudeBalance;
        if (preferredLatitude != 0) {
            double preferredNorthingSign = Math.signum(preferredLatitude);
            boolean candidateMatches = Math.signum(
                    Math.cos(candidate.bearing())
            ) == preferredNorthingSign;
            boolean currentMatches = Math.signum(
                    Math.cos(current.bearing())
            ) == preferredNorthingSign;
            if (candidateMatches != currentMatches) {
                return candidateMatches;
            }
        } else {
            double candidateCardinalOffset = Math.abs(
                    Math.cos(candidate.bearing())
            );
            double currentCardinalOffset = Math.abs(
                    Math.cos(current.bearing())
            );
            if (candidateCardinalOffset != currentCardinalOffset) {
                return candidateCardinalOffset < currentCardinalOffset;
            }
        }

        if (distanceDifference != 0) {
            return distanceDifference < 0;
        }
        return candidate.residual() < current.residual();
    }

    private static boolean cutLocusAmbiguous(
            GeoPoint start,
            GeoPoint end,
            RawInverse result,
            Ellipsoid ellipsoid
    ) {
        SphericalSeed seed = sphericalSeed(start, end, ellipsoid);
        if (Math.PI - seed.centralAngle() >= 0.15) {
            return false;
        }

        double bearing = result.initialBearingDegrees() * DEGREE;
        RawDirect plus = directRaw(
                start,
                bearing + CUT_LOCUS_DERIVATIVE_STEP_RADIANS,
                result.distanceMetres(),
                ellipsoid
        );
        RawDirect minus = directRaw(
                start,
                bearing - CUT_LOCUS_DERIVATIVE_STEP_RADIANS,
                result.distanceMetres(),
                ellipsoid
        );
        double endpointSeparation = endpointResidual(
                plus,
                minus.latitudeRadians(),
                minus.longitudeRadians()
        ).norm();
        double bearingSensitivityMetres = endpointSeparation
                * ellipsoid.semiMajorAxisMetres()
                / (2 * CUT_LOCUS_DERIVATIVE_STEP_RADIANS);
        return bearingSensitivityMetres <= CUT_LOCUS_SENSITIVITY_METRES;
    }

    private static ShootingResult solveShootingSeed(
            GeoPoint start,
            double targetLatitude,
            double targetLongitude,
            Ellipsoid ellipsoid,
            double initialBearing,
            double initialScaledDistance
    ) {
        double bearing = normalizeRadians(initialBearing);
        double scaledDistance = clamp(
                initialScaledDistance,
                0,
                MAX_DISTANCE_FACTOR
        );
        RawDirect endpoint = directRaw(
                start,
                bearing,
                scaledDistance * ellipsoid.semiMajorAxisMetres(),
                ellipsoid
        );
        Residual residual = endpointResidual(
                endpoint,
                targetLatitude,
                targetLongitude
        );
        double norm = residual.norm();
        double derivativeStep = 2e-6;

        for (int iteration = 0; iteration < 60; iteration++) {
            if (norm <= SHOOTING_TOLERANCE) {
                return new ShootingResult(
                        endpoint,
                        bearing,
                        scaledDistance * ellipsoid.semiMajorAxisMetres(),
                        norm,
                        iteration + 1
                );
            }

            RawDirect bearingPlus = directRaw(
                    start,
                    bearing + derivativeStep,
                    scaledDistance * ellipsoid.semiMajorAxisMetres(),
                    ellipsoid
            );
            RawDirect bearingMinus = directRaw(
                    start,
                    bearing - derivativeStep,
                    scaledDistance * ellipsoid.semiMajorAxisMetres(),
                    ellipsoid
            );
            RawDirect distancePlus = directRaw(
                    start,
                    bearing,
                    (scaledDistance + derivativeStep)
                            * ellipsoid.semiMajorAxisMetres(),
                    ellipsoid
            );
            RawDirect distanceMinus = directRaw(
                    start,
                    bearing,
                    Math.max(0, scaledDistance - derivativeStep)
                            * ellipsoid.semiMajorAxisMetres(),
                    ellipsoid
            );
            Residual rbp = endpointResidual(
                    bearingPlus,
                    targetLatitude,
                    targetLongitude
            );
            Residual rbm = endpointResidual(
                    bearingMinus,
                    targetLatitude,
                    targetLongitude
            );
            Residual rdp = endpointResidual(
                    distancePlus,
                    targetLatitude,
                    targetLongitude
            );
            Residual rdm = endpointResidual(
                    distanceMinus,
                    targetLatitude,
                    targetLongitude
            );
            double distanceDenominator = scaledDistance < derivativeStep
                    ? scaledDistance + derivativeStep
                    : 2 * derivativeStep;
            double j00 = (rbp.east() - rbm.east()) / (2 * derivativeStep);
            double j10 = (rbp.north() - rbm.north()) / (2 * derivativeStep);
            double j01 = (rdp.east() - rdm.east()) / distanceDenominator;
            double j11 = (rdp.north() - rdm.north()) / distanceDenominator;
            double determinant = j00 * j11 - j01 * j10;
            if (
                    !Double.isFinite(determinant)
                            || Math.abs(determinant) < 1e-15
            ) {
                break;
            }

            double bearingStep = (
                    -residual.east() * j11
                            + j01 * residual.north()
            ) / determinant;
            double distanceStep = (
                    -j00 * residual.north()
                            + residual.east() * j10
            ) / determinant;
            bearingStep = clamp(bearingStep, -0.75, 0.75);
            distanceStep = clamp(distanceStep, -0.75, 0.75);
            boolean accepted = false;

            for (
                    double damping = 1;
                    damping >= 1.0 / 1024;
                    damping /= 2
            ) {
                double candidateBearing = normalizeRadians(
                        bearing + bearingStep * damping
                );
                double candidateDistance = clamp(
                        scaledDistance + distanceStep * damping,
                        0,
                        MAX_DISTANCE_FACTOR
                );
                RawDirect candidateEndpoint = directRaw(
                        start,
                        candidateBearing,
                        candidateDistance * ellipsoid.semiMajorAxisMetres(),
                        ellipsoid
                );
                Residual candidateResidual = endpointResidual(
                        candidateEndpoint,
                        targetLatitude,
                        targetLongitude
                );
                double candidateNorm = candidateResidual.norm();
                if (candidateNorm < norm) {
                    bearing = candidateBearing;
                    scaledDistance = candidateDistance;
                    endpoint = candidateEndpoint;
                    residual = candidateResidual;
                    norm = candidateNorm;
                    accepted = true;
                    break;
                }
            }
            if (!accepted) {
                break;
            }
        }
        return null;
    }

    private static Residual endpointResidual(
            RawDirect endpoint,
            double targetLatitude,
            double targetLongitude
    ) {
        double latitude = endpoint.latitudeRadians();
        double longitudeDifference = normalizeRadians(
                endpoint.longitudeRadians() - targetLongitude
        );
        double sinLatitude = Math.sin(latitude);
        double cosLatitude = Math.cos(latitude);
        double sinTarget = Math.sin(targetLatitude);
        double cosTarget = Math.cos(targetLatitude);
        return new Residual(
                cosLatitude * Math.sin(longitudeDifference),
                sinLatitude * cosTarget
                        - cosLatitude
                        * sinTarget
                        * Math.cos(longitudeDifference)
        );
    }

    private static boolean inverseEndpointMatches(
            GeoPoint start,
            GeoPoint end,
            RawInverse result,
            Ellipsoid ellipsoid
    ) {
        RawDirect endpoint = directRaw(
                start,
                result.initialBearingDegrees() * DEGREE,
                result.distanceMetres(),
                ellipsoid
        );
        Residual residual = endpointResidual(
                endpoint,
                end.latitude() * DEGREE,
                end.longitude() * DEGREE
        );
        return residual.norm() <= INVERSE_ENDPOINT_TOLERANCE;
    }

    private static RawInverse validatedVincentyInverse(
            GeoPoint start,
            GeoPoint end,
            RawInverse candidate,
            Ellipsoid ellipsoid
    ) {
        if (candidate == null) {
            return null;
        }
        if (inverseEndpointMatches(start, end, candidate, ellipsoid)) {
            return candidate;
        }

        // Vincenty's fixed point can select the conjugate 90/270 branch.
        // The alternate is accepted only after direct endpoint closure.
        double oppositeInitialBearing = normalizeBearing(
                candidate.initialBearingDegrees() + 180
        );
        RawDirect endpoint = directRaw(
                start,
                oppositeInitialBearing * DEGREE,
                candidate.distanceMetres(),
                ellipsoid
        );
        Residual residual = endpointResidual(
                endpoint,
                end.latitude() * DEGREE,
                end.longitude() * DEGREE
        );
        if (residual.norm() > INVERSE_ENDPOINT_TOLERANCE) {
            return null;
        }

        return new RawInverse(
                candidate.distanceMetres(),
                oppositeInitialBearing,
                normalizeBearing(endpoint.finalBearingRadians() * RADIAN),
                candidate.ambiguous(),
                candidate.iterations()
        );
    }

    private static SphericalSeed sphericalSeed(
            GeoPoint start,
            GeoPoint end,
            Ellipsoid ellipsoid
    ) {
        double latitude1 = start.latitude() * DEGREE;
        double latitude2 = end.latitude() * DEGREE;
        double longitudeDifference = GeoPoint.normalizeLongitude(
                end.longitude() - start.longitude()
        ) * DEGREE;
        double sinLatitudeDifference = Math.sin(
                (latitude2 - latitude1) / 2
        );
        double sinLongitudeDifference = Math.sin(longitudeDifference / 2);
        double haversine = sinLatitudeDifference * sinLatitudeDifference
                + Math.cos(latitude1)
                * Math.cos(latitude2)
                * sinLongitudeDifference
                * sinLongitudeDifference;
        double centralAngle = 2 * Math.atan2(
                Math.sqrt(haversine),
                Math.sqrt(Math.max(0, 1 - haversine))
        );
        double bearing = Math.atan2(
                Math.sin(longitudeDifference) * Math.cos(latitude2),
                Math.cos(latitude1) * Math.sin(latitude2)
                        - Math.sin(latitude1)
                        * Math.cos(latitude2)
                        * Math.cos(longitudeDifference)
        );
        double meanRadius = (
                2 * ellipsoid.semiMajorAxisMetres()
                        + ellipsoid.semiMinorAxisMetres()
        ) / 3;
        return new SphericalSeed(
                Double.isFinite(bearing) ? bearing : 0,
                centralAngle * meanRadius / ellipsoid.semiMajorAxisMetres(),
                centralAngle
        );
    }

    private static boolean coincident(GeoPoint start, GeoPoint end) {
        return start.latitude() == end.latitude()
                && (Math.abs(start.latitude()) == 90
                        || Math.abs(
                                GeoPoint.normalizeLongitude(
                                        start.longitude() - end.longitude()
                                )
                        ) == 0
                );
    }

    private static boolean exactAntipodes(GeoPoint start, GeoPoint end) {
        boolean oppositePoles = Math.abs(start.latitude()) == 90
                && end.latitude() == -start.latitude();
        return oppositePoles
                || (Math.abs(start.latitude() + end.latitude()) <= 1e-13
                        && Math.abs(
                                Math.abs(
                                        GeoPoint.normalizeLongitude(
                                                end.longitude()
                                                        - start.longitude()
                                        )
                                ) - 180
                        ) <= 1e-13
                );
    }

    private static double normalizeBearing(double degrees) {
        return ((degrees % 360) + 360) % 360;
    }

    private static double normalizeRadians(double radians) {
        if (radians >= -Math.PI && radians <= Math.PI) {
            return radians;
        }

        return ((radians + Math.PI) % (2 * Math.PI) + 2 * Math.PI)
                % (2 * Math.PI)
                - Math.PI;
    }

    private static boolean convergedRadians(
            double previous,
            double next,
            double tolerance
    ) {
        double scale = Math.min(
                1,
                Math.max(Math.abs(next), tolerance)
        );
        return Math.abs(next - previous) <= tolerance * scale;
    }

    private static double clamp(double value, double minimum, double maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    private record RawInverse(
            double distanceMetres,
            double initialBearingDegrees,
            double finalBearingDegrees,
            boolean ambiguous,
            int iterations
    ) {
    }

    private record RawDirect(
            double latitudeRadians,
            double longitudeRadians,
            double finalBearingRadians,
            int iterations
    ) {
    }

    private record Residual(double east, double north) {
        double norm() {
            return Math.hypot(east, north);
        }
    }

    private record SphericalSeed(
            double bearing,
            double scaledDistance,
            double centralAngle
    ) {
    }

    private record ShootingResult(
            RawDirect endpoint,
            double bearing,
            double distanceMetres,
            double residual,
            int iterations
    ) {
    }
}
