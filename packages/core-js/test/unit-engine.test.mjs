import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  UNIT_CATEGORIES,
  convertLength,
  convertUnits,
  formatRational,
  parseDecimal,
  toRational,
} from "@convert-tools/core/units";

function jsonRational(value) {
  const rational = toRational(value);
  return {
    numerator: rational.n.toString(),
    denominator: rational.d.toString(),
  };
}

test("uluslararası deniz mili tam olarak 1852 metredir", () => {
  const result = convertLength("1", "nautical-mile", "metre");
  assert.equal(result.value, "1852");
  assert.equal(result.exactDecimal, true);
  assert.deepEqual(result.exactValue, {
    numerator: "1852",
    denominator: "1",
  });
  assert.deepEqual(result.exactMetres, result.exactValue);
  assert.deepEqual(result.exactFactor, result.exactValue);
  assert.equal(result.precision, 24);
  assert.equal(result.roundingMode, "HALF_UP");
  assert.equal(result.rounded, false);
});

test("uluslararası ayak tam olarak 0.3048 metredir", () => {
  const result = convertUnits("1", "length", "foot", "metre");
  assert.equal(result.value, "0.3048");
  assert.equal(result.exactDecimal, true);
});

test("uzun ondalık girdiler Number hassasiyetine düşmeden korunur", () => {
  const source = "12345678901234567890.123456789012345678";
  const parsed = parseDecimal(source);
  assert.equal(formatRational(parsed, 18), source);
  const roundTrip = convertUnits(source, "length", "metre", "millimetre", 18);
  assert.equal(roundTrip.value, "12345678901234567890123.456789012345678");
});

test("sonlu ama seçilen haneye sığmayan sonuç exact olarak işaretlenmez", () => {
  const result = convertUnits(
    "0.1234567890123456789012345",
    "length",
    "metre",
    "metre",
    24,
  );
  assert.equal(result.terminatingDecimal, true);
  assert.equal(result.requiredFractionDigits, 25);
  assert.equal(result.exactDecimal, false);
  assert.equal(result.rounded, true);
  assert.equal(result.value, "0.123456789012345678901235");
});

test("Türkçe ondalık virgülü ve bilimsel gösterim desteklenir", () => {
  assert.equal(formatRational(parseDecimal("1,25"), 8), "1.25");
  assert.equal(formatRational(parseDecimal("3e-4"), 8), "0.0003");
});

test("deniz mili → metre → deniz mili gösterim üzerinden tam döner", () => {
  const source = "123.456789012345678901234";
  const metres = convertLength(source, "nautical-mile", "metre");
  const nauticalMiles = convertLength(
    metres.value,
    "metre",
    "nautical-mile",
  );

  assert.equal(metres.exactDecimal, true);
  assert.equal(nauticalMiles.value, source);
  assert.deepEqual(nauticalMiles.exactValue, jsonRational(source));
});

test("tekrarlı ondalık sonuç kesin token ile kayıpsız geri döner", () => {
  const nauticalMiles = convertLength("1", "metre", "nautical-mile");
  assert.equal(nauticalMiles.exactDecimal, false);
  assert.equal(nauticalMiles.rounded, true);
  assert.equal(nauticalMiles.value, "0.000539956803455723542117");
  assert.deepEqual(nauticalMiles.exactValue, {
    numerator: "1",
    denominator: "1852",
  });
  assert.deepEqual(nauticalMiles.exactMetres, {
    numerator: "1",
    denominator: "1",
  });
  assert.deepEqual(nauticalMiles.exactFactor, {
    numerator: "1",
    denominator: "1852",
  });

  const exactReturn = convertLength(
    nauticalMiles.exactValue,
    "nautical-mile",
    "metre",
  );
  assert.equal(exactReturn.value, "1");
  assert.deepEqual(exactReturn.exactValue, {
    numerator: "1",
    denominator: "1",
  });

  const roundedReturn = convertLength(
    nauticalMiles.value,
    "nautical-mile",
    "metre",
  );
  assert.notDeepEqual(roundedReturn.exactValue, exactReturn.exactValue);
});

