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
  tools/          vektör üreticisi (npm run vectors) ve GeodTest doğrulama aracı
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

`npm run dev` ile `http://localhost:3008/` adresinde açılır. Üst çubukta altı
araç vardır; her biri kendi adresiyle açılır:

| Araç | Adres | Ne gösterir |
|---|---|---|
| Ölçüm | `#measure` | İki nokta (ters problem), azimut + mesafe (düz problem) ve rota; WGS 84, GRS 80, küre veya özel (prolate dahil) model; bütün birimler ve jeodezik büyüklükler; neredeyse antipodal uçlarda azimut ve alan yalnız anlamlı basamaklarıyla (≈) ve belirsizliğiyle |
| Konum | `#positions` | DD, DMS, DDM, MGRS, UTM/UPS, GARS ve GEOREF arasında çeviri; çıktı hassasiyetleri ve MGRS karesinin köşesi veya merkezi |
| CRS | `#crs` | Desteklenen EPSG sistemleri arasında koordinat dönüşümü |
| Uzunluk | `#length` | Kesin kesirli oranlarla birim çevirisi, 0–60 ondalık hassasiyet, kesin kesir ve bütün birimler |
| Üç eksenli | `#triaxial` | Üç eksenli elipsoitte ters ve düz jeodezik problem, kartezyen dönüşümler |
| Referans | `#reference` | Doğruluk, WGS 84 sabitleri, desteklenen CRS'ler, birim tanımları ve hata kodları |

- **Çalışma alanı.** Ölçüm, Konum ve CRS tek bir haritanın üzerinde çalışır.
  Harita üst çubuğun altındaki bütün pencereyi kaplar. Girdiler sol üstteki
  girdi panelinde, sonuç alt ortadaki sonuç şeridinde durur. Panel
  daraltılabilir. "Ayrıntılar" düğmesi şeridin üstünde bir çekmece açar:
  bütün birimler, ek büyüklükler, model ve kütüphane çağrısı oradadır. Sağdaki
  denetimler yakınlaştırır, sonuca sığdırır, tüm dünyayı gösterir ve haritayı
  büyütür. 2D/3D seçici düz harita ile küre/perspektif arasında geçiş yapar;
  pusula kuzeye döndürüp eğimi sıfırlar. 3D görünümde sağ tuşla sürükleme
  eğim ve yönü değiştirir. Büyütülmüş haritada paneller gizlenir. Telefonda (760 px'in altı)
  panel ve şerit ekranın altındaki bir sayfaya taşınır. Sayfanın tepesinde
  ana değeri gösteren koyu bir şerit vardır ve sayfa tutamaçla büyütülüp
  küçültülür.
- **Sayfa araçları.** Uzunluk, Üç eksenli ve Referans haritasız, ortalanmış
  birer sütundur ve sayfa kaydırılır. Çalışma alanı bu sırada gizli olarak
  açık kalır; geri dönüldüğünde harita aynı görünümdedir.
- **Araç durumu.** Araçlar arasında geçerken her araç girdilerini ve
  seçimlerini korur. Bu durum yalnız sayfa açıkken tutulur, kaydedilmez.
- **Araçlar arası aktarım.** Konum'daki nokta Ölçüm'e A veya B olarak ya da
  CRS'ye gönderilebilir; CRS'deki nokta Konum'a gönderilebilir.
- **Kütüphane çağrısı.** Her araç, sonucu üreten `@convert-tools/core`
  çağrısını kopyalanabilir biçimde gösterir.
- **Haritadan seçim ve yapıştırma.** Ölçüm'de A ve B haritadan seçilebilir ve
  sürüklenebilir; rotaya haritadan nokta eklenebilir. Konum ve CRS'de haritaya
  tıklamak noktayı seçer. Seçilen nokta ekran çözünürlüğüne (5–8 ondalık)
  yuvarlanıp forma yazılır. "41.0082, 28.9784" gibi bir çift, ya da DMS
  yazımı, nokta alanına yapıştırılabilir. Enlem ve boylam yer değiştirmişse
  düzeltilir ve bir notla bildirilir.
- **Sayılar.** Gösterilen değerler dile göre gruplanır (Türkçe `6.378.137` ve
  `0,3048`, İngilizce `6,378,137` ve `0.3048`). Kopyalanan değer her zaman
  düz yazılır: nokta ondalık ayırıcıdır ve basamak gruplaması yoktur.
  Koordinat çiftlerinde virgül iki değeri ayırdığı için çift her dilde ondalık
  noktayla yazılır.
- **Adresler.** `#<araç>` açık aracı belirtir. Adres bir araç belirtmiyorsa
  ilk açılışta Ölçüm açılır, sonradan değişirse açık araç olduğu gibi kalır.
  Eski `#distance` adresi Ölçüm'ü açar ve `#measure` olarak yeniden yazılır.
  `#reference/<bölüm>` Referans'ı o bölümde açar (`accuracy`, `wgs84`, `crs`,
  `units`, `errors`).

Değişmeyen kurallar:

- Bütün değerler `@convert-tools/core` kök girişinden gelir. Arayüzde hesap
  formülü yoktur; `app/test/boundaries.test.mjs` ve ESLint bunu denetler.
