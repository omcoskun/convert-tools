import { MONO_FONT } from "../theme.js";
import { TextField } from "../ui/index.js";

/** Text input for coordinates and numbers: no autocomplete or spell check. */
export default function Field({ id, label, value, onChange, placeholder, inputMode = "text", children, select, error }) {
  return (
    <TextField
      id={id}
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      select={select}
      error={error}
      fullWidth
      size="small"
      autoComplete="off"
      inputProps={select ? undefined : { inputMode, spellCheck: "false", style: { fontFamily: MONO_FONT } }}
    >
      {children}
    </TextField>
  );
}
