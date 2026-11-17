# @convert-tools/core

Çalışma zamanı bağımlılığı olmayan kesin uzunluk dönüşümü, koordinat
biçimleri (DD, DMS, DDM, UTM/UPS, MGRS, GARS, GEOREF), EPSG dönüşümleri ve
WGS 84 geodezi çekirdeği. Java eşi `packages/core-java` aynı algoritmaları
kullanır; iki çekirdek de `contracts/` altındaki aynı dosyaları geçer.

## Kurulum ve kullanım

```js
// ESM
import { convertLength } from "@convert-tools/core/length";
import { encodeMgrs, decodeMgrs, inverseGeodesic } from "@convert-tools/core/geodesy";

// CommonJS
const { convertLength } = require("@convert-tools/core/length");
```

```js
const nm = convertLength("1", "nautical-mile", "metre");
nm.exactValue;            // { numerator: "1852", denominator: "1" } — zincirleme için
nm.value;                 // "1852" — yalnız gösterim için, HALF_UP yuvarlanmış

encodeMgrs(39.933365, 32.859742);   // "36SVK8801520370"
decodeMgrs("36SVK8801520370");      // karenin merkezi + zone, easting, northing, cellMetres
```

Genel alt yollar:

| Alt yol | İçerik |
|---|---|
| `@convert-tools/core` | hepsi |
| `@convert-tools/core/length` | uzunluk dönüşümü ve kesin rasyonel aritmetik |
| `@convert-tools/core/units` | `length` ile aynı (geçiş uyumluluğu için korunur) |
| `@convert-tools/core/geodesy` | koordinat biçimleri, EPSG, geodezik |

`import` koşulu `src/` altındaki ESM kaynağını, `require` koşulu
`dist/cjs/` altındaki CommonJS kopyasını yükler. CommonJS kopyası Babel ile
yalnız modül sözdizimi dönüştürülerek üretilir; BigInt ve diğer sözdizimi
aşağı çevrilmez.

## Çalışma ortamı

- Node.js 20 veya üstü.
- Tarayıcılar: **Chrome 67, Firefox 68, Safari 14** ve üstü (BigInt'i
  destekleyen ilk sürümler). `test/browser-baseline.test.mjs`, `src/`
  içinde bu sürümlerden yeni sözdizimi (`??`, `?.`, sayı ayırıcıları, sınıf
  alanları, yeni RegExp bayrakları vb.) ve yerleşik fonksiyon
  (`Object.fromEntries`, `.flat()`, `.at()` vb.) kullanılmadığını denetler.

## Hatalar

Geçersiz girdi her zaman hata fırlatır; `NaN`, sessizce kırpılmış değer veya
yaklaşık sonuç döndürülmez. Tek hata tipi `ConvertToolsError`'dır:

```js
import { ConvertToolsError, decodeMgrs } from "@convert-tools/core/geodesy";

try {
  decodeMgrs("32NQQ7070975688");
} catch (error) {
  if (error.code === "MGRS_SQUARE_NOT_IN_BAND") {
    // kullanıcıya yerelleştirilmiş mesaj göster
  }
}
```

`code` sabittir ve Java çekirdeğinin `ConvertToolsException.code()` değeriyle
aynıdır; tam liste ve anlamları `contracts/error-codes.json`'dadır. `message`
geliştirici için İngilizce metindir ve sürümler arasında değişebilir.

ESM ve CommonJS kopyaları aynı uygulamada birlikte yüklenirse iki ayrı
`ConvertToolsError` sınıfı olur; bu durumda `instanceof` yerine
`error.name === "ConvertToolsError"` ve `error.code` kullanın.

## Doğruluk

