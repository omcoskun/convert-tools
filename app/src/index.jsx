import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { IWC } from "./env.js";
import { readPref } from "./lib/prefs.js";
import { loadRuntime } from "./runtime.js";
import { PALETTES, THEME_PREFERENCES, resolveTheme } from "./theme.js";

if (IWC) document.documentElement.dataset.iwc = IWC;

// The page takes the stored theme's colours before config.json and lang.json
// arrive, so a dark theme does not flash white; App takes over on render.
{
  const mode = resolveTheme(readPref("theme", "system", THEME_PREFERENCES), window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  root.style.backgroundColor = PALETTES[mode].paper;
}

const root = createRoot(document.getElementById("root"));

loadRuntime(window.fetch.bind(window), document.baseURI).then(
  // The tool named in the address renders first, so opening #length never
  // starts the map of the default tool.
  ({ config, lang }) => root.render(<App config={config} lang={lang} initialTool={window.location.hash.slice(1)} />),
  (error) => {
    // lang.json may be the file that failed, so this one message is fixed.
    root.render(
      <p role="alert" style={{ font: "16px system-ui, sans-serif", margin: 24 }}>
        config.json / lang.json yüklenemedi — could not be loaded: {String(error.message)}
      </p>,
    );
  },
);
