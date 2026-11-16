import Field from "../../components/Field.jsx";
import PointField from "../../components/PointField.jsx";
import { useLanguage } from "../../context.js";
import { Box, MenuItem } from "../../ui/index.js";

const SINGLE_FIELD_PLACEHOLDERS = {
  mgrs: "36S VK 88015 20370",
  gars: "426LV22",
  georef: "QJCK51585600",
};

// Two fields side by side where the widget is wide enough.
const pairSx = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 1 };

/**
 * The fields of one input format of the position tool. DD is one point
 * field ("enlem, boylam", PointField); the others are
 * the fields of their core reader.
 * @param {{
 *   format: string,
 *   values: Record<string, string>,
 *   setValue: (key: string, value: string) => void,
 *   onPoints: (points: { latitude: string, longitude: string }[], info: { swapped: boolean }) => void,
 * }} props
 *   onPoints: a pasted pair the point field hands over (see PointField).
 */
export default function CoordinateInputFields({ format, values, setValue, onPoints }) {
  const { text } = useLanguage();

  if (format === "dd") {
    return (
      <PointField
        id="position-point"
        label={text.positionPoint}
        value={values.dd}
        onChange={(value) => setValue("dd", value)}
        onPoints={onPoints}
        copyLabel={text.copyPosition}
      />
    );
  }

  if (format === "dms" || format === "ddm") {
    const placeholders = {
      dms: [`39°56'00.114"N`, `032°51'35.071"E`],
      ddm: [`39°56.0019'N`, `032°51.5845'E`],
    }[format];
    return (
      <Box sx={pairSx}>
        <Field
          id={`${format}-lat`}
          label={text.latitude}
          value={values[`${format}Lat`]}
          onChange={(value) => setValue(`${format}Lat`, value)}
          placeholder={placeholders[0]}
        />
        <Field
          id={`${format}-lon`}
          label={text.longitude}
          value={values[`${format}Lon`]}
          onChange={(value) => setValue(`${format}Lon`, value)}
          placeholder={placeholders[1]}
        />
      </Box>
    );
  }

  if (format === "utm") {
    return (
      <Box sx={pairSx}>
        <Field
          id="utm-zone"
          label={text.zone}
          value={values.zone}
          onChange={(value) => setValue("zone", value)}
          placeholder="36"
          inputMode="numeric"
        />
        <Field
          id="utm-hemisphere"
          select
          label={text.hemisphere}
          value={values.hemisphere}
          onChange={(value) => setValue("hemisphere", value)}
        >
          <MenuItem value="N">N</MenuItem>
          <MenuItem value="S">S</MenuItem>
        </Field>
        <Field
          id="utm-easting"
          label={text.easting}
          value={values.easting}
          onChange={(value) => setValue("easting", value)}
          placeholder="488015.988"
          inputMode="decimal"
        />
        <Field
          id="utm-northing"
          label={text.northing}
          value={values.northing}
          onChange={(value) => setValue("northing", value)}
          placeholder="4420370.844"
          inputMode="decimal"
        />
      </Box>
    );
  }

  return (
    <Field
      id={`${format}-coordinate`}
      label={text.coordinateValue}
      value={values[format]}
      onChange={(value) => setValue(format, value)}
      placeholder={SINGLE_FIELD_PLACEHOLDERS[format]}
    />
  );
}