- `app/public/config.json` başlangıç değerlerini, örnekleri ve ön ayarları,
  `app/public/lang.json` Türkçe ve İngilizce metinleri ve hata kodlarının
  yerelleştirilmiş açıklamalarını tutar. İkisi açılışta okunur ve
  doğrulanır. Yayımlanmış bir derlemede yeniden derlemeden değiştirilebilirler.
  `app/test/lang.test.mjs` ve `config.test.mjs` anahtarların kodla ve
  çekirdekle uyumunu denetler. `render.test.mjs` her aracı iki dilde de
  çizer.
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
- Harita, MapLibre GL JS 6 ile çizilen bir vektör haritasıdır: uzaktan
  bakınca küre, yakınlaşınca (12. düzeyden sonra) Web Mercator; 2D modu
  her ölçekte düz Web Mercator kullanır. Yıldızlı uzay arka planı yerel bir
  canvas üzerinde ekran çözünürlüğüne göre çizilir; sürekli animasyon veya
  ek görsel isteği yoktur. Kürenin kenarında atmosfer efekti bulunur.
  3D'de uzaklaşma sınırı ekranın panellerden kalan alanına ve enleme göre
  hesaplanır; küre bu alana sığdığında daha fazla uzaklaşılamaz. 2D'de düz
  dünya en az harita yüksekliği kadar kalır ve kuzey/güney kenarı ekranın
  dışında tutulur; uzay arka planı görünmez, dünya yanlara doğru tekrarlanır. Çekirdeğin
  örneklediği jeodezik hattı ve noktaları gösterir. Harita yalnız bir
  görseldir; ölçümü her zaman çekirdek yapar. Kutup yakınındaki noktalar ve
  kutbun üstünden geçen hatlar kürede gerçek yerlerinde çizilir (MapLibre'nin
  GeoJSON karoları ±85,05°'de bittiği için bu parça haritanın üstüne ayrıca
  çizilir). Kürede görünüm kutbun üstüne ortalanabilir ve 11. düzeye kadar
  yakınlaşılabilir; ±85,05°'nin ötesinde karo olmadığı için orası kenarın
  rengiyle düz boyanır. Antimeridyeni geçen hat tek parça çizilir.
- Üç altlık vardır ve `config.json` → `map.basemaps` içinde tanımlıdır
  (seçim hatırlanır): "standart" OpenFreeMap "positron"dur ve açık/koyu
  temayı izler (koyuda OpenFreeMap "dark" stili); "ayrıntılı" OpenFreeMap
  "liberty"dir (gölgeli rölyef ile); "uydu" EOX Sentinel-2 cloudless 2016
  görüntüsüdür (CC BY 4.0; 2017 katmanında Avrupa dışındaki karalar veri
  olmadığı için beyazdır); altında NASA GIBS Blue Marble (kamu malı, en çok
  8. düzey) kaba bir yedek olarak çizilir, böylece EOX karosu gelmediğinde
  boşluk yerine kaba görüntü görünür. Sınırlar ile yer adları vektör
  stilinden gelir. Altlığın "bazı parçalar yüklenemedi" uyarısı, son 10
  saniyedeki karo yüklemelerinin en az dörtte biri (ve en az 3'ü) başarısız
  olunca çıkar; yakınlaştırırken iptal edilen istekler sayılmaz.
  Raster kaynaklar yalnız bu kataloğun girdileridir; `src/map/map-adapter.js`
  stildeki başka raster kaynakları atar. Altlık yüklenemezse harita istek
  yapmayan çevrimdışı bir ızgaraya döner ve "Yeniden dene" düğmesi
  gösterir; ölçüm ve seçim çalışmaya devam eder. OpenFreeMap ücretsizdir ama
  hizmet garantisi (SLA) vermez; gerekirse aynı stil kendi sunucunuzda
  barındırılabilir.
- Katmanlar (varsayılan kapalı): enlem/boylam ızgarası (aralığı yakınlaştırma
  düzeyini izler) ve MGRS ızgara bölgeleri.
- Ölçek çubuğu Apple tarzıdır ve haritanın üst ortasında durur (telefonda
  sol üstte): yakınlaşırken görünür, sonra silinir; tıklayınca
  metrik, deniz mili ve imperial arasında döner; katman panelinden sabitlenebilir.
- Atıflar sağ altta bir ⓘ düğmesinin arkasındadır; altlık yüklendikten sonra
  5 saniye açık kalır, sonra kapanır (OSMF atıf yönergeleri buna izin verir).
  Atıflar `config.json`'da yapılandırılmış `{ text, href }` öğeleridir; uzak
  stilden HTML çizilmez.
- Haritada sağ tık (dokunmatikte uzun basış) noktayı ondalık derece ve MGRS
  olarak gösterir; her biri tek tıkla kopyalanır. "Konumum" tarayıcının
  konum özelliğini kullanır ve jeodezik bir doğruluk çemberi çizer; konum
  uygulamanın sunucusuna gönderilmez.
- Açık, koyu ya da sistem teması üst çubuktan seçilir ve `localStorage`'da
  saklanır.
- CSP `connect-src` ve `img-src` (raster karolar resim olarak yüklenir),
  derleme sırasında `config.json` → `map` içindeki her adresin kaynağından
  kurulur (`webpack.config.js` → `mapOrigins`). Bu yüzden
  altlık sunucusunu değiştirmek, diğer ayarların aksine, yeniden derleme ister.
- MapLibre ayrı bir parça olarak, yalnız bir çalışma alanı aracı açıldığında
  yüklenir (`src/map/maplibre.js`). Araç bağlantısının üzerine gelinince ya da
  bağlantıya odaklanılınca önceden çekilir. Stil dosyası ve web worker
  `node_modules/maplibre-gl/dist`'ten olduğu gibi `vendor/` klasörüne
  kopyalanır. `app/loaders/blank-import-meta-url.cjs`, webpack'in
  kütüphanedeki `import.meta.url` ifadesine derleme makinesinin dosya yolunu
  gömmesini engeller.
- Harita WebGL2 ve modül web worker'ı ister (MapLibre 6). Bunlar olmayan
  tarayıcıda harita yerine bir açıklama çıkar; formlar ve sonuçlar yine
  çalışır.

## Güvenlik

[`SECURITY.md`](SECURITY.md)
