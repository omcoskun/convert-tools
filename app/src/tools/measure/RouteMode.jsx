import { useEffect, useRef } from "react";
import { DataRow } from "../../components/DataList.jsx";
import Disclosure from "../../components/Disclosure.jsx";
import Icon from "../../components/Icon.jsx";
import PointField from "../../components/PointField.jsx";
import { fill, useLanguage } from "../../context.js";
import { COLORS, MONO_FONT, TYPE } from "../../theme.js";
import { Box, Button } from "../../ui/index.js";
import { displayAngle, displayDistance, lengthsOf, routeTone } from "./measure.js";
import Quantities from "./Quantities.jsx";

/**
 * The inputs of "Rota" (spec 8.1): numbered point rows (at least two), each
 * removable while more than two are left, then "Nokta ekle" and the
 * "Haritadan ekle" toggle. A paste of several lines fills several rows.
 * @param {{
 *   rows: string[],
 *   target: null | { index: number, append: boolean },
 *   adding: boolean,
 *   maxPoints: number,
 *   dispatch: (action: object) => void,
 * }} props
 *   adding: map clicks append points; maxPoints: config.measure.route.maxPoints.
 */
export default function RouteMode({ rows, target, adding, maxPoints, dispatch }) {
  const { text } = useLanguage();
  const full = rows.length >= maxPoints;
  // After "Kaldır" the button may be gone (the last row, or the list is down
  // to two): focus then moves to the point field now at that position.
  const focusAfterRemove = useRef(null);
  useEffect(() => {
    const index = focusAfterRemove.current;
    if (index == null) return;
    focusAfterRemove.current = null;
    const active = document.activeElement;
    if (active == null || active === document.body) document.getElementById(`measure-point-${Math.min(index, rows.length - 1)}`)?.focus();
  }, [rows.length]);
  return (
    <>
      <Box component="ol" sx={{ display: "flex", flexDirection: "column", gap: 1, m: 0, p: 0, listStyle: "none" }}>
        {rows.map((row, index) => {
          const point = String(index + 1);
          return (
            // Rows are positions in the list: removing one renumbers those after it.
            <li key={index}>
              <PointField
                id={`measure-point-${index}`}
                label={fill(text.routePoint, { point })}
                badge={{ text: point, tone: routeTone(index, rows.length) }}
                value={row}
                onChange={(value) => dispatch({ type: "edit", index, text: value })}
                onPoints={(points, { swapped }) => dispatch({ type: "paste", index, points, swapped })}
                picking={target != null && !target.append && target.index === index}
                onPick={() => dispatch({ type: "arm", index })}
                pickLabel={fill(text.pickRoutePoint, { point })}
                onRemove={
                  rows.length > 2
                    ? () => {
                        focusAfterRemove.current = index;
                        dispatch({ type: "remove", index });
                      }
                    : undefined
                }
                removeLabel={fill(text.removePoint, { point })}
                copyLabel={fill(text.copyRoutePoint, { point })}
              />
            </li>
          );
        })}
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, "& .MuiButton-startIcon": { mr: "6px" } }}>
        <Button
          size="small"
          variant="outlined"
          disabled={full}
          onClick={() => dispatch({ type: "add" })}
          startIcon={<Icon name="plus" size={16} />}
        >
          {text.addPoint}
        </Button>
        <Button
          size="small"
          variant={adding ? "contained" : "outlined"}
          aria-pressed={adding}
          disabled={full && !adding}
          onClick={() => dispatch({ type: "adding" })}
          startIcon={<Icon name="crosshair" size={16} />}
        >
          {text.addFromMap}
        </Button>
      </Box>
      {full && (
        <Box component="p" sx={{ m: 0, color: COLORS.muted, fontSize: TYPE.meta, lineHeight: 1.5 }}>
          {fill(text.routeLimit, { max: maxPoints })}
        </Box>
      )}
    </>
  );
}

/**
 * The details of "Rota": "Parçalar", one row per segment (from → to, length,
 * azimuths) that opens to its geodesic quantities.
 * @param {{
 *   segments: object[],
 *   labels: string[],
 *   unit: { id: string, symbol: string, decimals: number },
 * }} props
 *   segments: measureGeodesicPolyline's segments; labels: "1 → 2" for each,
 *   in the row numbers of the input; unit: the result widget's unit.
 */
export function RouteDetails({ segments, labels, unit }) {
  const { text, language } = useLanguage();
  return (
    <Disclosure title={text.segmentsTitle}>
      {segments.map((segment, index) => {
        const azimuths = segment.azimuthDefined
          ? `${text.initialAzimuth} ${displayAngle(segment.initialBearingDegrees, language, segment.bearingUncertaintyDegrees)} · ${text.finalAzimuth} ${displayAngle(segment.finalBearingDegrees, language, segment.bearingUncertaintyDegrees)}`
          : `${text.initialAzimuth} — · ${text.finalAzimuth} —`;
        const lengths = lengthsOf(segment.distanceMetres);
        return (
          <Disclosure
            key={labels[index]}
            title={
              <Box component="span" sx={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                <Box component="span" sx={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 1.5 }}>
                  <span>{labels[index]}</span>
                  <Box component="span" sx={{ fontFamily: MONO_FONT, fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
                    {displayDistance(segment.distanceMetres, unit.id, unit.decimals, language)} {unit.symbol}
                  </Box>
                </Box>
                <Box component="span" sx={{ color: COLORS.muted, fontSize: TYPE.meta, fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
                  {azimuths}
                </Box>
              </Box>
            }
          >
            <Quantities result={segment}>
              <DataRow
                label={text.metres}
                value={displayDistance(segment.distanceMetres, "metre", 3, language)}
                unit="m"
                copyValue={lengths.metre}
              />
            </Quantities>
          </Disclosure>
        );
      })}
    </Disclosure>
  );
}
