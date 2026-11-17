import DataList, { DataRow } from "../../components/DataList.jsx";
import Disclosure from "../../components/Disclosure.jsx";
import PointField from "../../components/PointField.jsx";
import { fill, useLanguage } from "../../context.js";
import { localeDecimal } from "../../lib/locale-decimal.js";
import { COLORS, TYPE } from "../../theme.js";
import { Box } from "../../ui/index.js";
import Quantities from "./Quantities.jsx";

const POINTS = [
  { letter: "A", tone: "a" },
  { letter: "B", tone: "b" },
];

/**
 * The inputs of "İki nokta" (spec 8.1): points A and B, one field each.
 * @param {{
 *   rows: string[],
 *   target: null | { index: number, append: boolean },
 *   dispatch: (action: object) => void,
 * }} props
 *   rows: the two point fields as typed; target: what the next map click
 *   places (pickTarget).
 */
export default function InverseMode({ rows, target, dispatch, showFormats }) {
  const { text } = useLanguage();
  return POINTS.map(({ letter, tone }, index) => (
    <PointField
      key={letter}
      id={`measure-point-${index}`}
      label={index === 0 ? text.startPoint : text.endPoint}
      badge={{ text: letter, tone }}
      value={rows[index]}
      showFormats={showFormats}
      onChange={(value) => dispatch({ type: "edit", index, text: value })}
      onPoints={(points, { swapped }) => dispatch({ type: "paste", index, points, swapped })}
      picking={target != null && !target.append && target.index === index}
      onPick={() => dispatch({ type: "arm", index })}
      pickLabel={fill(text.pickPointLabel, { point: letter })}
      copyLabel={fill(text.copyPoint, { point: letter })}
    />
  ));
}

/**
 * The details of "İki nokta": the distance in every unit at full precision
 * and the geodesic quantities of inverseGeodesic.
 * @param {{ value: { inverse: object, lengths: { metre: string, kilometre: string, "nautical-mile": string } } }} props
 */
export function InverseDetails({ value }) {
  const { text, language } = useLanguage();
  const { inverse, lengths } = value;
  return (
    <>
      <Disclosure title={text.allUnits}>
        <DataList>
          {[
            [text.metres, lengths.metre, 3, "m"],
            [text.kilometres, lengths.kilometre, 9, "km"],
            [text.nauticalMiles, lengths["nautical-mile"], 9, "NM"],
          ].map(([label, plain, decimals, symbol]) => (
            <DataRow key={symbol} label={label} value={localeDecimal(plain, decimals, language)} unit={symbol} copyValue={plain} />
          ))}
        </DataList>
      </Disclosure>
      <Disclosure title={text.quantities}>
        <Quantities result={inverse} showSolver />
        <Box component="p" sx={{ m: 0, pt: 1, color: COLORS.muted, fontSize: TYPE.meta, lineHeight: 1.5 }}>
          {text.quantitiesNote}
        </Box>
      </Disclosure>
    </>
  );
}
