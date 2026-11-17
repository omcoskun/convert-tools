# Değişiklik günlüğü

Bu dosya `@convert-tools/core` (JavaScript) ve `convert-tools-core` (Java)
için ortaktır; iki çekirdek aynı sürüm numarasını taşır.

## Sürüm yayımlanmadı

### Kırıcı değişiklikler

**UTM alanı**

- İleri UTM dönüşümü artık merkez meridyene 6° kuralı yerine zon ızgarasını
  kullanır: doğu 0…1 000 000 m veya kuzey 0…10 000 000 m aralığının dışına
  düşen nokta `OUTSIDE_UTM_DOMAIN` ile reddedilir (1e-6 m pay). Yüksek
  enlemlerde 6°'den uzak ama ızgarada kalan noktalar artık kabul edilir;
  ızgara dışına taşan noktalar artık ileri dönüşümde de reddedilir.
- Ters UTM dönüşümü 80°G–84°K dışındaki ızgara noktalarını
  `GRID_COORDINATE_OUT_OF_RANGE` ile reddeder (1e-9° pay). MGRS çözme bu
  denetimi atlar (`latitudeLimit: false`), çünkü 100 km kareler 84°K'nin
  ötesine uzanır.

**Geodezik çözücü**

- Ters ve doğrudan geodezik problemler artık Vincenty yerine Karney'nin
  algoritmasıyla (GeographicLib `Geodesic` / `GeodesicLine`, 6. derece seri)
  çözülür. Vincenty, "shooting" ve cut-locus kodu kaldırıldı; yedek çözücü
  yoktur.
- `inverseGeodesic` sonucunda `solver` artık `"karney-inverse"` (çakışık
  noktalarda `"identity"`), `algorithm` `"ellipsoidal"` olarak kalır.
  `directGeodesic` sonucunda `algorithm` `"karney-direct"` oldu.
- `iterations`: ters problemde Newton/bisection döngüsünün gerçekleştirdiği
  boylam değerlendirmesi sayısı (döngü sayacı + son değerlendirme); yalnız
  kimlik sonucunda ve kapalı form meridyonel/ekvatoral/kısa çizgi
  yollarında 0. Doğrudan problemde her zaman 0.
- `ambiguous` artık kesin kuralla belirlenir: `lat1 + lat2 == 0` tam olarak
  sağlanır ve (a) iki nokta kutupsa, (b) `|lon12|` tam olarak 180° ise veya
  (c) `f > 0` iken `|lon12|`, cut-locus sınırı
  `180 (1 − f A3(eps) cos(beta1))` değerini 1e-9°'den fazla aşıyorsa `true`.
  `f < 0` için yalnız (a) ve (b) geçerlidir. Yakın ama benzersiz antipodal
  rotalar artık `false` döndürür.
- `tolerance` ve `maxIterations` seçenekleri geriye dönük uyumluluk için
  kabul edilir (ters problemde eskisi gibi doğrulanır), ancak çözücü
  tarafından yok sayılır; kullanımdan kaldırılmıştır.
- `NO_CONVERGENCE` hata kodu sözleşmede kalır; geodezik fonksiyonlar artık bu
  kodu üretmez. Karney yöntemi iterasyon sınırına ulaşırsa son iterasyonu
  döndürür (GeographicLib ile aynı).
- Tam antipodlarda rota kuzey kutbu üzerinden alınır (ilk azimut 0°, son
  azimut 180°); `f < 0` iken kutup çifti dışında çözülen azimutlar döner.
  `f = 0` küre desteklenir.
- GeodTest (500.000 satır): en büyük ters mesafe hatası 1,1e-8 m, azimut
  kaynaklı uç kayması 7,5e-8 m, doğrudan konum hatası 1,0e-8 m; tam set
  2,3 s. Vincenty sürümünde bu değerler 7,58e-5 m, 5,68e-5 m ve 9,05e-5 m,
  süre 197 s idi.

### Eklenenler

