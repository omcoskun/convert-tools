import { Children, useId, useState } from "react";
import CopyButton from "../components/CopyButton.jsx";
import DataList, { DataRow } from "../components/DataList.jsx";
import Icon from "../components/Icon.jsx";
import { readoutFigureSx, readoutLabelSx } from "../components/Readout.jsx";
import { useLanguage } from "../context.js";
import { useSettledValue } from "../lib/use-settled-value.js";
import { COLORS, MONO_FONT, MOTION, PHONE, RADIUS, SHADOW, TYPE, WORKSPACE } from "../theme.js";
import { Box, visuallyHidden } from "../ui/index.js";
import { useWidgetRef, useWorkspace } from "./workspace-context.js";

// Desktop: a card centred at the bottom of the map. Its ink bar holds the
// label, the primary value and up to three cells; the details drawer opens
// above the bar on the sheet colour, so the kit's paper components read in
// it. Phone (spec 6.3): the bar becomes the ink strip at the top of the
// bottom sheet (primary value and the first cell), and the notices, the
// remaining cells and the details flow into the sheet after the input
// widget. The parts are placed with CSS only (order, display: contents),
// so the details are rendered once.
const desktop = {
  position: "absolute",
  left: "50%",
  bottom: WORKSPACE.hudBottom,
  transform: "translateX(-50%)",
  width: WORKSPACE.hudWidth,
  display: "flex",
  flexDirection: "column",
  gap: 1,
  pointerEvents: "none",
  "& > *": { pointerEvents: "auto" },
  "@media (min-width: 1100px)": {
    left: `calc(50% + (${WORKSPACE.inputWidth} + ${WORKSPACE.inset}px) / 2)`,
    width: `min(760px, calc(100% - ${WORKSPACE.inputWidth} - 64px))`,
  },
};

const hudSx = (expanded) => ({
  ...desktop,
  "& .hud-notices": { display: "flex", flexDirection: "column", gap: 1, "& > *": { boxShadow: SHADOW.float } },
  "& .hud-box": {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: `${RADIUS.widget}px`,
    bgcolor: COLORS.panel,
    boxShadow: SHADOW.float,
  },
  "& .hud-drawer": {
    display: "none",
    position: "relative",
    maxHeight: "min(440px, calc(100vh - 340px))",
    overflowY: "auto",
    overscrollBehavior: "contain",
    px: 2,
    py: 0.5,
    bgcolor: COLORS.sheet,
    color: COLORS.ink,
  },
  "& .hud-drawer[data-open='true']": { display: "block" },
  "& .hud-main": { display: "flex", flexDirection: "column", gap: 0.5, p: "12px 16px 8px", color: COLORS.onInk },
  "& .hud-head": { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, minHeight: 28 },
  // A value too long to share the row with its cells (a coordinate pair)
  // sends the cells to a second line instead of breaking or overlapping.
  "& .hud-row": { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 2, rowGap: 0.5, minHeight: 48, minWidth: 0 },
  "& .hud-cells-sheet": { display: "none" },
  "& .hud-actions-sheet": { display: "none", flexWrap: "wrap", gap: 1 },
  "& .hud-foot": { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, minHeight: 28 },
  "& .hud-actions": { display: "flex", flexWrap: "wrap", gap: 0.5, ml: "auto" },
  "& .hud-action": {
    display: "inline-flex",
    alignItems: "center",
    gap: 0.5,
    height: 28,
    px: 1.25,
    border: `1px solid ${COLORS.inkRaised}`,
    borderRadius: `${RADIUS.pill}px`,
    bgcolor: "transparent",
    color: COLORS.onInk,
    font: "inherit",
    fontSize: TYPE.meta,
    fontWeight: 650,
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: `background-color ${MOTION.fast} ${MOTION.ease}`,
    "&:hover": { bgcolor: COLORS.inkRaised },
    "&:focus-visible": { outlineColor: COLORS.focusOnInk },
  },
  // On phones the actions leave the slim strip for the sheet, on paper.
  "& .hud-actions-sheet .hud-action": {
    height: 40,
    px: 1.5,
    borderColor: COLORS.rule2,
    color: COLORS.ink,
    bgcolor: COLORS.sheet,
    "&:hover": { bgcolor: COLORS.paper2 },
    "&:focus-visible": { outlineColor: COLORS.focus },
  },
  ...(expanded && {
    "@media (min-width: 1100px)": { left: "50%", width: WORKSPACE.hudWidth },
    "& .hud-notices, & .hud-box": { display: "none" },
  }),
  [PHONE]: expanded
    ? { bottom: 16 }
    : {
        display: "contents",
        "& .hud-notices": { order: -1, px: 2, pt: 1.5, "& > *": { boxShadow: "none" } },
        "& .hud-box": { display: "contents" },
        "& .hud-main": {
          order: -2,
          position: "sticky",
          top: 0,
          zIndex: 2,
          flex: "none",
          gap: 0,
          // Room for the sheet's drag handle drawn over the strip's top edge.
          p: "20px 16px 10px",
          bgcolor: COLORS.panel,
        },
        "& .hud-head": { minHeight: 24 },
        "& .hud-row": { minHeight: 40, columnGap: 1.5 },
        "& .hud-cells > div:nth-of-type(n + 2), & .hud-foot": { display: "none" },
        "& .hud-actions-sheet": { display: "flex", order: 1, flex: "none", px: 2, pt: 1 },
        "& .hud-cells-sheet": { display: "block", order: 1, flex: "none", px: 2 },
        "& .hud-drawer, & .hud-drawer[data-open='true']": {
          display: "block",
          order: 2,
          flex: "none",
          maxHeight: "none",
          overflow: "visible",
          px: 2,
          pt: 0,
          pb: 3,
          bgcolor: "transparent",
        },
      },
});

