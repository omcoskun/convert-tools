// src/tools/index.js: the one list of tools the top bar, the address and
// the layout are built from.

import assert from "node:assert/strict";
import test from "node:test";
import "./support/jsx-loader.mjs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { readJson } from "./support/files.mjs";

const { DEFAULT_TOOL, TOOLS, resolveTool } = await import("../src/tools/index.js");
const { sectionOf } = await import("../src/lib/address.js");
const { default: Icon } = await import("../src/components/Icon.jsx");

const lang = readJson("public/lang.json");

test("the tools are measure, positions, crs, length, triaxial and reference, in navigation order", () => {
  assert.deepEqual(
    TOOLS.map((tool) => tool.id),
    ["measure", "positions", "crs", "length", "triaxial", "reference"],
  );
});

test("measure is the default tool", () => {
  assert.equal(DEFAULT_TOOL, "measure");
  assert.ok(TOOLS.some((tool) => tool.id === DEFAULT_TOOL));
});

test("resolveTool keeps known ids, opens measure for the old #distance and rejects the rest", () => {
  for (const { id } of TOOLS) assert.equal(resolveTool(id), id);
  assert.equal(resolveTool("distance"), "measure");
  for (const unknown of ["nope", "", "Measure", "toString", "__proto__", "#measure", "/reference"]) {
    assert.equal(resolveTool(unknown), null, JSON.stringify(unknown));
  }
});

test("an address may name a place inside a tool: #reference/errors opens Referans at its error codes", () => {
  assert.equal(resolveTool("reference/errors"), "reference");
  assert.equal(sectionOf("reference/errors"), "errors");
  assert.equal(sectionOf("reference"), null);
  assert.equal(sectionOf("reference/"), null);
  assert.equal(resolveTool("nope/errors"), null);
});

test("every tool has a label in every language, a drawn icon, a layout and a component", () => {
  for (const tool of TOOLS) {
    for (const language of Object.keys(lang)) {
      assert.equal(typeof lang[language].text[tool.labelKey], "string", `${language}.text.${tool.labelKey}`);
    }
    assert.match(renderToString(createElement(Icon, { name: tool.icon })), /<(path|circle|ellipse|rect)\b/, tool.icon);
    assert.ok(["workspace", "page"].includes(tool.layout), tool.id);
    assert.equal(typeof tool.Component, "function", tool.id);
    if (tool.prefetch !== undefined) assert.equal(typeof tool.prefetch, "function", tool.id);
  }
});
