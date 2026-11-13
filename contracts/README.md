# Diller arası sözleşme vektörleri

`test-vectors/` altındaki dosyalar JavaScript (`packages/core-js`) ve Java
(`packages/core-java`) çekirdeklerinin **ortak kabul ölçütüdür**. Doğruluğun
tanımı koddaki formül değil bu dosyalardır: bir formül veya sabit değişikliği iki
dilde de aynı dosyaları geçmeden kabul edilmez.

**Hiçbir beklenen değer test edilen koddan üretilmez.** Tüm koordinat ve jeodezik
referansları bağımsız araçlarla `contracts/tools/generate-vectors.mjs` tarafından
üretilir; üreteç çekirdek kodunu içe aktarmaz.

## Yeniden üretme

```bash
brew install geographiclib        # veya: apt-get install geographiclib-tools libgeographiclib-dev
node contracts/tools/generate-vectors.mjs
```

Girdiler sabit tohumlu (`0x5eedc0de`) bir üreteçten gelir; aynı araç sürümleriyle
çıktı bayt bayt aynıdır. `test-vectors/manifest.json` her dosyanın satır sayısını,
SHA-256 özetini, kaynak komutunu, araç sürümlerini ve atlanan satırları kaydeder.

Bu sürümdeki üretim ortamı: GeographicLib 2.7 (`GeoConvert`, `GeodSolve`, C++
kütüphanesi), Python 3.14.7, Apple clang 21.

## Dosyalar

| Dosya | Satır | Kaynak | Tolerans |
|---|---:|---|---|
| `utm-ups-forward.csv` | 5644 | `GeoConvert -s -u -p 9` (standart zon); `GeoConvert -z ZON -u -p 9` (zorlanmış zon) | 1 µm |
| `utm-ups-inverse.csv` | 2885 | `GeoConvert -g -p 9`, girdi `ZONh DOĞU KUZEY` | 1 µm (yer mesafesi) |
| `mgrs-forward.csv` | 15360 | `GeoConvert -m -p (HASSASİYET-5)` | birebir metin |
| `mgrs-reverse.csv` | 5428 | `GeoConvert -u -p 9` ve `-g -p 9`, MGRS girdisi (hücre merkezi); `valid=0` GeoConvert'in reddettiği kodlar | 1 µm; geçersizde hata zorunlu |
| `coordinate-projections.csv` | 1334 | EPSG:3857 `web_mercator.py`; EPSG:326xx/327xx `GeoConvert -z ZONh`; EPSG:5041/5042 GeographicLib `PolarStereographic::UPS()` | 1 µm; gidiş-dönüş 1 µm |
| `geodesic-wgs84.csv` | 2533 | `GeodSolve -i -f -p 9` | 0,1 mm |
| `geodesic-direct.csv` | 1005 | `GeodSolve -p 9` | 0,1 mm; son azimut 1e-6° |
| `gars.csv` | 2532 | GeographicLib `GARS::Forward/Reverse` | birebir metin; merkez 1e-12° |
| `georef.csv` | 2690 | GeographicLib `Georef::Forward/Reverse` | birebir metin; merkez 1e-12° |
| `unit-conversions.csv` | 4 | Tanımlar: 1 uluslararası deniz mili = 1852 m, 1 uluslararası ayak = 0,3048 m (kesin) | birebir kesir |

`contracts/tools/geographiclib-helper.cpp`, GeoConvert'in komut satırından
sunmadığı işlemler (GARS, GEOREF ve GeographicLib'in UPS politika aralığı olan
yaklaşık 83,5°K / 79,5°G dışındaki kutup stereografik) için aynı GeographicLib
sınıflarını doğrudan çağırır. `web_mercator.py`, EPSG:3857'yi Python'un C matematik
kütüphanesiyle ve çekirdeklerdekinden farklı bir formül biçimiyle
(`asinh(tan φ)`; çekirdekler `ln tan(π/4 + φ/2)` kullanır) hesaplar.

### Kapsanan kenar durumları

Zon sınırları (her 6° sınırı, sınırın 1e-9° doğusu ve batısı), Norveç (56°–64°K,
3°–12°D) ve Svalbard (72°–84°K, 0°–42°D) istisnaları ve sınırları, 80°G ve 84°K
sınırları (±1e-9°), her iki kutup, ±180° antimeridyen, ekvator (0 ve ±1e-9°), UPS
halkası, MGRS bant sınırları, 100 km kare kenarlarının 1 mm iki yanı, rastgele
noktalar. Jeodezikte: kutuplar, tam ve yakın antipodlar, ekvatoral ve meridyenel
hatlar, antimeridyen geçişi, 1 mm–1 km kısa hatlar, 1500 küresel rastgele çift,
500 kısa ve 500 antipoda yakın rastgele çift.

## Tolerans gerekçeleri

