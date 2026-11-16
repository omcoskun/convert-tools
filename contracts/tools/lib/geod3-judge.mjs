// Row-by-row verdicts for the triaxial solvers on a file in the layout of
// Karney's Geod3Test data set: rows "bet1 omg1 alp1 bet2 omg2 alp2 s12 m12
// M12 M21" (angles in degrees, lengths in the unit b = 1). Shared by
// validate-geod3test.mjs for the JavaScript and the Java outputs.

/** Largest allowed value of each measure, for every row. */
export const FLOORS = Object.freeze({
  "inv-distance": 1e-13,
  "inv-azimuth": 1e-13,
  "dir-position": 1e-13,
  m12: 1e-11,
  M12: 1e-11,
  M21: 1e-11,
});
export const MEASURES = Object.keys(FLOORS);
export const BLOCKS = ["umbilical", "ellipse", "near-umbilic", "general"];
/**
 * Columns of the per-row output files (tab separated, one header line). `row`
 * is the 0-based row index; the eleven numbers after it are the `out` array
 * of {@link judgeRow}:
 *   s12, alp1, alp2  the inverse solution between the row's end points
 *   ambiguous        1 if the solver reports several shortest geodesics, else 0
 *   closure          Cartesian distance from point 2 of the end of the line
 *                    that leaves point 1 with that alp1 and s12
 *   x, y, z          end of the direct problem (bet1, omg1, alp1*, s12*)
 *   m12, M12, M21    of that direct problem
 * (* = the data set). A value that could not be computed is NaN.
 */
export const ROW_COLUMNS = ["row", "s12", "alp1", "alp2", "ambiguous", "closure", "x", "y", "z", "m12", "M12", "M21"];

/** Block of a data row, from its end points (see validate-geod3test.mjs). */
export function blockOf(v) {
  const umbilic = (bet, omg) => Math.abs(bet) === 90 && (omg === 0 || Math.abs(omg) === 180);
  const ellipse = (bet, omg) => bet === 0 || Math.abs(bet) === 90 || [0, 90, 180].includes(Math.abs(omg));
  const near = (bet, omg) => 90 - Math.abs(bet) < 1 && Math.min(Math.abs(omg), 180 - Math.abs(omg)) < 1;
  if (umbilic(v[0], v[1]) || umbilic(v[3], v[4])) return "umbilical";
  if (ellipse(v[0], v[1]) || ellipse(v[3], v[4])) return "ellipse";
  if (near(v[0], v[1]) || near(v[3], v[4])) return "near-umbilic";
  return "general";
}

/** Absolute difference of two headings (degrees), in radians. */
export function headingDifference(x, y) {
  const degrees = ((((x - y) % 360) + 540) % 360) - 180;
  return (Math.abs(degrees) * Math.PI) / 180;
}

/**
 * Judges one solver's output for one data row.
 * @param {number[]} v the ten numbers of the data row
 * @param {ArrayLike<number>} out the eleven numbers of ROW_COLUMNS after `row`
 * @param {number[][]} groupRows every data row that lists the same point pair
 *   (bet1 omg1 bet2 omg2) as `v`, `v` included
 * @param {(beta: number, omega: number) => {x: number, y: number, z: number}} toCartesian
 * @returns {{ invDistance: number, invAzimuth: number, dirPosition: number,
 *   m12: number, M12: number, M21: number, alternative: boolean,
 *   failed: string[] }} the six measures; `alternative` is true when the
 *   inverse answer is another shortest geodesic than the listed one (the
 *   length matches, the line closes on point 2 and the solver flagged the
 *   ambiguity), in which case inv-azimuth does not count as failed; `failed`
 *   lists the measures above their floor (a NaN is above every floor)
 */
export function judgeRow(v, out, groupRows, toCartesian) {
  // The inverse answer is compared with the listed row of this point pair
  // whose azimuths it matches best.
  let best = null;
  let bestScore = 0;
  for (const w of groupRows) {
    const score = Math.max(headingDifference(out[1], w[2]), headingDifference(out[2], w[5]));
    if (best === null || score < bestScore || Number.isNaN(score)) {
      best = w;
      bestScore = score;
    }
  }
  const end = toCartesian(v[3], v[4]);
  const values = {
    "inv-distance": Math.abs(out[0] - v[6]),
    "inv-azimuth": headingDifference(out[1], best[2]) * Math.abs(best[7]),
    "dir-position": Math.hypot(out[5] - end.x, out[6] - end.y, out[7] - end.z),
    m12: Math.abs(out[8] - v[7]),
    M12: Math.abs(out[9] - v[8]),
    M21: Math.abs(out[10] - v[9]),
  };
  const alternative =
    values["inv-azimuth"] > FLOORS["inv-azimuth"] &&
    values["inv-distance"] <= FLOORS["inv-distance"] &&
    out[4] <= FLOORS["dir-position"] &&
    out[3] === 1;
  const failed = MEASURES.filter(
    (name) => !(values[name] <= FLOORS[name]) && !(name === "inv-azimuth" && alternative),
  );
  return {
    invDistance: values["inv-distance"],
    invAzimuth: values["inv-azimuth"],
    dirPosition: values["dir-position"],
    m12: values.m12,
    M12: values.M12,
    M21: values.M21,
    alternative,
    failed,
  };
}
