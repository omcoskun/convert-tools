// Loads public/config.json and public/lang.json at start-up, so texts and
// examples can be changed on a deployed build without rebuilding it.

export const LANG_GROUPS = Object.freeze(["text", "units", "examples", "errors"]);

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`${url.pathname}: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Checks the parts of config.json and lang.json the app relies on before it
 * renders, so a broken deployment shows one clear error instead of blank
 * fields.
 * @param {any} config
 * @param {any} lang
 */
export function validateRuntime(config, lang) {
  if (config == null || typeof config !== "object") throw new Error("config.json is not an object.");
  if (lang == null || typeof lang !== "object") throw new Error("lang.json is not an object.");
  const { languages, defaultLanguage } = config;
  if (!Array.isArray(languages) || languages.length === 0) {
    throw new Error("config.json: languages must be a non-empty array.");
  }
  if (!languages.includes(defaultLanguage)) {
    throw new Error(`config.json: defaultLanguage ${JSON.stringify(defaultLanguage)} is not in languages.`);
  }
  const [first] = languages;
  for (const language of languages) {
    if (lang[language] == null) throw new Error(`lang.json: language ${language} is missing.`);
    for (const group of LANG_GROUPS) {
      const entries = lang[language][group];
      if (entries == null || typeof entries !== "object") {
        throw new Error(`lang.json: ${language}.${group} is missing.`);
      }
      const expected = Object.keys(lang[first][group]).sort().join("\n");
      const actual = Object.keys(entries).sort().join("\n");
      if (actual !== expected) {
        throw new Error(`lang.json: ${language}.${group} keys differ from ${first}.${group}.`);
      }
      for (const [key, value] of Object.entries(entries)) {
        if (typeof value !== "string" || value === "") {
          throw new Error(`lang.json: ${language}.${group}.${key} must be a non-empty string.`);
        }
      }
    }
  }
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {string} baseUrl document base URL; the JSON files sit next to index.html
 * @returns {Promise<{ config: any, lang: any }>}
 */
export async function loadRuntime(fetchImpl, baseUrl) {
  const [config, lang] = await Promise.all([
    fetchJson(fetchImpl, new URL("config.json", baseUrl)),
    fetchJson(fetchImpl, new URL("lang.json", baseUrl)),
  ]);
  validateRuntime(config, lang);
  return { config, lang };
}
