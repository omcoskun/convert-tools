# WGS 84 geodezik doğrulama raporu

Doğrulama tarihi: 15 Kasım 2026

Bu rapor, JavaScript (`packages/core-js`) ve Java (`packages/core-java`)
çekirdeklerindeki WGS 84 inverse/direct geodezik hesabının Karney algoritmasıyla
yeniden yazılmış sürümünü belgeler. Ölçümler Karney'nin 500.000 satırlık resmî
`GeodTest` kümesinin tamamı üzerinde, iki dil için ayrı ayrı yapılmıştır.
Aşağıdaki bütün sayılar bu raporda anlatılan komutların çıktısından alınmıştır;
hiçbir değer tahmin edilmemiş veya başka bir kaynaktan aktarılmamıştır.

## Yöntem

Her iki çekirdek de Charles Karney'nin "Algorithms for geodesics" (Journal of
Geodesy 87:43–55, 2013) makalesindeki algoritmayı uygular. Yöntem, GeographicLib
2.7'nin `Geodesic` ve `GeodesicLine` sınıflarının altıncı derece seri açılımıdır:

- **Ters çözüm (inverse).** Başlangıç azimutu için `InverseStart` tahmini, ardından
  boylam farkı üzerinde Newton iterasyonu; Newton yakınsamazsa bisection yedeği.
  Kullanılan iterasyon sayısı sonuçtaki `iterations` alanında bildirilir.
- **Doğrudan çözüm (direct).** `GeodesicLine` üzerinde konum ve son azimut hesabı;
  iterasyon yoktur, `iterations` alanı 0'dır.
- **Yedek yok.** Eski kuadratik ters çözüm, direct-shooting yedeği ve kesim
  bölgesi (cut-locus) dal seçimi tamamen kaldırılmıştır. İterasyon sınırına
  ulaşılırsa GeographicLib ile aynı şekilde son yineleme döndürülür; ayrı bir
  yedek çözücüye veya başka bir rotaya düşülmez.
- **Elipsoit.** WGS 84: `a = 6378137 m`, `f = 1/298.257223563`. `f = 0` küre
  modeli de aynı kod yolundan geçer; uygulamanın kullandığı
  `{ a: 6371008.8, f: 0 }` küresi desteklenir.
- **Etiketler.** Ters çözümde `solver: "karney-inverse"`, çakışan noktalarda
  `solver: "identity"`; doğrudan çözümde `algorithm: "karney-direct"`. Ters
  çözümde `algorithm` değeri eskisi gibi `"ellipsoidal"` kalır.
- **Tam antipodlar.** `lat1 = −lat2` ve `|lon12| = 180°` olan çiftlerde kuzey
  kutbundan geçen rota döndürülür: başlangıç azimutu 0°, son azimut 180°.
  `f < 0` (prolate) elipsoitte bu rota en kısa rota değildir; orada kutup
  çifti dışındaki tam antipodlarda çözücünün bulduğu azimutlar döner.
- **Seçenekler.** `tolerance` ve `maxIterations` doğrulanmaya devam eder ama
  çözücü tarafından kullanılmaz; sözleşmede geriye dönük uyumluluk için dururlar
  ve kullanımdan kaldırılmıştır (deprecated).
- **Hata kodu.** `NO_CONVERGENCE` `contracts/error-codes.json` içinde kalır, ancak
  geodezik fonksiyonları artık bu kodu fırlatmaz.

### `ambiguous` alanının kesin kuralı

`lon12` boylam farkının (−180°, 180°] aralığına indirgenmiş hâli, `f` yassılaştırma
olsun. `ambiguous = true` **ancak ve ancak** `lat1 + lat2 == 0` iken ve aşağıdaki
koşullardan en az biri sağlanıyorsa:

1. `|lat1| == 90` (karşıt kutuplar);
2. `|lon12| == 180` (tam antipodlar);
3. `f > 0` ve `|lon12| − lonCut > 1e-9°`, burada
   `lonCut = 180° · (1 − f · A3(eps) · cos(beta1))`,
   `tan(beta1) = (1 − f) · tan(lat1)`,
   `k2 = ep2 · sin²(beta1)`, `ep2 = e2 / (1 − e2)`, `e2 = f(2 − f)`,
   `eps = k2 / (2 · (1 + sqrt(1 + k2)) + k2)` ve `A3` Karney'nin A3 serisidir.

