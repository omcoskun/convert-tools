# Değişiklik günlüğü

Bu dosya `@convert-tools/core` (JavaScript) ve `convert-tools-core` (Java)
için ortaktır; iki çekirdek aynı sürüm numarasını taşır.

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
