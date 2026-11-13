import Field from "../../components/Field.jsx";
import { useLanguage } from "../../context.js";
import { MenuItem, Stack } from "../../ui/index.js";

const SINGLE_FIELD_PLACEHOLDERS = {
  mgrs: "36S VK 88015 20370",
  gars: "426LV22",
  georef: "QJCK51585600",
};

export default function CoordinateInputFields({ format, values, setValue }) {
  const { text } = useLanguage();

  if (format === "dd" || format === "dms" || format === "ddm") {
    const placeholders = {
      dd: ["39.933365", "32.859742"],
      dms: [`39°56'00.114"N`, `032°51'35.071"E`],
      ddm: [`39°56.0019'N`, `032°51.5845'E`],
    }[format];
    const decimal = format === "dd" ? "decimal" : "text";
    return (
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Field
          id={`${format}-lat`}
          label={text.latitude}
          value={values[`${format}Lat`]}
          onChange={(value) => setValue(`${format}Lat`, value)}
          placeholder={placeholders[0]}
          inputMode={decimal}
        />
        <Field
          id={`${format}-lon`}
          label={text.longitude}
          value={values[`${format}Lon`]}
          onChange={(value) => setValue(`${format}Lon`, value)}
          placeholder={placeholders[1]}
          inputMode={decimal}
        />
      </Stack>
    );
  }

  if (format === "utm") {
    return (
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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
      </Stack>
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
