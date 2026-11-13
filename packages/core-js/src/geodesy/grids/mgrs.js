// Military Grid Reference System (NGA.SIG.0012).
//
// Lettering, truncation and the band/row consistency rules follow
// GeographicLib's MGRS class (Karney), the reference used for the contract
// vectors: grid coordinates are first floored to whole micrometres and the
// digits are then truncated, the zone is always written with two digits, and
// a 100 km square is accepted only if it can lie in the stated latitude band.

import { latitudeBandIndex, utmUpsForward, utmUpsInverse } from "../projections/utm-ups.js";
import { ConvertToolsError } from "../../errors.js";

const TILE = 100000;
const MICROMETRES_PER_METRE = 1e6;
const TILE_MICROMETRES = TILE * MICROMETRES_PER_METRE; // 1e11
const MAX_DIGITS = 11; // GeographicLib's internal resolution: 1 µm
const ANGLE_EPSILON = 2 ** -46; // degrees; GeographicLib MGRS angeps

const LATITUDE_BANDS = "CDEFGHJKLMNPQRSTUVWX";
const UTM_COLUMNS = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"];
const UTM_ROWS = "ABCDEFGHJKLMNPQRSTUV";
const UPS_BANDS = "ABYZ";
const UPS_COLUMNS = ["JKLPQRSTUXYZ", "ABCFGHJKLPQR", "RSTUXYZ", "ABCFGHJ"];
const UPS_ROWS = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "ABCDEFGHJKLMNP"];

const MIN_UTM_COLUMN = 1;
const MAX_UTM_SOUTH_ROW = 100;
const UTM_ROW_PERIOD = 20;
const UTM_EVEN_ROW_SHIFT = 5;
const MIN_UPS_SOUTH_INDEX = 8;
const MIN_UPS_NORTH_INDEX = 13;
const UPS_EASTING_INDEX = 20;

/**
 * True row index in [-90, 95) for a band (-10…9), column (0…7) and periodic
 * row (0…19), or MAX_UTM_SOUTH_ROW when the square cannot lie in the band.
 * Port of GeographicLib MGRS::UTMRow.
 */
function utmRow(band, column, periodicRow) {
  const centre = (100 * (8 * band + 4)) / 90;
  const north = band >= 0 ? 1 : 0;
  const minimumRow = band > -10 ? Math.floor(centre - 4.3 - 0.1 * north) : -90;
  const maximumRow = band < 9 ? Math.floor(centre + 4.4 - 0.1 * north) : 94;
  const baseRow = Math.trunc((minimumRow + maximumRow) / 2) - UTM_ROW_PERIOD / 2;
  let row =
    ((periodicRow - baseRow + MAX_UTM_SOUTH_ROW) % UTM_ROW_PERIOD) + baseRow;
  if (!(row >= minimumRow && row <= maximumRow)) {
    // Northings 71e5 and 80e5 cross band boundaries inside particular
    // columns; these rows are valid only there.
    const foldedBand = band >= 0 ? band : -band - 1;
    const foldedRow = row >= 0 ? row : -row - 1;
    const foldedColumn = column < 4 ? column : -column + 7;
    if (
      !(
        (foldedRow === 70 && foldedBand === 8 && foldedColumn >= 2) ||
        (foldedRow === 71 && foldedBand === 7 && foldedColumn <= 2) ||
        (foldedRow === 79 && foldedBand === 9 && foldedColumn >= 1) ||
        (foldedRow === 80 && foldedBand === 8 && foldedColumn <= 1)
      )
    ) {
      row = MAX_UTM_SOUTH_ROW;
    }
  }
  return row;
}

function validatePrecision(precision) {
  if (!Number.isInteger(precision) || precision < 0 || precision > 5) {
    throw new ConvertToolsError("INVALID_PRECISION", "MGRS precision must be between 0 and 5.");
  }
}

function digitText(micrometres, tileIndex, precision) {
  if (precision === 0) return "";
  const withinTile = micrometres - tileIndex * TILE_MICROMETRES;
  const value = Math.floor(withinTile / 10 ** (MAX_DIGITS - precision));
  return String(value).padStart(precision, "0");
}

