// public/lang.json: complete in every language and in step with the code
// that reads it, the core's units and the error-code contract.

import assert from "node:assert/strict";
import test from "node:test";
import { getCategory } from "@convert-tools/core";
import { LANG_GROUPS } from "../src/runtime.js";
import { readJson, sourceFiles } from "./support/files.mjs";

const lang = readJson("public/lang.json");
const config = readJson("public/config.json");
const errorCodes = readJson("../contracts/error-codes.json").codes.map((entry) => entry.code);

const sorted = (values) => [...values].sort();

// Text keys read as text[labelKey], where labelKey comes from a table in the
// named file. Each key must appear there as a string literal.
const DYNAMIC_TEXT_KEYS = {
  "App.jsx": ["units", "positionFormats", "crs", "distance"],
};

test("lang.json has exactly the languages of config.json and the four groups", () => {
  assert.deepEqual(sorted(Object.keys(lang)), sorted(config.languages));
  for (const language of config.languages) {
    assert.deepEqual(sorted(Object.keys(lang[language])), sorted(LANG_GROUPS), language);
  }
});

test("every language has the same keys and only non-empty strings", () => {
  const [first, ...others] = config.languages;
  for (const group of LANG_GROUPS) {
    const keys = sorted(Object.keys(lang[first][group]));
    for (const language of others) {
      assert.deepEqual(sorted(Object.keys(lang[language][group])), keys, `${language}.${group}`);
    }
    for (const language of config.languages) {
      for (const [key, value] of Object.entries(lang[language][group])) {
        assert.equal(typeof value, "string", `${language}.${group}.${key}`);
        assert.notEqual(value.trim(), "", `${language}.${group}.${key}`);
      }
    }
  }
});

test("{placeholders} are the same in every language", () => {
  const placeholders = (value) => sorted(value.match(/\{\w+\}/g) || []);
  const [first, ...others] = config.languages;
  for (const [key, value] of Object.entries(lang[first].text)) {
    for (const language of others) {
      assert.deepEqual(placeholders(lang[language].text[key]), placeholders(value), `${language}.text.${key}`);
    }
  }
});

test("the text group holds exactly the keys the sources read", () => {
  const used = new Set();
  const dynamicFiles = [];
  for (const { name, text } of sourceFiles()) {
    // text.key, but not "text.secondary" (an MUI palette path in a string).
    for (const match of text.matchAll(/(?<![\w"'`$])text\.([A-Za-z_]\w*)/g)) used.add(match[1]);
    if (/\btext\[/.test(text)) dynamicFiles.push(name);
  }
  assert.deepEqual(sorted(dynamicFiles), sorted(Object.keys(DYNAMIC_TEXT_KEYS)), "files that read text[...]");
  const sources = new Map(sourceFiles().map(({ name, text }) => [name, text]));
  for (const [file, keys] of Object.entries(DYNAMIC_TEXT_KEYS)) {
    for (const key of keys) {
      assert.ok(sources.get(file).includes(`"${key}"`), `${file} names text key ${key}`);
      used.add(key);
    }
  }
  const defined = Object.keys(lang[config.defaultLanguage].text);
  assert.deepEqual(
    sorted(defined.filter((key) => !used.has(key))),
    [],
    "keys in lang.json that no source reads",
  );
  assert.deepEqual(
    sorted([...used].filter((key) => !defined.includes(key))),
    [],
    "keys the sources read that lang.json lacks",
  );
});

test("the errors group covers exactly the codes of contracts/error-codes.json", () => {
  assert.equal(errorCodes.length, 23);
  for (const language of config.languages) {
    assert.deepEqual(sorted(Object.keys(lang[language].errors)), sorted(errorCodes), language);
  }
});

test("every unit of the core's length category has a label in every language", () => {
  const unitIds = getCategory("length").units.map((unit) => unit.id);
  for (const language of config.languages) {
    assert.deepEqual(sorted(Object.keys(lang[language].units)), sorted(unitIds), language);
  }
});

test("every example id in config.json has a label, and every label an example", () => {
  const ids = [...config.position.examples, ...config.crs.examples, ...config.distance.examples].map(
    (example) => example.id,
  );
  assert.equal(new Set(ids).size, ids.length, "example ids are unique");
  for (const language of config.languages) {
    assert.deepEqual(sorted(Object.keys(lang[language].examples)), sorted(ids), language);
  }
});
