import { useMemo, useState } from "react";
import { convertLength, getCategory } from "@convert-tools/core";
import CopyButton from "../../components/CopyButton.jsx";
import ErrorMessage from "../../components/ErrorMessage.jsx";
import ToolPage from "../../components/ToolPage.jsx";
import { fill, useConfig, useLanguage } from "../../context.js";
import { attempt } from "../../lib/attempt.js";
import { MONO_FONT } from "../../theme.js";
import { Box, Button, MenuItem, Paper, Stack, TextField, Typography } from "../../ui/index.js";

const LENGTH = getCategory("length");

function unitById(id) {
  return LENGTH.units.find((unit) => unit.id === id);
}

function UnitSelect({ id, label, value, onChange }) {
  const { units } = useLanguage();
  return (
    <TextField
      id={id}
      select
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      size="small"
      fullWidth
    >
      {LENGTH.units.map((unit) => (
        <MenuItem key={unit.id} value={unit.id}>
          {units[unit.id]} ({unit.symbol})
        </MenuItem>
      ))}
    </TextField>
  );
}

export default function LengthConverter() {
  const { text } = useLanguage();
  const { length: settings } = useConfig();
  const [fromId, setFromId] = useState(LENGTH.defaultFrom);
  const [toId, setToId] = useState(LENGTH.defaultTo);
  const [input, setInput] = useState("1");
  // After a swap the exact rational result is carried over, so display
  // rounding never feeds back into the next conversion.
  const [exactInput, setExactInput] = useState(null);
  const fromUnit = unitById(fromId);
  const toUnit = unitById(toId);

  const conversion = useMemo(
    () => attempt(() => convertLength(exactInput == null ? input : exactInput, fromId, toId, settings.precision)),
    [input, exactInput, fromId, toId, settings.precision],
  );

  const examples = useMemo(
    () =>
      settings.examples.map((example) => ({
        ...example,
        output: convertLength(example.value, example.from, example.to, settings.examplePrecision).value,
      })),
    [settings.examples, settings.examplePrecision],
  );

  function swapUnits() {
    if (!conversion.ok) return;
    setInput(conversion.value.value);
    setExactInput(conversion.value.exactValue);
    setFromId(toId);
    setToId(fromId);
  }

  return (
    <ToolPage title={text.unitTitle} subtitle={text.unitSubtitle} footer={text.unitFooter}>
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "flex-start" }}>
          <Stack spacing={2} sx={{ flex: 1 }}>
            <TextField
              id="length-value"
              label={text.value}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setExactInput(null);
              }}
              fullWidth
              autoComplete="off"
              inputProps={{ inputMode: "decimal", spellCheck: "false", style: { fontFamily: MONO_FONT } }}
              InputProps={{ endAdornment: <Typography color="text.secondary">{fromUnit.symbol}</Typography> }}
            />
            <UnitSelect
              id="length-from"
              label={text.from}
              value={fromId}
              onChange={(next) => {
                setFromId(next);
                setExactInput(null);
              }}
            />
          </Stack>

          <Button
            variant="outlined"
            onClick={swapUnits}
            disabled={!conversion.ok}
            aria-label={text.swap}
            title={text.swap}
            sx={{ alignSelf: "center", minWidth: 48, fontSize: "1.25rem" }}
          >
            ⇄
          </Button>

          <Stack spacing={2} sx={{ flex: 1 }} aria-live="polite">
            <Paper variant="outlined" sx={{ px: 1.5, py: 1, minHeight: 56 }}>
              <Typography variant="caption" color="text.secondary">
                {text.result}
              </Typography>
              {conversion.ok && (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box
                    component="strong"
                    sx={{ fontFamily: MONO_FONT, fontSize: "1.1rem", overflowWrap: "anywhere", flex: 1 }}
                  >
                    {conversion.value.value} {toUnit.symbol}
                  </Box>
                  <CopyButton value={conversion.value.value} label={text.result} />
                </Stack>
              )}
            </Paper>
            <UnitSelect id="length-to" label={text.to} value={toId} onChange={setToId} />
          </Stack>
        </Stack>

        {conversion.ok ? (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {conversion.value.exactDecimal ? text.exact : fill(text.rounded, { digits: settings.precision })}
            </Typography>
            <Box component="code" sx={{ fontFamily: MONO_FONT, fontSize: "0.85rem" }}>
              {text.rate}: 1 {fromUnit.symbol} = {conversion.value.factor} {toUnit.symbol}
            </Box>
          </Stack>
        ) : (
          <ErrorMessage summary={text.invalid} code={conversion.code} />
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {text.swapPrecision}
        </Typography>
      </Paper>

      <Paper component="section" aria-labelledby="length-examples" sx={{ p: { xs: 2, sm: 3 }, mt: 2 }}>
        <Typography id="length-examples" variant="h2">
          {text.examples}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {text.examplesHint}
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          {examples.map((example) => (
            <Button
              key={`${example.value}-${example.from}-${example.to}`}
              variant="outlined"
              onClick={() => {
                setInput(example.value);
                setExactInput(null);
                setFromId(example.from);
                setToId(example.to);
              }}
              sx={{ justifyContent: "flex-start", fontFamily: MONO_FONT }}
            >
              {example.value} {unitById(example.from).symbol} → {example.output} {unitById(example.to).symbol}
            </Button>
          ))}
        </Stack>
      </Paper>
    </ToolPage>
  );
}
