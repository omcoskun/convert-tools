import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { IWC } from "./env.js";
import { loadRuntime } from "./runtime.js";

if (IWC) document.documentElement.dataset.iwc = IWC;

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