test("dokuz uzunluk biriminin tüm yönleri kesin kesirle tersinirdir", () => {
  const length = UNIT_CATEGORIES.find((category) => category.id === "length");
  assert.ok(length);
  assert.equal(length.units.length, 9);

  const samples = [
    "0",
    "1",
    "-1",
    "0.1",
    "123.456789012345678901234",
    "-987654321.000000000001",
    "1e-30",
  ];

  for (const source of samples) {
    const expected = jsonRational(source);
    for (const from of length.units) {
      const expectedMetres = convertLength(
        source,
        from.id,
        "metre",
      ).exactValue;

      for (const to of length.units) {
        const forward = convertLength(source, from.id, to.id);
        const reverse = convertLength(forward.exactValue, to.id, from.id);
        const fromMetres = convertLength(
          forward.exactMetres,
          "metre",
          from.id,
        );

        assert.deepEqual(
          reverse.exactValue,
          expected,
          `${source}: ${from.id} -> ${to.id} -> ${from.id}`,
        );
        assert.deepEqual(
          forward.exactMetres,
          expectedMetres,
          `${source}: ${from.id} -> ${to.id} metre invariant`,
        );
        assert.deepEqual(
          fromMetres.exactValue,
          expected,
          `${source}: exact metres -> ${from.id}`,
        );

        if (forward.exactDecimal) {
          assert.deepEqual(
            jsonRational(forward.value),
            forward.exactValue,
            `${source}: ${from.id} -> ${to.id} exact display`,
          );
        }
      }
    }
  }
});

test("kesin girdiler Rational ve JSON kesri olarak kabul edilir", () => {
  assert.deepEqual(
    convertLength({ n: 1n, d: 2n }, "metre", "centimetre").exactValue,
    { numerator: "50", denominator: "1" },
  );
  assert.deepEqual(
    convertLength(
      { numerator: "1", denominator: "2" },
      "metre",
      "centimetre",
    ).exactValue,
    { numerator: "50", denominator: "1" },
  );
});

test("precision 0–60 arasında tam sayı olmalıdır", () => {
  for (const precision of [-1, 1.5, 61, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => convertLength("1", "metre", "metre", precision),
      /integer between 0 and 60/i,
    );
  }
  assert.equal(
    convertLength("1", "metre", "metre", 0).precision,
    0,
  );
  assert.equal(
    convertLength("1", "metre", "metre", 60).precision,
    60,
  );
});

test("güvensiz veya ondalıklı Number girdiler açıkça reddedilir", () => {
  for (const value of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => convertLength(value, "metre", "metre"),
      /use a decimal string/i,
    );
  }
  assert.equal(convertLength(42, "metre", "metre").value, "42");
});

test("aşırı büyük ondalık ve kesin kesir bileşenleri reddedilir", () => {
  const oversized = "9".repeat(4097);
  assert.throws(
    () => convertLength(oversized, "metre", "metre"),
    /at most 4096 digits/i,
  );
  assert.throws(
    () =>
      convertLength(
        { numerator: oversized, denominator: "1" },
        "metre",
        "metre",
      ),
    /at most 4096 digits/i,
  );
  assert.throws(
    () => convertLength(`${"0".repeat(4096)}1`, "metre", "metre"),
    /at most 4096 digits/i,
  );
  assert.throws(
    () =>
      convertLength(
        { numerator: `${"0".repeat(4096)}1`, denominator: "1" },
        "metre",
        "metre",
      ),
    /at most 4096 digits/i,
  );
});

test("belgelenen kesin girdi sınırı dönüşüm büyüse de korunur", () => {
  const maximumInteger = "9".repeat(4096);
  const expanded = convertLength(
    maximumInteger,
    "kilometre",
    "millimetre",
  );
  assert.equal(expanded.exactValue.numerator.length, 4102);
  assert.equal(expanded.exactValue.denominator, "1");

  const fractional = `.${"0".repeat(4095)}1`;
  const converted = convertLength(
    fractional,
    "nautical-mile",
    "metre",
  );
  const restored = convertLength(
    converted.exactValue,
    "metre",
    "nautical-mile",
  );
  assert.deepEqual(restored.exactValue, jsonRational(fractional));
});

test("JavaScript ortak birim sözleşmesi vektörlerini karşılar", async () => {
  const source = await readFile(
    new URL(
      "../../../contracts/test-vectors/unit-conversions.csv",
      import.meta.url,
    ),
    "utf8",
  );

  for (const line of source.trim().split("\n").slice(1)) {
    const [
      id,
      category,
      value,
      from,
      to,
      precision,
      expected,
      expectedNumerator,
      expectedDenominator,
      expectedMetresNumerator,
      expectedMetresDenominator,
      expectedFactorNumerator,
      expectedFactorDenominator,
    ] = line.split(",");
    const result = convertUnits(
      value,
      category,
      from,
      to,
      Number(precision),
    );
    assert.equal(result.value, expected, id);

    if (expectedNumerator) {
      assert.deepEqual(
        result.exactValue,
        {
          numerator: expectedNumerator,
          denominator: expectedDenominator,
        },
        `${id}: exactValue`,
      );
      assert.deepEqual(
        result.exactMetres,
        {
          numerator: expectedMetresNumerator,
          denominator: expectedMetresDenominator,
        },
        `${id}: exactMetres`,
      );
      assert.deepEqual(
        result.exactFactor,
        {
          numerator: expectedFactorNumerator,
          denominator: expectedFactorDenominator,
        },
        `${id}: exactFactor`,
      );
    }
  }
});
