/*
 * Triaxial ellipsoid coordinates and geodesics.
 *
 * The coordinate conversions are ported from GeographicLib's
 * Triaxial::Ellipsoid3 (Ellipsoid3.cpp):
 *
 * Copyright (c) Charles Karney (2024-2025) <karney@alum.mit.edu> and licensed
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

import io.github.mertc0604.converttools.coordinates.core.Angles;
import java.util.ArrayList;
import java.util.List;

/**
 * Mirror of packages/core-js/src/geodesy/triaxial/{ellipsoid3,geodesic3}.js:
 * the ellipsoid X²/a² + Y²/b² + Z²/c² = 1 with Karney's ellipsoidal latitude
 * beta and longitude omega, and geodesics by integration of the geodesic and
 * Jacobi equations in Cartesian coordinates (docs/TRIAXIAL_VALIDATION.md).
 * Angles are {sin, cos} pairs; the integration runs with lengths scaled so
 * that b = 1.
 */
final class TriaxialEngine {
    private static final int DIM = 10;
    private static final int[] SEQUENCE = {2, 4, 6, 8, 10, 12, 14, 16, 18, 20};
    private static final double STEP_TOLERANCE = 2e-15;
    private static final int MAX_SPLIT = 12;
    private static final int RAYS = 180;
    private static final int REFINE_RAYS = 16;
    private static final int NEWTON_ITERATIONS = 40;

    /** Semiaxes with the shape constants of Ellipsoid3::Ellipsoid3(a, b, c). */
    static final class Shape {
        final double a;
        final double b;
        final double c;
        final double k2;
        final double kp2;
        final double k;
        final double kp;
        final double ia2;
        final double ic2;
        final double step;
        final boolean umbilical;

        Shape(double a, double b, double c, double k2, double kp2) {
            this.a = a;
            this.b = b;
            this.c = c;
            this.k2 = k2;
            this.kp2 = kp2;
            this.k = Math.sqrt(k2);
            this.kp = Math.sqrt(kp2);
            this.ia2 = 1 / (a * a);
            this.ic2 = 1 / (c * c);
            // Macro step: 0.4 of the smallest principal radius of curvature.
            this.step = 0.4 * c * c / a;
            this.umbilical = !(k == 0 || kp == 0);
        }

        static Shape of(double a, double b, double c) {
            double s = (a - c) * (a + c);
            double kp2 = s == 0 ? 0 : (a - b) * (a + b) / s;
            double k2 = s == 0 ? 1 : (b - c) * (b + c) / s;
            return new Shape(a, b, c, k2, kp2);
        }

        Shape unit() {
            return new Shape(a / b, 1, c / b, k2, kp2);
        }
    }

    record Direct(double[] bet2, double[] omg2, double[] alp2, double m12, double M12, double M21) {
    }

    record Inverse(double s12, double[] alp1, double[] alp2, double m12, double M12, double M21, boolean ambiguous) {
    }

    private record End(double[] R, double[] V, double m, double dm, double M) {
    }

    private record Event(double s, double miss) {
    }

    private record Start(double alpha, double s) {
    }

    private record Solution(double alpha, double s, End end, double miss) {
    }

    private TriaxialEngine() {
    }

    static double[] angle(double degrees) {
        double[] sc = Angles.sincosd(degrees);
        return new double[] {sc[0], sc[1]};
    }

    static double degreesOf(double[] pair) {
        return Angles.atan2d(pair[0], pair[1]);
    }

    private static double hypot(double x, double y) {
        return Math.sqrt(x * x + y * y);
    }

    private static double hypot3(double x, double y, double z) {
        return Math.sqrt(x * x + y * y + z * z);
    }

    private static double[] normalize(double[] v) {
        double h = hypot3(v[0], v[1], v[2]);
        return new double[] {v[0] / h, v[1] / h, v[2] / h};
    }

    private static boolean signbit(double x) {
        return Math.copySign(1.0, x) < 0;
    }

    static double[] ellipToCart(Shape m, double[] bet, double[] omg) {
        double tx = hypot(m.k * bet[1], m.kp);
        double tz = hypot(m.k, m.kp * omg[0]);
        return new double[] {m.a * omg[1] * tx, m.b * bet[1] * omg[0], m.c * bet[0] * tz};
    }