| Ne | Referans | En büyük fark |
|---|---|---:|
| UTM/UPS ileri ve ters | GeoConvert 2.7 | 4,8 nm |
| MGRS kodlama (birebir metin) / kare merkezi | GeoConvert 2.7 | 0 / 3,2 nm |
| EPSG:326xx, 327xx, 5041, 5042 | GeoConvert, PolarStereographic | 3,3 nm |
| EPSG:3857 | tanım formülü (Python) | 15 nm |
| Geodezik ters (mesafe) / doğrudan (konum) | GeodSolve 2.7, GeodTest 500.000 satır | 1,1e-8 m / 1,0e-8 m |
| GARS, GEOREF (birebir metin) / hücre merkezi | GeographicLib | 0 / 1,4e-14° |

Transverse Mercator, Karney (2011) 6. derece Krüger serisidir. Ayrıntılar:
`docs/UTM_MGRS_VALIDATION.md`, `docs/GEODESIC_VALIDATION.md`,
`contracts/README.md`.

## Geodezik çözücü

Ters ve doğrudan geodezik problemler Karney'nin algoritmasıyla
("Algorithms for geodesics", J. Geodesy 87:43–55, 2013; GeographicLib'in
`Geodesic` ve `GeodesicLine` sınıflarının 6. derece serisi) çözülür. Eski
yedek çözücüler kaldırılmıştır; tek çözücü budur. Sonuç etiketleri:

| Alan | Değer |
|---|---|
| `inverseGeodesic().solver` | `"karney-inverse"`; çakışık noktalarda `"identity"` |
| `inverseGeodesic().algorithm` | `"ellipsoidal"` |
| `directGeodesic().algorithm` | `"karney-direct"` |
| `iterations` | ters: Newton/bisection döngüsünün yaptığı boylam değerlendirmesi (kapalı form yollarında 0); doğrudan: 0 |
| `arcDegrees`, `reducedLengthMetres`, `geodesicScale12`, `geodesicScale21`, `areaSquareMetres` | ters ve doğrudan sonuçta a12 (°), m12 (m), M12, M21 ve S12 (m², geodezik ile ekvator arasındaki alan, GeographicLib tanımı); çakışık noktada ve sıfır mesafede 0, 0, 1, 1, 0; tam antipotta kuzey kutbu rotasının değerleri (a12 = 180, S12 = c²π). `sampleGeodesicPath` ve `measurePolyline` segmentleri aynı alanları taşır |
| `bearingUncertaintyDegrees`, `areaUncertaintySquareMetres` | yalnız ters sonuçta (rota segmentleri dahil): azimutların ve S12'nin kesin değerden en fazla ne kadar uzak olabileceği, `max(1e-11°, 1e-7 m / \|m12\|)` (en çok 180°) ve `2 c² · rad(azimut belirsizliği) + 1e-14 c²`. Neredeyse antipodal noktalarda büyür; gösterimde anlamlı basamağı seçmek içindir. Azimut tanımsızken `null` |

`ambiguous`, `lat1 + lat2 == 0` tam olarak sağlandığında ve şu koşullardan
biri varsa `true` olur: iki nokta kutupsa, `|lon12|` tam olarak 180° ise veya
`f > 0` iken `|lon12|`, `lonCut = 180 (1 − f A3(eps) cos(beta1))` sınırını
1e-9°'den fazla aşıyorsa. `f < 0` için yalnız ilk iki koşul geçerlidir. Yakın
antipodal ama tek rotalı çiftler `false` döndürür. Tam antipodlarda rota
kuzey kutbu üzerinden alınır (ilk azimut 0°, son azimut 180°). `f < 0` iken
kutup rotası en kısa rota olmadığından, kutup çifti dışındaki tam antipodlarda
çözülen azimutlar döner.

`tolerance` ve `maxIterations` seçenekleri **kullanımdan kaldırılmıştır**:
geriye dönük uyumluluk için kabul edilir (ters problemde eskisi gibi
doğrulanır), çözücü tarafından yok sayılır. `f = 0` küre ve negatif `f`
(prolate) elipsoit desteklenir.

## Üç eksenli elipsoit

