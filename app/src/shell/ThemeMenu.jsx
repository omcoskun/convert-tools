import { useEffect, useId, useRef, useState } from "react";
import Icon from "../components/Icon.jsx";
import { useLanguage, useThemeMode } from "../context.js";
import { COLORS, MOTION, PHONE, RADIUS, SHADOW, THEME_PREFERENCES, TYPE } from "../theme.js";
import { Box } from "../ui/index.js";

const ICONS = { system: "system", light: "sun", dark: "moon" };
/** A preference's name in the interface language. */
function preferenceLabel(text, value) {
  if (value === "light") return text.themeLight;
  if (value === "dark") return text.themeDark;
  return text.themeSystem;
}

/**
 * The colour theme switch of the top bar: an icon button showing the shown
 * mode, opening a menu of three radio items (system, light, dark). Arrow
 * keys move between the items, Enter or Space picks one, Esc and a click
 * outside close the menu and give focus back to the button.
 */
export default function ThemeMenu() {
  const { text } = useLanguage();
  const { mode, preference, setPreference } = useThemeMode();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const items = [...menuRef.current.querySelectorAll("[role='menuitemradio']")];
    (items.find((item) => item.getAttribute("aria-checked") === "true") ?? items[0])?.focus();
    function onPointer(event) {
      if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onMenuKey(event) {
    const items = [...menuRef.current.querySelectorAll("[role='menuitemradio']")];
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <Box sx={{ position: "relative", flex: "none" }}>
      <Box
        component="button"
        type="button"
        ref={buttonRef}
        aria-label={`${text.theme}: ${preferenceLabel(text, preference)}`}
        title={text.theme}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        sx={{
          display: "grid",
          placeItems: "center",
          width: 32,
          height: 32,
          p: 0,
          border: `1px solid ${COLORS.rule}`,
          borderRadius: `${RADIUS.pill}px`,
          bgcolor: COLORS.paper2,
          color: COLORS.ink2,
          cursor: "pointer",
          transition: `background-color ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}`,
          "&:hover, &[aria-expanded='true']": { color: COLORS.ink, borderColor: COLORS.rule2 },
          [PHONE]: { width: 40, height: 40 },
        }}
      >
        <Icon name={mode === "dark" ? "moon" : "sun"} size={17} />
      </Box>
      {open && (
        <Box
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={text.theme}
          onKeyDown={onMenuKey}
          sx={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 1,
            minWidth: 168,
            p: "4px",
            border: `1px solid ${COLORS.rule2}`,
            borderRadius: `${RADIUS.card}px`,
            bgcolor: COLORS.sheet,
            boxShadow: SHADOW.raised,
          }}
        >
          {THEME_PREFERENCES.map((value) => (
            <Box
              key={value}
              component="button"
              type="button"
              role="menuitemradio"
              aria-checked={preference === value}
              tabIndex={-1}
              onClick={() => {
                setPreference(value);
                close();
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                width: "100%",
                height: 36,
                px: 1.25,
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
                "&:focus-visible": { outlineOffset: -2 },
                "&[aria-checked='true']": { color: COLORS.aInk },
                [PHONE]: { height: 44 },
              }}
            >
              <Icon name={ICONS[value]} size={17} />
              <Box component="span" sx={{ flex: 1 }}>
                {preferenceLabel(text, value)}
              </Box>
              {preference === value && <Icon name="check" size={16} />}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
