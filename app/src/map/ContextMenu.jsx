// The map's context menu (right click or long press): the coordinate of the
// point and two copy items, plain coordinates and MGRS. The parent gives the
// position (px in its own box); the menu flips and clamps itself to stay
// inside it. Arrow keys, Home and End move between the items; Esc, Tab and a
// press outside close it.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { encodeMgrs } from "@omcoskun/convert-tools";
import Icon from "../components/Icon.jsx";
import { useLanguage } from "../context.js";
import { COLORS, MONO_FONT, MOTION, PHONE, RADIUS, SHADOW, TYPE, UI_FONT } from "../theme.js";
import { Box } from "../ui/index.js";

const COPIED_MS = 900;
const EDGE = 8;

function fixed(value, digits) {
  const written = value.toFixed(digits);
  return /^-0\.0+$/.test(written) ? written.substring(1) : written;
}

/** "38SLC3918701405" as "38S LC 39187 01405"; the input when it has another shape. */
function spaceMgrs(code) {
  const match = /^(\d{1,2}[A-Z])([A-Z]{2})(\d*)$/.exec(code);
  if (!match || match[3].length % 2 !== 0) return code;
  const half = match[3].length / 2;
  return [match[1], match[2], match[3].slice(0, half), match[3].slice(half)].filter(Boolean).join(" ");
}

/**
 * @param {{
 *   menu: { x: number, y: number, latitude: number, longitude: number } | null,
 *   onClose: () => void,
 * }} props
 */
export default function ContextMenu({ menu, onClose }) {
  const { text } = useLanguage();
  const [copied, setCopied] = useState(null);
  const rootRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const latitude = menu?.latitude;
  const longitude = menu?.longitude;

  const mgrs = useMemo(() => {
    if (latitude == null || longitude == null) return null;
    try {
      return spaceMgrs(encodeMgrs(latitude, longitude, 5));
    } catch {
      return null;
    }
  }, [latitude, longitude]);

  // Flip and clamp inside the positioned parent before the first paint.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!menu || !root) return;
    const parent = root.offsetParent;
    const width = root.offsetWidth;
    const height = root.offsetHeight;
    let left = menu.x;
    let top = menu.y;
    if (parent) {
      if (left + width > parent.clientWidth - EDGE) left = menu.x - width;
      if (top + height > parent.clientHeight - EDGE) top = menu.y - height;
      left = Math.max(EDGE, Math.min(left, parent.clientWidth - width - EDGE));
      top = Math.max(EDGE, Math.min(top, parent.clientHeight - height - EDGE));
    }
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
  }, [menu]);

  useEffect(() => {
    if (!menu) return undefined;
    setCopied(null);
    rootRef.current?.querySelector("[role='menuitem']")?.focus({ preventScroll: true });
    function onPointer(event) {
      if (!rootRef.current?.contains(event.target)) onCloseRef.current();
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [menu]);

  useEffect(() => {
    if (copied == null) return undefined;
    const timer = window.setTimeout(() => onCloseRef.current(), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!menu) return null;

  async function copy(kind, value) {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(kind);
    } catch {
      onCloseRef.current();
    }
  }

  function onKeyDown(event) {
    const items = [...rootRef.current.querySelectorAll("[role='menuitem']")];
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  }

  const itemSx = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 1.5,
    width: "100%",
    minHeight: 36,
    px: 1.25,
    py: 0.5,
    border: 0,
    borderRadius: `${RADIUS.control}px`,
    bgcolor: "transparent",
    color: COLORS.ink2,
    font: "inherit",
    fontSize: TYPE.small,
    fontWeight: 650,
    textAlign: "left",
    cursor: "pointer",
    "&:hover, &:focus-visible": { bgcolor: COLORS.paper2, color: COLORS.ink },
    "&:focus-visible": { outline: `2px solid ${COLORS.focus}`, outlineOffset: -2 },
    [PHONE]: { minHeight: 44 },
  };

  const coordinates = `${fixed(menu.latitude, 5)}, ${fixed(menu.longitude, 5)}`;
  const items = [
    { kind: "coordinates", label: text.mapCopyCoordinates, secondary: null, value: `${fixed(menu.latitude, 6)}, ${fixed(menu.longitude, 6)}` },
  ];
  if (mgrs) items.push({ kind: "mgrs", label: text.mapCopyMgrs, secondary: mgrs, value: mgrs });

  return (
    <Box
      ref={rootRef}
      role="menu"
      aria-label={text.mapContextMenu}
      onKeyDown={onKeyDown}
      sx={{
        position: "absolute",
        left: menu.x,
        top: menu.y,
        zIndex: 3,
        minWidth: 200,
        p: "4px",
        border: `1px solid ${COLORS.rule2}`,
        borderRadius: `${RADIUS.card}px`,
        bgcolor: COLORS.glass,
        boxShadow: SHADOW.raised,
        fontFamily: UI_FONT,
      }}
    >
      <Box sx={{ px: 1.25, py: 0.75, fontFamily: MONO_FONT, fontVariantNumeric: "tabular-nums", fontSize: TYPE.meta, color: COLORS.muted, userSelect: "text" }}>
        {coordinates}
      </Box>
      {items.map((item) => (
        <Box
          key={item.kind}
          component="button"
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => copy(item.kind, item.value)}
          sx={itemSx}
        >
          {copied === item.kind ? (
            <>
              <span>{text.mapCopied}</span>
              <Box component="span" sx={{ display: "inline-flex", color: COLORS.success }}>
                <Icon name="check" size={16} />
              </Box>
            </>
          ) : (
            <>
              <span>{item.label}</span>
              {item.secondary && (
                <Box component="span" sx={{ fontFamily: MONO_FONT, fontSize: TYPE.meta, fontWeight: 400, color: COLORS.muted, transition: `color ${MOTION.fast} ${MOTION.ease}` }}>
                  {item.secondary}
                </Box>
              )}
            </>
          )}
        </Box>
      ))}
    </Box>
  );
}