`X²/a² + Y²/b² + Z²/c² = 1` (a ≥ b ≥ c > 0) üzerinde geodezik, ayrı bir
modüldür; konumlar elipsoidal enlem β ve boylam ω (derece), azimut sabit-ω
çizgisinden saat yönünde, uzunluklar yarı eksenlerin biriminde:

```js
import { inverseTriaxialGeodesic, directTriaxialGeodesic } from "@convert-tools/core/geodesy";

const ellipsoid = { a: Math.SQRT2, b: 1, c: Math.SQRT1_2 };
inverseTriaxialGeodesic({ beta: 10, omega: 20 }, { beta: -30, omega: 100 }, { ellipsoid });
// { distance: 1.8183135741369816, initialAzimuthDegrees: 115.365…, finalAzimuthDegrees: 91.142…,
//   reducedLength: 0.842…, geodesicScale12: -0.973…, geodesicScale21: -0.091…, ambiguous: false }
directTriaxialGeodesic({ beta: 10, omega: 20 }, 45, 1.5, { ellipsoid });
```

Ters problem en kısa geodeziği döndürür; nokta çifti için aynı uzunlukta
birden çok en kısa jeodezik varsa (örneğin iki nokta da β = 0 elipsindeyken
düzlemden ayrılan bir çizgi ya da antipodal umbilikler) sonuçtaki `ambiguous`
alanı `true`'dur ve döndürülen yollardan yalnızca biridir; çakışık noktalarda
`false`'dur. GeographicLib'in eş uzunluktaki jeodezikler ve umbilik noktalardaki
azimut etiketi arasındaki seçimi uygulanır (bkz. doğrulama belgesi).
`triaxialToCartesian` ve `cartesianToTriaxial` koordinat dönüşümüdür. Yöntem ve
doğrulama: [docs/TRIAXIAL_VALIDATION.md](../../docs/TRIAXIAL_VALIDATION.md).

## Biçim kuralları

- MGRS basamakları yuvarlanmaz, kesilir: kod noktayı içeren kareyi adlandırır.
  Zon her zaman iki haneyle yazılır (`01HEU`); tek haneli girdi de çözülür.
- Boylam +180° standart zonda zon 1'e, GARS'ta bant `001`'e düşer
  (GeographicLib ile aynı).
- EPSG:327xx'te ekvator 10 000 000 m northing ile yazılır.
- UTM alanı ızgarayla tanımlıdır: ileri dönüşüm, projeksiyonu zonun
  0…1 000 000 m doğu ve 0…10 000 000 m kuzey aralığına düşmeyen noktayı
  reddeder (merkez meridyene 6° kuralı yoktur); ters dönüşüm 80°G–84°K
  dışındaki ızgara noktalarını reddeder. MGRS çözmede enlem denetimi
  yapılmaz.
- UPS ters dönüşümü 60° enlem çemberi içindeki grid koordinatlarını kabul
  eder.
- Üç bileşenli güney DMS girdisinde `S` öncesinde `"` veya `″` saniye işareti
  kullanılır; belirsiz `39d56m00.114s` reddedilir.
- Girdiler derece, geodezik mesafeler metredir. GeoJSON `[longitude,
  latitude]` dizileri `{ latitude, longitude }` nesnelerine çevrilmelidir.

## Haritada geodezik hat

```js
import { sampleGeodesicPath } from "@convert-tools/core/geodesy";

const path = sampleGeodesicPath(start, end, { maxSegmentMetres: 25000, maxPoints: 2049 });
```

`path.distanceMetres` ölçüm sonucudur; `path.points` yalnız çizim
köşeleridir. Paket harita motoru içermez.

## Geliştirme

```bash
npm test                 # node:test, sözleşme vektörleri dahil
npm run build            # dist/cjs
npm run test:pack        # npm pack + boş projede import/require denemesi
```

Değişiklikler: `CHANGELOG.md`.
