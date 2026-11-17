/*
 * Port of the geodesic algorithms of GeographicLib's Geodesic and
 * GeodesicLine classes.
 *
 * Copyright (c) Charles Karney (2013-2022) <charles@karney.com> and licensed
 * under the MIT/X11 License. For more information, see
 * https://geographiclib.sourceforge.io/
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

package io.github.mertc0604.converttools.geodesy;

/**
 * Package-private Karney geodesic solver for one ellipsoid.
 *
 * <p>The series are those of C. F. F. Karney, "Algorithms for geodesics",
 * J. Geodesy <b>87</b>, 43-55 (2013), truncated at sixth order in the
 * flattening exactly like GeographicLib. The inverse problem uses Newton's
 * method on the longitude difference with a bisection bracket as a fallback;
 * the direct problem uses the reverted distance series from
 * GeographicLib's {@code GeodesicLine}.
 *
 * <p>All azimuths returned by this class are in the range [-180, 180].
 * Both problems also return the arc length a12 on the auxiliary sphere, the
 * reduced length m12, the geodesic scales M12 and M21 and the area S12
 * between the geodesic and the equator (GeographicLib's {@code a12},
 * {@code m12}, {@code M12}, {@code M21} and {@code S12}).
 */
final class GeodesicEngine {
    private static final int ORDER = 6;
    private static final int N_A1 = ORDER;
    private static final int N_C1 = ORDER;
    private static final int N_C1P = ORDER;
    private static final int N_A2 = ORDER;
    private static final int N_C2 = ORDER;
    private static final int N_A3 = ORDER;
    private static final int N_C3 = ORDER;
    private static final int N_C3X = N_C3 * (N_C3 - 1) / 2;
    private static final int N_C4 = ORDER;
    private static final int N_C4X = N_C4 * (N_C4 + 1) / 2;

    private static final int MAXIT1 = 20;
    private static final int MAXIT2 = MAXIT1 + 53 + 10;

    // Underflow guard: TINY * ulp(1) > 0 and TINY + ulp(1) == ulp(1).
    private static final double TINY = Math.sqrt(Double.MIN_NORMAL);
    private static final double TOL0 = Math.ulp(1.0);
    private static final double TOL1 = 200 * TOL0;
    private static final double TOL2 = Math.sqrt(TOL0);
    private static final double TOLB = TOL0;
    private static final double XTHRESH = 1000 * TOL2;

    private final double a;
    private final double f;
    private final double f1;
    private final double e2;
    private final double ep2;
    private final double b;
    private final double c2;
    private final double n;
    private final double etol2;
    private final double[] a3x = new double[N_A3];
    private final double[] c3x = new double[N_C3X];
    private final double[] c4x = new double[N_C4X];

    GeodesicEngine(double semiMajorAxis, double flattening) {
        this.a = semiMajorAxis;
        this.f = flattening;
        this.f1 = 1 - f;
        this.e2 = f * (2 - f);
        this.ep2 = e2 / (f1 * f1);
        this.b = a * f1;
        this.c2 = authalicRadiusSquared(a, b, e2, f);
        this.n = f / (2 - f);
        this.etol2 = 0.1 * TOL2
                / Math.sqrt(
                        Math.max(0.001, Math.abs(f))
                                * Math.min(1.0, 1 - f / 2)
                                / 2
                );
        a3coeff();
        c3coeff();
        c4coeff();
    }

    /**
     * Result of the inverse problem. Azimuths and the arc length are in
     * degrees, azimuths in [-180, 180]; the area is in square metres.
     */
    record InverseSolution(
            double distanceMetres,
            double initialBearingDegrees,
            double finalBearingDegrees,
            int iterations,
            double arcDegrees,
            double reducedLengthMetres,
            double geodesicScale12,
            double geodesicScale21,
            double areaSquareMetres
    ) {
    }

    /** Result of the direct problem. Angles are in degrees. */
    record DirectSolution(
            double latitudeDegrees,
            double longitudeDegrees,
            double finalBearingDegrees,
            double arcDegrees,
            double reducedLengthMetres,
            double geodesicScale12,
            double geodesicScale21,
            double areaSquareMetres
    ) {
    }

    /**
     * Reduced length, geodesic scales and area of the route over the north
     * pole between exact antipodes.
     */
    record PoleRoute(
            double reducedLengthMetres,
            double geodesicScale12,
            double geodesicScale21,
            double areaSquareMetres
    ) {
    }

    private record InverseStart(
            double sig12,
            double salp1,
            double calp1,
            double salp2,
            double calp2,
            double dnm
    ) {
    }

    private record Lambda12(
            double lam12,
            double salp2,
            double calp2,
            double sig12,
            double ssig1,
            double csig1,
            double ssig2,
            double csig2,
            double eps,
            double domg12,
            double dlam12
    ) {
    }

    /** NaN where a quantity was not asked for. */
    private record Lengths(
            double s12b,
            double m12b,
            double m0,
            double geodesicScale12,
            double geodesicScale21
    ) {
    }

