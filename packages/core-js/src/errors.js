/**
 * Stable error codes, identical to the Java core's ErrorCode enum and to
 * contracts/error-codes.json.
 * @type {readonly string[]}
 */
export const ERROR_CODES = Object.freeze([
  "INVALID_ARGUMENT",
  "INVALID_NUMBER",
  "INPUT_LIMIT_EXCEEDED",
  "DIVISION_BY_ZERO",
  "UNKNOWN_UNIT_CATEGORY",
  "UNKNOWN_UNIT",
  "INVALID_PRECISION",
  "LATITUDE_OUT_OF_RANGE",
  "LONGITUDE_OUT_OF_RANGE",
  "INVALID_ANGLE",
  "INVALID_ZONE",
  "INVALID_HEMISPHERE",
  "OUTSIDE_UTM_DOMAIN",
  "OUTSIDE_UPS_DOMAIN",
  "GRID_COORDINATE_OUT_OF_RANGE",
  "INVALID_MGRS",
  "MGRS_SQUARE_NOT_IN_BAND",
  "OUTSIDE_MGRS_DOMAIN",
  "INVALID_GARS",
  "INVALID_GEOREF",
  "UNSUPPORTED_CRS",
  "OUTSIDE_CRS_DOMAIN",
  "NO_CONVERGENCE",
]);

const KNOWN_CODES = new Set(ERROR_CODES);

/**
 * The only error type the core throws for invalid input or an impossible
 * calculation. Branch on `code`; `message` is English developer text and may
 * change between versions.
 *
 * @example
 * try {
 *   decodeMgrs("32NQQ7070975688");
 * } catch (error) {
 *   if (error instanceof ConvertToolsError && error.code === "MGRS_SQUARE_NOT_IN_BAND") {
 *     // show a localised message
 *   }
 * }
 */
export class ConvertToolsError extends Error {
  /**
   * @param {string} code one of {@link ERROR_CODES}
   * @param {string} message
   */
  constructor(code, message) {
    if (!KNOWN_CODES.has(code)) {
      throw new TypeError(`Unknown ConvertToolsError code: ${code}`);
    }
    super(message);
    this.name = "ConvertToolsError";
    /** @type {string} */
    this.code = code;
  }
}
