import { useMemo, useState } from "react";
import CallSnippet from "../../components/CallSnippet.jsx";
import Chips from "../../components/Chips.jsx";
import DataList, { DataRow } from "../../components/DataList.jsx";
import Disclosure from "../../components/Disclosure.jsx";
import ErrorMessage from "../../components/ErrorMessage.jsx";
import Field from "../../components/Field.jsx";
import Icon from "../../components/Icon.jsx";
import Readout from "../../components/Readout.jsx";
import Segmented from "../../components/Segmented.jsx";
import { fill, useConfig, useLanguage } from "../../context.js";
import { localeDecimal } from "../../lib/locale-decimal.js";
import PageLayout from "../../shell/PageLayout.jsx";
import { COLORS, MONO_FONT, PHONE, TYPE } from "../../theme.js";
import { Box, Button, MenuItem, Paper } from "../../ui/index.js";
import { categories, categoryOf, exactFraction, fractionDigits, isPartialNumber, lengthSnippet, runAll, runConversion } from "./length.js";

const CATEGORIES = categories();

/** A core decimal grouped for the language with all of its digits. */
function grouped(value, language) {
  return localeDecimal(value, fractionDigits(value), language);
}

function UnitSelect({ id, label, category, value, onChange }) {
  const { units } = useLanguage();
  return (
    <Field id={id} select label={label} value={value} onChange={onChange}>
      {category.units.map((unit) => (
        <MenuItem key={unit.id} value={unit.id}>
          {units[unit.id] ?? unit.label} ({unit.symbol})
        </MenuItem>
      ))}
    </Field>
  );
}

const noteSx = { m: 0, color: COLORS.onInkMuted, fontSize: TYPE.small, lineHeight: 1.5, overflowWrap: "anywhere" };