    /**
     * Solves the inverse problem. Latitudes and longitudes are in degrees.
     *
     * <p>The iteration count is the number of longitude evaluations made by
     * the Newton/bisection loop, and is 0 when the meridional, equatorial, or
     * short-line closed forms are used.
     */
    InverseSolution inverse(
            double latitude1Degrees,
            double longitude1Degrees,
            double latitude2Degrees,
            double longitude2Degrees
    ) {
        double lat1 = latFix(latitude1Degrees);
        double lat2 = latFix(latitude2Degrees);
        // If really close to the equator, treat as on the equator.
        lat1 = angRound(lat1);
        lat2 = angRound(lat2);

        double[] difference = angDiff(longitude1Degrees, longitude2Degrees);
        double lon12 = difference[0];
        double lon12s = difference[1];
        // Make the longitude difference positive.
        int lonsign = (int) Math.copySign(1.0, lon12);
        lon12 *= lonsign;
        lon12s *= lonsign;
        double lam12 = Math.toRadians(lon12);
        double[] sincos = sincosde(lon12, lon12s);
        double slam12 = sincos[0];
        double clam12 = sincos[1];
        lon12s = (180 - lon12) - lon12s;

        // Make the point with the larger latitude point 1.
        int swapp = Math.abs(lat1) < Math.abs(lat2) || lat2 != lat2 ? -1 : 1;
        if (swapp < 0) {
            lonsign *= -1;
            double swap = lat1;
            lat1 = lat2;
            lat2 = swap;
        }
        // Make lat1 <= 0.
        int latsign = (int) Math.copySign(1.0, -lat1);
        lat1 *= latsign;
        lat2 *= latsign;
        // Now 0 <= lon12 <= 180, -90 <= lat1 <= 0 and
        // lat1 <= lat2 <= -lat1.

        double[] lat1Sincos = sincosd(lat1);
        double sbet1 = f1 * lat1Sincos[0];
        double cbet1 = lat1Sincos[1];
        double[] normalized = norm(sbet1, cbet1);
        sbet1 = normalized[0];
        cbet1 = Math.max(TINY, normalized[1]);

        double[] lat2Sincos = sincosd(lat2);
        double sbet2 = f1 * lat2Sincos[0];
        double cbet2 = lat2Sincos[1];
        normalized = norm(sbet2, cbet2);
        sbet2 = normalized[0];
        cbet2 = Math.max(TINY, normalized[1]);

        // Force bet2 = +/-bet1 exactly when the difference is below the
        // rounding noise; this keeps Lambda12's symmetry exact.
        if (cbet1 < -sbet1) {
            if (cbet2 == cbet1) {
                sbet2 = Math.copySign(sbet1, sbet2);
            }
        } else if (Math.abs(sbet2) == -sbet1) {
            cbet2 = cbet1;
        }

        double dn1 = Math.sqrt(1 + ep2 * sbet1 * sbet1);
        double dn2 = Math.sqrt(1 + ep2 * sbet2 * sbet2);

        double sig12 = Double.NaN;
        double salp1 = Double.NaN;
        double calp1 = Double.NaN;
        double salp2 = Double.NaN;
        double calp2 = Double.NaN;
        double s12x = Double.NaN;
        double m12x = Double.NaN;
        double a12 = Double.NaN;
        double scale12 = Double.NaN;
        double scale21 = Double.NaN;
        double omg12 = 0;
        // somg12 = 2 marks "not yet known"; the area then uses sin/cos(omg12).
        double somg12 = 2;
        double comg12 = 0;
        int iterations = 0;

        double[] c1a = new double[N_C1 + 1];
        double[] c2a = new double[N_C2 + 1];
        double[] c3a = new double[N_C3];

        boolean meridian = lat1 == -90 || slam12 == 0;

        if (meridian) {
            // Endpoints are on a single full meridian, so the geodesic might
            // lie on a meridian.
            calp1 = clam12;
            salp1 = slam12;
            calp2 = 1;
            salp2 = 0;

            double ssig1 = sbet1;
            double csig1 = calp1 * cbet1;
            double ssig2 = sbet2;
            double csig2 = calp2 * cbet2;
            sig12 = Math.atan2(
                    Math.max(0.0, csig1 * ssig2 - ssig1 * csig2),
                    csig1 * csig2 + ssig1 * ssig2
            );
            Lengths lengths = lengths(
                    n, sig12, ssig1, csig1, dn1, ssig2, csig2, dn2,
                    cbet1, cbet2, true, true, true, c1a, c2a
            );
            s12x = lengths.s12b();
            m12x = lengths.m12b();
            scale12 = lengths.geodesicScale12();
            scale21 = lengths.geodesicScale21();
            if (sig12 < TOL2 || m12x >= 0) {
                // Need at least 2, to handle 90 0 90 180.
                if (sig12 < 3 * TINY
                        || (sig12 < TOL0 && (s12x < 0 || m12x < 0))) {
                    sig12 = 0;
                    m12x = 0;
                    s12x = 0;
                }
                m12x *= b;
                s12x *= b;
                a12 = Math.toDegrees(sig12);
            } else {
                // m12 < 0, i.e., prolate and too close to antipodal.
                meridian = false;
            }
        }

        if (!meridian
                && sbet1 == 0
                && (f <= 0 || lon12s >= f * 180)) {
            // Geodesic runs along the equator.
            calp1 = 0;
            calp2 = 0;
            salp1 = 1;
            salp2 = 1;
            s12x = a * lam12;
            sig12 = lam12 / f1;
            omg12 = sig12;
            m12x = b * Math.sin(sig12);
            scale12 = Math.cos(sig12);
            scale21 = scale12;
            a12 = lon12 / f1;
        } else if (!meridian) {
            // Point 1 and point 2 are within a hemisphere bounded by a
            // meridian; the geodesic is neither meridional nor equatorial.
            InverseStart start = inverseStart(
                    sbet1, cbet1, dn1, sbet2, cbet2, dn2,
                    lam12, slam12, clam12, c1a, c2a
            );
            sig12 = start.sig12();
            salp1 = start.salp1();
            calp1 = start.calp1();
            salp2 = start.salp2();
            calp2 = start.calp2();
            double dnm = start.dnm();

            if (sig12 >= 0) {
                // Short lines: InverseStart has already done the work.
                s12x = sig12 * b * dnm;
                m12x = dnm * dnm * b * Math.sin(sig12 / dnm);
                scale12 = Math.cos(sig12 / dnm);
                scale21 = scale12;
                a12 = Math.toDegrees(sig12);
                omg12 = lam12 / (f1 * dnm);
            } else {
                // Newton's method on f(alp1) = lambda12(alp1) - lam12 with a
                // bisection bracket. A range (alp1a, alp1b) brackets the root;
                // Newton is restarted from the midpoint whenever its step is
                // not usable.
                double ssig1 = Double.NaN;
                double csig1 = Double.NaN;
                double ssig2 = Double.NaN;
                double csig2 = Double.NaN;
                double eps = Double.NaN;
                double domg12 = Double.NaN;
                int numit = 0;
                double salp1a = TINY;
                double calp1a = 1;
                double salp1b = TINY;
                double calp1b = -1;
                boolean tripn = false;
                boolean tripb = false;

                for (;; ++numit) {
                    Lambda12 lambda = lambda12(
                            sbet1, cbet1, dn1, sbet2, cbet2, dn2,
                            salp1, calp1, slam12, clam12,
                            numit < MAXIT1, c1a, c2a, c3a
                    );
                    double value = lambda.lam12();
                    salp2 = lambda.salp2();
                    calp2 = lambda.calp2();
                    sig12 = lambda.sig12();
                    ssig1 = lambda.ssig1();
                    csig1 = lambda.csig1();
                    ssig2 = lambda.ssig2();
                    csig2 = lambda.csig2();
                    eps = lambda.eps();
                    domg12 = lambda.domg12();
                    double derivative = lambda.dlam12();
                    if (tripb
                            || !(Math.abs(value)
                            >= (tripn ? 8 : 1) * TOL0)
                            || numit == MAXIT2) {
                        break;
                    }
                    // Update the bracketing values.
                    if (value > 0
                            && (numit > MAXIT1
                            || calp1 / salp1 > calp1b / salp1b)) {
                        salp1b = salp1;
                        calp1b = calp1;
                    } else if (value < 0
                            && (numit > MAXIT1
                            || calp1 / salp1 < calp1a / salp1a)) {
                        salp1a = salp1;
                        calp1a = calp1;
                    }
                    if (numit < MAXIT1 && derivative > 0) {
                        double dalp1 = -value / derivative;
                        if (Math.abs(dalp1) < Math.PI) {
                            double sdalp1 = Math.sin(dalp1);
                            double cdalp1 = Math.cos(dalp1);
                            double nsalp1 = salp1 * cdalp1
                                    + calp1 * sdalp1;
                            if (nsalp1 > 0) {
                                calp1 = calp1 * cdalp1
                                        - salp1 * sdalp1;
                                salp1 = nsalp1;
                                double[] direction = norm(salp1, calp1);
                                salp1 = direction[0];
                                calp1 = direction[1];
                                // Quadratic convergence is not always
                                // achieved because the slope can vanish, so
                                // the convergence test uses epsilon.
                                tripn = Math.abs(value) <= 16 * TOL0;
                                continue;
                            }
                        }
                    }
                    // Use the midpoint of the bracket as the next estimate.
                    salp1 = (salp1a + salp1b) / 2;
                    calp1 = (calp1a + calp1b) / 2;
                    double[] direction = norm(salp1, calp1);
                    salp1 = direction[0];
                    calp1 = direction[1];
                    tripn = false;
                    tripb = Math.abs(salp1a - salp1)
                            + (calp1a - calp1) < TOLB
                            || Math.abs(salp1 - salp1b)
                            + (calp1 - calp1b) < TOLB;
                }
                iterations = numit + 1;

                Lengths lengths = lengths(
                        eps, sig12, ssig1, csig1, dn1, ssig2, csig2, dn2,
                        cbet1, cbet2, true, true, true, c1a, c2a
                );
                s12x = lengths.s12b() * b;
                m12x = lengths.m12b() * b;
                scale12 = lengths.geodesicScale12();
                scale21 = lengths.geodesicScale21();
                a12 = Math.toDegrees(sig12);
                // omg12 = lam12 - domg12
                double sdomg12 = Math.sin(domg12);
                double cdomg12 = Math.cos(domg12);
                somg12 = slam12 * cdomg12 - clam12 * sdomg12;
                comg12 = clam12 * cdomg12 + slam12 * sdomg12;
            }
        }

        double distanceMetres = 0 + s12x;
        double reducedLength = 0 + m12x;

        // Area between the geodesic and the equator (Karney 2013, section
        // 6), in the canonical frame, then given the sign of the
        // transformation. sin(alp1) * cos(bet1) = sin(alp0)
        double salp0 = salp1 * cbet1;
        double calp0 = Math.hypot(calp1, salp1 * sbet1); // calp0 > 0
        double area = 0;
        if (calp0 != 0 && salp0 != 0) {
            // tan(bet) = tan(sig) * cos(alp)
            double[] sig1 = norm(sbet1, calp1 * cbet1);
            double[] sig2 = norm(sbet2, calp2 * cbet2);
            double k2 = sq(calp0) * ep2;
            double eps = k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
            // Multiplier a^2 * e^2 * cos(alp0) * sin(alp0).
            double a4 = a * a * calp0 * salp0 * e2;
            double[] c4a = new double[N_C4];
            c4f(eps, c4a);
            double b41 = sinCosSeries(false, sig1[0], sig1[1], c4a);
            double b42 = sinCosSeries(false, sig2[0], sig2[1], c4a);
            area = a4 * (b42 - b41);
        }
        // Otherwise sig1 and sig2 are indeterminate on the equator and the
        // series part of the area stays 0.
        if (!meridian && somg12 == 2) {
            somg12 = Math.sin(omg12);
            comg12 = Math.cos(omg12);
        }
        double alp12;
        if (!meridian
                // omg12 < 3/4 pi: longitude difference not too big
                && comg12 > -0.7071
                // latitude difference not too big
                && sbet2 - sbet1 < 1.75) {
            // tan(Gamma/2) = tan(omg12/2) * (tan(bet1/2) + tan(bet2/2))
            // / (1 + tan(bet1/2) * tan(bet2/2)), with
            // tan(x/2) = sin(x) / (1 + cos(x)).
            double domg12 = 1 + comg12;
            double dbet1 = 1 + cbet1;
            double dbet2 = 1 + cbet2;
            alp12 = 2 * Math.atan2(
                    somg12 * (sbet1 * dbet2 + sbet2 * dbet1),
                    domg12 * (sbet1 * sbet2 + dbet1 * dbet2)
            );
        } else {
            // alp12 = alp2 - alp1, used in atan2 so no need to normalize.
            double salp12 = salp2 * calp1 - calp2 * salp1;
            double calp12 = calp2 * calp1 + salp2 * salp1;
            // For alp1 = +/-180 and alp2 = 0 the sign of salp12 = 0 decides
            // alp12 = -180; set it explicitly (as GeographicLib does).
            if (salp12 == 0 && calp12 < 0) {
                salp12 = TINY * calp1;
                calp12 = -1;
            }
            alp12 = Math.atan2(salp12, calp12);
        }
        area += c2 * alp12;
        area *= swapp * lonsign * latsign;
        area += 0; // -0 becomes 0

        // Convert salp/calp back to azimuths, undoing the canonicalization.
        if (swapp < 0) {
            double swap = salp1;
            salp1 = salp2;
            salp2 = swap;
            swap = calp1;
            calp1 = calp2;
            calp2 = swap;
            swap = scale12;
            scale12 = scale21;
            scale21 = swap;
        }
        salp1 *= swapp * lonsign;
        calp1 *= swapp * latsign;
        salp2 *= swapp * lonsign;
        calp2 *= swapp * latsign;

        return new InverseSolution(
                distanceMetres,
                atan2d(salp1, calp1),
                atan2d(salp2, calp2),
                iterations,
                a12,
                reducedLength,
                scale12,
                scale21,
                area
        );
    }

