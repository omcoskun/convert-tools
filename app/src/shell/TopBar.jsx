import { useEffect, useRef } from "react";
import Icon from "../components/Icon.jsx";
import Segmented from "../components/Segmented.jsx";
import { useConfig, useLanguage } from "../context.js";
import { BAR_HEIGHT, COLORS, MOTION, PHONE, PHONE_BAR_HEIGHT, RADIUS, SHADOW, TYPE } from "../theme.js";
import { basemapOrigins } from "../map/maplibre.js";
import { TOOLS } from "../tools/index.js";
import { Box, visuallyHidden } from "../ui/index.js";
import ThemeMenu from "./ThemeMenu.jsx";

// Tablets abbreviate inactive tools. Phones use a separate labeled row.
const COMPACT = "@media (max-width: 1099.98px)";
const COMPACT_POINTER = "@media (max-width: 1099.98px) and (min-width: 760px)";

function BrandMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" focusable="false" style={{ flex: "none" }}>
      <rect width="32" height="32" rx="9" fill={COLORS.panel} />
      <path
        d="M8.5 21.5C11 12 18 9.5 23.5 10.5"
        fill="none"
        stroke={COLORS.onInk}
        strokeWidth="1.8"
        strokeDasharray="2.6 2.4"
        strokeLinecap="round"
      />
      <circle cx="8.5" cy="21.5" r="3.2" fill={COLORS.a} stroke={COLORS.onInk} strokeWidth="1.4" />
      <circle cx="23.5" cy="10.5" r="3.2" fill={COLORS.b} stroke={COLORS.onInk} strokeWidth="1.4" />
    </svg>
  );
}

const link = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 1,
  height: 36,
  minWidth: 36,
  px: 1.5,
  borderRadius: `${RADIUS.control}px`,
  color: COLORS.ink2,
  fontSize: TYPE.body,
  fontWeight: 650,
  lineHeight: 1,
  textDecoration: "none",
  whiteSpace: "nowrap",
  transition: `background-color ${MOTION.fast} ${MOTION.ease}, color ${MOTION.fast} ${MOTION.ease}`,
  "&:hover": { bgcolor: COLORS.paper2, color: COLORS.ink },
  "&[aria-current='page'], &[aria-current='page']:hover": { bgcolor: COLORS.aSoft, color: COLORS.aInk },
  [PHONE]: { height: 44, minWidth: 0, width: "100%", px: 0.25, flexDirection: "column", gap: 0.5, fontSize: TYPE.label, "& > svg": { width: 16, height: 16 } },
  "@media (max-width: 359.98px)": { fontSize: 10 },
};

const tooltip = {
  display: "none",
  [COMPACT_POINTER]: {
    display: "block",
    position: "absolute",
    top: "calc(100% + 6px)",
    left: "50%",
    zIndex: 1,
    px: 1,
    py: 0.5,
    borderRadius: `${RADIUS.control}px`,
    bgcolor: COLORS.panel,
    boxShadow: SHADOW.raised,
    color: COLORS.onInk,
    fontSize: TYPE.meta,
    fontWeight: 650,
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    opacity: 0,
    transform: "translate(-50%, -2px)",
    transition: `opacity ${MOTION.fast} ${MOTION.ease}, transform ${MOTION.fast} ${MOTION.ease}`,
  },
};

/**
 * The bar across the top of every tool: brand, one link per tool of the
 * registry (icon and label; below 1100 px only the open tool keeps its
 * label, the others a tooltip and their accessible name; on phones the row
 * scrolls sideways) and the language switch.
 * @param {{
 *   tool: string,
 *   onSelect: (id: string) => void,
 *   language: string,
 *   onLanguage: (code: string) => void,
 *   overMap?: boolean,
 * }} props
 *   tool is the open tool's id; links keep their #id address for opening in
 *   a new tab, a plain click calls onSelect. overMap: the workspace map runs
 *   under the bar, which turns to glass (the sheet at about 90 % with a
 *   backdrop blur where supported).
 */