    static double[] headingToDirection(Shape m, double[] bet, double[] omg, double[] alp) {
        double tx = hypot(m.k * bet[1], m.kp);
        double tz = hypot(m.k, m.kp * omg[0]);
        if (bet[1] == 0 && omg[0] == 0 && !(m.k == 0 || m.kp == 0)) {
            double sa2 = 2 * alp[0] * alp[1];
            double ca2 = (alp[1] - alp[0]) * (alp[1] + alp[0]);
            return new double[] {
                (m.a * m.k / m.b) * omg[1] * ca2, -omg[1] * bet[0] * sa2, -(m.c * m.kp / m.b) * bet[0] * ca2
            };
        }
        double[] north;
        double[] east;
        if (tx == 0) {
            double scb = signbit(bet[1]) ? -1 : 1;
            north = new double[] {-omg[1] * bet[0] * scb, -omg[0] * bet[0], 0};
            east = new double[] {-omg[0], omg[1] * scb, 0};
        } else if (tz == 0) {
            double sso = signbit(omg[0]) ? -1 : 1;
            north = new double[] {0, -bet[0] * sso, bet[1]};
            east = new double[] {0, bet[1] * omg[1], bet[0] * omg[1] * sso};
        } else {
            north = new double[] {
                -m.a * m.k2 * bet[1] * bet[0] * omg[1] / tx, -m.b * bet[0] * omg[0], m.c * bet[1] * tz
            };
            east = new double[] {
                -m.a * tx * omg[0], m.b * bet[1] * omg[1], m.c * m.kp2 * bet[0] * omg[1] * omg[0] / tz
            };
        }
        north = normalize(north);
        east = normalize(east);
        return new double[] {
            alp[1] * north[0] + alp[0] * east[0],
            alp[1] * north[1] + alp[0] * east[1],
            alp[1] * north[2] + alp[0] * east[2]
        };
    }

    /** {bet, omg} of a surface position, with cos(beta) >= 0. */
    static double[][] cartToEllip(Shape m, double[] R) {
        double xi = R[0] / m.a;
        double eta = R[1] / m.b;
        double zeta = R[2] / m.c;
        double g = m.k2 * xi * xi + (m.k2 - m.kp2) * eta * eta - m.kp2 * zeta * zeta;
        if (Math.abs(R[0]) == m.a * m.kp2 && R[1] == 0 && Math.abs(R[2]) == m.c * m.k2) {
            g = 0;
        }
        double h = hypot(g, 2 * m.k * m.kp * eta);
        double so;
        double cb;
        if (h == 0) {
            so = 0;
            cb = 0;
        } else if (g < 0) {
            so = Math.copySign(1.0, eta) * (Math.sqrt((h - g) / 2) / m.kp);
            cb = Math.abs(eta / so);
        } else {
            cb = Math.sqrt((h + g) / 2) / m.k;
            so = eta / cb;
        }
        double tz = hypot(m.k, m.kp * so);
        double tx = hypot(m.k * cb, m.kp);
        double sb = tz == 0 ? -1 : zeta / tz;
        double co = tx == 0 ? 1 : xi / tx;
        return new double[][] {{sb, cb}, {so, co}};
    }

    static double[] directionToHeading(Shape m, double[] bet, double[] omg, double[] V) {
        double tz = hypot(m.k, m.kp * omg[0]);
        double tx = hypot(m.k * bet[1], m.kp);
        if (tx == 0 || tz == 0 || !(bet[1] == 0 && omg[0] == 0)) {
            double[] north;
            double[] east;
            if (tx == 0) {
                north = new double[] {-omg[1] * bet[0], -omg[0] * bet[0], tx * bet[0]};
                east = new double[] {-omg[0], omg[1], tx};
            } else if (tz == 0) {
                north = new double[] {tz, -bet[0], bet[1]};
                east = new double[] {tz * omg[1], bet[1] * omg[1], bet[0] * omg[1]};
            } else {
                north = new double[] {
                    -m.a * m.k2 * bet[1] * bet[0] * omg[1] / tx, -m.b * bet[0] * omg[0], m.c * bet[1] * tz
                };
                east = new double[] {
                    -m.a * tx * omg[0], m.b * bet[1] * omg[1], m.c * m.kp2 * bet[0] * omg[1] * omg[0] / tz
                };
            }
            north = normalize(north);
            east = normalize(east);
            return new double[] {dot(V, east), dot(V, north)};
        }
        // Umbilical point: the direction cosines with respect to y = 0 give 2 alp.
        double w = bet[0] * omg[1];
        double upx = omg[1] * tx / m.a;
        double upz = bet[0] * tz / m.c;
        double nu = hypot(upx, upz);
        upx /= nu;
        upz /= nu;
        double s2a = -V[1] * w;
        double c2a = (upz * V[0] - upx * V[2]) * w;
        double flip = -bet[0];
        double sa;
        double ca;
        if (c2a >= 0) {
            sa = flip * s2a;
            ca = flip * (1 + c2a);
        } else {
            sa = flip * Math.copySign(1.0, s2a) * (1 - c2a);
            ca = flip * Math.abs(s2a);
        }
        double n = hypot(sa, ca);
        return new double[] {sa / n, ca / n};
    }