    /**
     * Reduced length, geodesic scales and area of the route over the north
     * pole between exact antipodes, the route the public contract returns
     * for them (azimuth 0 at point 1, 180 at point 2). It runs along a
     * meridian: point 1 leaves northwards, passes the pole and reaches the
     * opposite meridian at the mirrored latitude, so sig2 = sig1 + pi on the
     * auxiliary sphere (ssig2 = -ssig1, csig2 = -csig1). On a meridian
     * k^2 = e'^2, so eps = n. The area of a meridional geodesic has no
     * series part (A4 = 0) and alp12 = 180 degrees, so S12 = c^2 * pi.
     */
    PoleRoute northPoleRoute(double latitude1Degrees) {
        double[] latSincos = sincosd(angRound(latitude1Degrees));
        double[] normalized = norm(f1 * latSincos[0], latSincos[1]);
        double sbet1 = normalized[0];
        // cbet1 = +epsilon at the poles
        double cbet1 = Math.max(TINY, normalized[1]);
        double dn1 = Math.sqrt(1 + ep2 * sbet1 * sbet1);
        Lengths route = lengths(
                n, Math.PI, sbet1, cbet1, dn1, -sbet1, -cbet1, dn1,
                cbet1, cbet1, true, true, true,
                new double[N_C1 + 1], new double[N_C2 + 1]
        );
        return new PoleRoute(
                0 + route.m12b() * b,
                route.geodesicScale12(),
                route.geodesicScale21(),
                c2 * Math.PI
        );
    }

