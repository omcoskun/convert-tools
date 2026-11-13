// loadRuntime() with a fake fetch: the files are read next to index.html,
// and a broken deployment is reported instead of rendered half-empty.

import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntime, validateRuntime } from "../src/runtime.js";

const CONFIG = { defaultLanguage: "tr", languages: ["tr", "en"] };
const group = (value) => ({ a: value, b: value });
const LANG = {
  tr: { text: group("tr"), units: group("tr"), examples: group("tr"), errors: group("tr") },
  en: { text: group("en"), units: group("en"), examples: group("en"), errors: group("en") },
};

const clone = (value) => JSON.parse(JSON.stringify(value));

/** A fetch that serves the given files by path name and records the URLs asked for. */
function fakeFetch(files) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), init });
    const name = new URL(url).pathname.split("/").pop();
    if (!(name in files)) return { ok: false, status: 404, json: async () => assert.fail("no body") };
    return { ok: true, status: 200, json: async () => clone(files[name]) };
  };
  return { fetchImpl, requests };
}

test("loads config.json and lang.json next to the document, also under a sub-path", async () => {
  const { fetchImpl, requests } = fakeFetch({ "config.json": CONFIG, "lang.json": LANG });
  const runtime = await loadRuntime(fetchImpl, "https://example.test/convert-tools/index.html");
  assert.deepEqual(runtime, { config: CONFIG, lang: LANG });
  assert.deepEqual(
    requests.map((request) => request.url).sort(),
    ["https://example.test/convert-tools/config.json", "https://example.test/convert-tools/lang.json"],
  );
  for (const request of requests) assert.equal(request.init.cache, "no-cache");
});

test("an HTTP error names the file and the status", async () => {
  const { fetchImpl } = fakeFetch({ "config.json": CONFIG });
  await assert.rejects(loadRuntime(fetchImpl, "https://example.test/"), { message: "/lang.json: HTTP 404" });
});

test("a language listed in config.json but missing from lang.json is rejected", async () => {
  const lang = clone(LANG);
  delete lang.en;
  const { fetchImpl } = fakeFetch({ "config.json": CONFIG, "lang.json": lang });
  await assert.rejects(loadRuntime(fetchImpl, "https://example.test/"), {
    message: "lang.json: language en is missing.",
  });
});

test("keys that differ between languages are rejected", async () => {
  const lang = clone(LANG);
  lang.en.errors.c = "extra";
  const { fetchImpl } = fakeFetch({ "config.json": CONFIG, "lang.json": lang });
  await assert.rejects(loadRuntime(fetchImpl, "https://example.test/"), {
    message: "lang.json: en.errors keys differ from tr.errors.",
  });
});

test("validateRuntime rejects the other broken shapes", () => {
  const cases = [
    [null, LANG, "config.json is not an object."],
    [CONFIG, "x", "lang.json is not an object."],
    [{ ...CONFIG, languages: [] }, LANG, "config.json: languages must be a non-empty array."],
    [{ ...CONFIG, defaultLanguage: "de" }, LANG, 'config.json: defaultLanguage "de" is not in languages.'],
  ];
  for (const [config, lang, message] of cases) {
    assert.throws(() => validateRuntime(config, lang), { message });
  }
  const missingGroup = clone(LANG);
  delete missingGroup.tr.units;
  assert.throws(() => validateRuntime(CONFIG, missingGroup), { message: "lang.json: tr.units is missing." });
  const empty = clone(LANG);
  empty.en.text.b = "";
  assert.throws(() => validateRuntime(CONFIG, empty), {
    message: "lang.json: en.text.b must be a non-empty string.",
  });
});
