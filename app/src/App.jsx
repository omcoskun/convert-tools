import { useEffect, useMemo, useState } from "react";
import ToolIcon from "./components/ToolIcon.jsx";
import { ConfigContext, LanguageContext } from "./context.js";
import { NAVY, NAVY_TEXT, theme } from "./theme.js";
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
  Typography,
} from "./ui/index.js";

// [id, text key of the navigation label, component]
const TOOLS = [
  ["length", "units", LengthConverter],
  ["positions", "positionFormats", PositionConverter],
  ["crs", "crs", CrsConverter],
  ["distance", "distance", DistanceCalculator],
];

const railButton = {
  justifyContent: "flex-start",
  gap: 1.25,
  px: 1.5,
  py: 1,
  width: "100%",
  textAlign: "left",
  lineHeight: 1.3,
  color: NAVY_TEXT,
  borderRadius: 2,
  "&:hover": { bgcolor: "rgba(255, 255, 255, 0.08)" },
  "&[aria-current='page']": { color: "#ffffff", bgcolor: "rgba(255, 255, 255, 0.14)" },
  "&:focus-visible": { outline: "2px solid #ffffff", outlineOffset: 2 },
};

const languageButton = {
  color: NAVY_TEXT,
  borderColor: "rgba(255, 255, 255, 0.28)",
  px: 1.25,
  "&.Mui-selected, &.Mui-selected:hover": { color: NAVY, bgcolor: "#ffffff" },
  "&:focus-visible": { outline: "2px solid #ffffff", outlineOffset: 2 },
};

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

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = text.pageTitle;
  }, [language, text.pageTitle]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ConfigContext.Provider value={config}>
        <LanguageContext.Provider value={active}>
          <Box sx={{ minHeight: "100vh", display: { md: "grid" }, gridTemplateColumns: { md: "232px minmax(0, 1fr)" } }}>
            <Box
              component="header"
              sx={{
                bgcolor: NAVY,
                color: "#ffffff",
                display: "flex",
                flexWrap: "wrap",
                alignItems: { xs: "center", md: "stretch" },
                flexDirection: { md: "column" },
                alignContent: { md: "stretch" },
                gap: { xs: 1.5, md: 3 },
                px: 2,
                py: { xs: 1.5, md: 3 },
                position: { md: "sticky" },
                top: 0,
                height: { md: "100vh" },
              }}
            >
              <Typography component="p" sx={{ fontWeight: 800, letterSpacing: "0.12em", fontSize: "1rem", px: { md: 1.5 } }}>
                <Box component="span" aria-hidden="true" sx={{ color: "#5eead4", mr: 1 }}>
                  ↔
                </Box>
                CONVERT
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={language}
                onChange={(event, next) => next && setLanguage(next)}
                aria-label={text.language}
                sx={{ order: { md: 3 }, ml: { xs: "auto", md: 1.5 }, mt: { md: "auto" }, alignSelf: { md: "flex-start" } }}
              >
                {config.languages.map((code) => (
                  <ToggleButton key={code} value={code} aria-label={lang[code].text.languageName} sx={languageButton}>
                    {code.toUpperCase()}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Box component="nav" aria-label={text.navigation} sx={{ flexBasis: { xs: "100%", md: "auto" }, order: { md: 2 }, minWidth: 0 }}>
                <Box
                  component="ul"
                  sx={{
                    listStyle: "none",
                    m: 0,
                    p: 0,
                    // Every tool stays visible on phones: 2 x 2, then one row, then the rail.
                    display: "grid",
                    gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))", md: "minmax(0, 1fr)" },
                    gap: 0.5,
                  }}
                >
                  {TOOLS.map(([id, labelKey]) => (
                    <li key={id}>
                      <Button
                        onClick={() => setTool(id)}
                        aria-current={id === tool ? "page" : undefined}
                        sx={railButton}
                      >
                        <ToolIcon name={id} />
                        {text[labelKey]}
                      </Button>
                    </li>
                  ))}
                </Box>
              </Box>
            </Box>
            <Container component="main" maxWidth="xl" sx={{ py: { xs: 3, md: 5 }, px: { xs: 2, md: 5 } }}>
              <Tool />
            </Container>
          </Box>
        </LanguageContext.Provider>
      </ConfigContext.Provider>
    </ThemeProvider>
  );
}
