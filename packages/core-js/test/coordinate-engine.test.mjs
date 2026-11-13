import assert from "node:assert/strict";
import test from "node:test";
import {
  coordinateResults,
  decodeGars,
  decodeGeoref,
  decodeMgrs,
  encodeGars,
  encodeGeoref,
  encodeMgrs,
  formatDdm,
  formatDms,
  fromDecimalDegrees,
  fromDdm,
  fromDms,
  fromGars,
  fromMgrs,
  fromUtmUps,
  inverseGeodesic,
  transformCrs,
  utmUpsForward,
  utmUpsInverse,
} from "@convert-tools/core/geodesy";

const closeTo = (actual, expected, tolerance, message) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} ≉ ${expected}`,
  );
};

const longitudeDifference = (first, second) =>
  Math.abs((((first - second) + 540) % 360) - 180);

const spatialDistanceMetres = (first, second) =>
  inverseGeodesic(first, second).distanceMetres;

function deterministicPoints(
  count,
  minimumLatitude,
  maximumLatitude,
  seed,
) {
  let state = seed >>> 0;
  const random = () => {
    state =
      (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };

  return Array.from({ length: count }, () => ({
    latitude:
      minimumLatitude +
      random() * (maximumLatitude - minimumLatitude),
    longitude: -180 + random() * 360,
  }));
}

test("Ramadi test noktası 1 metre hassasiyetli MGRS üretir", () => {
  const result = coordinateResults(fromDecimalDegrees(33.44, 43.27), 5);
  assert.equal(result.mgrs.replace(/\s/g, ""), "38SLC3918701405");
});

test("Ankara UTM dönüşümü metre-altı toleransla geri döner", () => {
  const point = fromDecimalDegrees(39.933365, 32.859742);
  const result = coordinateResults(point, 5);
  assert.match(result.utmUps, /^36N\b/);

  const grid = utmUpsForward(point.latitude, point.longitude);
  closeTo(grid.easting, 488015.98778223846, 0.001, "easting");
  closeTo(grid.northing, 4420370.843637543, 0.001, "northing");
  const roundTrip = fromUtmUps(
    grid.zone,
    "N",
    grid.easting,
    grid.northing,
  );
  closeTo(roundTrip.latitude, point.latitude, 1e-8, "latitude");
  closeTo(roundTrip.longitude, point.longitude, 1e-8, "longitude");
});

test("MGRS çözümleme hücrenin merkez noktasını kullanır", () => {
  const point = fromMgrs("36SVK8801520370");
  assert.equal(point.sourceKind, "cell");
  assert.equal(point.sourceCellMetres, 1);
  closeTo(point.latitude, 39.9333619, 0.00002, "latitude");
  closeTo(point.longitude, 32.8597363, 0.00002, "longitude");
});

test("Kutup noktaları UPS ve polar MGRS ile desteklenir", () => {
  const result = coordinateResults(fromDecimalDegrees(85, 0), 5);
  assert.match(result.utmUps, /^UPS N\b/);
  assert.match(result.mgrs.replace(/\s/g, ""), /^[YZ]/);
});

test("DMS girdi çözümlemesi ve biçimlemesi yön harflerini korur", () => {
  const point = fromDms(`39°56'00.114"N`, `032°51'35.0712"E`);
  closeTo(point.latitude, 39.933365, 1e-12, "latitude");
  closeTo(point.longitude, 32.859742, 1e-12, "longitude");
  const result = coordinateResults(point, 5);
  assert.match(result.dms, /N/);
  assert.match(result.dms, /E/);
  assert.throws(
    () => fromDms("39d56m00.114s", `032°51'35.0712"E`),
    /ambiguous/i,
  );
  assert.throws(
    () => fromDms("39d56m00.114sN", `032°51'35.0712"E`),
    /multiple hemispheres/i,
  );
  closeTo(
    fromDms(`39°56'00.114"S`, `032°51'35.0712"E`).latitude,
    -39.933365,
    1e-12,
    "explicit south latitude",
  );
});

