import { useEffect, useMemo, useRef, useState } from "react";
import { ConfigContext, LanguageContext, ThemeModeContext } from "./context.js";
import { sectionOf } from "./lib/address.js";
import { readPref, writePref } from "./lib/prefs.js";
import { HandoffContext, createHandoffStore } from "./shell/handoff.js";
import { ToolMemoryContext, createToolMemory } from "./shell/tool-memory.js";
import TopBar from "./shell/TopBar.jsx";
import WorkspaceLayout from "./shell/WorkspaceLayout.jsx";
import { COLORS, RADIUS, THEME_PREFERENCES, TYPE, createAppTheme, resolveTheme } from "./theme.js";
import { DEFAULT_TOOL, TOOLS, resolveTool } from "./tools/index.js";
import { Box, CssBaseline, ThemeProvider } from "./ui/index.js";

const layoutOf = (id) => TOOLS.find((tool) => tool.id === id).layout;

const DARK_QUERY = "(prefers-color-scheme: dark)";
const systemPrefersDark = () => (typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches) || false;

/**
 * The colour theme: the stored preference (system by default) and the
 * system's own setting, followed while the preference is "system".
 */
function useThemeModeState() {
  const [preference, setPreferenceState] = useState(() => readPref("theme", "system", THEME_PREFERENCES));
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    if (!query) return undefined;
    const onChange = () => setSystemDark(query.matches);
    onChange();
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  const mode = resolveTheme(preference, systemDark);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
    root.style.backgroundColor = "";
  }, [mode]);
  return useMemo(
    () => ({
      mode,
      preference,
      setPreference(next) {
        setPreferenceState(next);
        writePref("theme", next);
      },
    }),
    [mode, preference],
  );
}

/**
 * Workspace tools stand on the one map of WorkspaceLayout. Once a workspace
 * tool has been opened the workspace stays mounted, hidden while a page tool
 * is open, with the last workspace tool in it: coming back keeps the map's
 * view and the tool's state.
 * @param {{ config: any, lang: any, initialLanguage?: string, initialTool?: string }} props
 *   config and lang are the parsed public/config.json and public/lang.json;
 *   initialTool is an address id (index.jsx passes the page's #hash), an
 *   unknown one opens the default tool.
 */
export default function App({ config, lang, initialLanguage, initialTool = DEFAULT_TOOL }) {
  const [language, setLanguage] = useState(initialLanguage || config.defaultLanguage);
  const themeMode = useThemeModeState();
  const appTheme = useMemo(() => createAppTheme(themeMode.mode), [themeMode.mode]);
  const [tool, setTool] = useState(() => resolveTool(initialTool) ?? DEFAULT_TOOL);
  const [workspaceTool, setWorkspaceTool] = useState(() => (layoutOf(tool) === "workspace" ? tool : null));
  const languageNames = useMemo(
    () => Object.fromEntries(config.languages.map((code) => [code, lang[code].text.languageName])),
    [config.languages, lang],
  );
  const active = useMemo(() => ({ language, languageNames, ...lang[language] }), [language, languageNames, lang]);
  const { text } = active;
  const entry = TOOLS.find(({ id }) => id === tool);
  const Tool = entry.Component;
  const workspace = entry.layout === "workspace";
  const WorkspaceTool = workspaceTool && TOOLS.find(({ id }) => id === workspaceTool).Component;

  function openTool(id) {
    setTool(id);
    if (layoutOf(id) === "workspace") setWorkspaceTool(id);
  }

  // A tool hands a point to another and opens it (see shell/handoff.js).
  const selectToolRef = useRef(null);
  const handoff = useMemo(() => createHandoffStore((id) => selectToolRef.current?.(id)), []);
  // Workspace tools keep their inputs while another tool is open (shell/tool-memory.js).
  const toolMemory = useMemo(() => createToolMemory(), []);
  useEffect(() => {
    selectToolRef.current = selectTool;
  });

  // Each tool opens at its top: a page tool must not inherit the scroll of the
  // one before. An address naming a section ("#reference/errors") is left to
  // the tool, which scrolls to that section itself.
  useEffect(() => {
    if (sectionOf(window.location.hash.slice(1)) == null) window.scrollTo(0, 0);
  }, [tool]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = text.pageTitle;
  }, [language, text.pageTitle]);

  // The address remembers the open tool (#measure, #positions, ...). An old
  // address such as #distance opens its tool and is rewritten.
  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      const id = resolveTool(hash);
      if (id == null) return;
      openTool(id);
      // "#reference/errors" names a place in the tool, which reads it itself.
      if (id !== hash && !hash.startsWith(`${id}/`)) window.history.replaceState(null, "", `#${id}`);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function selectTool(id) {
    openTool(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <ThemeModeContext.Provider value={themeMode}>
      <ConfigContext.Provider value={config}>
        <LanguageContext.Provider value={active}>
          <Box
            sx={{
              minHeight: "100vh",
              display: "flex",
              flexDirection: "column",
              ...(workspace && {
                height: "100vh",
                overflow: "hidden",
                "@supports (height: 100dvh)": { height: "100dvh", minHeight: "100dvh" },
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
                borderRadius: `${RADIUS.control}px`,
                bgcolor: COLORS.panel,
                color: COLORS.onInk,
                fontSize: TYPE.body,
                fontWeight: 650,
                textDecoration: "none",
                "&:focus": { top: 8 },
                "&:focus-visible": { outlineColor: COLORS.focusOnInk },
              }}
            >
              {text.skipToContent}
            </Box>
            <TopBar tool={tool} onSelect={selectTool} language={language} onLanguage={setLanguage} overMap={workspace} />
            <Box
              component="main"
              id="main"
              tabIndex={-1}
              sx={{ flex: 1, minHeight: 0, outline: "none", display: "flex", flexDirection: "column" }}
            >
              <HandoffContext.Provider value={handoff}>
                <ToolMemoryContext.Provider value={toolMemory}>
                  {WorkspaceTool && (
                    <WorkspaceLayout hidden={!workspace}>
                      <WorkspaceTool key={workspaceTool} />
                    </WorkspaceLayout>
                  )}
                  {!workspace && <Tool />}
                </ToolMemoryContext.Provider>
              </HandoffContext.Provider>
            </Box>
          </Box>
        </LanguageContext.Provider>
      </ConfigContext.Provider>
      </ThemeModeContext.Provider>
    </ThemeProvider>
  );
}