Diğer bütün durumlarda `ambiguous = false`'tur: benzersiz ama antipoda yakın bir
rota `ambiguous` sayılmaz. `f < 0` (prolate) elipsoitlerde yalnız 1. ve
2. koşullar uygulanır. Bu kural, eski motorun "kesim bölgesine yakınsa işaretle"
yaklaşımından farklıdır; tam sete etkisi aşağıdaki karşılaştırmada görülür.

## Referans veri seti

`GeodTest.dat`, Karney'nin yüksek hassasiyetle üretilmiş resmî jeodezik test
kümesidir:

| Özellik | Değer |
|---|---|
| DOI | 10.5281/zenodo.32156 |
| Lisans | CC0-1.0 |
| Satır sayısı | 500.000 |
| Sütunlar | `lat1 lon1 azi1 lat2 lon2 azi2 s12 a12 m12 S12` |
| MD5 | `3461c4dc2500a8bad9394cd530b13dbe` |
| SHA-256 | `c1cabdddbcd7d5cfc6e6111db4608fa55be292b15ba2c5bcd6372a178848c692` |

MD5 ve SHA-256 özetleri bu raporda kullanılan dosyadan yeniden hesaplanmıştır;
MD5, veri setinin yayımlanmış özetiyle eşleşir.

Küme dokuz bloğa ayrılır (0 tabanlı satır indeksi):

| Blok | Satırlar | Satır sayısı |
|---|---|---:|
| Rastgele | 0–99.999 | 100.000 |
| Antipoda yakın | 100.000–149.999 | 50.000 |
| Kısa | 150.000–199.999 | 50.000 |
| Bir uç kutba yakın | 200.000–249.999 | 50.000 |
| İki uç karşıt kutba yakın | 250.000–299.999 | 50.000 |
| Meridyene yakın | 300.000–349.999 | 50.000 |
| Ekvatora yakın | 350.000–399.999 | 50.000 |
| Vertex'ten vertex'e | 400.000–449.999 | 50.000 |
| Vertex yakını | 450.000–499.999 | 50.000 |