/**
 * Encodes a WGS 84 point as MGRS. Digits are truncated, never rounded, so the
 * code names the square that contains the point.
 * @param {number} latitude degrees
 * @param {number} longitude degrees
 * @param {number} [precision=5] digits per axis: 0 (100 km) … 5 (1 m)
 * @returns {string} e.g. "38SLC3918701405"; the zone always has two digits
 */
export function encodeMgrs(latitude, longitude, precision = 5) {
  validatePrecision(precision);
  const grid = utmUpsForward(latitude, longitude);
  const x = Math.floor(grid.easting * MICROMETRES_PER_METRE);
  const y = Math.floor(grid.northing * MICROMETRES_PER_METRE);
  const column = Math.floor(x / TILE_MICROMETRES);
  const row = Math.floor(y / TILE_MICROMETRES);
  let letters;
  if (grid.zone !== 0) {
    const band =
      Math.abs(latitude) < ANGLE_EPSILON
        ? grid.north
          ? 0
          : -1
        : latitudeBandIndex(latitude);
    const columnIndex = column - MIN_UTM_COLUMN;
    const trueRow = utmRow(band, columnIndex, row % UTM_ROW_PERIOD);
    if (trueRow !== row - (grid.north ? 0 : MAX_UTM_SOUTH_ROW)) {
      throw new ConvertToolsError("OUTSIDE_MGRS_DOMAIN", "Latitude is inconsistent with the UTM coordinates.");
    }
    const zoneIndex = grid.zone - 1;
    letters =
      String(grid.zone).padStart(2, "0") +
      LATITUDE_BANDS[band + 10] +
      UTM_COLUMNS[zoneIndex % 3][columnIndex] +
      UTM_ROWS[(row + (zoneIndex & 1 ? UTM_EVEN_ROW_SHIFT : 0)) % UTM_ROW_PERIOD];
  } else {
    const east = column >= UPS_EASTING_INDEX;
    const bandIndex = (grid.north ? 2 : 0) + (east ? 1 : 0);
    const columnOffset = east
      ? UPS_EASTING_INDEX
      : grid.north
        ? MIN_UPS_NORTH_INDEX
        : MIN_UPS_SOUTH_INDEX;
    const rowOffset = grid.north ? MIN_UPS_NORTH_INDEX : MIN_UPS_SOUTH_INDEX;
    const columnLetter = UPS_COLUMNS[bandIndex][column - columnOffset];
    const rowLetter = UPS_ROWS[grid.north ? 1 : 0][row - rowOffset];
    if (!columnLetter || !rowLetter) {
      throw new ConvertToolsError("OUTSIDE_MGRS_DOMAIN", "UPS coordinate is outside the MGRS lettering grid.");
    }
    letters = UPS_BANDS[bandIndex] + columnLetter + rowLetter;
  }
  return letters + digitText(x, column, precision) + digitText(y, row, precision);
}

function lookup(alphabet, character) {
  return character === undefined ? -1 : alphabet.indexOf(character);
}

/**
 * Decodes MGRS to its grid square. With `center` (default) the returned point
 * is the centre of the square, otherwise its south-west corner.
 * Throws when the square cannot lie in the stated zone and latitude band.
 * @param {string} value e.g. "38SLC3918701405" or "38S LC 39187 01405"
 * @param {boolean} [center=true]
 * @returns {{latitude: number, longitude: number, zone: number, north: boolean,
 *   easting: number, northing: number, precision: number, cellMetres: number}}
 */