test("GARS referans örneği üretilir ve hücre merkezine çözülür", () => {
  const result = coordinateResults(fromDecimalDegrees(10.775276, 106.706797), 5);
  assert.equal(result.gars, "574JK19");

  const point = fromGars("574JK19");
  assert.equal(point.sourceKind, "area");
  assert.equal(point.sourceCellDegrees, 1 / 12);
  closeTo(point.latitude, 10.791666666666666, 1e-12, "latitude");
  closeTo(point.longitude, 106.70833333336667, 1e-9, "longitude");
});

test("GEOREF bilinen örneği kodlanır ve aynı hücreye çözülür", () => {
  const georef = encodeGeoref(106.706797, 10.775276, 4);
  assert.equal(georef, "VGBL42404651");
  const point = decodeGeoref(georef);
  assert.equal(encodeGeoref(point.longitude, point.latitude, 4), georef);
});

test("Web Mercator dönüşümü ve ters dönüşümü tutarlıdır", () => {
  const projected = transformCrs(
    "EPSG:4326",
    "EPSG:3857",
    32.859742,
    39.933365,
  );
  closeTo(projected.x, 3657929.7470383444, 1e-6, "x");
  closeTo(projected.y, 4856263.78244475, 1e-6, "y");

  const restored = transformCrs(
    "EPSG:3857",
    "EPSG:4326",
    projected.x,
    projected.y,
  );
  closeTo(restored.x, 32.859742, 1e-10, "longitude");
  closeTo(restored.y, 39.933365, 1e-10, "latitude");
});

test("Norveç ve Svalbard özel UTM zonları uygulanır", () => {
  assert.equal(utmUpsForward(60, 6).zone, 32);
  assert.equal(utmUpsForward(72, 21).zone, 35);
});

test("UPS güney dönüşümü kutup bölgesinde geri çevrilebilir", () => {
  const grid = utmUpsForward(-85, 30);
  assert.equal(grid.zone, 0);
  assert.equal(grid.north, false);
  const point = fromUtmUps(
    0,
    "S",
    grid.easting,
    grid.northing,
  );
  closeTo(point.latitude, -85, 1e-10, "latitude");
  closeTo(point.longitude, 30, 1e-10, "longitude");
});

test("Tanımsız EPSG kodu açıkça reddedilir", () => {
  assert.throws(
    () => transformCrs("EPSG:4326", "EPSG:999999", 0, 0),
    /not available/i,
  );
});

test("çıktılar yuvarlama ve hücre çözünürlüklerini açıkça bildirir", () => {
  const result = coordinateResults(
    fromDecimalDegrees(39.933365, 32.859742),
    3,
  );

  assert.deepEqual(result.resolution.dd, {
    kind: "angular-rounding",
    stepDegrees: 1e-10,
    maximumErrorDegrees: 5e-11,
  });
  closeTo(
    result.resolution.dms.stepDegrees,
    1e-5 / 3600,
    1e-23,
    "DMS resolution",
  );
  closeTo(
    result.resolution.ddm.stepDegrees,
    1e-7 / 60,
    1e-23,
    "DDM resolution",
  );
  assert.deepEqual(result.resolution.mgrs, {
    kind: "grid-cell",
    cellMetres: 100,
    decodedPoint: "cell-center",
    maximumCenterOffsetMetres: 100 * Math.SQRT1_2,
  });
  assert.deepEqual(result.resolution.utmUps, {
    kind: "grid-rounding",
    stepMetres: 0.001,
    maximumErrorMetresPerAxis: 0.0005,
  });
  assert.equal(result.resolution.gars.cellDegrees, 1 / 12);
  assert.equal(result.resolution.georef.cellDegrees, 1 / 6000);
});

test("coordinateResults tip sözleşmesindeki ondalık metinleri kabul eder", () => {
  const result = coordinateResults({
    latitude: "39.933365",
    longitude: "32.859742",
  });
  assert.equal(result.latitude, 39.933365);
  assert.equal(result.longitude, 32.859742);
});