// A long primary value (a coordinate pair): the page heading size, broken
// only at its spaces.
const mediumFigure = {
  fontSize: TYPE.heading,
  letterSpacing: "-0.01em",
  overflowWrap: "normal",
  [PHONE]: { fontSize: 20 },
};

/**
 * The result widget (HUD) of a workspace tool (spec 6.2, 6.3): the primary
 * value large on ink with its unit, unit switch and copy button, up to three
 * secondary cells beside it and a "Ayrıntılar" toggle that opens a drawer
 * upwards with everything else. With no value it shows the empty node: one
 * instruction and, where it helps, one action button. While the map is
 * enlarged it is one compact line. Announces each settled value politely.
 * A workspace tool renders exactly one, next to its InputWidget.
 * @param {{
 *   label: string,
 *   value?: string | null,
 *   unit?: string,
 *   copyValue?: string,
 *   copyLabel?: string,
 *   aside?: import("react").ReactNode,
 *   cells?: Array<{ label: string, value: string, copyValue?: string }>,
 *   empty?: import("react").ReactNode,
 *   notices?: import("react").ReactNode,
 *   details?: import("react").ReactNode,
 *   valueSize?: "lg" | "md",
 *   actions?: Array<{ key: string, label: string, icon?: string, onClick: () => void }>,
 * }} props
 *   label names the value ("Elipsoidal mesafe · WGS 84"); value is the
 *   formatted figure, null or undefined when there is none; copyValue is
 *   the plain value its copy button copies, named by copyLabel (default
 *   label); aside sits at the right of the label row (a Segmented
 *   tone="ink" size="sm" unit switch); cells are shown with a value only;
 *   notices (Notice or ErrorMessage elements) render above the primary row;
 *   details is the drawer content (Disclosure sections, closed by default),
 *   and without it there is no toggle. valueSize "md" sets a long value
 *   (a coordinate pair) at the page heading size instead of the readout
 *   size, so it fits beside its cells and breaks only between its parts.
 *   actions are buttons that act on the value (hand it to another tool),
 *   shown with a value only, at the foot of the ink bar.
 */