export function decodeMgrs(value, center = true) {
  const source = String(value).toUpperCase().replace(/\s+/g, "");
  let position = 0;
  let zone = 0;
  while (position < source.length && /\d/.test(source[position])) {
    zone = zone * 10 + Number(source[position]);
    position += 1;
  }
  if (position > 2) throw new ConvertToolsError("INVALID_MGRS", "MGRS zone has more than two digits.");
  if (position > 0 && !(zone >= 1 && zone <= 60)) {
    throw new ConvertToolsError("INVALID_MGRS", "MGRS zone must be from 1 to 60.");
  }
  const utm = position > 0;
  let band = lookup(utm ? LATITUDE_BANDS : UPS_BANDS, source[position]);
  if (band < 0) throw new ConvertToolsError("INVALID_MGRS", "Invalid MGRS latitude band letter.");
  position += 1;
  const north = band >= (utm ? 10 : 2);
  if (source.length - position < 2) {
    throw new ConvertToolsError("INVALID_MGRS", "MGRS must include the 100 km square letters.");
  }
  let column = lookup(
    utm ? UTM_COLUMNS[(zone - 1) % 3] : UPS_COLUMNS[band],
    source[position],
  );
  if (column < 0) throw new ConvertToolsError("INVALID_MGRS", "Invalid MGRS 100 km column letter.");
  let row = lookup(utm ? UTM_ROWS : UPS_ROWS[north ? 1 : 0], source[position + 1]);
  if (row < 0) throw new ConvertToolsError("INVALID_MGRS", "Invalid MGRS 100 km row letter.");
  position += 2;

  if (utm) {
    if ((zone - 1) & 1) {
      row = (row + UTM_ROW_PERIOD - UTM_EVEN_ROW_SHIFT) % UTM_ROW_PERIOD;
    }
    band -= 10;
    row = utmRow(band, column, row);
    if (row === MAX_UTM_SOUTH_ROW) {
      throw new ConvertToolsError("MGRS_SQUARE_NOT_IN_BAND", "MGRS 100 km square is not in its zone and latitude band.");
    }
    row = north ? row : row + MAX_UTM_SOUTH_ROW;
    column += MIN_UTM_COLUMN;
  } else {
    const east = (band & 1) === 1;
    column += east
      ? UPS_EASTING_INDEX
      : north
        ? MIN_UPS_NORTH_INDEX
        : MIN_UPS_SOUTH_INDEX;
    row += north ? MIN_UPS_NORTH_INDEX : MIN_UPS_SOUTH_INDEX;
  }

  const digits = source.slice(position);
  if (!/^\d*$/.test(digits)) throw new ConvertToolsError("INVALID_MGRS", "MGRS digits contain a non-digit.");
  if (digits.length % 2 !== 0) {
    throw new ConvertToolsError("INVALID_MGRS", "MGRS must end with an even number of digits.");
  }
  const precision = digits.length / 2;
  if (precision > 5) throw new ConvertToolsError("INVALID_MGRS", "MGRS supports at most 5 digits per axis.");
  let unit = 1;
  let x = column;
  let y = row;
  for (let index = 0; index < precision; index += 1) {
    unit *= 10;
    x = x * 10 + Number(digits[index]);
    y = y * 10 + Number(digits[index + precision]);
  }
  if (center) {
    unit *= 2;
    x = 2 * x + 1;
    y = 2 * y + 1;
  }
  const easting = (TILE * x) / unit;
  const northing = (TILE * y) / unit;
  const point = utmUpsInverse(utm ? zone : 0, north, easting, northing);
  return {
    ...point,
    zone: utm ? zone : 0,
    north,
    easting,
    northing,
    precision,
    cellMetres: 10 ** (5 - precision),
  };
}

/**
 * Inserts spaces between MGRS parts for display: "38S LC 39187 01405".
 * Returns the normalised input unchanged if it is not MGRS-shaped.
 * @param {string} value
 * @returns {string}
 */
export function formatMgrs(value) {
  const source = String(value).toUpperCase().replace(/\s+/g, "");
  const utm = source.match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d*)$/);
  const ups = source.match(/^([ABYZ])([A-HJ-NP-Z]{2})(\d*)$/);
  const match = utm || ups;
  if (!match) return source;

  const numeric = match[match.length - 1];
  const prefix = match.slice(1, -1).join(" ");
  if (!numeric) return prefix;
  const split = numeric.length / 2;
  return `${prefix} ${numeric.slice(0, split)} ${numeric.slice(split)}`;
}