Depodaki `contracts/test-vectors/geodtest-sample.csv`, bu kümeden deterministik
olarak seçilmiş 1.000 satırdır: 0 tabanlı satır indeksi 500'ün katı olan satırlar
(rastgele bloktan 200, diğer sekiz bloktan 100'er). Dosyanın SHA-256 özeti
`70668bb1889e94de241970da1e72272e50b4c18f14cded81ae10079c18db7830`'dir. Seçim
kuralı `contracts/test-vectors/manifest.json` içindeki `selection` alanında ve
`contracts/README.md` içinde aynen kayıtlıdır.

## Tam set ölçümleri

Ölçüm ortamı: Node.js v26.11.1, OpenJDK 21.0.11 (`javac --release 17` ile
derlendi), Darwin arm64, GeographicLib 2.7.

Aşağıdaki iki blok, ölçüm komutlarının **birebir** çıktısıdır. Sütunlar: blok adı,
satır sayısı, inverse/direct istisna sayısı, `ambiguous` satır sayısı, ters mesafe
farkı (`s12`) p99 ve maksimumu, ters azimut hatasının uç noktayı kaydırdığı mesafe
(`|Δazi1|·|m12|`) p99 ve maksimumu, azimut farkları ve doğrudan uç nokta farkı.

### JavaScript

Komut:

```bash
node /path/to/geodtest-check.mjs \
  "$PWD/packages/core-js/src/index.js" /path/to/GeodTest.dat
```

```text
random             100000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=3.73e-9 max=7.45e-9 | azi1*m12[m] p99=6.20e-9 max=9.48e-9 | azi1[deg] max=1.14e-12 azi2[deg] max=1.12e-12 | direct pos[m] p99=4.89e-9 max=9.72e-9 azi2[deg] max=1.93e-12
antipodal           50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=7.45e-9 max=1.12e-8 | azi1*m12[m] p99=1.60e-9 max=2.74e-9 | azi1[deg] max=6.73e-10 azi2[deg] max=6.74e-10 | direct pos[m] p99=6.58e-9 max=1.00e-8 azi2[deg] max=9.24e-13
short               50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=1.56e-9 max=2.74e-9 | azi1*m12[m] p99=1.36e-9 max=2.67e-9 | azi1[deg] max=4.76e-5 azi2[deg] max=4.76e-5 | direct pos[m] p99=1.60e-9 max=3.19e-9 azi2[deg] max=1.43e-10
one-pole            50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=3.73e-9 max=7.45e-9 | azi1*m12[m] p99=6.20e-9 max=9.49e-9 | azi1[deg] max=5.26e-13 azi2[deg] max=5.40e-13 | direct pos[m] p99=4.50e-9 max=7.12e-9 azi2[deg] max=5.40e-13
opposite-poles      50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=7.45e-9 max=7.45e-9 | azi1*m12[m] p99=1.14e-9 max=1.53e-9 | azi1[deg] max=8.18e-6 azi2[deg] max=8.18e-6 | direct pos[m] p99=6.02e-9 max=8.37e-9 azi2[deg] max=1.75e-8
meridional          50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=3.73e-9 max=7.45e-9 | azi1*m12[m] p99=6.27e-9 max=8.89e-9 | azi1[deg] max=4.35e-12 azi2[deg] max=4.38e-12 | direct pos[m] p99=4.78e-9 max=8.70e-9 azi2[deg] max=8.76e-10
equatorial          50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=5.59e-9 max=7.45e-9 | azi1*m12[m] p99=3.15e-9 max=4.71e-9 | azi1[deg] max=4.26e-14 azi2[deg] max=4.26e-14 | direct pos[m] p99=6.33e-9 max=9.50e-9 azi2[deg] max=4.26e-14
vertex-to-vertex    50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=3.73e-9 max=7.45e-9 | azi1*m12[m] p99=6.16e-20 max=9.07e-19 | azi1[deg] max=7.47e-4 azi2[deg] max=7.47e-4 | direct pos[m] p99=5.96e-9 max=9.21e-9 azi2[deg] max=2.02e-10
near-vertex         50000 invErr=0 dirErr=0 ambig=3 | s12[m] p99=7.45e-9 max=7.45e-9 | azi1*m12[m] p99=1.62e-9 max=7.53e-8 | azi1[deg] max=1.80e-2 azi2[deg] max=1.80e-2 | direct pos[m] p99=6.33e-9 max=9.49e-9 azi2[deg] max=2.12e-10
ALL                500000 invErr=0 dirErr=0 ambig=3 | s12[m] p99=3.73e-9 max=1.12e-8 | azi1*m12[m] p99=5.66e-9 max=7.53e-8 | azi1[deg] max=1.80e-2 azi2[deg] max=1.80e-2 | direct pos[m] p99=6.12e-9 max=1.00e-8 azi2[deg] max=1.75e-8
solvers: {"karney-inverse":500000}
worst: {"s12":{"value":1.1175870895385742e-8,"index":102577},"azi1Position":{"value":7.532862281496078e-8,"index":498963,"dA1":0.01803361191564079},"directPosition":{"value":1.0041167354435402e-8,"index":111872}}
seconds: 2.4
```

### Java

Komut:

```bash
OUT=$(mktemp -d)
find packages/core-java/src/main/java packages/core-java/src/test/java -name '*.java' -print0 \
  | xargs -0 javac --release 17 -Xlint:all -Werror -d "$OUT"
java -cp "$OUT" io.github.mertc0604.converttools.GeodTestFullSet /path/to/GeodTest.dat
```

```text
random             100000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=3.73e-9 max=7.45e-9 | azi1*m12[m] p99=6.20e-9 max=9.48e-9 | azi1[deg] max=1.59e-12 azi2[deg] max=1.58e-12 | direct pos[m] p99=8.16e-9 max=1.95e-8 azi2[deg] max=6.59e-12
antipodal           50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=7.45e-9 max=1.12e-8 | azi1*m12[m] p99=1.59e-9 max=2.74e-9 | azi1[deg] max=6.73e-10 azi2[deg] max=6.73e-10 | direct pos[m] p99=6.58e-9 max=1.19e-8 azi2[deg] max=9.24e-13
short               50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=1.55e-9 max=2.93e-9 | azi1*m12[m] p99=1.35e-9 max=2.71e-9 | azi1[deg] max=6.05e-5 azi2[deg] max=6.05e-5 | direct pos[m] p99=3.18e-9 max=5.29e-9 azi2[deg] max=1.43e-10
one-pole            50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=3.73e-9 max=7.45e-9 | azi1*m12[m] p99=6.20e-9 max=9.49e-9 | azi1[deg] max=5.26e-13 azi2[deg] max=5.40e-13 | direct pos[m] p99=8.39e-9 max=1.52e-8 azi2[deg] max=5.40e-13
opposite-poles      50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=7.45e-9 max=7.45e-9 | azi1*m12[m] p99=1.14e-9 max=1.53e-9 | azi1[deg] max=8.18e-6 azi2[deg] max=8.18e-6 | direct pos[m] p99=6.00e-9 max=8.37e-9 azi2[deg] max=1.75e-8
meridional          50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=3.73e-9 max=9.31e-9 | azi1*m12[m] p99=6.27e-9 max=8.89e-9 | azi1[deg] max=4.35e-12 azi2[deg] max=4.38e-12 | direct pos[m] p99=8.58e-9 max=1.62e-8 azi2[deg] max=8.76e-10
equatorial          50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=5.59e-9 max=7.45e-9 | azi1*m12[m] p99=3.15e-9 max=4.71e-9 | azi1[deg] max=4.26e-14 azi2[deg] max=4.26e-14 | direct pos[m] p99=7.97e-9 max=1.43e-8 azi2[deg] max=7.11e-14
vertex-to-vertex    50000 invErr=0 dirErr=0 ambig=0 | s12[m] p99=3.73e-9 max=7.45e-9 | azi1*m12[m] p99=6.16e-20 max=9.07e-19 | azi1[deg] max=7.47e-4 azi2[deg] max=7.47e-4 | direct pos[m] p99=6.29e-9 max=9.49e-9 azi2[deg] max=2.02e-10
near-vertex         50000 invErr=0 dirErr=0 ambig=3 | s12[m] p99=7.45e-9 max=7.45e-9 | azi1*m12[m] p99=1.60e-9 max=7.53e-8 | azi1[deg] max=1.80e-2 azi2[deg] max=1.80e-2 | direct pos[m] p99=6.32e-9 max=9.49e-9 azi2[deg] max=2.12e-10
ALL                500000 invErr=0 dirErr=0 ambig=3 | s12[m] p99=3.73e-9 max=1.12e-8 | azi1*m12[m] p99=5.66e-9 max=7.53e-8 | azi1[deg] max=1.80e-2 azi2[deg] max=1.80e-2 | direct pos[m] p99=7.40e-9 max=1.95e-8 azi2[deg] max=1.75e-8
solvers: {"karney-inverse":500000}
worst: {"s12":{"value":1.1175870895385742e-8,"index":102577},"azi1Position":{"value":7.532862281496078e-8,"index":498963,"dA1":0.01803361191564079},"directPosition":{"value":1.951631192437937e-8,"index":9958}}
ambiguous: 3 first indexes: [497712, 497725, 498963]
seconds: 1.3
```

### Eşiklerle karşılaştırma

| Ölçüt | Gerekli | JavaScript | Java |
|---|---:|---:|---:|
| İstisna (inverse, direct) | 0 | 0 | 0 |
| Ters mesafe farkı, maksimum | ≤ 5e-8 m | 1.12e-8 m | 1.12e-8 m |
| `\|Δazi1\|·\|m12\|`, maksimum | ≤ 1e-7 m | 7.53e-8 m | 7.53e-8 m |
| Doğrudan uç nokta farkı, maksimum | ≤ 5e-8 m | 1.00e-8 m | 1.95e-8 m |
| `ambiguous: true` satırları | yalnız kurala uyanlar | 3 | 3 |
| Tam set çalışma süresi | rapor edilir | 2.4 s | 1.3 s |

## Eski motorla karşılaştırma

Eski sürüm, ters çözümde klasik kuadratik yaklaşımı ve antipoda yakın bölgede
direct-shooting yedeğini kullanıyordu. Eski ölçüm ile yeni tam set sonuçları:

| Ölçüt | Eski Vincenty + shooting | Yeni JavaScript | Yeni Java |
|---|---:|---:|---:|
| En büyük ters mesafe farkı | 7.58e-5 m | 1.12e-8 m | 1.12e-8 m |
| En büyük doğrudan uç nokta farkı | 9.05e-5 m | 1.00e-8 m | 1.95e-8 m |
| `ambiguous: true` satır sayısı | 100.055 | 3 | 3 |
| Yedek çözüme düşen satır | 86.613 | 0 | 0 |
| Tam set çalışma süresi | 197.0 s | 2.4 s | 1.3 s |

Eski motorda 100.055 satır `ambiguous` işaretleniyordu; bunların büyük kısmı
vertex-vertex ve vertex yakını bloklarındaki, aslında benzersiz en kısa yolu olan
çiftlerdi. Yeni kesin kural yalnız `lat1 + lat2 == 0` olan ve gerçekten kesim
bölgesinde kalan satırları işaretler; tam sette bu sayı 3'tür. Yedek çözüm ve
kesim bölgesi dal seçimi koddan kaldırıldığı için "yedek çözüme düşen satır"
sayısı artık 0'dır.

## `ambiguous` satırlarının denetimi

Tam sette `ambiguous: true` dönen üç satırın tamamı `lat1 + lat2 == 0` koşulunu
sağlar ve kuralın (c) şıkkına girer. (a) kutup çifti veya (b) tam antipod
koşulunu sağlayan başka satır yoktur. Değerler 0 tabanlı satır indeksine göredir:

| Satır | `lat1` | `lat2` | `\|lon12\|` | `lonCut` | Fark | Kural |
|---:|---:|---:|---:|---:|---:|---|
| 497712 | 55.01707577475 | −55.01707577475 | 179.6534055107691 | 179.65340550843464 | 2.3344455257756636e-9° | (c) |
| 497725 | 85.224117973184 | −85.224117973184 | 179.94962723348712 | 179.949627219654 | 1.3833130196871934e-8° | (c) |
| 498963 | 68.301784708761 | −68.301784708761 | 179.77638751584965 | 179.77638751314416 | 2.705490942389588e-9° | (c) |

Üç satırda da fark `1e-9°` eşiğinin üzerindedir. `contracts/tools/validate-geodtest.mjs`
bu denetimi her satır için yapar; 500.000 satırın tamamında beklenen ve gerçek
`ambiguous` değeri arasında uyuşmazlık sayısı 0'dır.

## Yeniden üretme

Depo kökünden:

```bash
# Tam set, JavaScript (ölçüm betiği depo dışında; aşağıdaki araç depo içindedir)
node /path/to/geodtest-check.mjs "$PWD/packages/core-js/src/index.js" /path/to/GeodTest.dat

# Tam set, Java
OUT=$(mktemp -d)
find packages/core-java/src/main/java packages/core-java/src/test/java -name '*.java' -print0 \
  | xargs -0 javac --release 17 -Xlint:all -Werror -d "$OUT"
java -cp "$OUT" io.github.mertc0604.converttools.GeodTestFullSet /path/to/GeodTest.dat
```

Depo içindeki desteklenen doğrulama aracı, MD5 kontrolünü ve `ambiguous`
kural denetimini de yapar:

```bash
node contracts/tools/validate-geodtest.mjs /path/to/GeodTest.dat
```

Araç `GeodTest.dat` dosyasının MD5 özetini `3461c4dc2500a8bad9394cd530b13dbe`
ile karşılaştırır; eşleşmezse veya bu raporda listelenen kabul eşiklerinden biri
aşılırsa çıkış kodu 1'dir. CI'ın parçası değildir.

Örnek vektör dosyasını yeniden üretmek için:

```bash
awk 'BEGIN{print "id,lat1,lon1,azi1,lat2,lon2,azi2,s12,a12,m12,S12"} (NR-1)%500==0 {printf "geodtest-%06d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n", NR-1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10}' GeodTest.dat > contracts/test-vectors/geodtest-sample.csv
```

Sözleşme vektörlerini ve iki dilin testlerini yeniden çalıştırmak için:

```bash
npm run vectors
npm run test:core
npm run test:java
```

## Kapsam ve sınırlar

- **Üç eksenli elipsoit ayrı bir modüldür.** Dünya hesapları dönel elipsoit
  (WGS 84) üzerindedir. Üç eksenli elipsoitte geodezik için ayrı bir modül
  vardır (`inverseTriaxialGeodesic`, `directTriaxialGeodesic`; Java
  `TriaxialGeodesic`); yöntemi ve geliştirme kanıtı
  [TRIAXIAL_VALIDATION.md](TRIAXIAL_VALIDATION.md) içindedir. Karney'nin
  `Geod3Test` kümesi (DOI 10.5281/zenodo.12510796) hold-out'tur: aşağıya bakın.
- **a12, m12, M12, M21 ve S12 artık ortak API'dedir.** İki çekirdek de ters ve
  doğrudan sonuçlarda `arcDegrees`, `reducedLengthMetres`, `geodesicScale12`,
  `geodesicScale21` ve `areaSquareMetres` döndürür (GeographicLib `Lengths`,
  C4 alan serisi, `GenPosition`). Bu sütunların `GeodTest` üzerindeki doğruluğu
  17 Kasım 2026'daki hold-out koşusunda ölçüldü: aşağıdaki "Hold-out"
  bölümüne bakın.

- **Yüzey mesafesi.** Bu sonuçlar WGS 84 elipsoit yüzey mesafesi içindir. Arazi
  yüksekliği, jeoit, 3B eğik mesafe, rhumb line, UTM grid mesafesi, sensör
  doğruluğu veya farklı datum dönüşümü bu doğruluk zarfına dahil değildir.
- Hiçbir kayan nokta yazılımı için mutlak "sıfır hata" garantisi verilemez.
  Savunulabilir ifade, bu sürümün resmî 500.000 vektörde ölçülen en büyük
  değerlerinin yukarıdaki tabloda listelenen eşiklerin altında kaldığıdır.

## Hold-out: a12, m12, S12 ve Geod3Test

`GeodTest.dat` dosyasının a12, m12 ve S12 sütunları, `geodtest-sample.csv`
dosyasının aynı sütunları ve `Geod3Test-v1.txt` geliştirme sırasında
kullanılmadı; bağımsız bir test aşamasına ayrıldı. Geliştirme kanıtı yalnız
kendi üretilen girdilerde GeodSolve karşılaştırması, matematiksel özellikler
(küre kapalı formları, karşılıklılık, ters/doğrudan kapanış, tam antipodlar)
ve sonlu farklardan gelir.

Kapı `contracts/test-vectors/holdout.txt` dosyasıdır; içinde tek kelime
`disabled` durur. `enabled` yapılmadıkça hold-out testleri çalışmaz ve
"disabled" satırı yazar. Eşikler önceden sabitlendi ve değiştirilmez: bizim
değerimiz ≤ max(2 × referans ikili dosyanın en büyük hatası, taban).

| Ölçüt | Taban | JavaScript | Java |
|---|---:|---|---|
| GeodTest ters mesafe | 5e-8 m | 1,12e-8 m | 1,12e-8 m |
| GeodTest doğrudan konum | 5e-8 m | 1,00e-8 m | 1,42e-8 m |
| GeodTest `\|Δazi1\|·\|m12\|` | 1e-7 m | 7,53e-8 m (yakın tepe; sınır 1,51e-7) | 7,53e-8 m |
| GeodTest a12, ters | 5e-13° | 1,36e-10° (yakın tepe; sınır 2,72e-10) | 1,14e-10° |
| GeodTest a12, doğrudan | 5e-13° | 8,53e-14° | 8,53e-14° |
| GeodTest m12, ters | 5e-8 m | 4,54e-5 m (yakın tepe; sınır 9,07e-5) | 3,79e-5 m |
| GeodTest m12, doğrudan | 5e-8 m | 8,29e-9 m | 8,29e-9 m |
| GeodTest S12, ters | 0,05 m² | 2,55e10 m² (yakın tepe; sınır 5,11e10) | 2,55e10 m² |
| GeodTest S12, doğrudan | 0,05 m² | 1,24e4 m² (karşı kutuplar; sınır 2,48e4) | 1,24e4 m² |
| Geod3Test mesafe, konum, `\|Δα1\|·\|m12\|` | 1e-13 | 1,87e-14; 1,89e-14; 2,36e-14 | 1,87e-14; 1,89e-14; 2,12e-14 |
| Geod3Test m12/M12/M21 (mutlak) | 1e-11 | 3,00e-14; 3,93e-14; 6,88e-14 | 3,00e-14; 4,31e-14; 6,88e-14 |

Geod3Test sonuçları ve ilk koşuda bulunan iki cut-locus satırı
[TRIAXIAL_VALIDATION.md](TRIAXIAL_VALIDATION.md) "Hold-out sonuçları"
bölümündedir.

GeodTest ölçümü 17 Kasım 2026'da yapıldı (500.000 satır, referans
GeographicLib 2.7 `GeodSolve`; `validate-geodtest.mjs` son satırı
`PASS: all limits met`). Her blokta ve her ölçütte iki dil de sınırın
altındadır. Tabanı aşan bütün değerler referansın aynı bloktaki hatası
düzeyindedir, çoğu aynı satırda ve aynı değerdedir: yakın tepe bloğunda
(satır 450000–499999) ters a12 ve m12'nin en büyüğü JavaScript'te de
`GeodSolve`'da da satır 459433'te 1,36e-10° ve 4,54e-5 m'dir. Bu blok a12 ≈
180 − 1e-7° olan neredeyse antipodal çiftlerden oluşur; ters a12, m12 ve S12
orada girdinin son bitlerine karşı kötü koşulludur.