test("DMS ve DDM biçimleri belirtilen açısal çözünürlükte geri döner", () => {
  const points = [
    { latitude: -90, longitude: -180 },
    { latitude: 90, longitude: 180 },
    { latitude: 0, longitude: 0 },
    { latitude: 84, longitude: 179.999999999 },
    { latitude: -80, longitude: -179.999999999 },
    ...deterministicPoints(500, -90, 90, 0xd15ea5e),
  ];
  const dmsToleranceDegrees = 1e-5 / 7200 + 1e-14;
  const ddmToleranceDegrees = 1e-7 / 120 + 1e-14;

  for (const point of points) {
    const dmsLatitude = formatDms(point.latitude, "latitude");
    const dmsLongitude = formatDms(point.longitude, "longitude");
    const dmsRoundTrip = fromDms(dmsLatitude, dmsLongitude);
    closeTo(
      dmsRoundTrip.latitude,
      point.latitude,
      dmsToleranceDegrees,
      "DMS latitude",
    );
    assert.ok(
      longitudeDifference(
        dmsRoundTrip.longitude,
        point.longitude,
      ) <= dmsToleranceDegrees,
      "DMS longitude",
    );
    assert.equal(
      formatDms(dmsRoundTrip.latitude, "latitude"),
      dmsLatitude,
    );
    assert.equal(
      formatDms(dmsRoundTrip.longitude, "longitude"),
      dmsLongitude,
    );

    const ddmLatitude = formatDdm(point.latitude, "latitude");
    const ddmLongitude = formatDdm(point.longitude, "longitude");
    const ddmRoundTrip = fromDdm(ddmLatitude, ddmLongitude);
    closeTo(
      ddmRoundTrip.latitude,
      point.latitude,
      ddmToleranceDegrees,
      "DDM latitude",
    );
    assert.ok(
      longitudeDifference(
        ddmRoundTrip.longitude,
        point.longitude,
      ) <= ddmToleranceDegrees,
      "DDM longitude",
    );
    assert.equal(
      formatDdm(ddmRoundTrip.latitude, "latitude"),
      ddmLatitude,
    );
    assert.equal(
      formatDdm(ddmRoundTrip.longitude, "longitude"),
      ddmLongitude,
    );
  }
});

test("UTM ve UPS sayısal geri dönüşü mikrometre sınırında kalır", () => {
  const points = [
    { latitude: 39.933365, longitude: 32.859742 },
    { latitude: 0, longitude: 0 },
    { latitude: -80, longitude: 0 },
    { latitude: 83.999999999, longitude: 0 },
    { latitude: 56, longitude: 3 },
    { latitude: 63.999999, longitude: 11.999999 },
    { latitude: 72, longitude: 8.999999 },
    { latitude: 72, longitude: 20.999999 },
    { latitude: 72, longitude: 32.999999 },
    { latitude: 72, longitude: 41.999999 },
    { latitude: 85, longitude: 179.999999 },
    { latitude: -85, longitude: -179.999999 },
    ...deterministicPoints(1_000, -89.999999, 89.999999, 0x5eed1234),
  ];

  for (const point of points) {
    const grid = utmUpsForward(
      point.latitude,
      point.longitude,
    );
    const restored = utmUpsInverse(
      grid.zone,
      grid.north,
      grid.easting,
      grid.northing,
    );
    assert.ok(
      spatialDistanceMetres(point, restored) <= 1e-6,
      `UTM/UPS round-trip: ${JSON.stringify(point)}`,
    );
  }

  const pole = { latitude: 90, longitude: 47 };
  const poleGrid = utmUpsForward(pole.latitude, pole.longitude);
  const restoredPole = utmUpsInverse(
    poleGrid.zone,
    poleGrid.north,
    poleGrid.easting,
    poleGrid.northing,
  );
  closeTo(restoredPole.latitude, 90, 1e-12, "pole latitude");
  const reprojectedPole = utmUpsForward(
    restoredPole.latitude,
    restoredPole.longitude,
  );
  closeTo(
    reprojectedPole.easting,
    poleGrid.easting,
    1e-9,
    "pole easting",
  );
  closeTo(
    reprojectedPole.northing,
    poleGrid.northing,
    1e-9,
    "pole northing",
  );
});

