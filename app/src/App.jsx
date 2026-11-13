import { useEffect, useMemo, useState } from "react";
import { ConfigContext, LanguageContext } from "./context.js";
import { theme } from "./theme.js";
import CoordinateTool from "./tools/coordinates/CoordinateTool.jsx";
import LengthConverter from "./tools/length/LengthConverter.jsx";
import {
  Box,
  Container,
  CssBaseline,
  Stack,
  Tab,
  Tabs,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "./ui/index.js";

const TOOLS = [
  ["length", "units", LengthConverter],
  ["coordinates", "coordinates", CoordinateTool],
];

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
          <Container component="main" maxWidth="lg" sx={{ py: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography component="p" variant="h6" sx={{ fontWeight: 800, letterSpacing: "0.08em" }}>
                <Box component="span" aria-hidden="true" sx={{ color: "primary.main", mr: 1 }}>
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
              >
                {config.languages.map((code) => (
                  <ToggleButton key={code} value={code} aria-label={lang[code].text.languageName}>
                    {code.toUpperCase()}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>
            <Tabs value={tool} onChange={(event, next) => setTool(next)} aria-label="Convert" sx={{ mb: 2 }}>
              {TOOLS.map(([id, labelKey]) => (
                <Tab key={id} value={id} label={text[labelKey]} />
              ))}
            </Tabs>
            <Tool />
          </Container>
        </LanguageContext.Provider>
      </ConfigContext.Provider>
    </ThemeProvider>
  );
}