    /**
     * Solves the direct problem. The distance may be zero but not negative.
     */
    DirectSolution direct(
            double latitude1Degrees,
            double longitude1Degrees,
            double azimuth1Degrees,
            double distanceMetres
    ) {
        double azi1 = angNormalize(azimuth1Degrees);
        // Guard against underflow in salp0; AngRound also turns -0 into +0.
        double[] aziSincos = sincosd(angRound(azi1));
        double salp1 = aziSincos[0];
        double calp1 = aziSincos[1];

        double lat1 = latFix(latitude1Degrees);
        double[] latSincos = sincosd(angRound(lat1));
        double sbet1 = f1 * latSincos[0];
        double cbet1 = latSincos[1];
        double[] normalized = norm(sbet1, cbet1);
        sbet1 = normalized[0];
        cbet1 = Math.max(TINY, normalized[1]);
        double dn1 = Math.sqrt(1 + ep2 * sbet1 * sbet1);

        // sin(alp1) * cos(bet1) = sin(alp0)
        double salp0 = salp1 * cbet1;
        double calp0 = Math.hypot(calp1, salp1 * sbet1);

        double ssig1 = sbet1;
        double somg1 = salp0 * sbet1;
        double csig1 = sbet1 != 0 || calp1 != 0 ? cbet1 * calp1 : 1;
        double comg1 = csig1;
        normalized = norm(ssig1, csig1);
        ssig1 = normalized[0];
        csig1 = normalized[1];

        double k2 = calp0 * calp0 * ep2;
        double eps = k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
        double a1m1 = a1m1f(eps);
        double[] c1a = new double[N_C1 + 1];
        c1f(eps, c1a);
        double[] c1pa = new double[N_C1P + 1];
        c1pf(eps, c1pa);
        // Reduced length and geodesic scales (I2).
        double a2m1 = a2m1f(eps);
        double[] c2a = new double[N_C2 + 1];
        c2f(eps, c2a);
        double b21 = sinCosSeries(true, ssig1, csig1, c2a);
        double b11 = sinCosSeries(true, ssig1, csig1, c1a);
        double sinB11 = Math.sin(b11);
        double cosB11 = Math.cos(b11);
        // tau1 = sig1 + B11
        double stau1 = ssig1 * cosB11 + csig1 * sinB11;
        double ctau1 = csig1 * cosB11 - ssig1 * sinB11;
        double[] c3a = new double[N_C3];
        c3f(eps, c3a);
        double a3c = -f * salp0 * a3f(eps);
        double b31 = sinCosSeries(true, ssig1, csig1, c3a);
        // Area (I4).
        double[] c4a = new double[N_C4];
        c4f(eps, c4a);
        // Multiplier a^2 * e^2 * cos(alp0) * sin(alp0).
        double a4 = a * a * calp0 * salp0 * e2;
        double b41 = sinCosSeries(false, ssig1, csig1, c4a);

        double tau12 = distanceMetres / (b * (1 + a1m1));
        double sinTau12 = Math.sin(tau12);
        double cosTau12 = Math.cos(tau12);
        // tau2 = tau1 + tau12
        double b12 = -sinCosSeries(
                true,
                stau1 * cosTau12 + ctau1 * sinTau12,
                ctau1 * cosTau12 - stau1 * sinTau12,
                c1pa
        );
        double sig12 = tau12 - (b12 - b11);
        double ssig12 = Math.sin(sig12);
        double csig12 = Math.cos(sig12);
        boolean correctedSeries = false;
        if (Math.abs(f) > 0.01) {
            // The reverted distance series is inaccurate for |f| > 1/100, so
            // correct sig12 with one Newton iteration.
            double ssig2 = ssig1 * csig12 + csig1 * ssig12;
            double csig2 = csig1 * csig12 - ssig1 * ssig12;
            double b12Correction = sinCosSeries(true, ssig2, csig2, c1a);
            double error = (1 + a1m1)
                    * (sig12 + (b12Correction - b11))
                    - distanceMetres / b;
            sig12 -= error / Math.sqrt(1 + k2 * ssig2 * ssig2);
            ssig12 = Math.sin(sig12);
            csig12 = Math.cos(sig12);
            correctedSeries = true; // b12 is updated below
        }

        // sig2 = sig1 + sig12
        double ssig2 = ssig1 * csig12 + csig1 * ssig12;
        double csig2 = csig1 * csig12 - ssig1 * ssig12;
        double dn2 = Math.sqrt(1 + k2 * ssig2 * ssig2);
        if (correctedSeries) {
            b12 = sinCosSeries(true, ssig2, csig2, c1a);
        }
        double ab1 = (1 + a1m1) * (b12 - b11);
        // sin(bet2) = cos(alp0) * sin(sig2)
        double sbet2 = calp0 * ssig2;
        double cbet2 = Math.hypot(salp0, calp0 * csig2);
        if (cbet2 == 0) {
            // salp0 = 0, csig2 = 0. Break the degeneracy here.
            cbet2 = TINY;
            csig2 = TINY;
        }
        // tan(alp0) = cos(sig2) * tan(alp2)
        double salp2 = salp0;
        double calp2 = calp0 * csig2;

        // tan(omg2) = sin(alp0) * tan(sig2)
        double somg2 = salp0 * ssig2;
        double comg2 = csig2;
        double east = Math.copySign(1.0, salp0);
        double omg12 = east * (
                sig12
                        - (Math.atan2(ssig2, csig2)
                        - Math.atan2(ssig1, csig1))
                        + (Math.atan2(east * somg2, comg2)
                        - Math.atan2(east * somg1, comg1))
                );
        double lam12 = omg12 + a3c * (
                sig12
                        + (sinCosSeries(true, ssig2, csig2, c3a) - b31)
                );
        double lon12 = Math.toDegrees(lam12);
        double longitude2 = angNormalize(
                longitude1Degrees + angNormalize(lon12)
        );
        double latitude2 = atan2d(sbet2, f1 * cbet2);
        double azimuth2 = atan2d(salp2, calp2);

        // Reduced length and geodesic scales.
        double b22 = sinCosSeries(true, ssig2, csig2, c2a);
        double ab2 = (1 + a2m1) * (b22 - b21);
        double j12 = (a1m1 - a2m1) * sig12 + (ab1 - ab2);
        // The parentheses keep the cancellation accurate for coincident
        // points.
        double m12 = b * (dn2 * (csig1 * ssig2)
                - dn1 * (ssig1 * csig2)
                - csig1 * csig2 * j12);
        double t = k2 * (ssig2 - ssig1) * (ssig2 + ssig1) / (dn1 + dn2);
        double scale12 = csig12 + (t * ssig2 - csig2 * j12) * ssig1 / dn1;
        double scale21 = csig12 - (t * ssig1 - csig1 * j12) * ssig2 / dn2;

        // Area between the geodesic and the equator.
        double b42 = sinCosSeries(false, ssig2, csig2, c4a);
        double salp12;
        double calp12;
        if (calp0 == 0 || salp0 == 0) {
            // alp12 = alp2 - alp1, used in atan2 so no need to normalize.
            salp12 = salp2 * calp1 - calp2 * salp1;
            calp12 = calp2 * calp1 + salp2 * salp1;
        } else {
            // tan(alp) = tan(alp0) * sec(sig), so tan(alp2 - alp1) =
            // calp0 * salp0 * (csig1 - csig2)
            // / (salp0^2 + calp0^2 * csig1 * csig2), with csig1 - csig2
            // written without cancellation.
            salp12 = calp0 * salp0 * (csig12 <= 0
                    ? csig1 * (1 - csig12) + ssig12 * ssig1
                    : ssig12 * (csig1 * ssig12 / (1 + csig12) + ssig1));
            calp12 = salp0 * salp0 + calp0 * calp0 * csig1 * csig2;
        }
        double area = c2 * Math.atan2(salp12, calp12) + a4 * (b42 - b41);

        return new DirectSolution(
                latitude2,
                longitude2,
                azimuth2,
                Math.toDegrees(sig12),
                m12,
                scale12,
                scale21,
                area
        );
    }

    /**
     * Longitude of the cut locus for a point at the given latitude, using
     * Karney's A3 series. Used by the exact {@code ambiguous} rule.
     */
    /** The authalic radius squared, c^2: S12 is c^2 times an angle plus a series. */
    double authalicRadiusSquared() {
        return c2;
    }

    double lonCut(double latitudeDegrees) {
        double[] latSincos = sincosd(latitudeDegrees);
        double sbet = f1 * latSincos[0];
        double cbet = latSincos[1];
        double radius = Math.hypot(sbet, cbet);
        sbet /= radius;
        cbet /= radius;
        double k2 = ep2 * sbet * sbet;
        double eps = k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
        return 180 * (1 - f * a3f(eps) * cbet);
    }