export default function TopBar({ tool, onSelect, language, onLanguage, overMap = false }) {
  const { text, languageNames } = useLanguage();
  const { languages, map } = useConfig();
  const prefetch = (entry) => () => entry.prefetch?.(basemapOrigins(map));
  const navRef = useRef(null);

  // On phones the row may scroll: centre the open tool, so the tools on
  // both sides show that the row goes on (again when its label's width
  // changes with the language).
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector("[aria-current='page']");
    if (!current || nav.scrollWidth <= nav.clientWidth) return;
    const box = nav.getBoundingClientRect();
    const link = current.getBoundingClientRect();
    nav.scrollLeft += link.left + link.width / 2 - (box.left + box.width / 2);
  }, [tool, language]);

  function handleClick(event, id) {
    // Modified clicks open the address in a new tab or window, as links do.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onSelect(id);
  }

  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1100,
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 3,
        height: BAR_HEIGHT,
        px: 2,
        bgcolor: overMap ? COLORS.glass : COLORS.sheet,
        borderBottom: `1px solid ${COLORS.rule}`,
        ...(overMap && {
          "@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))": {
            WebkitBackdropFilter: "blur(14px) saturate(1.4)",
            backdropFilter: "blur(14px) saturate(1.4)",
          },
        }),
        [PHONE]: { display: "grid", gridTemplateColumns: "1fr auto", gridTemplateRows: "48px 52px", height: PHONE_BAR_HEIGHT, gap: 0, px: 1 },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: "none", color: COLORS.ink }}>
        <BrandMark />
        <Box>
        <Box
          component="span"
          sx={{ fontSize: TYPE.title, fontWeight: 700, letterSpacing: "-0.01em" }}
        >
          {text.brandName}
        </Box>
        <Box component="span" sx={{ display: "block", mt: "2px", fontSize: 10, color: COLORS.muted, [COMPACT]: { display: "none" } }}>{text.workspaceSubtitle}</Box>
        </Box>
      </Box>
      <Box
        component="nav"
        ref={navRef}
        aria-label={text.navigation}
        sx={{
          flex: 1,
          minWidth: 0,
          [PHONE]: {
            gridColumn: "1 / -1",
            gridRow: 2,
            alignSelf: "stretch",
            display: "flex",
            alignItems: "center",
            overflowX: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          },
        }}
      >
        <Box
          component="ul"
          sx={{ display: "flex", gap: 0.5, m: 0, p: 0, listStyle: "none", [PHONE]: { gap: 0.25, width: "100%" } }}
        >
          {TOOLS.map((entry) => {
            const current = entry.id === tool;
            const label = text[entry.labelKey];
            return (
              <Box
                component="li"
                key={entry.id}
                sx={{
                  position: "relative",
                  flex: "none",
                  [PHONE]: { flex: "1 1 0", minWidth: 0 },
                  [COMPACT_POINTER]: {
                    "&:hover > .tool-tip, & > a:focus-visible + .tool-tip": { opacity: 1, transform: "translate(-50%, 0)" },
                  },
                }}
              >
                <Box
                  component="a"
                  href={`#${entry.id}`}
                  aria-current={current ? "page" : undefined}
                  onClick={(event) => handleClick(event, entry.id)}
                  onPointerEnter={prefetch(entry)}
                  onFocus={prefetch(entry)}
                  sx={{ ...link, [COMPACT_POINTER]: current ? undefined : { px: 0 } }}
                >
                  <Icon name={entry.icon} size={18} />
                  <Box component="span" sx={current ? undefined : { [COMPACT_POINTER]: visuallyHidden }}>
                    {label}
                  </Box>
                </Box>
                {!current && (
                  <Box component="span" className="tool-tip" aria-hidden="true" sx={tooltip}>
                    {label}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box sx={{ flex: "none", display: "flex", alignItems: "center", gap: 1, [PHONE]: { gridColumn: 2, gridRow: 1 } }}>
        <ThemeMenu />
        <Segmented
          label={text.language}
          size="sm"
          value={language}
          onChange={onLanguage}
          options={languages.map((code) => ({
            value: code,
            // The name starts with the visible code: "TR, Türkçe".
            label: (
              <>
                {code.toUpperCase()}
                <Box component="span" lang={code} sx={visuallyHidden}>
                  {`, ${languageNames[code]}`}
                </Box>
              </>
            ),
          }))}
        />
      </Box>
    </Box>
  );
}
