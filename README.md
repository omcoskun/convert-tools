# Convert

Kesin uzunluk dönüşümü, WGS 84 koordinat biçimleri, EPSG dönüşümleri ve
elipsoidal geodezik ölçüm için **kütüphane**: JavaScript çekirdeği
`@convert-tools/core` ve onun Java 17 eşi. İki çekirdek dilden bağımsız aynı
sözleşme vektörlerini geçer. `app/` bu kütüphanenin ince bir tanıtım
arayüzüdür; hesap yapmaz.

Ölçüt kanıtlanabilir doğruluktur: referans değerler GeographicLib 2.7
(GeoConvert, GeodSolve) ile üretilir, test edilen koddan türetilmez.

## Neler var?

- Uzunluk: mm, cm, m, km, inç, ayak, yarda, kara mili, deniz mili. Oranlar
  kesin kesirdir (`1 NM = 1852 m`, `1 ft = 0.3048 m`).
- Koordinat biçimleri: DD, DMS, DDM, MGRS, UTM/UPS, GARS, GEOREF.
- CRS: EPSG:4326, EPSG:3857, WGS 84 UTM zonları (326xx, 327xx), UPS
  (5041, 5042).
- Geodezi: WGS 84 üzerinde ters ve doğrudan geodezik, çok parçalı çizgi
  uzunluğu, haritada çizim için örneklenmiş geodezik hat.
- Tek hata tipi ve sabit hata kodları (JS `ConvertToolsError`, Java
  `ConvertToolsException`).

## Yapı

```text
packages/
  core-js/        @convert-tools/core: çalışma zamanı bağımlılığı yok (ESM + CommonJS)
  core-java/      Java 17 eşi: io.github.mertc0604:convert-tools-core
contracts/
  test-vectors/   GeographicLib ile üretilmiş ortak doğruluk vektörleri (CSV)
  error-codes.json, error-cases.csv
                  23 hata kodu ve her iki çekirdeğin geçtiği hata durumları
  tools/          vektör üreticisi (npm run vectors)
app/              tanıtım arayüzü: React 18, Webpack 5, MUI v5 (npm workspace)
docs/             doğrulama raporları ve başlangıç durumu
```

`units` ve `geodesy` ayrıdır: `convertLength` bilinen bir uzunluğun birimini
değiştirir; `inverseGeodesic` iki koordinattan WGS 84 yüzey mesafesini üretir;
`transformCrs` koordinat sistemini değiştirir. Projeksiyon X/Y farkı mesafe
olarak kullanılmaz.

## Komutlar

