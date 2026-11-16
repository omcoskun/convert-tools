import { COLORS, MONO_FONT, PHONE, TYPE } from "../theme.js";
import { Box, TextField } from "../ui/index.js";

/**
 * A labelled text input or select: the label above, the control 36 px high
 * (40 px on phones, where the text is 16 px so iOS does not zoom in).
 * Typed values (coordinates, numbers, codes) are mono, with no
 * autocomplete or spell check. onPaste lets a tool take over a paste (e.g.
 * a coordinate pair for two fields).
 * @param {{
 *   id: string,
 *   label: string,
 *   value: string,
 *   onChange: (value: string) => void,
 *   onPaste?: (event: ClipboardEvent) => void,
 *   placeholder?: string,
 *   inputMode?: string,
 *   select?: boolean,
 *   children?: import("react").ReactNode,
 *   error?: boolean,
 *   describedBy?: string,
 *   labelStart?: import("react").ReactNode,
 *   labelEnd?: import("react").ReactNode,
 *   sx?: object,
 * }} props
 *   With select, children are the MenuItem options. describedBy is the id
 *   of a message about the value (aria-describedby). labelStart and
 *   labelEnd share the label's row: a badge before it, buttons at the end.
 *   sx styles the wrapper.
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
  describedBy,
  labelStart,
  labelEnd,
  sx,
}) {
  const labelId = `${id}-label`;
  const labelElement = (
    <Box
      component={select ? "span" : "label"}
      id={labelId}
      htmlFor={select ? undefined : id}
      sx={{
        color: COLORS.ink2,
        fontSize: TYPE.meta,
        fontWeight: 650,
        lineHeight: 1.4,
        ...((labelStart || labelEnd) && { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
      }}
    >
      {label}
    </Box>
  );
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, width: "100%", minWidth: 0, ...sx }}>
      {labelStart || labelEnd ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, minHeight: 28 }}>
          {labelStart}
          {labelElement}
          {labelEnd}
        </Box>
      ) : (
        labelElement
      )}
      <TextField
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        select={select}
        error={error}
        fullWidth
        size="small"
        autoComplete="off"
        SelectProps={select ? { labelId } : undefined}
        inputProps={select ? undefined : { inputMode, onPaste, spellCheck: "false", "aria-describedby": describedBy }}
        sx={{
          "& .MuiOutlinedInput-root": { height: 36 },
          "& .MuiOutlinedInput-input": {
            py: 0,
            pl: 1.5,
            fontSize: TYPE.body,
            ...(!select && { pr: 1.5, fontFamily: MONO_FONT, fontVariantNumeric: "tabular-nums" }),
          },
          [PHONE]: {
            "& .MuiOutlinedInput-root": { height: 40 },
            "& .MuiOutlinedInput-input": { fontSize: 16 },
          },
        }}
      >
        {children}
      </TextField>
    </Box>
  );
}
