import { useId, useMemo } from "react";
import { coordinateResults, formatDms } from "@convert-tools/core";
import { useLanguage } from "../context.js";
import { attempt } from "../lib/attempt.js";
import { formatPairForCopy, pastedText } from "../lib/coordinate-paste.js";
import { parsePointList, readPointText } from "../lib/point-text.js";
import { COLORS, MONO_FONT, MOTION, PHONE, RADIUS, TYPE } from "../theme.js";
import { Box, visuallyHidden } from "../ui/index.js";
import CopyButton from "./CopyButton.jsx";
import Field from "./Field.jsx";
import Icon from "./Icon.jsx";

// A is cobalt, B vermilion, other points ink (spec section 7).
const TONES = {
  a: { color: COLORS.a, soft: COLORS.aSoft, ink: COLORS.aInk },
  b: { color: COLORS.b, soft: COLORS.bSoft, ink: COLORS.bInk },
  ink: { color: COLORS.ink, soft: COLORS.paper2, ink: COLORS.ink },
};

const cardButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "5px",
  flex: "none",
  height: 28,
  minWidth: 28,
  px: "8px",
  border: `1px solid ${COLORS.rule2}`,
  borderRadius: `${RADIUS.control}px`,
  bgcolor: COLORS.sheet,
  color: COLORS.ink2,
  font: "inherit",
  fontSize: TYPE.meta,
  fontWeight: 650,
  whiteSpace: "nowrap",
  cursor: "pointer",
  transition: `background-color ${MOTION.fast} ${MOTION.ease}, border-color ${MOTION.fast} ${MOTION.ease}`,
  "&:hover": { borderColor: COLORS.ink2 },
  [PHONE]: { height: 40, minWidth: 40 },
};

function Badge({ text, tone }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        display: "inline-grid",
        placeItems: "center",
        flex: "none",
        minWidth: 22,
        height: 22,
        px: "5px",
        boxSizing: "border-box",
        borderRadius: `${RADIUS.pill}px`,
        bgcolor: TONES[tone].color,
        color: "#ffffff",
        fontSize: TYPE.meta,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
      }}
    >
      {text}
    </Box>
  );
}

/**
 * One point as one text field, "enlem, boylam" (spec 8.1). It accepts what
 * the paste parser reads (decimal or DMS pairs, hemisphere letters, either
 * order when letters say which is which) and keeps the typed digits. Under a
 * valid point it shows the point's DMS and MGRS; under an incomplete or
 * invalid one a message in the user's language. Buttons on the field: pick
 * on the map, copy, and remove where a list allows it.
 * @param {{
 *   id: string,
 *   label: string,
 *   badge?: { text: string, tone: "a" | "b" | "ink" },
 *   value: string,
 *   onChange: (text: string) => void,
 *   onPoints?: (points: { latitude: string, longitude: string }[], info: { swapped: boolean }) => void,
 *   picking?: boolean,
 *   onPick?: () => void,
 *   pickLabel?: string,
 *   onRemove?: () => void,
 *   removeLabel?: string,
 *   copyLabel: string,
 *   showFormats?: boolean,
 * }} props
 *   onPoints: a paste of more than one pair, or of one pair that was only
 *   valid as longitude, latitude (so the swap can be announced); without
 *   it the first pair fills the field. One pair as written fills the field
 *   with the pasted text. picking: the next map click places this point;
 *   onPick toggles that, pickLabel names the button. copyLabel names the
 *   copy button, which copies "latitude, longitude". Without badge the
 *   field is in ink and has no letter badge (a tool's one point).
 */