Node.js 22.15 veya üstü ve npm gerekir (çekirdek tek başına Node 20'de çalışır).

```bash
npm ci --ignore-scripts
```

| Komut | Ne yapar |
|---|---|
| `npm run dev` | tanıtım arayüzü, `http://localhost:3008/` |
| `npm run build` | çekirdeğin CommonJS kopyası (`packages/core-js/dist/cjs`) ve arayüz (`app/build`) |
| `npm test` | `test:core` ve `test:app` |
| `npm run test:core` | çekirdek testleri ve sözleşme vektörleri (`node:test`) |
| `npm run test:app` | arayüz testleri: lang/config uyumu, render, sınır kuralları |
| `npm run test:pack` | `npm pack` ve boş bir projede `import`/`require` denemesi |
| `npm run test:java` | `javac --release 17` ile derleyip dört Java sözleşme testini çalıştırır (Maven gerekmez) |
| `npm run lint` | ESLint 9 |
| `npm run vectors` | vektörleri yeniden üretir (GeographicLib 2.7 kurulu olmalı) |

macOS'ta `Baslat.command` çift tıklamayla paketleri kurar ve arayüzü açar.

## Doğruluk

JavaScript çekirdeğinde ölçülen en büyük farklar (Java aynı vektörleri geçer):

| Ne | Referans | En büyük fark |
|---|---|---:|
| UTM/UPS ileri ve ters | GeoConvert 2.7 | 4,8 nm |
| MGRS kodlama (birebir metin) / kare merkezi | GeoConvert 2.7 | 0 / 3,2 nm |
| EPSG:326xx, 327xx, 5041, 5042 | GeoConvert, PolarStereographic | 3,3 nm |
| EPSG:3857 | tanım formülü (Python) | 15 nm |
| Geodezik ters (mesafe) / doğrudan (konum) | GeodSolve 2.7 | 0,08 mm / 0,09 mm |
| GARS, GEOREF (birebir metin) / hücre merkezi | GeographicLib | 0 / 1,4e-14° |

Transverse Mercator, Karney (2011) 6. derece Krüger serisidir. Ayrıntılar:
[`docs/UTM_MGRS_VALIDATION.md`](docs/UTM_MGRS_VALIDATION.md),
[`docs/GEODESIC_VALIDATION.md`](docs/GEODESIC_VALIDATION.md),
[`contracts/README.md`](contracts/README.md).

Doğruluk modelinin sınırları:

- Uzunluk oranları JavaScript'te `BigInt`, Java'da `BigInteger` pay/payda
  olarak tutulur. `value` yalnız gösterim içindir; zincirleme hesapta
  `exactValue` kullanılır.
- Geodezik mesafe WGS 84 elipsoit yüzey mesafesidir. EPSG:3857 düz çizgi
  mesafesi, UTM grid mesafesi, sabit kerteriz yolu veya rakımlı 3B mesafe
  değildir. Küresel modeller (ör. Google Maps `geometry.spherical`) farklı
  sonuç verir: `(0°, 0°) → (90°, 0°)` elipsoitte yaklaşık 10 001 965,729 m,
  6 378 137 m yarıçaplı kürede yaklaşık 10 018 754,171 m'dir.
- Antipodal kesim bölgesinde `ambiguous: true` birden fazla en kısa rota
  olduğunu bildirir; çağıran uygulama bunu görünür kılmalıdır.
- MGRS, GARS ve GEOREF bir hücreyi adlandırır: çözümleme hücrenin merkezini
  verir, özgün noktayı değil.
- Sayısal doğruluk, kaynak koordinatın veya sensörün doğruluğunu artırmaz.
  Operasyonel kullanımda datum, yükseklik modeli ve cihaz hatası için yetkili
  referans yazılımıyla ayrıca kabul testi yapılmalıdır.

## JavaScript kullanımı

```js
import { convertLength, encodeMgrs, inverseGeodesic } from "@convert-tools/core";

convertLength("1", "nautical-mile", "metre").value; // "1852"
encodeMgrs(39.933365, 32.859742);                   // "36SVK8801520370"

const { distanceMetres } = inverseGeodesic(
  { latitude: 39.933365, longitude: 32.859742 },
  { latitude: 41.008238, longitude: 28.978359 },
);

try {
  convertLength("abc", "metre", "foot");
} catch (error) {
  if (error.code === "INVALID_NUMBER") {
    // kullanıcıya yerelleştirilmiş mesaj göster
  }
}
```

Alt yollar, CommonJS, desteklenen çalışma ortamları ve biçim kuralları:
[`packages/core-js/README.md`](packages/core-js/README.md). Sürüm değişiklikleri
ve 3.0.0'ın kırıcı değişiklikleri:
[`packages/core-js/CHANGELOG.md`](packages/core-js/CHANGELOG.md).

## Java kullanımı

```java
GeoPoint ankara = new GeoPoint(39.933365, 32.859742);
GeoPoint istanbul = new GeoPoint(41.008238, 28.978359);
GeodesicResult result = Geodesic.inverse(ankara, istanbul);

UnitConversion nm = LengthConverter.convert("1", "nautical-mile", "metre", 24);

CoordinateSource source = Coordinates.fromMgrs("38SLC3918701405");
CoordinateResult formats = Coordinates.results(source, 5);
```

Ayrıntılar: [`packages/core-java/README.md`](packages/core-java/README.md).

## Tanıtım arayüzü (`app/`)

- `npm run dev` ile `http://localhost:3008/` adresinde açılır. Uzunluk,
  konum biçimleri, CRS/EPSG ve mesafe araçlarını gösterir.
- Bütün değerler `@convert-tools/core` kök girişinden gelir. Arayüzde hesap
  formülü yoktur; `app/test/boundaries.test.mjs` ve ESLint bunu denetler.
- `app/public/config.json` başlangıç değerlerini ve örnekleri,
  `app/public/lang.json` Türkçe ve İngilizce metinleri ve hata kodlarının
  yerelleştirilmiş açıklamalarını tutar. İkisi açılışta okunur; yayımlanmış bir
  derlemede yeniden derlemeden değiştirilebilir. `app/test/lang.test.mjs` ve
  `config.test.mjs` anahtarların kodla ve çekirdekle uyumunu denetler.
- `IWC` derleme değişkeni (`hap` veya `hwf`) webpack `DefinePlugin` ile
  `process.env.IWC` olarak gömülür ve `<html data-iwc>` olarak yazılır. İki
  değer arasındaki davranış farkı henüz tanımlı değildir; arayüz bu değere göre
  dallanmaz. Başka bir değer derlemeyi durdurur.

  ```bash
  IWC=hap npm run build
  ```

- Ekip standardı Emotion ve kurum içi bir MUI çatalıdır. Çatala
  erişilemediği için yerine `@mui/material` 5.18.0 kullanılır. Bütün MUI
  importları yalnız `app/src/ui/index.js` üzerinden geçer; çatala geçmek o
  dosyayı ve `app/package.json`'u değiştirmek demektir.
- Tarayıcı tabanı: arayüz için MUI v5'in desteklediği Chrome 90, Edge 91,
  Firefox 78, Safari 14 ve iOS 12.5; çekirdek tek başına Chrome 67,
  Firefox 68 ve Safari 14'te çalışır (BigInt).
- Üretim derlemesi göreli URL kullanır (GitHub Pages alt yolunda da çalışır)
  ve Content-Security-Policy meta etiketi taşır.
- Mesafe haritası, çekirdeğin örneklediği geodezik hattın bağımlılıksız bir
  eşdikdörtgen SVG çizimidir. Natural Earth kara sınırları ve adları yerelden
  yüklenir (kıyı çizgisi yoktur). Harita bir görseldir, ölçüm aracı değildir.

## Güvenlik

[`SECURITY.md`](SECURITY.md)