test("Web Mercator sınırlar ve antimeridyen dahil konumsal olarak geri döner", () => {
  const maximumLatitude = 85.0511287798066;
  const points = [
    { latitude: 0, longitude: -180 },
    { latitude: 0, longitude: 180 },
    { latitude: maximumLatitude, longitude: 180 },
    { latitude: -maximumLatitude, longitude: -180 },
    ...deterministicPoints(
      500,
      -maximumLatitude,
      maximumLatitude,
      0x38574326,
    ),
  ];

  for (const point of points) {
    const projected = transformCrs(
      "EPSG:4326",
      "EPSG:3857",
      point.longitude,
      point.latitude,
    );
    const restored = transformCrs(
      "EPSG:3857",
      "EPSG:4326",
      projected.x,
      projected.y,
    );
    assert.ok(
      spatialDistanceMetres(point, {
        latitude: restored.y,
        longitude: restored.x,
      }) <= 1e-6,
      `Web Mercator round-trip: ${JSON.stringify(point)}`,
    );
  }
});

test("GARS sınırları geçerli hücrelere kapanır ve hücre merkezini döndürür", () => {
  const points = [
    { latitude: -90, longitude: -180 },
    { latitude: 90, longitude: 180 },
    { latitude: 90, longitude: 0 },
    { latitude: 0, longitude: 180 },
    ...deterministicPoints(500, -90, 90, 0x6a725),
  ];

  for (const point of points) {
    const code = encodeGars(point.longitude, point.latitude);
    const decoded = decodeGars(code);
    assert.ok(
      Math.abs(decoded.latitude - point.latitude) <=
        decoded.cellDegrees / 2 + 1e-12,
      `GARS latitude containment: ${code}`,
    );
    assert.ok(
      longitudeDifference(decoded.longitude, point.longitude) <=
        decoded.cellDegrees / 2 + 1e-12,
      `GARS longitude containment: ${code}`,
    );
    assert.equal(
      encodeGars(decoded.longitude, decoded.latitude),
      code,
    );
  }
});

test("GEOREF tüm çözünürlüklerde kutup ve antimeridyen hücrelerini korur", () => {
  const points = [
    { latitude: -90, longitude: -180 },
    { latitude: 90, longitude: 180 },
    { latitude: 90, longitude: 0 },
    { latitude: 0, longitude: 180 },
    ...deterministicPoints(250, -90, 90, 0x6e0ef),
  ];

  for (let precision = 0; precision <= 5; precision += 1) {
    for (const point of points) {
      const code = encodeGeoref(
        point.longitude,
        point.latitude,
        precision,
      );
      const decoded = decodeGeoref(code);
      assert.ok(
        Math.abs(decoded.latitude - point.latitude) <=
          decoded.cellDegrees / 2 + 1e-12,
        `GEOREF latitude containment: ${code}`,
      );
      assert.ok(
        longitudeDifference(decoded.longitude, point.longitude) <=
          decoded.cellDegrees / 2 + 1e-12,
        `GEOREF longitude containment: ${code}`,
      );
      assert.equal(
        encodeGeoref(
          decoded.longitude,
          decoded.latitude,
          precision,
        ),
        code,
      );
    }
  }
});

test("MGRS geri dönüşü metin eşitliği yerine kaynak hücre kapsamını korur", () => {
  const points = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: -180 },
    { latitude: 0, longitude: 180 },
    { latitude: -80, longitude: 0 },
    { latitude: 84, longitude: 0 },
    { latitude: 56, longitude: 3 },
    { latitude: 72, longitude: 9 },
    { latitude: 72, longitude: 21 },
    { latitude: 90, longitude: 0 },
    { latitude: -90, longitude: 0 },
    ...deterministicPoints(250, -90, 90, 0x4d675),
  ];

  for (let precision = 0; precision <= 5; precision += 1) {
    for (const point of points) {
      const sourceGrid = utmUpsForward(
        point.latitude,
        point.longitude,
      );
      const code = encodeMgrs(
        point.latitude,
        point.longitude,
        precision,
      );
      const decoded = decodeMgrs(code, true);
      assert.equal(decoded.zone, sourceGrid.zone, code);
      assert.equal(decoded.north, sourceGrid.north, code);
      assert.ok(
        Math.abs(decoded.easting - sourceGrid.easting) <=
          decoded.cellMetres / 2 + 1e-7,
        `MGRS easting containment: ${code}`,
      );
      assert.ok(
        Math.abs(decoded.northing - sourceGrid.northing) <=
          decoded.cellMetres / 2 + 1e-7,
        `MGRS northing containment: ${code}`,
      );
    }
  }
});