- Ters ve doğrudan geodezik sonuçları (JavaScript `inverseGeodesic`,
  `directGeodesic`, `sampleGeodesicPath`, `measurePolyline` segmentleri;
  Java `GeodesicResult`, `DirectResult`, `GeodesicPath`) beş yeni alan
  taşır: `arcDegrees` (a12), `reducedLengthMetres` (m12), `geodesicScale12`
  (M12), `geodesicScale21` (M21) ve `areaSquareMetres` (S12, geodezik ile
  ekvator arasındaki alan; GeographicLib tanımı, C4 alan serisi). Çakışık
  noktalarda ve sıfır mesafede 0, 0, 1, 1, 0. Tam antipodlarda beşi de
  döndürülen kuzey kutbu rotasını anlatır (a12 = 180°, S12 = c²π).
- Sözleşme vektörleri: `geodesic-wgs84.csv` ve `geodesic-direct.csv` yeni
  sütunlar aldı; küre, f = 1/150, f = 1/50 ve iki prolate elipsoit için
  `geodesic-ellipsoids.csv` ve `geodesic-direct-ellipsoids.csv` eklendi
  (GeodSolve `-f -p 9`).

- Üç eksenli elipsoitte geodezik (ayrı modül `src/geodesy/triaxial/`):
  `inverseTriaxialGeodesic`, `directTriaxialGeodesic`, `triaxialToCartesian`,
  `cartesianToTriaxial`; Java `TriaxialGeodesic`. Konumlar elipsoidal enlem β
  ve boylam ω (Karney 2025); m12, M12, M21 dahil. Yöntem ve kanıt:
  `docs/TRIAXIAL_VALIDATION.md`. Vektörler `triaxial-inverse.csv`,
  `triaxial-direct.csv` (Geod3Solve). Doğrulama araçları
  `validate-geod3test.mjs`, `Geod3TestFullSet`.
- Üç eksenli ters problem sonucu (`inverseTriaxialGeodesic` ve Java
  `InverseResult`, son bileşen) `ambiguous` alanını taşır: nokta çifti için
  aynı uzunlukta birden çok en kısa jeodezik varsa `true`, yoksa ve çakışık
  noktalarda `false`. Eş uzunluktaki jeodeziklerin seçimi ile umbilik
  noktalardaki azimut etiketi artık GeographicLib (`Geod3Solve` 2.7) ile
  aynıdır; kurallar `docs/TRIAXIAL_VALIDATION.md` içindedir. Sözleşme
  vektörleri: `triaxial-conventions.csv` (212 satır, `ambiguous` sütunu).

### Düzeltilenler

- JavaScript ters çözücü iki noktada GeographicLib C++ 2.7'den ayrılıyordu
  (Newton bracket güncellemesi `numit > maxit1` ve prolate InverseStart'ta
  `lam12x`). Ekvatora çok yakın prolate çizgilerde mesafe 9,5 cm'ye kadar
  sapıyordu (f = −1/50); artık 4e-9 m. Java zaten C++ ile aynıydı.
- Java `Geodesic.direct` azimutu motora `((x % 360) + 360) % 360` ile
  yuvarlanmış olarak veriyordu (1 ulp kayıp); artık JavaScript gibi ham
  değeri verir, motor kesin `AngNormalize` uygular.

## 3.0.0 — 2026-11-13

Doğruluk kriteri artık `contracts/` altındaki dilden bağımsız dosyalardır:
GeographicLib 2.7'den üretilen vektörler, `error-codes.json` ve
`error-cases.csv`. İki çekirdek de bu dosyaların tamamını geçer. Doğrulama
sonuçları: `docs/UTM_MGRS_VALIDATION.md`.

### Kırıcı değişiklikler

**Hatalar**

- Tüm hatalar tek tiptir: JS'te `ConvertToolsError` (`Error` alt sınıfı,
  `code` alanı), Java'da `ConvertToolsException`
  (`IllegalArgumentException` alt sınıfı, `code()` metodu). Kod listesi
  `contracts/error-codes.json`'dadır ve iki dilde aynıdır.
