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
| Geodezik ters (mesafe) / doğrudan (konum) | GeodSolve 2.7 | 0,08 mm / 0,09 mm |
| GARS, GEOREF (birebir metin) / hücre merkezi | GeographicLib | 0 / 1,4e-14° |

Transverse Mercator, Karney (2011) 6. derece Krüger serisidir. Ayrıntılar:
`docs/UTM_MGRS_VALIDATION.md`, `docs/GEODESIC_VALIDATION.md`,
`contracts/README.md`.

## Biçim kuralları

- MGRS basamakları yuvarlanmaz, kesilir: kod noktayı içeren kareyi adlandırır.
  Zon her zaman iki haneyle yazılır (`01HEU`); tek haneli girdi de çözülür.
- Boylam +180° standart zonda zon 1'e, GARS'ta bant `001`'e düşer
  (GeographicLib ile aynı).
- EPSG:327xx'te ekvator 10 000 000 m northing ile yazılır.
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
