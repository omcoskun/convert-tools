import { WGS84 } from "@convert-tools/core";
import DataList, { DataRow } from "../../components/DataList.jsx";
import Disclosure from "../../components/Disclosure.jsx";
import Field from "../../components/Field.jsx";
import Segmented from "../../components/Segmented.jsx";
import { fill, useLanguage } from "../../context.js";
import { localeDecimal, signedDecimal } from "../../lib/locale-decimal.js";
import { degreesText } from "../../lib/number-text.js";
import { COLORS, TYPE } from "../../theme.js";
import { Box } from "../../ui/index.js";
import { displayDistance } from "./measure.js";

const note = { m: 0, color: COLORS.muted, fontSize: TYPE.meta, lineHeight: 1.5 };

/** Number of decimals a configured number is written with (6371008.8 -> 1). */
function decimalsOf(value) {
  const [, fraction = ""] = String(value).split(".");
  return fraction.length;
}

/**
 * The short name of a model of config.measure.models, for the result
 * widget's label and the model switch.
 * @param {Record<string, string>} text
 * @param {string} id
 */
export function modelName(text, id) {
  return { wgs84: text.modelWgs84, grs80: text.modelGrs80, sphere: text.modelSphere, custom: text.modelCustom }[id] ?? id;
}

/**
 * "Model" in the details of every mode (spec 8.1): the switch between WGS 84
 * (default), GRS 80, the sphere and a custom ellipsoid (a and 1/f, 1/f = 0
 * a sphere), the parameters in use, and with WGS 84 the comparison with a
 * sphere. Always present, so a model the core rejects can be changed back.
 * @param {{
 *   models: Array<{ id: string, a?: number, inverseFlattening?: number }>,
 *   model: string,
 *   custom: { a: string, inverseFlattening: string },
 *   onModel: (id: string) => void,
 *   onCustom: (field: "a" | "inverseFlattening", value: string) => void,
 *   comparison?: null | { radiusMetres: number, metres: number, differenceMetres: number, differencePercent: number },
 *   unit: { id: string, symbol: string, decimals: number },
 * }} props
 *   comparison: sphericalComparison of the result (shown with WGS 84 only);
 *   unit: the unit the result widget shows the distance in.
 */
export default function ModelSection({ models, model, custom, onModel, onCustom, comparison, unit }) {
  const { text, language } = useLanguage();
  const entry = models.find((item) => item.id === model);
  let parameters = null;
  if (model === "wgs84") parameters = { a: String(WGS84.a), inverseFlattening: degreesText(1 / WGS84.f) };
  else if (entry && model !== "custom") parameters = { a: String(entry.a), inverseFlattening: String(entry.inverseFlattening) };

  return (
    <Disclosure title={text.modelTitle}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, minWidth: 0 }}>
        <Segmented
          label={text.modelChoice}
          size="sm"
          value={model}
          onChange={onModel}
          options={models.map((item) => ({ value: item.id, label: modelName(text, item.id) }))}
        />
        {model === "custom" ? (
          <>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 1 }}>
              <Field
                id="measure-model-a"
                label={text.semiMajorAxis}
                value={custom.a}
                onChange={(value) => onCustom("a", value)}
                inputMode="decimal"
              />
              <Field
                id="measure-model-inverse-flattening"
                label={text.inverseFlattening}
                value={custom.inverseFlattening}
                onChange={(value) => onCustom("inverseFlattening", value)}
              />
            </Box>
            <Box component="p" sx={note}>
              {text.customHint}
            </Box>
          </>
        ) : (
          parameters && (
            <DataList>
              <DataRow
                label={text.semiMajorAxis}
                value={localeDecimal(parameters.a, decimalsOf(parameters.a), language)}
                copyValue={parameters.a}
              />
              <DataRow
                label={text.inverseFlattening}
                value={localeDecimal(parameters.inverseFlattening, decimalsOf(parameters.inverseFlattening), language)}
                copyValue={parameters.inverseFlattening}
                note={parameters.inverseFlattening === "0" ? text.customHint : undefined}
              />
            </DataList>
          )
        )}
        {model === "wgs84" && comparison && (
          <Box component="section" aria-labelledby="measure-sphere-title" sx={{ pt: 1.5, borderTop: `1px solid ${COLORS.rule}` }}>
            <Box component="h3" id="measure-sphere-title" sx={{ m: 0, fontSize: TYPE.small, fontWeight: 650 }}>
              {text.sphericalComparison}
            </Box>
            <DataList>
              <DataRow
                label={text.sphereDistance}
                value={displayDistance(comparison.metres, unit.id, unit.decimals, language)}
                unit={unit.symbol}
              />
              <DataRow
                label={text.sphereDifference}
                value={fill(text.sphereDifferenceValue, {
                  metres: signedDecimal(comparison.differenceMetres, 1, language),
                  percent: signedDecimal(comparison.differencePercent, 3, language),
                })}
              />
            </DataList>
            <Box component="p" sx={{ ...note, mt: 0.5 }}>
              {fill(text.sphereComparisonNote, {
                radius: localeDecimal(String(comparison.radiusMetres), decimalsOf(comparison.radiusMetres), language),
              })}
            </Box>
          </Box>
        )}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, pt: 1.5, borderTop: `1px solid ${COLORS.rule}` }}>
          <Box component="p" sx={note}>
            {text.distanceModel}
          </Box>
          <Box component="p" sx={note}>
            {text.mapVisualOnly} {text.mapProjection}
          </Box>
          <Box component="p" sx={note}>
            {text.mapPickRounding} {text.mapBasemapSource}
          </Box>
        </Box>
      </Box>
    </Disclosure>
  );
}