    private InverseStart inverseStart(
            double sbet1,
            double cbet1,
            double dn1,
            double sbet2,
            double cbet2,
            double dn2,
            double lam12,
            double slam12,
            double clam12,
            double[] c1a,
            double[] c2a
    ) {
        // Return a starting point for Newton's method in salp1 and calp1
        // (function value is -1). If Newton's method is not needed, also
        // return salp2, calp2 and the function value is sig12.
        double sig12 = -1;
        double salp1;
        double calp1;
        double salp2 = Double.NaN;
        double calp2 = Double.NaN;
        double dnm = Double.NaN;

        // bet12 = bet2 - bet1 in [0, pi)
        // bet12a = bet2 + bet1 in (-pi, 0]
        double sbet12 = sbet2 * cbet1 - cbet2 * sbet1;
        double cbet12 = cbet2 * cbet1 + sbet2 * sbet1;
        double sbet12a = sbet2 * cbet1 + cbet2 * sbet1;
        boolean shortline = cbet12 >= 0
                && sbet12 < 0.5
                && cbet2 * lam12 < 0.5;
        double somg12;
        double comg12;

        if (shortline) {
            double sbetm2 = sq(sbet1 + sbet2);
            // sin((bet1 + bet2) / 2)^2
            sbetm2 /= sbetm2 + sq(cbet1 + cbet2);
            dnm = Math.sqrt(1 + ep2 * sbetm2);
            double omg12 = lam12 / (f1 * dnm);
            somg12 = Math.sin(omg12);
            comg12 = Math.cos(omg12);
        } else {
            somg12 = slam12;
            comg12 = clam12;
        }

        salp1 = cbet2 * somg12;
        calp1 = comg12 >= 0
                ? sbet12 + cbet2 * sbet1 * sq(somg12) / (1 + comg12)
                : sbet12a - cbet2 * sbet1 * sq(somg12) / (1 - comg12);

        double ssig12 = Math.hypot(salp1, calp1);
        double csig12 = sbet1 * sbet2 + cbet1 * cbet2 * comg12;

        if (shortline && ssig12 < etol2) {
            // Really short lines.
            salp2 = cbet1 * somg12;
            calp2 = sbet12 - cbet1 * sbet2 * (
                    comg12 >= 0
                            ? sq(somg12) / (1 + comg12)
                            : 1 - comg12
                    );
            double[] normalized = norm(salp2, calp2);
            salp2 = normalized[0];
            calp2 = normalized[1];
            sig12 = Math.atan2(ssig12, csig12);
        } else if (Math.abs(n) > 0.1
                || csig12 >= 0
                || ssig12 >= 6 * Math.abs(n) * Math.PI * sq(cbet1)) {
            // Nothing to do; zeroth-order spherical approximation is OK.
        } else {
            // Scale lam12 and bet2 to x, y coordinates where the antipodal
            // point is at the origin and the singular point is at y = 0,
            // x = -1.
            double x;
            double y;
            double lamscale;
            double betscale;
            double lam12x = Math.atan2(-slam12, -clam12);
            if (f >= 0) {
                // x = dlong, y = dlat
                double k2 = sq(sbet1) * ep2;
                double eps = k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
                lamscale = f * cbet1 * a3f(eps) * Math.PI;
                betscale = lamscale * cbet1;
                x = lam12x / lamscale;
                y = sbet12a / betscale;
            } else {
                // x = dlat, y = dlong
                double cbet12a = cbet2 * cbet1 - sbet2 * sbet1;
                double bet12a = Math.atan2(sbet12a, cbet12a);
                Lengths lengths = lengths(
                        n, Math.PI + bet12a,
                        sbet1, -cbet1, dn1, sbet2, cbet2, dn2,
                        cbet1, cbet2, false, true, false, c1a, c2a
                );
                double m12b = lengths.m12b();
                double m0 = lengths.m0();
                x = -1 + m12b / (cbet1 * cbet2 * m0 * Math.PI);
                betscale = x < -0.01
                        ? sbet12a / x
                        : -f * sq(cbet1) * Math.PI;
                lamscale = betscale / cbet1;
                y = lam12x / lamscale;
            }

            if (y > -TOL1 && x > -1 - XTHRESH) {
                // Strip near the cut locus.
                if (f >= 0) {
                    salp1 = Math.min(1.0, -x);
                    calp1 = -Math.sqrt(1 - sq(salp1));
                } else {
                    calp1 = Math.max(x > -TOL1 ? 0.0 : -1.0, x);
                    salp1 = Math.sqrt(1 - sq(calp1));
                }
            } else {
                // Estimate alp1 by solving the astroid problem, then use the
                // spherical formula to compute alp1 from omg12.
                double k = astroid(x, y);
                double omg12a = lamscale * (
                        f >= 0
                                ? -x * k / (1 + k)
                                : -y * (1 + k) / k
                        );
                somg12 = Math.sin(omg12a);
                comg12 = -Math.cos(omg12a);
                salp1 = cbet2 * somg12;
                calp1 = sbet12a
                        - cbet2 * sbet1 * sq(somg12) / (1 - comg12);
            }
        }

        // Sanity check on the starting guess. The backwards comparison lets
        // NaN through.
        if (!(salp1 <= 0)) {
            double[] normalized = norm(salp1, calp1);
            salp1 = normalized[0];
            calp1 = normalized[1];
        } else {
            salp1 = 1;
            calp1 = 0;
        }
        return new InverseStart(sig12, salp1, calp1, salp2, calp2, dnm);
    }

    private Lambda12 lambda12(
            double sbet1,
            double cbet1,
            double dn1,
            double sbet2,
            double cbet2,
            double dn2,
            double salp1,
            double calp1,
            double slam120,
            double clam120,
            boolean diffp,
            double[] c1a,
            double[] c2a,
            double[] c3a
    ) {
        if (sbet1 == 0 && calp1 == 0) {
            // Break the degeneracy of the equatorial line. This case has
            // already been handled.
            calp1 = -TINY;
        }

        // sin(alp1) * cos(bet1) = sin(alp0)
        double salp0 = salp1 * cbet1;
        double calp0 = Math.hypot(calp1, salp1 * sbet1);

        // tan(bet1) = tan(sig1) * cos(alp1)
        double ssig1 = sbet1;
        double somg1 = salp0 * sbet1;
        double csig1 = calp1 * cbet1;
        double comg1 = csig1;
        double[] normalized = norm(ssig1, csig1);
        ssig1 = normalized[0];
        csig1 = normalized[1];

        // Enforce symmetries when abs(bet2) = -bet1.
        double salp2 = cbet2 != cbet1 ? salp0 / cbet2 : salp1;
        double calp2 = cbet2 != cbet1 || Math.abs(sbet2) != -sbet1
                ? Math.sqrt(
                        sq(calp1 * cbet1)
                                + (cbet1 < -sbet1
                                ? (cbet2 - cbet1) * (cbet1 + cbet2)
                                : (sbet1 - sbet2) * (sbet1 + sbet2))
                ) / cbet2
                : Math.abs(calp1);

        // tan(bet2) = tan(sig2) * cos(alp2)
        double ssig2 = sbet2;
        double somg2 = salp0 * sbet2;
        double csig2 = calp2 * cbet2;
        double comg2 = csig2;
        normalized = norm(ssig2, csig2);
        ssig2 = normalized[0];
        csig2 = normalized[1];

        // sig12 = sig2 - sig1, limit to [0, pi]
        double sig12 = Math.atan2(
                Math.max(0.0, csig1 * ssig2 - ssig1 * csig2),
                csig1 * csig2 + ssig1 * ssig2
        );
        // omg12 = omg2 - omg1, limit to [0, pi]
        double somg12 = Math.max(0.0, comg1 * somg2 - somg1 * comg2);
        double comg12 = comg1 * comg2 + somg1 * somg2;
        // eta = omg12 - lam120
        double eta = Math.atan2(
                somg12 * clam120 - comg12 * slam120,
                comg12 * clam120 + somg12 * slam120
        );
        double k2 = sq(calp0) * ep2;
        double eps = k2 / (2 * (1 + Math.sqrt(1 + k2)) + k2);
        c3f(eps, c3a);
        double b312 = sinCosSeries(true, ssig2, csig2, c3a)
                - sinCosSeries(true, ssig1, csig1, c3a);
        double domg12 = -f * a3f(eps) * salp0 * (sig12 + b312);
        double lam12 = eta + domg12;

        double dlam12 = Double.NaN;
        if (diffp) {
            if (calp2 == 0) {
                dlam12 = -2 * f1 * dn1 / sbet1;
            } else {
                Lengths lengths = lengths(
                        eps, sig12, ssig1, csig1, dn1, ssig2, csig2, dn2,
                        cbet1, cbet2, false, true, false, c1a, c2a
                );
                dlam12 = lengths.m12b() * f1 / (calp2 * cbet2);
            }
        }
        return new Lambda12(
                lam12, salp2, calp2, sig12,
                ssig1, csig1, ssig2, csig2, eps, domg12, dlam12
        );
    }

