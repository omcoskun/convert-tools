import DataList, { DataRow } from "../../components/DataList.jsx";
import { useLanguage } from "../../context.js";
import { fixedDecimal, localeDecimal } from "../../lib/locale-decimal.js";
import { plainNumber } from "../../lib/number-text.js";
import { squareKilometres } from "./measure.js";

/**
 * The five geodesic quantities of a core result (spec 8.1, GeographicLib's
 * names): a12 the arc length on the auxiliary sphere in degrees, m12 the
 * reduced length, M12 and M21 the geodesic scales, S12 the area between the
 * geodesic and the equator in km² (m² beneath). With showSolver, the solver
 * and its iterations follow. children: rows (DataRow) shown before them.
 * @param {{
 *   result: {
 *     arcDegrees: number,
 *     reducedLengthMetres: number,
 *     geodesicScale12: number,
 *     geodesicScale21: number,
 *     areaSquareMetres: number,
 *     solver?: string,
 *     iterations?: number,
 *   },
 *   showSolver?: boolean,
 *   children?: import("react").ReactNode,
 * }} props
 */
export default function Quantities({ result, showSolver = false, children }) {
  const { text, language } = useLanguage();
  const { arcDegrees, reducedLengthMetres, geodesicScale12, geodesicScale21, areaSquareMetres } = result;
  const area = squareKilometres(areaSquareMetres, 3);
  return (
    <DataList>
      {children}
      <DataRow
        label={text.arcLength}
        symbol="a₁₂"
        value={`${fixedDecimal(arcDegrees, 9, language)}°`}
        copyValue={plainNumber(arcDegrees)}
      />
      <DataRow
        label={text.reducedLength}
        symbol="m₁₂"
        value={fixedDecimal(reducedLengthMetres, 3, language)}
        unit="m"
        copyValue={plainNumber(reducedLengthMetres)}
      />
      <DataRow
        label={text.geodesicScale12}
        symbol="M₁₂"
        value={fixedDecimal(geodesicScale12, 9, language)}
        copyValue={plainNumber(geodesicScale12)}
      />
      <DataRow
        label={text.geodesicScale21}
        symbol="M₂₁"
        value={fixedDecimal(geodesicScale21, 9, language)}
        copyValue={plainNumber(geodesicScale21)}
      />
      <DataRow
        label={text.area}
        symbol="S₁₂"
        value={localeDecimal(area, 3, language)}
        unit="km²"
        copyValue={squareKilometres(areaSquareMetres, 9)}
        note={`${fixedDecimal(areaSquareMetres, 1, language)} m²`}
      />
      {showSolver && result.solver != null && (
        <>
          {/* The solver name is the core's own string, shown as is. */}
          <DataRow label={text.solver} value={String(result.solver)} />
          <DataRow label={text.iterations} value={result.iterations} />
        </>
      )}
    </DataList>
  );
}
