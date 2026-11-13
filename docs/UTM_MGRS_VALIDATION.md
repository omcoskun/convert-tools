# UTM / UPS / MGRS / GARS doğrulama raporu

Kayıt tarihi: 13 Kasım 2026. Referans: GeographicLib 2.7 (`GeoConvert`,
`TransverseMercatorProj`, `PolarStereographic`, `GARS`). Vektörlerin nasıl
üretildiği ve toleransların gerekçesi için `contracts/README.md`'ye bakın.

## Ne değişti

| Konu | Eski davranış | Yeni davranış |
|---|---|---|
| Transverse Mercator | Kesik seri + ters dönüşümde sayısal türevle "düzeltme" | Karney (2011) 6. derece Krüger serisi, ileri ve ters; düzeltme döngüsü yok |
| Seri katsayıları | — | α ve β (Denk. 35, 36) ile A (Denk. 29), arXiv:1002.1417v3 PDF'inden tek tek kontrol edildi |
| Açı fonksiyonları | `Math.sin(x * π/180)` | GeographicLib `sincosd`, `atan2d`, `tand`, `AngDiff`; 90°'nin katlarında tam sonuç |
| Konformal enlem | Yaklaşık | GeographicLib `taupf` / `tauf` (Newton, 5 adım) |
| Standart zon, +180° | Zon 60 | Zon 1 (GeographicLib `StandardZone`) |
| MGRS zon yazımı | Tek haneli zon "1HEU" | Her zaman iki hane "01HEU"; tek haneli giriş hâlâ çözülür |
| MGRS basamakları | Metre üzerinden kesme | Önce mikrometreye taban, sonra kesme (GeographicLib ile aynı) |
| MGRS bant kontrolü | Çözülen nokta bandın ±1° içindeyse kabul | GeographicLib `UTMRow`: kare banda düşemiyorsa hata |
| UPS ters dönüşüm alanı | Dikdörtgen sınır | 60° enlem çemberi (+1 µm) |
| EPSG:327xx ekvatorda | Kuzey sayılıp 0 m northing | 10 000 000 m false northing |
| GARS, +180° | Bant 720 | Bant 001 (GeographicLib `GARS::Forward`) |

## Düzeltme öncesi ve sonrası (aynı vektör dosyaları)

Düzeltme öncesi değerler, `e5c5247` commit'indeki kodun bu aşamadaki vektör
dosyalarıyla çalıştırılmasından alındı. JS ve Java aynı sonuçları verdi.

| Kontrol | Satır | Önce: en büyük hata | Önce: kalan satır | Sonra: JS | Sonra: Java |
|---|---:|---:|---:|---:|---:|
| UTM/UPS ileri | 5806 | 3,473 mm (+8 satır hata fırlattı) | 4633 | 4,662 nm | 4,662 nm |
| UTM/UPS ters | 2966 | 4,244 m | 2341 | 4,746 nm | 4,746 nm |
| MGRS kodlama (birebir metin) | 15360 | — | 2064 | 0 | 0 |
| MGRS çözme, kare merkezi | 4225 | 1508 m | 3234 | 3,164 nm | 3,164 nm |
| EPSG:326xx | 212 | 0,956 mm | 610 (tüm CRS) | 2,816 nm | 2,816 nm |
| EPSG:327xx | 212 | 10 000 km (ekvator) | ↑ | 3,268 nm | 3,268 nm |
| EPSG:5041 | 215 | 2,328 nm | ↑ | 1,863 nm | 1,317 nm |
| EPSG:5042 | 215 | 2,083 nm | ↑ | 2,083 nm | 2,083 nm |
| EPSG:3857 | 504 | 14,90 nm | ↑ | 14,90 nm | 14,90 nm |
| CRS gidiş-dönüş | 1358 | — | ↑ | 4,746 nm | 4,746 nm |
| GARS kodlama | 2532 | — | 6 | 0 | 0 |
| GARS merkezi | 2532 | 1,421e-14° | — | 1,421e-14° | 1,421e-14° |

Geodezik ve GEOREF kontrolleri bu aşamada değişmedi (geodezik motora
dokunulmadı; bkz. `GEODESIC_VALIDATION.md`).

## Zon kenarı ölçümü (başlangıç ölçümünün tekrarı)

`docs/BASELINE.md`'deki yöntemle: zon 36, 80°G–84°K, merkez meridyenden ±6°,
referans `TransverseMercatorProj -l 33 -k 0.9996 -p 10` (kesin TM).

| Merkez meridyene uzaklık | Önce ileri | Önce ters | Sonra ileri | Sonra ters |
|---|---:|---:|---:|---:|
| ≤ 3° | 0,956 mm | 0,952 mm | 7 nm | 5 nm |
| 3°–4,5° | 1,572 mm | 1,436 mm | 6 nm | 6 nm |
| 4,5°–6° | 11,487 mm | 4,780 mm | 6 nm | 6 nm |

Ankara (39.933365, 32.859742): `GeoConvert -u -p 9` →
`36n 488015.987782238 4420370.843637543`; kod →
`488015.98778223846 4420370.843637543`. Eski kodun 0,139 mm farkı kapandı.

Hedef ≤ 1 µm idi; ölçülen en büyük hata 4,7 nm.

## Bulunan kök nedenler

1. **Seri ve sayısal türev.** Eski ters dönüşüm kendi ileri dönüşümüne doğru
   yakınsıyordu; gidiş-dönüş testi geçerken gerçek konum milimetre (zon
   kenarında metre) düzeyinde yanlıştı. Merkez meridyenden çok uzak MGRS
   karelerinde (ör. `24XST0308180498`: 82,66°K, 68,02°B; merkez meridyenden
   ~397 km) sapma 1508 m'ye çıkıyordu; Krüger serisi 3900 km'ye kadar 5 nm
   içinde kalır.
2. **MGRS bant kontrolü.** ±1° toleranslı kontrol, GeoConvert'in reddettiği
   kareleri (ör. `32NQQ7070975688`, `26PJD`, `54JSV20`) kabul ediyordu.
3. **Ekvatorda yarıküre.** `utmForward` yarıküreyi her zaman enlemin
   işaretinden seçiyordu; EPSG:327xx'te 0° enlem 10 000 km kayıyordu. Artık
   CRS katmanı yarıküreyi açıkça veriyor; ekvator her iki yarıkürede
   yazılabilir, diğer enlemler yarıküreyle uyuşmazsa hata verilir.
4. **Derece trigonometri.** `sin(-180°)` sıfır çıkmadığı için UPS'te
   antimeridyen üzerindeki nokta yanlış doğu/batı bandına düşüyordu.
5. **+180° boylam.** Zon ve GARS bandı GeographicLib'den farklıydı.

## Komutlar

```bash
node contracts/tools/generate-vectors.mjs          # vektörleri yeniden üretir (~2 s)
cd packages/core-js && node --test test/           # 61 test, 61 geçti
sh packages/core-java/scripts/test.sh              # javac + 3 Java test sınıfı, hepsi geçti
```