    /**
     * Distance and reduced length divided by b, and the geodesic scales,
     * from the auxiliary-sphere arc sig12 between sig1 and sig2
     * (GeographicLib Lengths). m0 is the coefficient of the secular term of
     * the reduced length. Quantities not asked for are NaN.
     */
    private Lengths lengths(
            double eps,
            double sig12,
            double ssig1,
            double csig1,
            double dn1,
            double ssig2,
            double csig2,
            double dn2,
            double cbet1,
            double cbet2,
            boolean needDistance,
            boolean needReducedLength,
            boolean needScale,
            double[] c1a,
            double[] c2a
    ) {
        boolean needJ12 = needReducedLength || needScale;
        double m0x = 0;
        double j12 = 0;
        double a1 = 0;
        double a2 = 0;
        if (needDistance || needJ12) {
            a1 = a1m1f(eps);
            c1f(eps, c1a);
            if (needJ12) {
                a2 = a2m1f(eps);
                c2f(eps, c2a);
                m0x = a1 - a2;
                a2 = 1 + a2;
            }
            a1 = 1 + a1;
        }

        double s12b = Double.NaN;
        double m12b = Double.NaN;
        double m0 = Double.NaN;
        double scale12 = Double.NaN;
        double scale21 = Double.NaN;
        if (needDistance) {
            double b1 = sinCosSeries(true, ssig2, csig2, c1a)
                    - sinCosSeries(true, ssig1, csig1, c1a);
            s12b = a1 * (sig12 + b1);
            if (needJ12) {
                double b2 = sinCosSeries(true, ssig2, csig2, c2a)
                        - sinCosSeries(true, ssig1, csig1, c2a);
                j12 = m0x * sig12 + (a1 * b1 - a2 * b2);
            }
        } else if (needJ12) {
            for (int l = 1; l <= N_C2; l++) {
                c2a[l] = a1 * c1a[l] - a2 * c2a[l];
            }
            j12 = m0x * sig12
                    + (sinCosSeries(true, ssig2, csig2, c2a)
                    - sinCosSeries(true, ssig1, csig1, c2a));
        }
        if (needReducedLength) {
            m0 = m0x;
            // The parentheses keep the cancellation accurate for coincident
            // points.
            m12b = dn2 * (csig1 * ssig2)
                    - dn1 * (ssig1 * csig2)
                    - csig1 * csig2 * j12;
        }
        if (needScale) {
            double csig12 = csig1 * csig2 + ssig1 * ssig2;
            double t = ep2 * (cbet1 - cbet2) * (cbet1 + cbet2) / (dn1 + dn2);
            scale12 = csig12 + (t * ssig2 - csig2 * j12) * ssig1 / dn1;
            scale21 = csig12 - (t * ssig1 - csig1 * j12) * ssig2 / dn2;
        }
        return new Lengths(s12b, m12b, m0, scale12, scale21);
    }

    private static double astroid(double x, double y) {
        // Solve k^4 + 2k^3 - (x^2 + y^2 - 1)k^2 - 2y^2 k - y^2 = 0 for the
        // positive root k. Adapted from Geocentric::Reverse.
        double k;
        double p = sq(x);
        double q = sq(y);
        double r = (p + q - 1) / 6;
        if (!(q == 0 && r <= 0)) {
            double s = p * q / 4;
            double r2 = sq(r);
            double r3 = r * r2;
            // Discriminant of the quadratic equation for T3; zero on the
            // evolute curve p^(1/3) + q^(1/3) = 1.
            double disc = s * (s + 2 * r3);
            double u = r;
            if (disc >= 0) {
                double t3 = s + r3;
                // Pick the sign on the sqrt to maximize abs(T3).
                t3 += t3 < 0 ? -Math.sqrt(disc) : Math.sqrt(disc);
                double t = Math.cbrt(t3);
                u += t + (t != 0 ? r2 / t : 0);
            } else {
                double ang = Math.atan2(Math.sqrt(-disc), -(s + r3));
                u += 2 * r * Math.cos(ang / 3);
            }
            double v = Math.sqrt(sq(u) + q);
            double uv = u < 0 ? q / (v - u) : u + v;
            double w = (uv - q) / (2 * v);
            k = uv / (Math.sqrt(uv + sq(w)) + w);
        } else {
            k = 0;
        }
        return k;
    }

    private void a3coeff() {
        final double[] coeff = {
                // A3, coeff of eps^5, polynomial in n of order 0
                -3, 128,
                // A3, coeff of eps^4, polynomial in n of order 1
                -2, -3, 64,
                // A3, coeff of eps^3, polynomial in n of order 2
                -1, -3, -1, 16,
                // A3, coeff of eps^2, polynomial in n of order 2
                3, -1, -2, 8,
                // A3, coeff of eps^1, polynomial in n of order 1
                1, -1, 2,
                // A3, coeff of eps^0, polynomial in n of order 0
                1, 1,
        };
        int o = 0;
        int k = 0;
        for (int j = N_A3 - 1; j >= 0; --j) {
            int m = Math.min(N_A3 - j - 1, j);
            a3x[k++] = polyval(m, coeff, o, n) / coeff[o + m + 1];
            o += m + 2;
        }
    }