export default function PointField({
  id,
  label,
  badge,
  value,
  onChange,
  onPoints,
  picking = false,
  onPick,
  pickLabel,
  onRemove,
  removeLabel,
  copyLabel,
  showFormats = true,
}) {
  const { text } = useLanguage();
  const messageId = useId();
  const reading = useMemo(() => readPointText(value), [value]);
  const { status, latitude, longitude } = reading;
  const tone = TONES[badge?.tone] ?? TONES.ink;
  const formats = useMemo(() => {
    if (latitude === undefined) return null;
    const result = attempt(() => ({
      dms: [formatDms(Number(latitude), "latitude", 3), formatDms(Number(longitude), "longitude", 3)],
      mgrs: coordinateResults({ latitude, longitude }, 5).mgrs,
    }));
    return result.ok ? result.value : null;
  }, [latitude, longitude]);

  let message = "";
  if (status === "invalid") message = `${text.coordinateInvalid} (${text.coordinateRange})`;
  else if (status === "incomplete") message = text.pointIncomplete;

  function handlePaste(event) {
    const clipboard = pastedText(event);
    const parsed = parsePointList(clipboard);
    if (parsed == null) return;
    event.preventDefault();
    const [first] = parsed.points;
    const single = clipboard.trim();
    if (parsed.points.length === 1 && !parsed.swapped && !/[\r\n]/.test(single)) onChange(single);
    else if (onPoints) onPoints(parsed.points, { swapped: parsed.swapped });
    else onChange(formatPairForCopy(first.latitude, first.longitude));
  }

  const buttons = (
    <>
      {status === "valid" && (
        <CopyButton value={formatPairForCopy(latitude, longitude)} name={copyLabel} iconOnly />
      )}
      {onPick && (
        <Box
          component="button"
          type="button"
          aria-pressed={picking}
          title={pickLabel}
          onClick={onPick}
          sx={{
            ...cardButton,
            borderColor: picking ? tone.color : COLORS.rule2,
            bgcolor: picking ? tone.color : COLORS.sheet,
            color: picking ? "#ffffff" : tone.ink,
            "&:hover": { borderColor: tone.color },
            // In a narrow field only the icon shows; the name keeps the visible words first.
            "@container (max-width: 340px)": { px: 0, "& > .pick-text": visuallyHidden },
          }}
        >
          <Icon name="crosshair" size={16} />
          <span className="pick-text">{picking ? text.pickingPoint : status === "valid" ? text.repickPoint : text.pickPoint}</span>
          <Box component="span" sx={visuallyHidden}>{`, ${label}`}</Box>
        </Box>
      )}
      {onRemove && (
        <Box component="button" type="button" aria-label={removeLabel} title={removeLabel} onClick={onRemove} sx={{ ...cardButton, px: 0 }}>
          <Icon name="clear" size={16} />
        </Box>
      )}
    </>
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        p: "8px 10px 10px 12px",
        minWidth: 0,
        containerType: "inline-size",
        border: `1px solid ${picking ? tone.color : COLORS.rule}`,
        borderLeft: `3px solid ${tone.color}`,
        borderRadius: `${RADIUS.card}px`,
        bgcolor: COLORS.sheet,
        boxShadow: picking ? `0 0 0 3px ${tone.soft}` : "none",
        transition: `border-color ${MOTION.fast} ${MOTION.ease}, box-shadow ${MOTION.fast} ${MOTION.ease}`,
        "& .MuiOutlinedInput-input": { fontSize: TYPE.small },
        [PHONE]: { "& .MuiOutlinedInput-input": { fontSize: 16 } },
      }}
    >
      <Field
        id={id}
        label={label}
        labelStart={badge && <Badge text={badge.text} tone={badge.tone} />}
        labelEnd={buttons}
        value={value}
        onChange={onChange}
        onPaste={handlePaste}
        placeholder={text.pointPlaceholder}
        error={status === "invalid"}
        describedBy={message || (formats && showFormats) || reading.swapped ? messageId : undefined}
      />
      {message ? (
        <Box
          component="p"
          id={messageId}
          sx={{ m: 0, color: status === "invalid" ? COLORS.error : COLORS.muted, fontSize: TYPE.meta, fontWeight: 650, lineHeight: 1.45 }}
        >
          {message}
        </Box>
      ) : (
        formats && (showFormats || reading.swapped) && (
          <Box id={messageId}>
            {showFormats && <Box
              component="dl"
              sx={{ m: 0, display: "grid", gridTemplateColumns: "40px minmax(0, 1fr)", gap: "2px 8px", alignItems: "baseline" }}
            >
              {[
                ["DMS", formats.dms],
                ["MGRS", [formats.mgrs]],
              ].map(([name, parts]) => (
                <Box key={name} sx={{ display: "contents" }}>
                  <Box component="dt" sx={{ color: COLORS.muted, fontWeight: 650, fontSize: TYPE.label, letterSpacing: "0.06em" }}>
                    {name}
                  </Box>
                  <Box
                    component="dd"
                    sx={{
                      m: 0,
                      display: "flex",
                      flexWrap: "wrap",
                      columnGap: 1.5,
                      color: COLORS.ink2,
                      fontFamily: MONO_FONT,
                      fontSize: TYPE.meta,
                      lineHeight: 1.5,
                    }}
                  >
                    {parts.map((part) => (
                      // Each angle stays on one line; the pair breaks between them if it must.
                      <Box key={part} component="span" sx={{ whiteSpace: "nowrap" }}>
                        {part}
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>}
            {reading.swapped && (
              <Box component="p" sx={{ m: 0, mt: "2px", color: COLORS.muted, fontSize: TYPE.meta, lineHeight: 1.45 }}>
                {text.pointSwapped}
              </Box>
            )}
          </Box>
        )
      )}
    </Box>
  );
}