/** Uzunluk (spec 8.4): one conversion, the value in every unit, examples and the library call. */
export default function LengthConverter() {
  const { text, language, units } = useLanguage();
  const { length: settings } = useConfig();
  // The page opens on the first example, or on the category's defaults.
  const [opening] = useState(() => settings.examples[0] ?? null);
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const category = categoryOf(categoryId);
  const [fromId, setFromId] = useState(opening?.from ?? category.defaultFrom);
  const [toId, setToId] = useState(opening?.to ?? category.defaultTo);
  const [input, setInput] = useState(opening?.value ?? "1");
  const [precision, setPrecision] = useState(String(settings.defaultPrecision));
  // After a swap the exact rational result is carried over, so display
  // rounding never feeds back into the next conversion.
  const [exactInput, setExactInput] = useState(null);
  const unitOf = (id) => category.units.find((unit) => unit.id === id);
  const fromUnit = unitOf(fromId);
  const toUnit = unitOf(toId);
  const request = { categoryId, input, exactInput, fromId, toId, precision };

  const conversion = useMemo(
    () => runConversion({ categoryId, input, exactInput, fromId, toId, precision }),
    [categoryId, input, exactInput, fromId, toId, precision],
  );
  const all = useMemo(
    () => runAll({ categoryId, input, exactInput, fromId, precision }),
    [categoryId, input, exactInput, fromId, precision],
  );

  const examples = useMemo(
    () =>
      settings.examples.map((example) => ({
        ...example,
        output: runConversion({ categoryId: "length", input: example.value, fromId: example.from, toId: example.to, precision: settings.examplePrecision }),
      })),
    [settings.examples, settings.examplePrecision],
  );

  function changeCategory(next) {
    const nextCategory = categoryOf(next);
    setCategoryId(next);
    setFromId(nextCategory.defaultFrom);
    setToId(nextCategory.defaultTo);
    setExactInput(null);
  }

  function swapUnits() {
    if (!conversion.ok) return;
    setInput(conversion.value.value);
    setExactInput(conversion.value.exactValue);
    setFromId(toId);
    setToId(fromId);
  }

  // Nothing typed yet, or a number still being typed ("-", "1.", "2e-"): no error yet.
  const empty = input.trim() === "" || isPartialNumber(input);
  const precisionFailed = !conversion.ok && conversion.code === "INVALID_PRECISION";
  const fraction = conversion.ok ? exactFraction(conversion.value) : null;

  return (
    <PageLayout title={text.unitTitle} subtitle={text.unitSubtitle} footer={text.unitFooter}>
      <Paper sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2, [PHONE]: { p: 2 } }}>
        {CATEGORIES.length > 1 && (
          <Segmented
            label={text.unitCategory}
            options={CATEGORIES.map((item) => ({ value: item.id, label: item.id === "length" ? text.navLength : item.label }))}
            value={categoryId}
            onChange={changeCategory}
          />
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) auto minmax(0, 1fr)",
            alignItems: "end",
            gap: 1,
            [PHONE]: { gridTemplateColumns: "minmax(0, 1fr) auto" },
          }}
        >
          <Field
            id="length-value"
            label={`${text.value} (${fromUnit.symbol})`}
            value={input}
            inputMode="decimal"
            sx={{ [PHONE]: { gridColumn: "1 / -1" } }}
            error={!empty && !conversion.ok && !precisionFailed}
            onChange={(value) => {
              setInput(value);
              setExactInput(null);
            }}
          />
          <UnitSelect
            id="length-from"
            label={text.from}
            category={category}
            value={fromId}
            onChange={setFromId}
          />
          <Button
            variant="outlined"
            onClick={swapUnits}
            disabled={!conversion.ok}
            aria-label={text.swap}
            title={text.swap}
            sx={{ minWidth: 36, width: 36, height: 36, p: 0, [PHONE]: { minWidth: 40, width: 40, height: 40, gridRow: 2, gridColumn: 2 } }}
          >
            <Icon name="swap" size={20} />
          </Button>
          <Box sx={{ minWidth: 0, [PHONE]: { gridColumn: "1 / -1" } }}>
            <UnitSelect id="length-to" label={text.to} category={category} value={toId} onChange={setToId} />
          </Box>
        </Box>

        <Readout
          label={text.result}
          value={conversion.ok ? grouped(conversion.value.value, language) : null}
          unit={toUnit.symbol}
          copyValue={conversion.ok ? conversion.value.value : undefined}
          empty={empty ? text.lengthEmpty : text.resultFailed}
        >
          <Box component="p" sx={noteSx}>
            {conversion.ok && (conversion.value.exactDecimal ? text.exact : fill(text.rounded, { digits: conversion.value.precision }))}
          </Box>
          <Box component="p" sx={{ ...noteSx, fontFamily: MONO_FONT }}>
            {text.rate}: 1 {fromUnit.symbol} = {conversion.ok ? conversion.value.factor : "—"} {toUnit.symbol}
          </Box>
          {fraction && (
            <Box component="p" sx={noteSx}>
              {text.exactFraction}:{" "}
              <Box component="span" sx={{ color: COLORS.onInk, fontFamily: MONO_FONT }}>
                {fraction} {toUnit.symbol}
              </Box>
            </Box>
          )}
        </Readout>
        {!empty && !conversion.ok && (
          <ErrorMessage summary={precisionFailed ? fill(text.precisionInvalid, { max: settings.maxPrecision }) : text.invalid} code={conversion.code} />
        )}

        <Field
          id="length-precision"
          label={fill(text.precisionDigits, { max: settings.maxPrecision })}
          value={precision}
          inputMode="numeric"
          error={precisionFailed}
          onChange={setPrecision}
          sx={{ maxWidth: 240, [PHONE]: { maxWidth: "none" } }}
        />
        <Box component="p" sx={{ m: 0, color: COLORS.muted, fontSize: TYPE.meta, lineHeight: 1.5 }}>
          {text.swapPrecision}
        </Box>

        <Box>
          <Disclosure title={text.allUnits}>
            {all.ok ? (
              <DataList>
                {all.value.map((row) => (
                  <DataRow
                    key={row.id}
                    label={units[row.id] ?? row.label}
                    value={grouped(row.value, language)}
                    unit={row.symbol}
                    copyValue={row.value}
                  />
                ))}
              </DataList>
            ) : (
              <Box component="p" sx={{ m: 0, py: 1, color: COLORS.muted, fontSize: TYPE.small }}>
                {text.resultFailed}
              </Box>
            )}
          </Disclosure>
        </Box>

        <Chips
          label={text.examples}
          items={examples.map((example) => ({
            key: `${example.value}-${example.from}-${example.to}`,
            label: (
              <code>
                {example.value} {unitOf(example.from)?.symbol} → {example.output.ok ? example.output.value.value : "—"}{" "}
                {unitOf(example.to)?.symbol}
              </code>
            ),
            onClick: () => {
              setCategoryId("length");
              setInput(example.value);
              setExactInput(null);
              setFromId(example.from);
              setToId(example.to);
            },
          }))}
        />
        {conversion.ok && <CallSnippet code={lengthSnippet(request)} />}
      </Paper>
    </PageLayout>
  );
}
