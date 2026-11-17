import Disclosure from "../../components/Disclosure.jsx";
import Field from "../../components/Field.jsx";
import PointField from "../../components/PointField.jsx";
import Segmented from "../../components/Segmented.jsx";
import { fill, useLanguage } from "../../context.js";
import { readNumberText } from "../../lib/point-text.js";
import { COLORS, TYPE } from "../../theme.js";
import { Box } from "../../ui/index.js";
import { LENGTH_UNITS } from "./measure.js";
import Quantities from "./Quantities.jsx";

const message = { m: 0, color: COLORS.error, fontSize: TYPE.meta, fontWeight: 650, lineHeight: 1.45 };

/**
 * The inputs of "Azimut + mesafe" (spec 8.1): the start point A, the
 * azimuth in degrees and the distance with its unit. B is computed, so it
 * has no field.
 * @param {{
 *   state: { a: string, azimuth: string, distance: string, distanceUnit: string },
 *   target: null | { index: number, append: boolean },
 *   dispatch: (action: object) => void,
 * }} props
 */
export default function DirectMode({ state, target, dispatch, showFormats }) {
  const { text } = useLanguage();
  const azimuthInvalid = readNumberText(state.azimuth).status === "invalid";
  const distanceInvalid = readNumberText(state.distance).status === "invalid";
  const field = (name) => (value) => dispatch({ type: "direct", field: name, value });
  return (
    <>
      <PointField
        id="measure-point-0"
        label={text.startPoint}
        badge={{ text: "A", tone: "a" }}
        value={state.a}
        showFormats={showFormats}
        onChange={(value) => dispatch({ type: "edit", index: 0, text: value })}
        onPoints={(points, { swapped }) => dispatch({ type: "paste", index: 0, points, swapped })}
        picking={target != null && target.index === 0}
        onPick={() => dispatch({ type: "arm", index: 0 })}
        pickLabel={fill(text.pickPointLabel, { point: "A" })}
        copyLabel={fill(text.copyPoint, { point: "A" })}
      />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        <Field
          id="measure-azimuth"
          label={text.azimuth}
          value={state.azimuth}
          onChange={field("azimuth")}
          placeholder="90"
          error={azimuthInvalid}
          describedBy={azimuthInvalid ? "measure-azimuth-message" : undefined}
        />
        {azimuthInvalid && (
          <Box component="p" id="measure-azimuth-message" sx={message}>
            {text.invalid}
          </Box>
        )}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        <Field
          id="measure-distance"
          label={text.distance}
          labelEnd={
            <Segmented
              label={text.distanceUnit}
              size="sm"
              value={state.distanceUnit}
              onChange={field("distanceUnit")}
              options={LENGTH_UNITS.map((unit) => ({ value: unit.id, label: unit.symbol }))}
            />
          }
          value={state.distance}
          onChange={field("distance")}
          placeholder="100"
          inputMode="decimal"
          error={distanceInvalid}
          describedBy={distanceInvalid ? "measure-distance-message" : undefined}
        />
        {distanceInvalid && (
          <Box component="p" id="measure-distance-message" sx={message}>
            {text.invalid}
          </Box>
        )}
      </Box>
    </>
  );
}

/**
 * The details of "Azimut + mesafe": the geodesic quantities of
 * directGeodesic.
 * @param {{ value: { direct: object } }} props
 */
export function DirectDetails({ value }) {
  const { text } = useLanguage();
  return (
    <Disclosure title={text.quantities}>
      <Quantities result={value.direct} />
      <Box component="p" sx={{ m: 0, pt: 1, color: COLORS.muted, fontSize: TYPE.meta, lineHeight: 1.5 }}>
        {text.quantitiesNote} {text.directLineNote}
      </Box>
    </Disclosure>
  );
}
