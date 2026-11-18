// The map credits (OSMF attribution guideline): a small round (i) button in a
// corner that opens a pill with the credit links. It opens by itself for 5 s
// on mount and whenever `revision` changes (a new basemap loaded), then
// collapses unless hovered or focused. A click toggles it; Esc or a press
// outside collapses it. The parent positions it.
import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon.jsx";
import { useLanguage } from "../context.js";
import { COLORS, MOTION, PHONE, RADIUS, SHADOW, TYPE, UI_FONT } from "../theme.js";
import { Box } from "../ui/index.js";

const AUTO_OPEN_MS = 5000;
const LEAVE_MS = 1500;

/**
 * @param {{ credits: { text: string, href: string }[], revision?: number | string }} props
 */
export default function Attribution({ credits, revision }) {
  const { text } = useLanguage();
  const [open, setOpen] = useState(true);
  const rootRef = useRef(null);
  const timerRef = useRef(0);
  const heldRef = useRef(false);
  const stickyRef = useRef(false);

  function collapseLater(ms) {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (!heldRef.current && !stickyRef.current) setOpen(false);
    }, ms);
  }

  useEffect(() => {
    stickyRef.current = false;
    setOpen(true);
    collapseLater(AUTO_OPEN_MS);
    return () => window.clearTimeout(timerRef.current);
  }, [revision]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event) {
      if (!rootRef.current?.contains(event.target)) {
        stickyRef.current = false;
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  if (!credits || credits.length === 0) return null;

  function onKeyDown(event) {
    if (event.key === "Escape" && open) {
      stickyRef.current = false;
      setOpen(false);
    }
  }

  function hold() {
    heldRef.current = true;
  }

  function release() {
    heldRef.current = rootRef.current?.matches(":hover") || rootRef.current?.contains(document.activeElement) || false;
    if (!heldRef.current && !stickyRef.current) collapseLater(LEAVE_MS);
  }

  function toggle() {
    window.clearTimeout(timerRef.current);
    stickyRef.current = !open;
    setOpen(!open);
  }

  return (
    <Box
      ref={rootRef}
      className="map-attribution"
      onKeyDown={onKeyDown}
      onPointerEnter={hold}
      onPointerLeave={release}
      onFocus={hold}
      onBlur={release}
      sx={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: UI_FONT }}
    >
      {open && (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            px: 1.25,
            minHeight: 24,
            border: `1px solid ${COLORS.rule2}`,
            borderRadius: `${RADIUS.pill}px`,
            bgcolor: COLORS.glass,
            boxShadow: SHADOW.float,
            fontSize: TYPE.label,
            color: COLORS.ink2,
            maxWidth: "calc(100vw - 64px)",
          }}
        >
          {credits.map((credit, index) => (
            <Box component="span" key={credit.href} sx={{ whiteSpace: "nowrap" }}>
              {index > 0 && " · "}
              <Box
                component="a"
                href={credit.href}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: COLORS.ink2,
                  textDecoration: "none",
                  "&:hover": { color: COLORS.ink, textDecoration: "underline" },
                  "&:focus-visible": { outline: `2px solid ${COLORS.focus}`, outlineOffset: 2, borderRadius: "2px" },
                }}
              >
                {credit.text}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      <Box
        component="button"
        type="button"
        aria-label={text.mapAttribution}
        title={text.mapAttribution}
        aria-expanded={open}
        onClick={toggle}
        sx={{
          display: "grid",
          placeItems: "center",
          flex: "none",
          width: 24,
          height: 24,
          p: 0,
          border: `1px solid ${COLORS.rule2}`,
          borderRadius: `${RADIUS.pill}px`,
          bgcolor: COLORS.glass,
          boxShadow: SHADOW.float,
          color: COLORS.ink2,
          cursor: "pointer",
          transition: `color ${MOTION.fast} ${MOTION.ease}`,
          "&:hover, &[aria-expanded='true']": { color: COLORS.ink },
          "&:focus-visible": { outline: `2px solid ${COLORS.focus}`, outlineOffset: 2 },
          "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          [PHONE]: { width: 28, height: 28 },
        }}
      >
        <Icon name="info" size={15} />
      </Box>
    </Box>
  );
}
