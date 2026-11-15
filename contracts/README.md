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
| `coordinate-projections.csv` | 1358 | EPSG:3857 `web_mercator.py`; EPSG:326xx/327xx `GeoConvert -z ZONh`; EPSG:5041/5042 GeographicLib `PolarStereographic::UPS()` | 1 µm; gidiş-dönüş 1 µm |
| `geodesic-wgs84.csv` | 2533 | `GeodSolve -i -f -p 9` | 1e-7 m; azimut `\|m12\|·Δα` 1e-7 m; a12, m12, M12, M21, S12 aşağıda |
| `geodesic-direct.csv` | 1005 | `GeodSolve -f -p 9` | 1e-7 m; son azimut 1e-6°; a12, m12, M12, M21, S12 aşağıda |
| `geodesic-ellipsoids.csv` | 2000 | `GeodSolve -i -f -p 9 -e a f`; küre, f = 1/150, 1/50, −1/150, −1/50 | WGS 84 ters dosyasıyla aynı |
| `geodesic-direct-ellipsoids.csv` | 760 | `GeodSolve -f -p 9 -e a f`; aynı beş elipsoit | 1e-7 m konum; a12, m12, M12, M21, S12 aşağıda |
| `geodtest-sample.csv` | 1000 | `GeodTest.dat` her 500. satırdan biri (aşağıdaki awk kuralı) | 1e-7 m; azimut `\|m12\|·Δα` 1e-7 m |
| `triaxial-inverse.csv` | 70 | `Geod3Solve -i -t a b c -p 15`; Cayley, Dünya benzeri, hafif, oblate, prolate | `1e-10 · b` mesafe; azimut `\|m12\|·Δα` aynı |
| `triaxial-direct.csv` | 80 | `Geod3Solve -t a b c -p 15`; aynı beş elipsoit | `1e-10 · b` konum; son azimut `b·Δα` aynı |
| `gars.csv` | 3072 | GeographicLib `GARS::Forward/Reverse` | birebir metin; merkez 1e-12° |
| `georef.csv` | 3590 | GeographicLib `Georef::Forward/Reverse` | birebir metin; merkez 1e-12° |
| `unit-conversions.csv` | 4 | Tanımlar: 1 uluslararası deniz mili = 1852 m, 1 uluslararası ayak = 0,3048 m (kesin) | birebir kesir |

`geodtest-sample.csv`, Karney'nin 500.000 satırlık resmî `GeodTest.dat`
kümesinden (DOI 10.5281/zenodo.32156, CC0-1.0, MD5
`3461c4dc2500a8bad9394cd530b13dbe`) deterministik olarak seçilmiş 1.000 veri
satırıdır (başlıkla 1.001 satır). 0 tabanlı satır indeksi 500'ün katı olan
satırlar alınır; yani rastgele bloktan 200, diğer sekiz bloktan 100'er satır.
Sütunlar `id,lat1,lon1,azi1,lat2,lon2,azi2,s12,a12,m12,S12`; `id`, `geodtest-`
ön eki ve altı haneli 0 tabanlı satır indeksidir. Dosyanın SHA-256 özeti
`70668bb1889e94de241970da1e72272e50b4c18f14cded81ae10079c18db7830`'dir. Seçim
kuralı `manifest.json` içindeki `selection` alanında aynen durur:

```bash
awk 'BEGIN{print "id,lat1,lon1,azi1,lat2,lon2,azi2,s12,a12,m12,S12"} (NR-1)%500==0 {printf "geodtest-%06d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n", NR-1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10}' GeodTest.dat > contracts/test-vectors/geodtest-sample.csv
```

Bu dosya iki dilin de örnek satırlarda tam set ile aynı 1e-7 m eşiğini
uygulamasını sağlar; tam set ölçümü `docs/GEODESIC_VALIDATION.md` içindedir.
`generate-vectors.mjs` bu dosyayı yeniden üretmez (kaynak veri seti depoda
tutulmaz), yalnız manifest kaydını korur.

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
noktalar, EPSG:326xx ve 327xx'te ekvator (güney CRS'te 10 000 km false
northing), GARS/GEOREF hücre sınırları (0,001'–59' çizgileri ve 1e-13° /
1e-12° iki yanı, dört çeyrek). Jeodezikte: kutuplar, tam ve yakın antipodlar, ekvatoral ve meridyenel
hatlar, antimeridyen geçişi, 1 mm–1 km kısa hatlar, 1500 küresel rastgele çift,
500 kısa ve 500 antipoda yakın rastgele çift; ayrıca `GeodTest.dat`'ın her
bloğundan örneklenen 1.000 satır (`geodtest-sample.csv`).

İki çok elipsoitli dosya `id,ellipsoid,a,f` sütunlarıyla başlar, sonra WGS 84
dosyalarıyla aynı sütunları taşır. Kendi rastgele sayı üreteçleri (tohum
`0xe111b5e`) vardır; bu yüzden eklenmeleri diğer dosyaları bayt bayt
değiştirmedi (manifest SHA-256 özetleriyle doğrulandı). Her elipsoit için kenar
satırları, 150 rastgele, 100 antipoda yakın, 25 kısa, 100 ekvatora yakın ve 20
meridyenel çift ile 152 doğrudan durum üretilir. Ekvatora yakın prolate satırlar,
JavaScript çözücüsünün GeographicLib C++'tan ayrıldığı bir hatayı (9,5 cm)
yakalamak için eklendi; eski kod bu dosyada 3 satırda 3,8 mm'ye kadar hata verir.