- Java: sıfıra bölme artık `ArithmeticException` değil, geodezik yakınsamama
  artık `IllegalStateException` değil; ikisi de `ConvertToolsException`
  (`DIVISION_BY_ZERO`, `NO_CONVERGENCE`).
- JS: `formatDms` / `formatDdm` sonlu olmayan, enlem/boylam aralığı dışındaki
  değerleri ve 0–9 dışındaki basamak sayısını reddeder (önceden metin
  üretiyordu). Java zaten reddediyordu.

**UTM / UPS**

- Transverse Mercator, Karney (2011) 6. derece Krüger serisine geçti. İleri
  ve ters dönüşüm GeoConvert ile 5 nm içinde aynıdır. Önceki sürüme göre
  sonuçlar zon kenarında 11,5 mm'ye, merkez meridyenden çok uzak ters
  dönüşümde metrelere kadar değişebilir (önceki sonuçlar yanlıştı).
- Boylam +180° standart zonda zon 1'dir (önceden 60).
- EPSG:327xx'te ekvator (enlem 0) artık 10 000 000 m northing ile yazılır
  (önceden 0).
- UPS ters dönüşümü artık yalnız 60° enlem çemberi içindeki grid
  koordinatlarını kabul eder (+1 µm pay). Önceki kabul alanı
  700 000–3 300 000 m karesiydi; karenin köşeleri 60°'nin dışındaydı.
  Dışarıdaki noktalar `GRID_COORDINATE_OUT_OF_RANGE` ile reddedilir.
- Java: `Wgs84.meridionalArc` kaldırıldı (yalnız eski UTM serisi
  kullanıyordu).

**MGRS**

- Zon her zaman iki haneyle yazılır: `01HEU` (önceden `1HEU`). Tek haneli
  girdi hâlâ çözülür.
- Basamaklar GeographicLib gibi önce mikrometreye taban alınıp sonra kesilir.
- Çözme, 100 km karenin harf bandına düşüp düşemeyeceğini GeographicLib
  `UTMRow` kuralıyla denetler. Önceden kabul edilen bazı kodlar (ör.
  `32NQQ7070975688`, `26PJD`, `54JSV20`) artık `MGRS_SQUARE_NOT_IN_BAND`
  ile reddedilir. Hata mesajları değişti.

**GARS / GEOREF**

- GARS: boylam +180° artık bant `001`'e düşer (önceden `720`).
- GEOREF: kodlayıcı dakika değerine `1e-10` ekleyerek kesiyordu; dakika
  çizgisinin ~0,1 mm altındaki nokta bir sonraki hücreye yazılıyordu.
  Artık GeographicLib'in tamsayı algoritması kullanılır.

**Paket (JS)**

- TypeScript bildirim dosyaları (`*.d.ts`) ve `exports` içindeki `types`
  koşulları kaldırıldı; tipler JSDoc ile belgelenir.

### Eklenenler

- JS: CommonJS desteği. `exports` içinde `import` → `src/` (ESM),
  `require` → `dist/cjs/` (Babel yalnız modül dönüşümü yapar; BigInt ve
  diğer sözdizimi aşağı çevrilmez).
- JS: `ConvertToolsError`, `ERROR_CODES` tüm giriş noktalarından dışa
  aktarılır.
- Java: `ConvertToolsException`, `ErrorCode`, `UtmUps.latitudeBandIndex`,
  `UtmUps.utmForward(lat, lon, zone, north)`.

### Sözleşme dosyaları

- `contracts/test-vectors/` kodun kendi çıktısından değil, GeographicLib 2.7
  ve bağımsız bir EPSG:3857 formülünden üretilir
  (`contracts/tools/generate-vectors.mjs`, `manifest.json` SHA-256 ve araç
  sürümlerini kaydeder). UTM satırları `coordinate-projections.csv`'den
  `utm-ups-forward.csv` / `utm-ups-inverse.csv`'ye taşındı; yeni dosyalar:
  `mgrs-forward.csv`, `mgrs-reverse.csv`, `gars.csv`, `georef.csv`,
  `geodesic-direct.csv`.
- Yeni: `contracts/error-codes.json`, `contracts/error-cases.csv`.
