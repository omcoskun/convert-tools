import { transformCrs } from "./projections/crs.js";
import {
  formatDdm,
  formatDms,
  parseCoordinatePair,
} from "./formats/dms.js";
import {
  decodeGars,
  encodeGars,
} from "./grids/gars.js";
import {
  decodeGeoref,
  encodeGeoref,
} from "./grids/georef.js";
import { decodeMgrs, encodeMgrs, formatMgrs } from "./grids/mgrs.js";
import {
  fixed,
  parseCoordinateNumber,
  pointFromValues,
} from "./core/numbers.js";
import {
  utmUpsForward,
  utmUpsInverse,
} from "./projections/utm-ups.js";
import { ConvertToolsError } from "../errors.js";

const DD_DIGITS = 10;
const DMS_SECOND_DIGITS = 5;
const DDM_MINUTE_DIGITS = 7;
const GRID_METRE_DIGITS = 3;
const GARS_CELL_DEGREES = 1 / 12;
const GEOREF_PRECISION = 4;

function pointSource(point) {
  return { ...point, sourceKind: "point" };
}

export function fromDecimalDegrees(latitude, longitude) {
  return pointSource(pointFromValues(latitude, longitude));
}

export function fromDms(latitude, longitude) {
  return pointSource(parseCoordinatePair(latitude, longitude));
}

export function fromDdm(latitude, longitude) {
  return pointSource(parseCoordinatePair(latitude, longitude));
}

export function fromMgrs(value) {
  const decoded = decodeMgrs(value, true);
  return {
    latitude: decoded.latitude,
    longitude: decoded.longitude,
    sourceKind: "cell",
    sourceCellMetres: decoded.cellMetres,
  };
}

export function fromUtmUps(zoneValue, hemisphereValue, eastingValue, northingValue) {
  const zoneSource = String(zoneValue).trim();
  if (!/^\d{1,2}$/.test(zoneSource)) {
    throw new ConvertToolsError("INVALID_ZONE", "Zone must be an integer from 0 to 60.");
  }
  const zone = Number(zoneSource);
  if (zone < 0 || zone > 60) {
    throw new ConvertToolsError("INVALID_ZONE", "Zone must be an integer from 0 to 60.");
  }
  const hemisphere = String(hemisphereValue).trim().toUpperCase();
  if (hemisphere !== "N" && hemisphere !== "S") {
    throw new ConvertToolsError("INVALID_HEMISPHERE", "Hemisphere must be N or S.");
  }
  const point = utmUpsInverse(
    zone,
    hemisphere === "N",
    parseCoordinateNumber(eastingValue, "Easting"),
    parseCoordinateNumber(northingValue, "Northing"),
  );
  return pointSource(point);
}

export function fromGars(value) {
  const decoded = decodeGars(value);
  return {
    latitude: decoded.latitude,
    longitude: decoded.longitude,
    sourceKind: "area",
    sourceCellDegrees: decoded.cellDegrees,
  };
}

export function fromGeoref(value) {
  const decoded = decodeGeoref(value);
  return {
    latitude: decoded.latitude,
    longitude: decoded.longitude,
    sourceKind: "cell",
    sourceCellDegrees: decoded.cellDegrees,
  };
}

export function coordinateResults(point, mgrsPrecision = 5) {
  const { latitude, longitude } = pointFromValues(
    point.latitude,
    point.longitude,
  );
  const precision = Number(mgrsPrecision);
  if (!Number.isInteger(precision) || precision < 0 || precision > 5) {
    throw new ConvertToolsError("INVALID_PRECISION", "MGRS precision must be between 0 and 5.");
  }

  const grid = utmUpsForward(latitude, longitude);
  const gridPrefix =
    grid.zone === 0
      ? `UPS ${grid.north ? "N" : "S"}`
      : `${grid.zone}${grid.north ? "N" : "S"}`;
  const ddStepDegrees = 10 ** -DD_DIGITS;
  const dmsStepDegrees = 10 ** -DMS_SECOND_DIGITS / 3600;
  const ddmStepDegrees = 10 ** -DDM_MINUTE_DIGITS / 60;
  const mgrsCellMetres = 10 ** (5 - precision);
  const gridStepMetres = 10 ** -GRID_METRE_DIGITS;
  const georefCellDegrees =
    10 ** (2 - GEOREF_PRECISION) / 60;
  return {
    latitude,
    longitude,
    dd: `${fixed(latitude, DD_DIGITS)}, ${fixed(longitude, DD_DIGITS)}`,
    dms: `${formatDms(latitude, "latitude", DMS_SECOND_DIGITS)}  ${formatDms(longitude, "longitude", DMS_SECOND_DIGITS)}`,
    ddm: `${formatDdm(latitude, "latitude", DDM_MINUTE_DIGITS)}  ${formatDdm(longitude, "longitude", DDM_MINUTE_DIGITS)}`,
    mgrs: formatMgrs(encodeMgrs(latitude, longitude, precision)),
    utmUps: `${gridPrefix}  ${fixed(grid.easting, GRID_METRE_DIGITS)} E  ${fixed(grid.northing, GRID_METRE_DIGITS)} N`,
    gars: encodeGars(longitude, latitude),
    georef: encodeGeoref(longitude, latitude, GEOREF_PRECISION),
    resolution: {
      dd: {
        kind: "angular-rounding",
        stepDegrees: ddStepDegrees,
        maximumErrorDegrees: ddStepDegrees / 2,
      },
      dms: {
        kind: "angular-rounding",
        stepDegrees: dmsStepDegrees,
        maximumErrorDegrees: dmsStepDegrees / 2,
      },
      ddm: {
        kind: "angular-rounding",
        stepDegrees: ddmStepDegrees,
        maximumErrorDegrees: ddmStepDegrees / 2,
      },
      mgrs: {
        kind: "grid-cell",
        cellMetres: mgrsCellMetres,
        decodedPoint: "cell-center",
        maximumCenterOffsetMetres:
          mgrsCellMetres * Math.SQRT1_2,
      },
      utmUps: {
        kind: "grid-rounding",
        stepMetres: gridStepMetres,
        maximumErrorMetresPerAxis: gridStepMetres / 2,
      },
      gars: {
        kind: "angular-cell",
        cellDegrees: GARS_CELL_DEGREES,
        decodedPoint: "cell-center",
        maximumCenterOffsetDegreesPerAxis:
          GARS_CELL_DEGREES / 2,
      },
      georef: {
        kind: "angular-cell",
        cellDegrees: georefCellDegrees,
        decodedPoint: "cell-center",
        maximumCenterOffsetDegreesPerAxis:
          georefCellDegrees / 2,
      },
    },
    sourceKind: point.sourceKind ?? "point",
    sourceCellMetres: point.sourceCellMetres,
    sourceCellDegrees: point.sourceCellDegrees,
  };
}

export {
  decodeGars,
  decodeGeoref,
  decodeMgrs,
  encodeGars,
  encodeGeoref,
  encodeMgrs,
  formatDdm,
  formatDms,
  transformCrs,
  utmUpsForward,
  utmUpsInverse,
};
export {
  normalizeEpsg,
  SUPPORTED_CRS,
} from "./projections/crs.js";