    /** R scaled onto the surface and V projected on the tangent plane (Ellipsoid3::Norm). */
    static double[][] projectToSurface(Shape m, double[] R, double[] V) {
        double ra = hypot3(R[0] / m.a, R[1] / m.b, R[2] / m.c);
        double[] P = {R[0] / ra, R[1] / ra, R[2] / ra};
        if (V == null) {
            return new double[][] {P, null};
        }
        double[] up = {P[0] / (m.a * m.a), P[1] / (m.b * m.b), P[2] / (m.c * m.c)};
        double u2 = dot(up, up);
        double f = dot(up, V) / u2;
        return new double[][] {P, normalize(new double[] {V[0] - f * up[0], V[1] - f * up[1], V[2] - f * up[2]})};
    }

    // ------------------------------------------------------------ integration

    private static void derivative(Shape u, double[] y, double[] dy) {
        double nx = y[0] * u.ia2;
        double ny = y[1];
        double nz = y[2] * u.ic2;
        double n2 = nx * nx + ny * ny + nz * nz;
        double kappa = (y[3] * y[3] * u.ia2 + y[4] * y[4] + y[5] * y[5] * u.ic2) / n2;
        double curvature = u.ia2 * u.ic2 / (n2 * n2);
        dy[0] = y[3];
        dy[1] = y[4];
        dy[2] = y[5];
        dy[3] = -kappa * nx;
        dy[4] = -kappa * ny;
        dy[5] = -kappa * nz;
        dy[6] = y[7];
        dy[7] = -curvature * y[6];
        dy[8] = y[9];
        dy[9] = -curvature * y[8];
    }

    private static double[] midpoint(Shape u, double[] y0, double H, int n) {
        double h = H / n;
        double[] z0 = y0.clone();
        double[] z1 = new double[DIM];
        double[] f = new double[DIM];
        derivative(u, z0, f);
        for (int i = 0; i < DIM; i++) {
            z1[i] = z0[i] + h * f[i];
        }
        for (int step = 1; step < n; step++) {
            derivative(u, z1, f);
            for (int i = 0; i < DIM; i++) {
                double t = z0[i] + 2 * h * f[i];
                z0[i] = z1[i];
                z1[i] = t;
            }
        }
        derivative(u, z1, f);
        double[] out = new double[DIM];
        for (int i = 0; i < DIM; i++) {
            out[i] = 0.5 * (z1[i] + z0[i] + h * f[i]);
        }
        return out;
    }

    private static double[] extrapolatedStep(Shape u, double[] y, double H) {
        List<double[][]> table = new ArrayList<>();
        for (int k = 0; k < SEQUENCE.length; k++) {
            double[][] row = new double[k + 1][];
            row[0] = midpoint(u, y, H, SEQUENCE[k]);
            for (int j = 1; j <= k; j++) {
                double r = (double) SEQUENCE[k] / SEQUENCE[k - j];
                double ratio = r * r - 1;
                double[] current = row[j - 1];
                double[] previous = table.get(k - 1)[j - 1];
                double[] next = new double[DIM];
                for (int i = 0; i < DIM; i++) {
                    next[i] = current[i] + (current[i] - previous[i]) / ratio;
                }
                row[j] = next;
            }
            table.add(row);
            if (k > 0) {
                double[] last = table.get(k - 1)[k - 1];
                double error = 0;
                for (int i = 0; i < DIM; i++) {
                    error = Math.max(error, Math.abs(row[k][i] - last[i]));
                }
                if (error <= STEP_TOLERANCE) {
                    return row[k];
                }
            }
        }
        return null;
    }

    private static double[] step(Shape u, double[] y, double H, int depth) {
        double[] result = extrapolatedStep(u, y, H);
        if (result != null) {
            return result;
        }
        if (depth >= MAX_SPLIT) {
            return midpoint(u, y, H, SEQUENCE[SEQUENCE.length - 1]);
        }
        return step(u, step(u, y, H / 2, depth + 1), H / 2, depth + 1);
    }

