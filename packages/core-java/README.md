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
boylam, Y enlemdir. UTM alanı ızgarayla tanımlıdır: ileri dönüşüm zon
ızgarasının (0…1 000 000 m doğu, 0…10 000 000 m kuzey) dışına düşen noktayı,
ters dönüşüm 80°G–84°K dışındaki ızgara noktasını reddeder. MGRS çözmede
enlem denetimi yapılmaz.

## İki harita noktası arasındaki mesafe

```java
GeoPoint ankara = new GeoPoint(39.933365, 32.859742);
GeoPoint istanbul = new GeoPoint(41.008238, 28.978359);
GeodesicResult result = Geodesic.inverse(ankara, istanbul);

System.out.println(result.distanceMetres());
System.out.println(result.initialBearingDegrees());
```

`Geodesic.inverse` iki nokta arasındaki en kısa elipsoit geodeziğini
döndürür. Çözücü Charles Karney'in "Algorithms for geodesics" (J. Geodesy
87:43–55, 2013) yöntemidir; GeographicLib'in `Geodesic` ve `GeodesicLine`
sınıflarının altıncı mertebe serileri kullanılır. Kaynak dosyalar
GeographicLib türevi olduklarını ve MIT lisans metnini başlarında taşır.
Eski yinelemeli çözücü, atış (shooting) yedeği ve kesme yeri eğrisi
(cut-locus) sezgisi tamamen kaldırılmıştır.

Sonuç etiketleri sözleşmedir:

- `solver()` normalde `"karney-inverse"`, çakışık noktalarda `"identity"`.
- `algorithm()` her zaman `"ellipsoidal"`.
- `iterations()` ters problemde gerçekten kullanılan Newton/bisection
  yineleme sayısıdır; meridyen, ekvator ve çok kısa çizgi kapalı formlarında
  0'dır. `Geodesic.direct` her zaman `"karney-direct"` ve 0 iterasyon bildirir.
- `arcDegrees()`, `reducedLengthMetres()`, `geodesicScale12()`,
  `geodesicScale21()` ve `areaSquareMetres()`: a12 (°), m12 (m), M12, M21 ve
  S12 (m², geodezik ile ekvator arasındaki alan, GeographicLib tanımı).
  `GeodesicResult`, `DirectResult` ve `GeodesicPath` bunları kaydın sonunda
  taşır. Çakışık noktada ve sıfır mesafede 0, 0, 1, 1, 0; tam antipotta kuzey
  kutbu rotasının değerleri (a12 = 180, S12 = c²π).
- `bearingUncertaintyDegrees()` ve `areaUncertaintySquareMetres()` (yalnız
  `GeodesicResult`): azimutların ve S12'nin kesin değerden en fazla ne kadar
  uzak olabileceği, `max(1e-11°, 1e-7 m / |m12|)` (en çok 180°) ve
  `rad(azimut belirsizliği) · min(2 c², s12² / 2) + 1e-14 c²`. Neredeyse antipodal noktalarda
  büyür; azimut tanımsızken `null`.

`ambiguous` alanı kesin bir kuralla hesaplanır. `lat1 + lat2 == 0` tam olarak
sağlanmalı ve aşağıdakilerden en az biri doğru olmalıdır:

1. `|lat1| == 90` (karşıt kutuplar);
2. `|lon12| == 180°`;
3. `f > 0` ve `|lon12| − lonCut > 1e-9°`, burada
   `lonCut = 180° · (1 − f · A3(eps) · cos(beta1))`,
   `tan(beta1) = (1 − f)·tan(lat1)`, `k2 = ep2 · sin²(beta1)`,
   `ep2 = e2/(1 − e2)`, `e2 = f(2 − f)`,
   `eps = k2 / (2·(1 + sqrt(1 + k2)) + k2)` ve `A3` Karney'in A3 serisidir.
   Ekvatorda bu koşul `|lon12| > (1 − f)·180°` olur.

Yakın karşıt ama tek çözümlü bir çizgi `ambiguous` değildir. `f < 0` (prolate)
elipsoitte yalnızca 1. ve 2. koşullar uygulanır; kesme yeri testi `f > 0`
için tanımlıdır. Tam karşıt noktalar (`lat1 = −lat2` ve `|lon12| = 180°`, ya
da karşıt kutuplar) kuzey kutbu üzerinden kanonik 0°/180° yönleriyle döner.
Prolate elipsoitte kutup rotası en kısa rota olmadığından, kutup çifti
dışındaki tam karşıt noktalarda çözülen azimutlar döner.

