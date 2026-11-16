import { COLORS, MONO_FONT, TYPE } from "../theme.js";
import { Box } from "../ui/index.js";
import CopyButton from "./CopyButton.jsx";

/**
 * A list of labelled values (a <dl>), one DataRow per entry, separated by
 * hairlines. No outer border or margin: the card or section around it
 * frames it.
 * @param {{ children: import("react").ReactNode }} props
 */
export default function DataList({ children }) {
  return (
    <Box component="dl" sx={{ m: 0, minWidth: 0, "& > * + *": { borderTop: `1px solid ${COLORS.rule}` } }}>
      {children}
    </Box>
  );
}

/**
 * One entry of a DataList: the label on the left, the value in mono on the
 * right, an optional copy button at the end and a note under the value.
 * Values line up from row to row whether a row can be copied or not.
 * @param {{
 *   label: string,
 *   symbol?: string,
 *   value: import("react").ReactNode,
 *   unit?: string,
 *   copyValue?: string,
 *   note?: import("react").ReactNode,
 * }} props
 *   symbol is a short mono prefix of the label such as "m12"; copyValue is
 *   the plain value to copy and adds a copy button named after the label.
 */
export function DataRow({ label, symbol, value, unit, copyValue, note }) {
  const copyable = copyValue != null;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: copyable ? "minmax(0, 40%) minmax(0, 1fr) auto" : "minmax(0, 40%) minmax(0, 1fr)",
        alignItems: "center",
        columnGap: 1.5,
        rowGap: 0.25,
        minHeight: 40,
        py: 1,
      }}
    >
      <Box component="dt" sx={{ color: COLORS.muted, fontSize: TYPE.small, lineHeight: 1.45, overflowWrap: "anywhere" }}>
        {symbol && (
          <>
            <Box component="span" sx={{ color: COLORS.ink, fontFamily: MONO_FONT, fontSize: TYPE.meta, fontWeight: 650 }}>
              {symbol}
            </Box>{" "}
          </>
        )}
        {label}
      </Box>
      <Box
        component="dd"
        sx={{
          m: 0,
          minWidth: 0,
          color: COLORS.ink,
          fontFamily: MONO_FONT,
          fontSize: TYPE.body,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.45,
          overflowWrap: "anywhere",
        }}
      >
        {value}
        {unit && (
          <>
            {" "}
            <Box component="span" sx={{ color: COLORS.muted, fontSize: TYPE.meta }}>
              {unit}
            </Box>
          </>
        )}
      </Box>
      {copyable && (
        <Box component="dd" sx={{ m: 0, mr: -0.5 }}>
          <CopyButton value={copyValue} label={label} iconOnly />
        </Box>
      )}
      {note && (
        <Box component="dd" sx={{ gridColumn: 2, m: 0, color: COLORS.muted, fontSize: TYPE.meta, lineHeight: 1.45 }}>
          {note}
        </Box>
      )}
    </Box>
  );
}