- **UTM/UPS/MGRS: 1 µm.** GeographicLib 6. derece Krüger serisini kullanır
  (Karney 2011; merkez meridyenden 3900 km içinde 5 nm doğruluk). Çekirdekler aynı
  seriyi uygular; 1 µm sınırı tüm yuvarlama farklarını kapsar ama herhangi bir
  formül hatasını yakalar. Enlem/boylam farkları, yerel küresel ölçekle (1°≈111,32
  km) metreye çevrilir; bu çevrimin %1'lik yaklaşıklığı hata miktarının kendisine
  uygulanır, sonuca değil.
- **Jeodezik: 0,1 mm.** Çekirdeklerin jeodezik motoru Vincenty ters çözümü ve
  antipoda yakın bölgede direct-shooting yedeğidir; GeographicLib'in 500.000
  satırlık `GeodTest` kümesinde en büyük mesafe farkı 0,076 mm ölçülmüştür
  (`docs/GEODESIC_VALIDATION.md`). Eski dosyadaki 1 mm toleransı 0,1 mm'ye
  sıkılaştırıldı. Bu motor GeographicLib'in nanometre düzeyindeki doğruluğuna
  sahip değildir; bu bir sınırlamadır, hata değildir.
- **Azimut ölçütü.** Azimut hatası derece olarak değil, jeodeziğin uç noktasını
  yana kaydırdığı mesafe olarak ölçülür: `|m12| × Δα` (m12 = indirgenmiş uzunluk,
  `GeodSolve -f` çıktısı). Bu ölçüt çok kısa hatlarda (derece cinsinden azimut
  anlamsızlaşır) ve antipoda yakın hatlarda (uç nokta azimuta duyarsızlaşır)
  fiziksel olarak doğru ölçüdür. Tolerans mesafeyle aynıdır (0,1 mm).
- **Azimut boş bırakılan satırlar.** Birden fazla en kısa jeodezik varsa azimut
  tanımsızdır ve dosyada boştur: çakışan noktalar, kutup uçları, tam antipodlar ve
  en kısa yolu ekvatordan ayrılan iki ekvator noktası (yolun ekvatora göre aynı
  uzunlukta bir ayna görüntüsü vardır). Bu kural geometriden gelir; test edilen
  kodun çıktısına bakılmadan uygulanır. Mesafe bu satırlarda da zorunludur.

## Bilinçli politika farkları ve atlanan satırlar

`manifest.json` içindeki `skipped` alanı her atlanan satır sınıfını sayısıyla
listeler.

- **Zorlanmış UTM zonu.** Kütüphane zorlanmış zonda merkez meridyenden en çok 6°
  ve 80°G–84°K aralığını kabul eder; GeographicLib ise doğu değeri 0–1000 km
  olduğu sürece daha geniş alanı kabul eder. Vektörler ±6° ile sınırlıdır.
  GeoConvert'in 1000 km dışında kaldığı için reddettiği zorlanmış zon satırları
  (78) atlanır.
- **GEOREF hassasiyet 1** (10 dakikalık hücre, eksen başına 1 hane) GeographicLib'de
  yoktur; bu hassasiyet için referans vektör yoktur. GeographicLib'in `prec ≥ 2`
  değeri bu kütüphanedeki hassasiyetle aynı hane sayısıdır.
- **GEOREF boylam +180°.** GeographicLib 2.7 `Georef::Forward` boylam tam +180
  iken boş kod döndürür; bu 30 satır atlanır. Kütüphane +180°'yi −180° ile aynı
  hücreye koyar (GARS ve MGRS'teki GeographicLib davranışıyla tutarlı).
- **MGRS kesme kenarı.** Bir kesme sınırına 1 µm'den yakın (ama tam üstünde
  olmayan) noktaların beklenen hanesi 1 µm doğrulukta belirsizdir; üretici bu tür
  satırları atlar. Bu sürümde böyle satır yoktur.

## Kesin uzunluk sözleşmesi

Uzunluk dönüşümünün değişmez değeri metre cinsinden indirgenmiş bir kesirdir.
JavaScript nesnelerinde hesap `bigint` ile yapılır; süreçler ve diller arasında
ise JSON güvenli biçim kullanılır:

```json
{
  "numerator": "1",
  "denominator": "1852"
}
```

`exactValue` hedef birimdeki kesin değeri, `exactMetres` aynı fiziksel
uzunluğun metre cinsinden değişmez değerini ve `exactFactor` kesin dönüşüm
oranını taşır. Payda her zaman pozitif, kesir indirgenmiş ve iki alan da onluk
tam sayı metnidir.

`value` yalnız gösterim içindir. `exactDecimal` false ve `rounded` true ise bu
metni sonraki hesap için kullanmak bilgi kaybettirir; zincirleme dönüşümlerde
`exactValue` veya `exactMetres` kullanılmalıdır. Yuvarlama modu `HALF_UP`,
`precision` aralığı 0–60'tır.

Yüksek hassasiyetli veya ondalıklı girdiler JSON/JavaScript Number olarak
verilmemelidir. Kesinlik için ondalık metin ya da JSON kesri kullanılmalıdır.
Bir kesir bileşeni en fazla 4096 onluk basamak, ondalık üs ise -1000 ile +1000
arasındadır.
