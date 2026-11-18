import { createContext, useContext } from "react";

/** Contents of public/config.json. */
export const ConfigContext = createContext(null);

/**
 * The active language: { language, languageNames, text, units, examples,
 * errors } where the last four are the groups of public/lang.json for that
 * language and languageNames maps every language code to its own name
 * ({ tr: "Türkçe", en: "English" }) for the language switch.
 */
export const LanguageContext = createContext(null);

/**
 * The colour theme: { mode, preference, setPreference } where mode is the
 * shown "light" or "dark" and preference the chosen "system", "light" or
 * "dark". Light when no provider is above (server-rendered tests).
 */
export const ThemeModeContext = createContext(null);

const FIXED_LIGHT = Object.freeze({ mode: "light", preference: "light", setPreference() {} });

export function useThemeMode() {
  return useContext(ThemeModeContext) ?? FIXED_LIGHT;
}

export function useConfig() {
  const value = useContext(ConfigContext);
  if (value == null) throw new Error("ConfigContext is not provided.");
  return value;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (value == null) throw new Error("LanguageContext is not provided.");
  return value;
}

/**
 * Replaces {name} placeholders in a lang.json string.
 * @param {string} template
 * @param {Record<string, string | number>} values
 */
export function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
