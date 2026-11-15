import { MONO_FONT } from "../theme.js";
import { TextField } from "../ui/index.js";

/**
 * Text input for coordinates and numbers: no autocomplete or spell check.
 * onPaste lets a tool take over a paste (e.g. a coordinate pair for two
 * fields).
 */
export default function Field({
  id,
  label,
  value,
  onChange,
  onPaste,
  placeholder,
  inputMode = "text",
  children,
  select,
  error,
  sx,
}) {
  return (
    <TextField
      id={id}
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      select={select}
      error={error}
      sx={sx}
      fullWidth
      size="small"
      autoComplete="off"
      inputProps={select ? undefined : { inputMode, onPaste, spellCheck: "false", style: { fontFamily: MONO_FONT } }}
    >
      {children}
    </TextField>
  );
}