    private void c3coeff() {
        final double[] coeff = {
                // C3[1], coeff of eps^5, polynomial in n of order 0
                3, 128,
                // C3[1], coeff of eps^4, polynomial in n of order 1
                2, 5, 128,
                // C3[1], coeff of eps^3, polynomial in n of order 2
                -1, 3, 3, 64,
                // C3[1], coeff of eps^2, polynomial in n of order 2
                -1, 0, 1, 8,
                // C3[1], coeff of eps^1, polynomial in n of order 1
                -1, 1, 4,
                // C3[2], coeff of eps^5, polynomial in n of order 0
                5, 256,
                // C3[2], coeff of eps^4, polynomial in n of order 1
                1, 3, 128,
                // C3[2], coeff of eps^3, polynomial in n of order 2
                -3, -2, 3, 64,
                // C3[2], coeff of eps^2, polynomial in n of order 2
                1, -3, 2, 32,
                // C3[3], coeff of eps^5, polynomial in n of order 0
                7, 512,
                // C3[3], coeff of eps^4, polynomial in n of order 1
                -10, 9, 384,
                // C3[3], coeff of eps^3, polynomial in n of order 2
                5, -9, 5, 192,
                // C3[4], coeff of eps^5, polynomial in n of order 0
                7, 512,
                // C3[4], coeff of eps^4, polynomial in n of order 1
                -14, 7, 512,
                // C3[5], coeff of eps^5, polynomial in n of order 0
                21, 2560,
        };
        int o = 0;
        int k = 0;
        for (int l = 1; l < N_C3; ++l) {
            for (int j = N_C3 - 1; j >= l; --j) {
                int m = Math.min(N_C3 - j - 1, j);
                c3x[k++] = polyval(m, coeff, o, n) / coeff[o + m + 1];
                o += m + 2;
            }
        }
    }

    private double a3f(double eps) {
        return polyval(N_A3 - 1, a3x, 0, eps);
    }

    private void c3f(double eps, double[] c) {
        double mult = 1;
        int o = 0;
        for (int l = 1; l < N_C3; ++l) {
            int m = N_C3 - l - 1;
            mult *= eps;
            c[l] = mult * polyval(m, c3x, o, eps);
            o += m + 1;
        }
    }

    private void c4coeff() {
        // Coefficients of the area series C4 (GeographicLib Geodesic.cpp,
        // GEOGRAPHICLIB_GEODESIC_ORDER == 6).
        final double[] coeff = {
                // C4[0], coeff of eps^5, polynomial in n of order 0
                97, 15015,
                // C4[0], coeff of eps^4, polynomial in n of order 1
                1088, 156, 45045,
                // C4[0], coeff of eps^3, polynomial in n of order 2
                -224, -4784, 1573, 45045,
                // C4[0], coeff of eps^2, polynomial in n of order 3
                -10656, 14144, -4576, -858, 45045,
                // C4[0], coeff of eps^1, polynomial in n of order 4
                64, 624, -4576, 6864, -3003, 15015,
                // C4[0], coeff of eps^0, polynomial in n of order 5
                100, 208, 572, 3432, -12012, 30030, 45045,
                // C4[1], coeff of eps^5, polynomial in n of order 0
                1, 9009,
                // C4[1], coeff of eps^4, polynomial in n of order 1
                -2944, 468, 135135,
                // C4[1], coeff of eps^3, polynomial in n of order 2
                5792, 1040, -1287, 135135,
                // C4[1], coeff of eps^2, polynomial in n of order 3
                5952, -11648, 9152, -2574, 135135,
                // C4[1], coeff of eps^1, polynomial in n of order 4
                -64, -624, 4576, -6864, 3003, 135135,
                // C4[2], coeff of eps^5, polynomial in n of order 0
                8, 10725,
                // C4[2], coeff of eps^4, polynomial in n of order 1
                1856, -936, 225225,
                // C4[2], coeff of eps^3, polynomial in n of order 2
                -8448, 4992, -1144, 225225,
                // C4[2], coeff of eps^2, polynomial in n of order 3
                -1440, 4160, -4576, 1716, 225225,
                // C4[3], coeff of eps^5, polynomial in n of order 0
                -136, 63063,
                // C4[3], coeff of eps^4, polynomial in n of order 1
                1024, -208, 105105,
                // C4[3], coeff of eps^3, polynomial in n of order 2
                3584, -3328, 1144, 315315,
                // C4[4], coeff of eps^5, polynomial in n of order 0
                -128, 135135,
                // C4[4], coeff of eps^4, polynomial in n of order 1
                -2560, 832, 405405,
                // C4[5], coeff of eps^5, polynomial in n of order 0
                128, 99099,
        };
        int o = 0;
        int k = 0;
        for (int l = 0; l < N_C4; ++l) {
            for (int j = N_C4 - 1; j >= l; --j) {
                int m = N_C4 - j - 1;
                c4x[k++] = polyval(m, coeff, o, n) / coeff[o + m + 1];
                o += m + 2;
            }
        }
    }

    private void c4f(double eps, double[] c) {
        double mult = 1;
        int o = 0;
        for (int l = 0; l < N_C4; ++l) {
            int m = N_C4 - l - 1;
            c[l] = mult * polyval(m, c4x, o, eps);
            o += m + 1;
            mult *= eps;
        }
    }

    /**
     * The square of the authalic radius, c^2 = (a^2 + b^2 atanh(e) / e) / 2,
     * written with GeographicLib's eatanhe: atan replaces atanh on a prolate
     * ellipsoid, and c^2 = a^2 on a sphere.
     */
    private static double authalicRadiusSquared(
            double a,
            double b,
            double e2,
            double f
    ) {
        if (e2 == 0) {
            return (a * a + b * b) / 2;
        }
        double es = (f < 0 ? -1 : 1) * Math.sqrt(Math.abs(e2));
        double eatanhe = es > 0
                ? es * atanh(es)
                : -es * Math.atan(es);
        return (a * a + b * b * (eatanhe / e2)) / 2;
    }

    private static double atanh(double x) {
        // atanh(x) = log1p(2x / (1 - x)) / 2, accurate for small x.
        double y = Math.abs(x);
        y = Math.log1p(2 * y / (1 - y)) / 2;
        return Math.copySign(y, x);
    }

    private static double a1m1f(double eps) {
        final double[] coeff = {
                // (1 - eps) * A1 - 1, polynomial in eps^2 of order 3
                1, 4, 64, 0, 256,
        };
        int m = N_A1 / 2;
        double t = polyval(m, coeff, 0, sq(eps)) / coeff[m + 1];
        return (t + eps) / (1 - eps);
    }

    private static void c1f(double eps, double[] c) {
        final double[] coeff = {
                // C1[1]/eps^1, polynomial in eps^2 of order 2
                -1, 6, -16, 32,
                // C1[2]/eps^2, polynomial in eps^2 of order 2
                -9, 64, -128, 2048,
                // C1[3]/eps^3, polynomial in eps^2 of order 1
                9, -16, 768,
                // C1[4]/eps^4, polynomial in eps^2 of order 1
                3, -5, 512,
                // C1[5]/eps^5, polynomial in eps^2 of order 0
                -7, 1280,
                // C1[6]/eps^6, polynomial in eps^2 of order 0
                -7, 2048,
        };
        double eps2 = sq(eps);
        double d = eps;
        int o = 0;
        for (int l = 1; l <= N_C1; ++l) {
            int m = (N_C1 - l) / 2;
            c[l] = d * polyval(m, coeff, o, eps2)
                    / coeff[o + m + 1];
            o += m + 2;
            d *= eps;
        }
    }

    private static void c1pf(double eps, double[] c) {
        final double[] coeff = {
                // C1p[1]/eps^1, polynomial in eps^2 of order 2
                205, -432, 768, 1536,
                // C1p[2]/eps^2, polynomial in eps^2 of order 2
                4005, -4736, 3840, 12288,
                // C1p[3]/eps^3, polynomial in eps^2 of order 1
                -225, 116, 384,
                // C1p[4]/eps^4, polynomial in eps^2 of order 1
                -7173, 2695, 7680,
                // C1p[5]/eps^5, polynomial in eps^2 of order 0
                3467, 7680,
                // C1p[6]/eps^6, polynomial in eps^2 of order 0
                38081, 61440,
        };
        double eps2 = sq(eps);
        double d = eps;
        int o = 0;
        for (int l = 1; l <= N_C1P; ++l) {
            int m = (N_C1P - l) / 2;
            c[l] = d * polyval(m, coeff, o, eps2)
                    / coeff[o + m + 1];
            o += m + 2;
            d *= eps;
        }
    }