    private static double[] integrate(Shape u, double[] y0, double s) {
        int count = (int) Math.max(1, Math.ceil(Math.abs(s) / u.step));
        double H = s / count;
        double[] y = y0;
        for (int i = 0; i < count; i++) {
            y = step(u, y, H, 0);
        }
        return y;
    }

    private static double[] initialState(Shape u, double[] bet, double[] omg, double[] alp) {
        double[] R = ellipToCart(u, bet, omg);
        double[] V = headingToDirection(u, bet, omg, alp);
        return new double[] {R[0], R[1], R[2], V[0], V[1], V[2], 0, 1, 1, 0};
    }

    private static End finish(Shape u, double[] y) {
        double[][] RV = projectToSurface(u, new double[] {y[0], y[1], y[2]}, new double[] {y[3], y[4], y[5]});
        return new End(RV[0], RV[1], y[6], y[7], y[8]);
    }

    static Direct direct(Shape model, double[] bet1, double[] omg1, double[] alp1, double s) {
        Shape u = model.unit();
        End end = finish(u, integrate(u, initialState(u, bet1, omg1, alp1), s / model.b));
        double[][] position = cartToEllip(u, end.R());
        double[] alp2 = directionToHeading(u, position[0], position[1], end.V());
        return new Direct(position[0], position[1], alp2, end.m() * model.b, end.M(), end.dm());
    }

    // ---------------------------------------------------------------- inverse

    private static double dot(double[] x, double[] y) {
        return x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    }

