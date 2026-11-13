# Convert Tools Core — Java

Java 17 için dış bağımlılığı olmayan kesin uzunluk dönüşümü, koordinat
formatları, CRS dönüşümü ve WGS 84 geodezi çekirdeğidir. JavaScript
çekirdeğiyle aynı birim kimliklerini, metre/derece sözleşmesini ve
`contracts/test-vectors` referanslarını kullanır.

## Kesin uzunluk dönüşümü

```java
UnitConversion result = LengthConverter.convert(
    "1",
    "nautical-mile",
    "metre",
    24
);

System.out.println(result.value()); // 1852
```

Ondalık gösterimi sonsuz süren bir sonuç yeniden dönüştürülecekse gösterilen
metin yerine kesin değer taşınır:

```java
UnitConversion first = LengthConverter.convert(
    "1", "metre", "nautical-mile", 24
);
UnitConversion back = LengthConverter.convert(
    first.exactValue(), "nautical-mile", "metre", 24
);

System.out.println(back.value()); // 1
```

## Koordinat formatları

```java
CoordinateSource source = Coordinates.fromDms(
    "39°56'00.114\"N",
    "032°51'35.0712\"E"
);
CoordinateResult result = Coordinates.results(source, 5);

System.out.println(result.mgrs());
System.out.println(result.utmUps());
System.out.println(result.resolution().get(CoordinateFormat.MGRS));
```

Girdi için `fromDecimalDegrees`, `fromDms`, `fromDdm`, `fromMgrs`,
`fromUtmUps`, `fromGars` ve `fromGeoref` kullanılabilir. MGRS, GARS ve GEOREF
bir nokta yerine hücre tanımlar; çözümleme hücre merkezini ve hücre
çözünürlüğünü birlikte döndürür.

Üç bileşenli güney DMS yazımında `S` öncesinde `"` veya `″` saniye işareti
zorunludur. Belirsiz `39d56m00.114s` girdisi sessiz yön değişimi yerine
reddedilir.

Koordinat sonucunu harita mesafesi motoruna açıkça aktarmak için adaptör
kullanılır:

```java
CoordinateSource first = Coordinates.fromMgrs("36SVK8801520370");
CoordinateSource second = Coordinates.fromMgrs("38SLC3918701405");
GeodesicResult distance = Geodesic.inverse(
    Coordinates.toGeoPoint(first),
    Coordinates.toGeoPoint(second)
);
```

Hücre tabanlı kaynaklarda ölçüm, format sözleşmesi gereği hücre merkezleri
arasında yapılır.

## CRS / EPSG dönüşümü

```java
CrsTransformation projected = CrsTransformer.transform(
    "EPSG:4326",
    "EPSG:32636",
    "32.859742",
    "39.933365"
);

CrsTransformation restored = CrsTransformer.transform(
    projected.target(),
    projected.source(),
    projected.x(),
    projected.y()
);
```

Desteklenen sistemler EPSG:4326, EPSG:3857, WGS 84 UTM kuzey/güney zonları ve
WGS 84 UPS kuzey/güneydir. API sırası her zaman X/Y'dir; EPSG:4326 için X
boylam, Y enlemdir.

## İki harita noktası arasındaki mesafe

```java
GeoPoint ankara = new GeoPoint(39.933365, 32.859742);
GeoPoint istanbul = new GeoPoint(41.008238, 28.978359);
GeodesicResult result = Geodesic.inverse(ankara, istanbul);

System.out.println(result.distanceMetres());
System.out.println(result.initialBearingDegrees());
```

## Harita çizgisi uzunluğu

```java
PolylineMeasurement measurement = Geodesic.measurePolyline(List.of(
    new GeoPoint(39.933365, 32.859742),
    new GeoPoint(40.2, 31.5),
    new GeoPoint(41.008238, 28.978359)
));
```

Tek bir ölçüm geodeziğini bir harita katmanında çizmek için eşit mesafe
aralıklı noktalar üretilebilir:

```java
GeodesicPath path = Geodesic.samplePath(
    new GeoPoint(39.933365, 32.859742),
    new GeoPoint(41.008238, 28.978359),
    25_000,
    2_049
);

System.out.println(path.distanceMetres());
System.out.println(path.points());
```

Noktalar yalnız çizim içindir; ölçüm `Geodesic.inverse` sonucundan gelir.
`maxPoints` güvenlik sınırı hedef segment boyunu geçersiz kılarsa etkin
segment uzunluğu `sampledMaximumSegmentMetres()` ile bildirilir.

Hesaplar iki boyutlu WGS 84 elipsoit yüzey mesafesidir. Web Mercator piksel
mesafesi, rhumb line, grid mesafesi veya yükseklik içeren 3B eğik mesafe
değildir.

## Hatalar

Geçersiz girdi her zaman `ConvertToolsException` fırlatır
(`IllegalArgumentException` alt sınıfı). `code()` sabit bir `ErrorCode`
döndürür; liste JavaScript çekirdeğinin `ERROR_CODES` listesiyle ve
`contracts/error-codes.json` ile aynıdır, `contracts/error-cases.csv` iki
dilde de aynı kodu doğrular.

```java
try {
    Mgrs.decode("32NQQ7070975688");
} catch (ConvertToolsException error) {
    if (error.code() == ErrorCode.MGRS_SQUARE_NOT_IN_BAND) {
        // yerelleştirilmiş mesaj göster
    }
}
```

## Test

Maven gerekmez; CI ile aynı adımlar:

```bash
sh packages/core-java/scripts/test.sh
```

Betik kaynakları `javac --release 17 -Xlint:all -Werror` ile derler ve
`ContractTest`, `CoordinateContractTest`, `ReferenceVectorTest`,
`ErrorContractTest` sınıflarını `contracts/` dosyalarına karşı çalıştırır.
Değişiklikler: `packages/core-js/CHANGELOG.md` (iki çekirdek için ortak).