    private static double a2m1f(double eps) {
        final double[] coeff = {
                // (eps + 1) * A2 - 1, polynomial in eps^2 of order 3
                -11, -28, -192, 0, 256,
        };
        int m = N_A2 / 2;
        double t = polyval(m, coeff, 0, sq(eps)) / coeff[m + 1];
        return (t - eps) / (1 + eps);
    }

    private static void c2f(double eps, double[] c) {
        final double[] coeff = {
                // C2[1]/eps^1, polynomial in eps^2 of order 2
                1, 2, 16, 32,
                // C2[2]/eps^2, polynomial in eps^2 of order 2
                35, 64, 384, 2048,
                // C2[3]/eps^3, polynomial in eps^2 of order 1
                15, 80, 768,
                // C2[4]/eps^4, polynomial in eps^2 of order 1
                7, 35, 512,
                // C2[5]/eps^5, polynomial in eps^2 of order 0
                63, 1280,
                // C2[6]/eps^6, polynomial in eps^2 of order 0
                77, 2048,
        };
        double eps2 = sq(eps);
        double d = eps;
        int o = 0;
        for (int l = 1; l <= N_C2; ++l) {
            int m = (N_C2 - l) / 2;
            c[l] = d * polyval(m, coeff, o, eps2)
                    / coeff[o + m + 1];
            o += m + 2;
            d *= eps;
        }
    }

    private static double sinCosSeries(
            boolean sineSeries,
            double sinx,
            double cosx,
            double[] c
    ) {
        // Evaluate y = sum(c[i] * sin(2*i*x), i=1..n) or
        // sum(c[i] * cos((2*i+1)*x), i=0..n-1) with Clenshaw summation.
        // c[0] is unused for the sine series.
        int k = c.length;
        int count = k - (sineSeries ? 1 : 0);
        double ar = 2 * (cosx - sinx) * (cosx + sinx);
        double y0 = (count & 1) != 0 ? c[--k] : 0;
        double y1 = 0;
        count /= 2;
        while (count-- != 0) {
            y1 = ar * y0 - y1 + c[--k];
            y0 = ar * y1 - y0 + c[--k];
        }
        return sineSeries
                ? 2 * sinx * cosx * y0
                : cosx * (y0 - y1);
    }

    private static double sq(double value) {
        return value * value;
    }

    private static double[] norm(double sinx, double cosx) {
        double r = Math.hypot(sinx, cosx);
        return new double[]{sinx / r, cosx / r};
    }

    private static double polyval(int order, double[] p, int start, double x) {
        double y = order < 0 ? 0 : p[start];
        int index = start + 1;
        for (int n = order; n > 0; n--) {
            y = y * x + p[index++];
        }
        return y;
    }

    private static double angRound(double x) {
        final double z = 1 / 16.0;
        double y = Math.abs(x);
        // The compiler must not simplify z - (z - y) to y.
        y = y < z ? z - (z - y) : y;
        return Math.copySign(y, x);
    }

    private static double angNormalize(double x) {
        double y = Math.IEEEremainder(x, 360.0);
        return Math.abs(y) == 180 ? Math.copySign(180.0, x) : y;
    }

    private static double latFix(double x) {
        return Math.abs(x) > 90 ? Double.NaN : x;
    }

    private static double[] angDiff(double x, double y) {
        double[] sum = sum(
                Math.IEEEremainder(-x, 360.0),
                Math.IEEEremainder(y, 360.0)
        );
        sum = sum(Math.IEEEremainder(sum[0], 360.0), sum[1]);
        double difference = sum[0];
        double error = sum[1];
        if (difference == 0 || Math.abs(difference) == 180) {
            // If error == 0, take the sign from y - x; otherwise difference
            // and error must have opposite signs.
            difference = Math.copySign(
                    difference,
                    error == 0 ? y - x : -error
            );
        }
        return new double[]{difference, error};
    }

    private static double[] sum(double u, double v) {
        double s = u + v;
        double up = s - v;
        double vpp = s - up;
        up -= u;
        vpp -= v;
        double t = s != 0 ? 0 - (up + vpp) : s;
        return new double[]{s, t};
    }

    private static double[] sincosd(double x) {
        // Reduce the argument exactly to [-45, 45] before converting it to
        // radians so that cardinal directions stay exact.
        double d = x % 360.0;
        int quadrant = (int) Math.round(d / 90);
        d -= 90 * quadrant;
        double r = Math.toRadians(d);
        double s = Math.sin(r);
        double c = Math.cos(r);
        if (Math.abs(d) == 45) {
            c = Math.sqrt(0.5);
            s = Math.copySign(c, r);
        } else if (Math.abs(d) == 30) {
            c = Math.sqrt(0.75);
            s = Math.copySign(0.5, r);
        }
        double sinx;
        double cosx;
        switch (quadrant & 3) {
            case 0 -> {
                sinx = s;
                cosx = c;
            }
            case 1 -> {
                sinx = c;
                cosx = -s;
            }
            case 2 -> {
                sinx = -s;
                cosx = -c;
            }
            default -> {
                sinx = -c;
                cosx = s;
            }
        }
        if (sinx == 0) {
            sinx = Math.copySign(sinx, x);
        }
        return new double[]{sinx, 0.0 + cosx};
    }

    private static double[] sincosde(double x, double correction) {
        double d = x % 360.0;
        int quadrant = (int) Math.round(d / 90);
        d -= 90 * quadrant;
        double r = Math.toRadians(angRound(d + correction));
        double s = Math.sin(r);
        double c = Math.cos(r);
        if (Math.abs(d) == 45) {
            c = Math.sqrt(0.5);
            s = Math.copySign(c, r);
        } else if (Math.abs(d) == 30) {
            c = Math.sqrt(0.75);
            s = Math.copySign(0.5, r);
        }
        double sinx;
        double cosx;
        switch (quadrant & 3) {
            case 0 -> {
                sinx = s;
                cosx = c;
            }
            case 1 -> {
                sinx = c;
                cosx = -s;
            }
            case 2 -> {
                sinx = -s;
                cosx = -c;
            }
            default -> {
                sinx = -c;
                cosx = s;
            }
        }
        if (sinx == 0) {
            sinx = Math.copySign(sinx, x);
        }
        return new double[]{sinx, 0.0 + cosx};
    }

    private static double atan2d(double y, double x) {
        int quadrant = 0;
        double yy = y;
        double xx = x;
        if (Math.abs(yy) > Math.abs(xx)) {
            double swap = xx;
            xx = yy;
            yy = swap;
            quadrant = 2;
        }
        if (xx < 0) {
            xx = -xx;
            ++quadrant;
        }
        // Here xx >= 0 and xx >= abs(yy), so the angle is in [-pi/4, pi/4].
        double angle = Math.toDegrees(Math.atan2(yy, xx));
        return switch (quadrant) {
            case 1 -> Math.copySign(180.0, yy) - angle;
            case 2 -> 90 - angle;
            case 3 -> -90 + angle;
            default -> angle;
        };
    }
}