export default function ResultHud({
  label,
  value,
  unit,
  copyValue,
  copyLabel,
  aside,
  cells = [],
  empty,
  notices,
  details,
  valueSize = "lg",
  actions = [],
}) {
  const { text } = useLanguage();
  const { expanded } = useWorkspace();
  const widgetRef = useWidgetRef("result");
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const drawerId = useId();
  const hasValue = value != null;
  const noticeItems = Children.toArray(notices);
  const hasDetails = details != null && details !== false;
  const shownCells = hasValue ? cells.slice(0, 3) : [];
  const shownActions = hasValue ? actions : [];
  const announced = useSettledValue(hasValue ? `${label}: ${value}${unit ? ` ${unit}` : ""}` : "", 700);

  return (
    <Box ref={widgetRef} data-widget="result" sx={hudSx(expanded)}>
      {noticeItems.length > 0 && <Box className="hud-notices">{noticeItems}</Box>}
      <Box component="section" className="hud-box" aria-labelledby={labelId}>
        {hasDetails && (
          <Box id={drawerId} className="hud-drawer" data-open={open}>
            {details}
          </Box>
        )}
        <div className="hud-main">
          <div className="hud-head">
            <Box component="p" id={labelId} sx={{ ...readoutLabelSx, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", [PHONE]: { whiteSpace: "normal" } }}>
              {label}
            </Box>
            {aside}
          </div>
          <div className="hud-row">
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: "1 1 auto", minWidth: 0 }}>
              {hasValue ? (
                <>
                  <Box component="p" sx={{ m: 0, minWidth: 0, fontFamily: MONO_FONT, fontVariantNumeric: "tabular-nums" }}>
                    <Box component="span" sx={{ ...readoutFigureSx, ...(valueSize === "md" && mediumFigure), color: COLORS.onInk }}>
                      {value}
                    </Box>
                    {unit && (
                      <>
                        {" "}
                        <Box component="span" sx={{ color: COLORS.onInkMuted, fontSize: TYPE.title }}>
                          {unit}
                        </Box>
                      </>
                    )}
                  </Box>
                  {copyValue != null && <CopyButton value={copyValue} label={copyLabel || label} iconOnly tone="ink" />}
                </>
              ) : (
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    columnGap: 2,
                    rowGap: 1,
                    py: 0.5,
                    color: COLORS.onInkMuted,
                    fontSize: TYPE.small,
                    lineHeight: 1.5,
                  }}
                >
                  {empty}
                </Box>
              )}
            </Box>
            {shownCells.length > 0 && (
              <Box component="dl" className="hud-cells" sx={{ display: "flex", flex: "none", m: 0 }}>
                {shownCells.map((cell) => (
                  <Box
                    key={cell.label}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "auto auto",
                      alignItems: "center",
                      columnGap: 0.5,
                      rowGap: "2px",
                      pl: 2,
                      ml: 2,
                      borderLeft: `1px solid ${COLORS.inkRaised}`,
                      "&:first-of-type": { ml: 0 },
                      [PHONE]: { pl: 1.5, ml: 0 },
                    }}
                  >
                    <Box component="dt" sx={{ ...readoutLabelSx, gridColumn: 1, whiteSpace: "nowrap" }}>
                      {cell.label}
                    </Box>
                    <Box
                      component="dd"
                      sx={{
                        gridColumn: 1,
                        m: 0,
                        fontFamily: MONO_FONT,
                        fontSize: TYPE.title,
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cell.value}
                    </Box>
                    {cell.copyValue != null && (
                      <Box component="dd" sx={{ gridColumn: 2, gridRow: "1 / span 2", m: 0, [PHONE]: { display: "none" } }}>
                        <CopyButton value={cell.copyValue} label={cell.label} iconOnly tone="ink" />
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </div>
          {(hasDetails || shownActions.length > 0) && (
            <div className="hud-foot">
              {hasDetails && (
                <Box
                  component="button"
                  type="button"
                  className="hud-toggle"
                  onClick={() => setOpen(!open)}
                  aria-expanded={open}
                  aria-controls={drawerId}
                  sx={{
                    alignSelf: "flex-start",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.5,
                    height: 28,
                    ml: -1,
                    px: 1,
                    border: 0,
                    borderRadius: `${RADIUS.control}px`,
                    bgcolor: "transparent",
                    color: COLORS.onInkMuted,
                    font: "inherit",
                    fontSize: TYPE.small,
                    fontWeight: 650,
                    cursor: "pointer",
                    transition: `background-color ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}`,
                    "&:hover": { bgcolor: COLORS.inkRaised, color: COLORS.onInk },
                    "&:focus-visible": { outlineColor: COLORS.focusOnInk },
                    "& > svg": { transform: open ? "none" : "rotate(180deg)", transition: `transform ${MOTION.base} ${MOTION.ease}` },
                  }}
                >
                  {text.resultDetails}
                  <Icon name="chevron" size={16} />
                </Box>
              )}
              {shownActions.length > 0 && (
                <div className="hud-actions">
                  {shownActions.map((action) => (
                    <Box key={action.key} component="button" type="button" className="hud-action" onClick={action.onClick}>
                      {action.icon && <Icon name={action.icon} size={15} />}
                      {action.label}
                    </Box>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Box>
      {/* The actions again for the phone sheet; only one of the two is ever displayed. */}
      {shownActions.length > 0 && (
        <div className="hud-actions-sheet">
          {shownActions.map((action) => (
            <Box key={action.key} component="button" type="button" className="hud-action" onClick={action.onClick}>
              {action.icon && <Icon name={action.icon} size={15} />}
              {action.label}
            </Box>
          ))}
        </div>
      )}
      {shownCells.length > 1 && (
        <div className="hud-cells-sheet">
          <DataList>
            {shownCells.map((cell) => (
              <DataRow key={cell.label} label={cell.label} value={cell.value} copyValue={cell.copyValue} />
            ))}
          </DataList>
        </div>
      )}
      {expanded && (
        <Box
          sx={{
            alignSelf: "center",
            display: "flex",
            alignItems: "baseline",
            gap: 1,
            maxWidth: "100%",
            minHeight: 40,
            px: 2,
            py: 1,
            borderRadius: `${RADIUS.pill}px`,
            bgcolor: COLORS.panel,
            color: COLORS.onInk,
            boxShadow: SHADOW.float,
          }}
        >
          <Box component="span" sx={{ ...readoutLabelSx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </Box>
          <Box component="span" sx={{ fontFamily: MONO_FONT, fontSize: TYPE.title, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {hasValue ? `${value}${unit ? ` ${unit}` : ""}` : "—"}
          </Box>
        </Box>
      )}
      <Box role="status" aria-live="polite" sx={visuallyHidden}>
        {announced}
      </Box>
    </Box>
  );
}