    private static double[] cross(double[] x, double[] y) {
        return new double[] {x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]};
    }

    private static double[] unitNormal(Shape u, double[] R) {
        double[] n = {R[0] * u.ia2, R[1], R[2] * u.ic2};
        double h = Math.sqrt(dot(n, n));
        return new double[] {n[0] / h, n[1] / h, n[2] / h};
    }

    private static double along(double[] y, double[] P2) {
        return (P2[0] - y[0]) * y[3] + (P2[1] - y[1]) * y[4] + (P2[2] - y[2]) * y[5];
    }

    private static double alongDerivative(Shape u, double[] y, double[] P2) {
        double[] dy = new double[DIM];
        derivative(u, y, dy);
        return -(y[3] * y[3] + y[4] * y[4] + y[5] * y[5])
                + (P2[0] - y[0]) * dy[3] + (P2[1] - y[1]) * dy[4] + (P2[2] - y[2]) * dy[5];
    }

    private static double distance3(double[] x, double[] y) {
        return Math.sqrt((x[0] - y[0]) * (x[0] - y[0]) + (x[1] - y[1]) * (x[1] - y[1]) + (x[2] - y[2]) * (x[2] - y[2]));
    }

    private static List<Event> traceRay(Shape u, double[] y0, double[] P2, double sMax) {
        List<Event> events = new ArrayList<>();
        int count = (int) Math.ceil(sMax / u.step);
        double H = sMax / count;
        double[] y = y0;
        double f = along(y, P2);
        for (int i = 0; i < count; i++) {
            double[] next = step(u, y, H, 0);
            double fNext = along(next, P2);
            if (f > 0 && fNext <= 0) {
                double d = H * f / (f - fNext);
                double[] at = step(u, y, d, 0);
                for (int iteration = 0; iteration < 8; iteration++) {
                    double correction = -along(at, P2) / alongDerivative(u, at, P2);
                    d = Math.min(H, Math.max(0, d + correction));
                    at = step(u, y, d, 0);
                    if (Math.abs(correction) <= 1e-15) {
                        break;
                    }
                }
                events.add(new Event(i * H + d, distance3(new double[] {at[0], at[1], at[2]}, P2)));
            }
            y = next;
            f = fNext;
        }
        return events;
    }

    private static Event nearest(List<Event> events, double s) {
        Event best = null;
        for (Event event : events) {
            if (best == null || Math.abs(event.s() - s) < Math.abs(best.s() - s)) {
                best = event;
            }
        }
        return best;
    }

    /** The shortest geodesic, or null if no Newton iteration converged. */
    static Inverse inverse(Shape model, double[] bet1, double[] omg1, double[] bet2, double[] omg2) {
        Shape u = model.unit();
        double[] P1 = ellipToCart(u, bet1, omg1);
        double[] P2 = ellipToCart(u, bet2, omg2);
        if (P1[0] == P2[0] && P1[1] == P2[1] && P1[2] == P2[2]) {
            return new Inverse(0, angle(0), angle(0), 0, 1, 1, false);
        }
        // At an umbilical point the heading maps to the direction through 2 alp:
        // headings in [-90, 90) cover every direction once.
        boolean umb1 = u.umbilical && bet1[1] == 0 && omg1[0] == 0;
        boolean umb2 = u.umbilical && bet2[1] == 0 && omg2[0] == 0;
        double span = umb1 ? 180 : 360;
        double spacing = span / RAYS;
        double sMax = Math.PI * u.a;
        double[] alphas = new double[RAYS];
        List<List<Event>> rays = new ArrayList<>();
        for (int j = 0; j < RAYS; j++) {
            alphas[j] = -span / 2 + j * spacing;
            rays.add(traceRay(u, initialState(u, bet1, omg1, angle(alphas[j])), P2, sMax));
        }
        List<Start> starts = new ArrayList<>();
        for (int j = 0; j < RAYS; j++) {
            List<Event> left = rays.get((j + RAYS - 1) % RAYS);
            List<Event> right = rays.get((j + 1) % RAYS);
            for (Event event : rays.get(j)) {
                Event l = nearest(left, event.s());
                Event r = nearest(right, event.s());
                if ((l == null || event.miss() <= l.miss()) && (r == null || event.miss() <= r.miss())) {
                    starts.add(new Start(alphas[j], event.s()));
                }
            }
        }
        Solution best = null;
        List<Solution> solutions = new ArrayList<>();
        for (Start start : starts) {
            Solution solution = newton(u, bet1, omg1, P2, start.alpha(), start.s(), spacing);
            if (solution == null) {
                continue;
            }
            solutions.add(solution);
            if (best == null || solution.s() < best.s()) {
                best = solution;
            }
        }
        if (REFINE_RAYS > 0) {
            // Two local minima of the miss can sit closer together than one
            // coarse ray spacing, and the missed one can lie up to two coarse
            // cells from the seed when the coarser line sits exactly on a ray
            // (symmetric pairs do). Refine every coarse seed with a fine fan
            // over the seed's cell and its neighbours and start Newton from the
            // fine minima as well; a fine seed limits the Newton update to the
            // fine spacing.
            double fineSpacing = 2 * spacing / REFINE_RAYS;
            List<Start> fineStarts = new ArrayList<>();
            for (Start start : starts) {
                List<List<Event>> fine = new ArrayList<>();
                for (int k = 0; k <= 2 * REFINE_RAYS; k++) {
                    double alpha = start.alpha() - 2 * spacing + k * fineSpacing;
                    fine.add(traceRay(u, initialState(u, bet1, omg1, angle(alpha)), P2, sMax));
                }
                for (int k = 1; k < 2 * REFINE_RAYS; k++) {
                    List<Event> left = fine.get(k - 1);
                    List<Event> right = fine.get(k + 1);
                    double alpha = start.alpha() - 2 * spacing + k * fineSpacing;
                    for (Event event : fine.get(k)) {
                        Event l = nearest(left, event.s());
                        Event r = nearest(right, event.s());
                        if ((l == null || event.miss() <= l.miss()) && (r == null || event.miss() <= r.miss())) {
                            fineStarts.add(new Start(alpha, event.s()));
                        }
                    }
                }
            }
            for (Start start : fineStarts) {
                Solution solution = newton(u, bet1, omg1, P2, start.alpha(), start.s(), fineSpacing);
                if (solution == null) {
                    continue;
                }
                solutions.add(solution);
                if (best == null || solution.s() < best.s()) {
                    best = solution;
                }
            }
        }
        if (best == null) {
            return null;
        }
        double[] alp2 = directionToHeading(u, bet2, omg2, best.end().V());
        double[] alp1 = umb1
                ? directionToHeading(u, bet1, omg1, headingToDirection(u, bet1, omg1, angle(best.alpha())))
                : angle(best.alpha());
        // GeographicLib's choice between equally short geodesics and between
        // the two heading labels of a direction at an umbilical point
        // (docs/TRIAXIAL_VALIDATION.md). The mirror image in the plane z = 0
        // and the heading label leave s12, m12, M12 and M21 unchanged.
        boolean opposite = umb1 && umb2 && bet1[0] == -bet2[0] && omg1[1] == -omg2[1];
        // A line leaving the plane bet = 0 has an equally short mirror image.
        boolean ambiguous = bet1[0] == 0 && bet2[0] == 0 && Math.abs(alp1[1]) > 1e-9;
        // R1: both points on the ellipse bet = 0; leave towards negative bet.
        if (bet1[0] == 0 && bet2[0] == 0 && alp1[1] > 0) {
            alp1 = new double[] {alp1[0], -alp1[1]};
            alp2 = new double[] {alp2[0], -alp2[1]};
        }
        // R2: umbilical start, end on the plane y = 0.
        if (umb1 && !opposite && onPlane(bet2, omg2) && Math.abs(alp1[1]) <= 1e-9) {
            alp1 = new double[] {Math.signum(omg1[1]) * side(omg2), 0};
        }
        // R3: umbilical end, start on the plane y = 0.
        if (umb2 && !opposite && onPlane(bet1, omg1) && Math.abs(alp2[1]) <= 1e-9) {
            alp2 = umb1
                    ? new double[] {Math.signum(omg2[1]), 0}
                    : new double[] {-Math.signum(omg2[1]) * side(omg1), 0};
        }
        // Every direction from an umbilic reaches the antipodal umbilic with
        // the same length.
        if (opposite) {
            ambiguous = true;
        }
        // Two converged lines of the same length with different headings are
        // equally short geodesics.
        if (!ambiguous && solutions.size() > 1) {
            double period = umb1 ? 180 : 360;
            for (Solution solution : solutions) {
                if (solution == best || !(Math.abs(solution.s() - best.s()) <= 1e-13)) {
                    continue;
                }
                double wrapped = Math.abs(solution.alpha() - best.alpha()) % period;
                if (Math.min(wrapped, period - wrapped) > 1e-9) {
                    ambiguous = true;
                    break;
                }
            }
        }
        return new Inverse(best.s() * model.b, alp1, alp2, best.end().m() * model.b, best.end().M(),
                best.end().dm(), ambiguous);
    }

    /** True when the point lies on the plane y = 0, which carries the umbilics. */
    private static boolean onPlane(double[] bet, double[] omg) {
        return bet[1] == 0 || omg[0] == 0;
    }

    /** -1 for sin(omega) &lt; 0, else +1. */
    private static int side(double[] omg) {
        return omg[0] < 0 ? -1 : 1;
    }

    private static Solution newton(Shape u, double[] bet1, double[] omg1, double[] P2,
                                   double alpha0, double s0, double spacing) {
        double alpha = alpha0;
        double s = s0;
        Solution best = null;
        int lastBest = 0;
        boolean umbilic = u.umbilical && bet1[1] == 0 && omg1[0] == 0;
        double speed = umbilic ? 2 : 1;
        double[] R1 = ellipToCart(u, bet1, omg1);
        for (int iteration = 0; iteration < NEWTON_ITERATIONS; iteration++) {
            double[] start = angle(alpha);
            double[] V1 = headingToDirection(u, bet1, omg1, start);
            // dV1/dalp: the heading turned by 90 degrees (45 at an umbilical
            // point, where the direction depends on 2 alp with twice the speed).
            double[] turned = headingToDirection(u, bet1, omg1, angle(alpha + (umbilic ? 45 : 90)));
            double sense = Math.signum(dot(cross(unitNormal(u, R1), V1), turned));
            if (sense == 0 || Double.isNaN(sense)) {
                sense = 1;
            }
            End end = finish(u, integrate(u, new double[] {R1[0], R1[1], R1[2], V1[0], V1[1], V1[2], 0, 1, 1, 0}, s));
            double[] r = {P2[0] - end.R()[0], P2[1] - end.R()[1], P2[2] - end.R()[2]};
            double miss = Math.sqrt(dot(r, r));
            if (best == null || miss < best.miss()) {
                best = new Solution(alpha, s, end, miss);
                lastBest = iteration;
            }
            // Near an umbilic the reduced length is small and the iteration
            // converges slowly: keep going until the miss itself is well below
            // the distance tolerance, or for three iterations after the last
            // improvement.
            if (miss <= 1e-14 * u.a) {
                break;
            }
            if (iteration - lastBest >= 3) {
                break;
            }
            double[] W = cross(unitNormal(u, end.R()), end.V());
            double ds = dot(r, end.V());
            double dalpha = sense * dot(r, W) / (end.m() * speed) / (Math.PI / 180);
            if (!Double.isFinite(dalpha)) {
                dalpha = 0;
            }
            dalpha = Math.max(-spacing, Math.min(spacing, dalpha));
            alpha += dalpha;
            s += ds;
            if (!(s > 0)) {
                return null;
            }
        }
        return best.miss() < 1e-12 ? best : null;
    }
}
