import { createContext, useContext } from "react";

/** Contents of public/config.json. */
export const ConfigContext = createContext(null);

/**
 * The active language: { language, text, units, examples, errors } where the
 * last four are the groups of public/lang.json for that language.
 */
export const LanguageContext = createContext(null);

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