`geodtest-sample.csv` (1000 satır) üzerindeki hold-out testi
(`holdout.test.mjs`, `HoldoutTest.java`) ilk koşuda yakın tepe bloğunun 100
örnek satırının 68'inde ters a12 (en çok 1,75e-11°), 85'inde ters m12 (en çok
5,83e-6 m) için kaldı (JavaScript 153, Java 155 kontrol). Test yalnız
tabanları (a12 1e-7 m / (a · 1°) ≈ 8,98e-13°, m12 1e-7 m) uyguluyordu,
yukarıdaki kuralın "2 × referans" terimini uygulamıyordu. `GeodSolve` aynı
örnek satırlarda tabanları aynı en büyük değerlerle aşar. Test, kuralı blok
başına `GeodSolve` en büyükleriyle (`REFERENCE_INVERSE`; yakın tepe değerleri
en kötü satırda yeniden hesaplandı: 1,3617e-10°, 4,537e-5 m) uygulayacak
şekilde düzeltildi. Tabanlar değişmedi; yalnız yakın tepe bloğunda ters a12
ve m12 sınırı tabanın üstüne çıkar (2,72e-10°, 9,07e-5 m). Doğrudan a12 ve
m12 için `GeodSolve` en büyükleri (8,53e-14°, 8,40e-9 m) her blokta tabanın
yarısının altındadır; o sınırlar değişmez.