test("boylam +180° standart zonda zon 1'e, GARS'ta 001 bandına düşer", () => {
  assert.equal(utmUpsForward(0, 180).zone, 1);
  assert.equal(utmUpsForward(0, -180).zone, 1);
  assert.equal(utmUpsForward(0, 179.999999999).zone, 60);
  assert.equal(encodeMgrs(0, 180, 0), "01NAA");
  assert.equal(encodeGars(180, 0), encodeGars(-180, 0));
});

test("MGRS zonu her zaman iki haneyle yazılır ve iki biçim de çözülür", () => {
  assert.equal(encodeMgrs(-37.25, -177, 0), "01HEU"); // GeoConvert -m -p -5
  const padded = decodeMgrs("01HEU");
  const bare = decodeMgrs("1HEU");
  assert.equal(padded.latitude, bare.latitude);
  assert.equal(padded.longitude, bare.longitude);
});

test("bandıyla tutarsız MGRS karesi reddedilir", () => {
  // GeoConvert rejects these; the old decoder silently accepted them.
  for (const code of ["32NQQ7070975688", "26PJD", "54JSV20"]) {
    assert.throws(() => decodeMgrs(code), /not in its zone and latitude band/);
  }
  // Valid squares at the edge of a band are still accepted.
  assert.doesNotThrow(() => decodeMgrs("57CTL19"));
});

test("UPS 60° sınırında kendi çıktısını geri çevirir", () => {
  for (const [latitude, longitude] of [[60, 45], [-60, -135], [60, 180]]) {
    const grid = transformCrs(
      "EPSG:4326",
      latitude > 0 ? "EPSG:5041" : "EPSG:5042",
      longitude,
      latitude,
    );
    const back = transformCrs(grid.target, "EPSG:4326", grid.x, grid.y);
    closeTo(back.y, latitude, 1e-12, "latitude");
    closeTo(back.x, longitude, 1e-12, "longitude");
  }
  assert.throws(
    () => transformCrs("EPSG:5041", "EPSG:4326", 5500000, 2000000),
    /outside the supported range/,
  );
});

test("UPS kutup ve antimeridyende derece-tam trigonometri kullanır", () => {
  // sin(-180°) must be exactly zero: the point lies on the east/west split
  // and GeographicLib places it in the eastern (B) band.
  assert.equal(encodeMgrs(-80.5, -180, 0), "BAB");
  assert.equal(utmUpsForward(-85, -180).easting, 2000000);
});

test("güney UTM CRS'i ekvatorda 10 000 km false northing kullanır", () => {
  // By definition the central meridian at the equator is (500 000, 0) in the
  // northern CRS and (500 000, 10 000 000) in the southern CRS.
  const south = transformCrs("EPSG:4326", "EPSG:32735", 27, 0);
  assert.equal(south.x, 500000);
  assert.equal(south.y, 10000000);
  const north = transformCrs("EPSG:4326", "EPSG:32635", 27, 0);
  assert.equal(north.x, 500000);
  assert.equal(north.y, 0);
  const back = transformCrs("EPSG:32735", "EPSG:4326", 500000, 10000000);
  assert.equal(back.x, 27);
  assert.equal(Math.abs(back.y), 0);
});

test("GEOREF dakika sınırının hemen altındaki noktayı kendi hücresine yazar", () => {
  // GeographicLib Georef::Forward (contract rows cell-1m-*-p2): 1e-12° below
  // the 1' line is still in minute 00; the old +1e-10 nudge wrote 01.
  assert.equal(encodeGeoref("32.016666666665664", "39.016666666665664", 2), "QJCK0000");
  assert.equal(encodeGeoref("32.016666666666666", "39.016666666666666", 2), "QJCK0101");
  assert.equal(encodeGeoref("-32.016666666667668", "-39.016666666667668", 2), "KDNF5858");
});
