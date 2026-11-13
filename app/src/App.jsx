import { useEffect, useMemo, useState } from "react";
import Icon from "./components/Icon.jsx";
import { ConfigContext, LanguageContext } from "./context.js";
import { prefetchMapLibre } from "./map/maplibre.js";
import { COLORS, PHONE, theme } from "./theme.js";
import CrsConverter from "./tools/coordinates/CrsConverter.jsx";
import DistanceCalculator from "./tools/coordinates/DistanceCalculator.jsx";
import PositionConverter from "./tools/coordinates/PositionConverter.jsx";
import LengthConverter from "./tools/length/LengthConverter.jsx";
import {
  Box,
  Button,
  Container,
  CssBaseline,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  visuallyHidden,
} from "./ui/index.js";

// [id, text key of the navigation label, component]
const TOOLS = [
  ["length", "units", LengthConverter],
  ["positions", "positionFormats", PositionConverter],
  ["crs", "crs", CrsConverter],
  ["distance", "distance", DistanceCalculator],
];
const TOOL_IDS = TOOLS.map(([id]) => id);

// The distance tool is a full-height map workspace; the others are pages.
const FULL_HEIGHT_TOOLS = new Set(["distance"]);

const TOPBAR_HEIGHT = 52;

const navButton = {
  gap: 0.75,
  minHeight: 36,
  px: 1.25,
  borderRadius: "10px",
  color: COLORS.ink2,
  fontSize: "0.875rem",
  whiteSpace: "nowrap",
  "&:hover": { bgcolor: COLORS.paper2 },
  "&[aria-current='page']": { bgcolor: COLORS.ink, color: COLORS.paper },
  "&[aria-current='page']:hover": { bgcolor: COLORS.ink },
  [PHONE]: { px: 1, minWidth: 0 },
};

const languageButton = {
  border: 0,
  minWidth: 36,
  height: 30,
  px: 1,
  borderRadius: "8px !important",
  color: COLORS.muted,
  fontSize: "0.8rem",
  "&.Mui-selected, &.Mui-selected:hover": {
    bgcolor: COLORS.sheet,
    color: COLORS.ink,
    boxShadow: "0 1px 2px rgba(22, 25, 28, 0.14)",
  },
};

function BrandMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" focusable="false" style={{ flex: "none" }}>
      <rect width="32" height="32" rx="9" fill={COLORS.ink} />
      <path
        d="M8.5 21.5C11 12 18 9.5 23.5 10.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.8"
        strokeDasharray="2.6 2.4"
        strokeLinecap="round"
      />
      <circle cx="8.5" cy="21.5" r="3.2" fill={COLORS.a} stroke="#ffffff" strokeWidth="1.4" />
      <circle cx="23.5" cy="10.5" r="3.2" fill={COLORS.b} stroke="#ffffff" strokeWidth="1.4" />
    </svg>
  );
}

/**
 * @param {{ config: any, lang: any, initialLanguage?: string, initialTool?: string }} props
 *   config and lang are the parsed public/config.json and public/lang.json.
 */
export default function App({ config, lang, initialLanguage, initialTool = "length" }) {
  const [language, setLanguage] = useState(initialLanguage || config.defaultLanguage);
  const [tool, setTool] = useState(initialTool);
  const active = useMemo(() => ({ language, ...lang[language] }), [language, lang]);
  const { text } = active;
  const Tool = TOOLS.find(([id]) => id === tool)[2];
  const fullHeight = FULL_HEIGHT_TOOLS.has(tool);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = text.pageTitle;
  }, [language, text.pageTitle]);

  // The address remembers the open tool (#length, #positions, #crs, #distance).
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (TOOL_IDS.includes(id)) setTool(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function selectTool(id) {
    setTool(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ConfigContext.Provider value={config}>
        <LanguageContext.Provider value={active}>
          <Box
            sx={{
              minHeight: "100vh",
              display: "flex",
              flexDirection: "column",
              ...(fullHeight && {
                height: "100vh",
                overflow: "hidden",
                "@supports (height: 100dvh)": { height: "100dvh" },
              }),
            }}
          >
            <Box
              component="a"
              href="#main"
              sx={{
                position: "absolute",
                left: 12,
                top: -60,
                zIndex: 2000,
                px: 1.5,
                py: 1,
                borderRadius: "9px",
                bgcolor: COLORS.ink,
                color: COLORS.paper,
                textDecoration: "none",
                "&:focus": { top: 10 },
              }}
            >
              {text.skipToContent}
            </Box>
            <Box
              component="header"
              sx={{
                position: "sticky",
                top: 0,
                zIndex: 1100,
                flex: "none",
                display: "flex",
                alignItems: "center",
                gap: { xs: 1, sm: 2 },
                height: TOPBAR_HEIGHT,
                px: { xs: 1.25, sm: 2 },
                bgcolor: COLORS.sheet,
                borderBottom: `1px solid ${COLORS.rule}`,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 700, fontSize: "1rem" }}>
                <BrandMark />
                <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
                  Convert
                </Box>
              </Box>
              <Box component="nav" aria-label={text.navigation} sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  component="ul"
                  sx={{ listStyle: "none", m: 0, p: 0, display: "flex", gap: 0.5, [PHONE]: { justifyContent: "center", gap: 0.25 } }}
                >
                  {TOOLS.map(([id, labelKey]) => (
                    <li key={id}>
                      <Button
                        onClick={() => selectTool(id)}
                        onPointerEnter={id === "distance" ? prefetchMapLibre : undefined}
                        onFocus={id === "distance" ? prefetchMapLibre : undefined}
                        aria-current={id === tool ? "page" : undefined}
                        sx={navButton}
                      >
                        <Icon name={id} size={18} />
                        {/* On phones only the open tool keeps a visible label. */}
                        <Box component="span" sx={id === tool ? undefined : { [PHONE]: visuallyHidden }}>
                          {text[labelKey]}
                        </Box>
                      </Button>
                    </li>
                  ))}
                </Box>
              </Box>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={language}
                onChange={(event, next) => next && setLanguage(next)}
                aria-label={text.language}
                sx={{ flex: "none", p: "3px", gap: "2px", borderRadius: "10px", bgcolor: COLORS.paper2 }}
              >
                {config.languages.map((code) => (
                  <ToggleButton key={code} value={code} aria-label={lang[code].text.languageName} sx={languageButton}>
                    {code.toUpperCase()}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <Box
              component="main"
              id="main"
              tabIndex={-1}
              sx={{ flex: 1, minHeight: 0, outline: "none", display: "flex", flexDirection: "column" }}
            >
              {fullHeight ? (
                <Tool />
              ) : (
                <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 4 }, px: { xs: 2, md: 3 } }}>
                  <Tool />
                </Container>
              )}
            </Box>
          </Box>
        </LanguageContext.Provider>
      </ConfigContext.Provider>
    </ThemeProvider>
  );
}