Küre de desteklenir; `f = 0` olan bir elipsoit aynı API ile kullanılabilir:

```java
Ellipsoid sphere = new Ellipsoid("SPHERE", 6_371_008.8, 0, 6_371_008.8);
GeodesicResult spherical = Geodesic.inverse(ankara, istanbul, sphere);
// spherical.distanceMetres() ≈ 349365.585
```

Eski `tolerance` ve `maxIterations` seçenekleri yalnızca JavaScript API'sinde
vardır; geriye dönük uyumluluk için kabul edilip doğrulanır, ancak çözücü
tarafından yok sayılır ve kullanımdan kaldırılmıştır. Java API'si bu
seçenekleri hiçbir zaman dışa açmamıştır.

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

Noktalar yalnız çizim içindir; ölçüm `Geodesic.inverse` sonucundan gelir ve
üretilen ara noktalar aynı en kısa geodezik üzerindedir. `maxPoints` güvenlik
sınırı hedef segment boyunu geçersiz kılarsa etkin segment uzunluğu
`sampledMaximumSegmentMetres()` ile bildirilir.

Hesaplar iki boyutlu WGS 84 elipsoit yüzey mesafesidir. Web Mercator piksel
mesafesi, rhumb line, grid mesafesi veya yükseklik içeren 3B eğik mesafe
değildir.

## Hatalar

Geçersiz girdi her zaman `ConvertToolsException` fırlatır
(`IllegalArgumentException` alt sınıfı). `code()` sabit bir `ErrorCode`
döndürür; liste JavaScript çekirdeğinin `ERROR_CODES` listesiyle ve
`contracts/error-codes.json` ile aynıdır, `contracts/error-cases.csv` iki
dilde de aynı kodu doğrular. Geodezik ters ve doğrudan çözücüler artık
`NO_CONVERGENCE` fırlatmaz; kod geriye dönük uyumluluk için sözleşmede kalır.

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
`ErrorContractTest`, `GeodesicLengthsTest`, `TriaxialGeodesicTest` ve
`HoldoutTest` sınıflarını
`contracts/` dosyalarına karşı çalıştırır. `HoldoutTest`,
`contracts/test-vectors/holdout.txt` `disabled` iken yalnız bir satır yazar.
`ReferenceVectorTest` ayrıca `contracts/test-vectors/geodtest-sample.csv`
dosyasını 1e-7 m toleransla doğrular.

Karney'in tam `GeodTest.dat` seti (500.000 satır) isteğe bağlı bir ölçüm
aracıyla, CI'ya eklenmeden çalıştırılabilir:

```bash
OUT=$(mktemp -d)
find packages/core-java/src/main/java packages/core-java/src/test/java \
    -name '*.java' -print0 \
  | xargs -0 javac --release 17 -Xlint:all -Werror -d "$OUT"
java -cp "$OUT" io.github.mertc0604.converttools.GeodTestFullSet \
    /path/to/GeodTest.dat
```

Araç, JavaScript ölçüm betiğiyle aynı blok blok tabloyu (ters ve doğrudan
problem) yazdırır. Üç eksenli `Geod3Test-v1.txt` için karşılığı
`Geod3TestFullSet` sınıfıdır (aynı derleme, tüm çekirdeklerde paralel).
`Geod3TestFullSet <veri> <satırlar.tsv>` her satırın çıktısını
(`row s12 alp1 alp2 ambiguous closure x y z m12 M12 M21`) dosyaya yazar ve
hiçbir şeyi yargılamaz; satırları
`contracts/tools/validate-geod3test.mjs --java-rows <satırlar.tsv>`
JavaScript satırlarıyla aynı kodla yargılar.

Üç eksenli elipsoitte geodezik `TriaxialGeodesic` sınıfındadır
(`inverse`, `direct`, `toCartesian`, `fromCartesian`; kayıtlar `Axes`,
`Point`, `Cartesian`, `InverseResult`, `DirectResult`). `InverseResult`
son bileşen olarak `ambiguous` taşır: aynı uzunlukta birden çok en kısa
jeodezik varsa `true`, çakışık noktalarda `false`. JavaScript modülüyle aynı
kurallar: `docs/TRIAXIAL_VALIDATION.md`.

Değişiklikler: `packages/core-js/CHANGELOG.md` (iki çekirdek için ortak).
