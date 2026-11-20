# Convert

Kesin uzunluk dönüşümü, WGS 84 koordinat biçimleri, EPSG dönüşümleri ve
elipsoidal geodezik ölçüm için **kütüphane**: JavaScript çekirdeği
`@omcoskun/convert-tools` ve onun Java 17 eşi. İki çekirdek dilden bağımsız aynı
sözleşme vektörlerini geçer. Kütüphaneyi kullanan harita uygulaması (Map) ayrı
bir repodadır: [omcoskun/map](https://github.com/omcoskun/map).

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
  core-js/        @omcoskun/convert-tools: çalışma zamanı bağımlılığı yok (ESM + CommonJS)
  core-java/      Java 17 eşi: io.github.omcoskun:convert-tools
contracts/
  test-vectors/   GeographicLib ile üretilmiş ortak doğruluk vektörleri (CSV)
  error-codes.json, error-cases.csv
                  23 hata kodu ve her iki çekirdeğin geçtiği hata durumları
  tools/          vektör üreticisi (npm run vectors) ve GeodTest doğrulama aracı
scripts/          sürüm tag'inin denetimi (release workflow'u)
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
| `npm run build` | çekirdeğin CommonJS kopyası (`packages/core-js/dist/cjs`) |
| `npm test` | `test:core` |
| `npm run test:core` | çekirdek testleri ve sözleşme vektörleri (`node:test`) |
| `npm run test:pack` | `npm pack` ve boş bir projede `import`/`require` denemesi |
| `npm run test:java` | `javac --release 17` ile derleyip dört Java sözleşme testini çalıştırır (Maven gerekmez) |
| `npm run lint` | ESLint 9 |
| `npm run vectors` | vektörleri yeniden üretir (GeographicLib 2.7 kurulu olmalı) |

## Doğruluk

JavaScript çekirdeğinde ölçülen en büyük farklar (Java aynı vektörleri geçer):

| Ne | Referans | En büyük fark |
|---|---|---:|
| UTM/UPS ileri ve ters | GeoConvert 2.7 | 4,8 nm |
| MGRS kodlama (birebir metin) / kare merkezi | GeoConvert 2.7 | 0 / 3,2 nm |
| EPSG:326xx, 327xx, 5041, 5042 | GeoConvert, PolarStereographic | 3,3 nm |
| EPSG:3857 | tanım formülü (Python) | 15 nm |
| Geodezik ters (mesafe) / doğrudan (konum) | GeodSolve 2.7 | 11,2 nm / 10,0 nm |
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
- `ambiguous: true` yalnız `lat1 + lat2 == 0` olan simetrik çiftlerde ve birden
  fazla en kısa rotanın bulunduğu kesim bölgesinde işaretlenir; antipoda yakın
  ama benzersiz rotalar artık işaretlenmez. Çağıran uygulama bu bayrağı görünür
  kılmalıdır. Kesin kural `packages/core-js/README.md` ve
  `docs/GEODESIC_VALIDATION.md` içindedir.
- MGRS, GARS ve GEOREF bir hücreyi adlandırır: çözümleme hücrenin merkezini
  verir, özgün noktayı değil.
- Sayısal doğruluk, kaynak koordinatın veya sensörün doğruluğunu artırmaz.
  Operasyonel kullanımda datum, yükseklik modeli ve cihaz hatası için yetkili
  referans yazılımıyla ayrıca kabul testi yapılmalıdır.

## Kurulum

Paketler GitHub Packages'ta yayımlanır. Kurmak için `read:packages` yetkili
bir classic kişisel erişim token'ı (PAT) gerekir; repo gizli yapıldıktan sonra
repoya erişim de gerekir. 1.0.0 şu an herkese açıktır; kütüphane gizli
yapılınca paketler gizli olarak yeniden yayımlanacak.

**npm.** Projenin `.npmrc` dosyasına paketin nereden geleceğini, kendi
`~/.npmrc` dosyanıza token'ı, `ghp_X…` yerine kendi token'ınızı işaretsiz
yazarak ekleyin (token hiçbir zaman repoya girmez):

```text
# proje/.npmrc
@omcoskun:registry=https://npm.pkg.github.com

# ~/.npmrc
//npm.pkg.github.com/:_authToken=ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

```bash
npm install @omcoskun/convert-tools
```

**Maven.** `~/.m2/settings.xml` içinde `github` kimlikli bir sunucu tanımlayın
(kullanıcı adı ve PAT), projeye repository'yi ve bağımlılığı ekleyin:

```xml
<!-- ~/.m2/settings.xml -->
<servers>
  <server>
    <id>github</id>
    <username>GITHUB_KULLANICI_ADI</username>
    <password>TOKEN</password>
  </server>
</servers>

<!-- pom.xml -->
<repositories>
  <repository>
    <id>github</id>
    <url>https://maven.pkg.github.com/omcoskun/convert-tools</url>
  </repository>
</repositories>
<dependencies>
  <dependency>
    <groupId>io.github.omcoskun</groupId>
    <artifactId>convert-tools</artifactId>
    <version>1.0.0</version>
  </dependency>
</dependencies>
```

**GitHub erişimi olmadan.** Her sürümün GitHub Release'ında
`omcoskun-convert-tools-<sürüm>.tgz` ve `convert-tools-<sürüm>.jar` dosyaları
vardır. Tarball `npm install ./omcoskun-convert-tools-1.0.0.tgz` ile kurulur;
jar classpath'e eklenir. İkisi de hesap ve ağ gerektirmez.

## JavaScript kullanımı

```js
import { convertLength, encodeMgrs, inverseGeodesic } from "@omcoskun/convert-tools";

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
(1.0.0 ve yayım öncesi geçmiş):
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

## Güvenlik

[`SECURITY.md`](SECURITY.md)