Yeni sütunlar: ters dosyalarda `arcDegrees`, `geodesicScale12`,
`geodesicScale21`, `areaSquareMetres` (`reducedLengthMetres` zaten vardı);
doğrudan dosyalarda `expectedArcDegrees`, `expectedReducedLengthMetres`,
`expectedGeodesicScale12`, `expectedGeodesicScale21`,
`expectedAreaSquareMetres`. Azimutun boş olduğu satırlarda (rota benzersiz
değil) M12, M21 ve S12 de boştur; a12 ve m12 rotadan bağımsız olduğu için
doludur.

## Tolerans gerekçeleri

- **Üç eksenli geodezik: `1e-10 · b`.** Geod3Solve yakın umbilik noktalarda
  kendi hesabında 1e-11 · b düzeyinde hata yapar (docs/TRIAXIAL_VALIDATION.md);
  tolerans bunu kapsar, diğer satırlarda farklar 5e-14 · b altındadır.
  Geod3Solve m12, M12, M21 yazmaz; bunlar testlerde sonlu farklarla, oblate
  sınırda iki eksenli çözücüyle ve kürede kapalı formlarla denetlenir. Tam
  antipodlar dosyada yoktur: Geod3Solve `-i` orada geçersiz hat verebilir.

- **UTM/UPS/MGRS: 1 µm.** GeographicLib 6. derece Krüger serisini kullanır
  (Karney 2011; merkez meridyenden 3900 km içinde 5 nm doğruluk). Çekirdekler aynı
  seriyi uygular; 1 µm sınırı tüm yuvarlama farklarını kapsar ama herhangi bir
  formül hatasını yakalar. Enlem/boylam farkları, yerel küresel ölçekle (1°≈111,32
  km) metreye çevrilir; bu çevrimin %1'lik yaklaşıklığı hata miktarının kendisine
  uygulanır, sonuca değil.
- **Jeodezik: 1e-7 m.** Çekirdekler Karney'nin (2013) algoritmasını uygular:
  GeographicLib `Geodesic` ve `GeodesicLine` sınıflarının altıncı derece serisi,
  ters çözümde Newton + bisection; eski kuadratik çözüm, shooting veya kesim
  bölgesi yedeği yoktur. 500.000 satırlık `GeodTest` kümesinde en büyük ters mesafe farkı
  JavaScript ve Java'da 1.12e-8 m, ters azimutun uç noktayı kaydırdığı en büyük
  mesafe iki dilde 7.53e-8 m, doğrudan uç nokta farkı JavaScript'te 1.00e-8 m,
  Java'da 1.95e-8 m ölçüldü (`docs/GEODESIC_VALIDATION.md`). 1e-7 m sınırı bu
  ölçülen değerlerin üstündedir ve yine de bir formül hatasını yakalar.
- **Azimut ölçütü.** Azimut hatası derece olarak değil, jeodeziğin uç noktasını
  yana kaydırdığı mesafe olarak ölçülür: `|m12| × Δα` (m12 = indirgenmiş uzunluk,
  `GeodSolve -f` çıktısı). Bu ölçüt çok kısa hatlarda (derece cinsinden azimut
  anlamsızlaşır) ve antipoda yakın hatlarda (uç nokta azimuta duyarsızlaşır)
  fiziksel olarak doğru ölçüdür. Tolerans mesafeyle aynıdır (1e-7 m).
- **Azimut boş bırakılan satırlar.** Birden fazla en kısa jeodezik varsa azimut
  tanımsızdır ve dosyada boştur: çakışan noktalar, kutup uçları, tam antipodlar ve
  en kısa yolu ekvatordan ayrılan iki ekvator noktası (yolun ekvatora göre aynı
  uzunlukta bir ayna görüntüsü vardır). Bu kural geometriden gelir; test edilen
  kodun çıktısına bakılmadan uygulanır. Mesafe bu satırlarda da zorunludur. Bu
  dosya kuralı `ambiguous` alanıyla aynı değildir: `ambiguous` yalnız
  `lat1 + lat2 == 0` iken ve kutup çifti, tam antipod veya
  `|lon12| - lonCut > 1e-9°` koşullarından biri sağlanınca `true` olur
  (`f < 0` için yalnız ilk ikisi); benzersiz ama antipoda yakın bir yol
  `ambiguous` değildir. Kesin tanım `packages/core-js/README.md` ve
  `packages/core-java/README.md` içindedir.
- **Uzunluk ve alan sütunları.** Hepsi satırın `toleranceMetres` değerinden
  (1e-7 m) veya yuvarlamadan türetilir: `arcDegrees` için
  `toleranceMetres / (a · 1°)`, `reducedLengthMetres` için `toleranceMetres`,
  `geodesicScale12/21` için `toleranceMetres / a`. `areaSquareMetres` için
  doğrudan problemde 0,25 m² (Dünya'daki en büyük |S12| = c²π ≈ 1,3e14 m²'nin
  16 ulp'si); ters problemde `0,25 m² + c² · 1e-8 m / |m12|`. Ters çözücü alp1'i
  ancak (uç nokta gürültüsü) / |m12| kadar belirler ve S12 yaklaşık
  c² · Δalp1 kadar kayar; 1e-8 m ölçülen uç nokta gürültüsünün on katıdır. Bu
  nedenle antipoda yakın hatlar (küçük |m12|) azimutları gibi daha geniş bir
  alan toleransı alır. Ölçülen en büyük farklar: WGS 84 ters S12 5,25 m²
  (`near-antipodal-0087`), çok elipsoitli ters 1495 m²
  (`SPHERE-near-antipodal-094`, m12 = 30,9 m), doğrudan 0,047 m²; a12
  ≤ 5,7e-14°, m12 ≤ 3,7e-9 m, M12/M21 ≤ 6,7e-16 (iki dil).

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