### Geliştirme kanıtı (GeodSolve, kendi girdilerimiz)

Kendi rastgele girdilerimizde (tohum 20261115, kategori başına 2000 satır;
WGS 84, küre, f = 1/150, 1/50, −1/150, −1/50) çekirdek ile `GeodSolve` farkı,
`GeodSolve` ile `GeodSolve -E` (tam hassasiyet) farkıyla aynı düzeydedir: s12
≤ 7,5e-9 m, a12 ≤ 8,5e-14°, m12 ≤ 8,2e-9 m, M12/M21 ≤ 1,4e-14, doğrudan S12
≤ 0,45 m².

Bu çalışma sırasında JavaScript ters çözücüsünün GeographicLib C++ 2.7'den iki
noktada ayrıldığı bulundu ve düzeltildi (Newton bracket kuralı `numit > maxit1`
ve prolate InverseStart'ta `lam12x / lamscale`): ekvatora çok yakın prolate
çizgilerde mesafe hatası 9,5 cm'den (f = −1/50) 3,7e-9 m'ye indi. Java zaten
C++ ile aynıydı. Java `Geodesic.direct` azimutu `((x % 360) + 360) % 360` ile
1 ulp yuvarlıyordu; artık ham değeri motora verir (doğrudan S12 farkı
0,40 m²'den 0,047 m²'ye indi).

### Bilinen risk: antipoda yakın S12

Antipoda yakın ters problemde S12 kötü koşulludur: uç nokta gürültüsü ε (~1e-9 m)
alp1'i ε/|m12| kadar, S12'yi yaklaşık 2c²ε/|m12| kadar oynatır. Kendi
girdilerimizde WGS 84 antipoda yakın blokta çekirdek−GeodSolve farkı 70 m²,
GeodSolve−GeodSolve -E farkı 7,3 m² ölçüldü; kürede m12 = 0,07 m iken 2e5 m²
oldu. Neden, V8/JVM ile Apple libm arasındaki son bit farklarının 1/|m12| ile
büyümesidir. Bu, GeodTest antipodal bloğunda S12 eşiği (2 × GeodSolve
maksimumu) için bir risktir; eşik değiştirilmedi.

### Raporlanan belirsizlik (azimut ve S12)

Bu kötü koşulluluk artık sonuçta raporlanır: her ters sonuç
`bearingUncertaintyDegrees = min(180°, max(1e-11°, 1e-7 m / |m12|))` ve
`areaUncertaintySquareMetres = rad(bearingUncertaintyDegrees) ·
min(2 c², s12² / 2) + 1e-14 c²` taşır (azimut tanımsızken ikisi de `null`).
1e-7 m, sözleşmenin `|Δazi|·|m12|` toleransıdır. Alan sınırı, başlangıçta
bu kadar dönen iki geodezik arasında kalan alandır: dönme açısı çarpı
`∫ m(t) dt`; elipsoitte `m(t) ≤ t` olduğundan bu en çok `s12² / 2`, yarım
meridyen boyunca yaklaşık `2 c²`. İlk sürüm her çizgide `2 c²` kullanıyordu;
bu, kısa çizgilerde gerçek hatanın yaklaşık bir milyon katıydı (GeodTest
short bloğunda en büyük `|ΔS12|/sınır` 1,4e-6) ve 5 km'lik her ölçümde S12'yi
gereksiz yere kaba gösterirdi. 17 Kasım 2026'da tam GeodTest setinde
(JavaScript, belirsiz rota olan 3 satır hariç) ölçülen değerler sınırın
altındadır:

| Blok | en büyük `\|Δazi\|·\|m12\|` (m) | en büyük `\|ΔS12\|·\|m12\|/c²` (m) | `\|m12\|` > 100 km iken en büyük `\|ΔS12\|` (m²) | en büyük `\|ΔS12\|` / alan sınırı |
|---|---:|---:|---:|---:|
| random | 1,27e-8 | 7,38e-9 | 0,82 | 4,6e-2 |
| antipodal | 2,87e-9 | 5,49e-9 | 1,86 | 2,7e-2 |
| short | 2,67e-9 | 2,71e-13 | — | 3,9e-2 |
| one-pole | 1,27e-8 | 7,81e-9 | 0,27 | 7,3e-2 |
| opposite-poles | 1,53e-9 | 3,06e-9 | — | 1,5e-2 |
| meridional | 1,27e-8 | 7,19e-9 | 0,97 | 6,9e-2 |
| equatorial | 0 | 1,96e-12 | 6,4e-4 | 9,6e-6 |
| vertex-to-vertex | 9,1e-19 | 1,8e-18 | — | 4,2e-6 |
| near-vertex | 1,00e-8 | 2,00e-8 | — | 8,3e-2 |

Son sütun, sıradan hatlarda da S12'nin 0,1 m² basamağının anlamlı
olmadığını gösterir (GeodSolve'un kendi farkları da bu düzeydedir); tanıtım
uygulaması S12'yi bu yüzden belirsizliğiyle birlikte gösterir. Satır satır
denetim `geodesic-wgs84.csv`, `geodesic-ellipsoids.csv` (her iki dilde) ve
`geodtest-sample.csv` (hold-out) üzerinde testlerdedir.

## Kaynaklar

- [Karney, "Algorithms for geodesics", J. Geodesy 87:43–55, 2013](https://doi.org/10.1007/s00190-012-0578-z)
- [GeographicLib geodesic documentation](https://geographiclib.sourceforge.io/C%2B%2B/doc/geodesic.html)
- [GeodTest DOI arşivi](https://doi.org/10.5281/zenodo.32156)
- [Geod3Test DOI arşivi](https://doi.org/10.5281/zenodo.12510796)
