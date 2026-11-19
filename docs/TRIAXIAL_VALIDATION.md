# Üç eksenli elipsoitte geodezik: tasarım ve doğrulama

Bu belge `packages/core-js/src/geodesy/triaxial/` modülünün (ve Java karşılığı
`TriaxialGeodesic`) yöntemini, gerekçesini ve geliştirme kanıtını anlatır.
Elipsoit `X²/a² + Y²/b² + Z²/c² = 1`, `a ≥ b ≥ c > 0`; konumlar elipsoidal enlem
β ve boylam ω (Karney, "Jacobi's solution for geodesics on a triaxial
ellipsoid", 2025/2026, bölüm 2), azimut α sabit-ω çizgisinden saat yönünde.

## Aşama 0 — karar

İki yol değerlendirildi:

1. **Jacobi çözümünün GeographicLib'deki uygulamasının (Geodesic3,
   GeodesicLine3, Trigfun) birebir portu.** Doğruluğu kanıtlanmış ve hızlı;
   ancak binlerce satırlık uyarlanabilir Fourier/Chebyshev açılımı, umbilik
   ve daire çizgileri için ayrı dallar içerir. Bu işin kalan bütçesinde tam ve
   denetlenmiş bir port mümkün değil; yarım port, tam porttan daha risklidir.
2. **Kartezyen koordinatlarda geodezik ve Jacobi denklemlerinin sayısal
   integrasyonu** ve en kısa rota için açıkça tanımlı bir arama. Seçilen budur.

Ölçütler sırasıyla: yöntemin doğruluğu, umbilik noktalarda ve asal elipslerde
sağlamlık, çift hassasiyete yakın doğruluk, kod boyu.

- **Doğruluk ve sağlamlık.** Kartezyen denklemler (`R'' = −κ n`,
  `n = (X/a², Y/b², Z/c²)`, `κ = (Vx²/a² + Vy²/b² + Vz²/c²)/|n|²`) yüzeyin her
  noktasında düzgündür; umbilik noktalar ve asal elipsler denklem için özel
  değildir, yalnız (β, ω, α) dönüşümü için özeldir. Bu dönüşüm GeographicLib
  `Ellipsoid3` kodunun (umbilik ve kutup kuralları dahil) portudur.
- **m12, M12, M21.** Jacobi denklemi `m'' + K m = 0`,
  `K = 1 / (a² b² c² |n|⁴)` (Gauss eğriliği) aynı integrasyonda çözülür:
  `m(0) = 0, m'(0) = 1` çözümünden `m12 = m(s)`, `M21 = m'(s)`;
  `M(0) = 1, M'(0) = 0` çözümünden `M12 = M(s)` (Karney 2013'teki tanımlar).
- **İntegratör.** Gragg–Bulirsch–Stoer (değiştirilmiş orta nokta kuralı +
  h²'de Richardson ekstrapolasyonu); adım uzunluğu en küçük eğrilik yarıçapı
  `c²/a` ile ölçeklenir, ekstrapolasyon tablosu yakınsayana kadar derinleşir.
  Son konum yüzeye, hız teğet düzleme izdüşürülür. Uzunluklar içeride `b = 1`
  birimine ölçeklenir.
- **Ters problem (en kısa rota).** P1'den 180 ışınlık eşit aralıklı azimut
  yelpazesiyle (umbilik başlangıçta 180°'lik aralıkta) geodezikler `π a`
  uzunluğuna (bir yüzey çapı üst sınırı) kadar izlenir; her ışında P2'ye en
  yakın geçişler (`(P2 − X)·V = 0`) bulunur. Yelpaze yalnızca Newton'a başlangıç
  verdiği için ucuz bir integratörle izlenir: `u.step/2` sabit adımlı
  dördüncü mertebe Runge–Kutta (konum hatası CAYLEY'de yaklaşık 2e-4 b), geçiş
  noktası 1e-9 düzeyinde bulunur. Her geçiş, P2'nin hattın hangi yanında
  kaldığını da (`(P2 − X)·(n × V)` işareti) kaydeder. Newton başlangıçları:
  1. komşu ışınlara göre kaçırma mesafesinin yerel en küçükleri;
  2. her en küçüğün hücresi ve iki yanındaki ikişer hücre üzerinde 16 aralıklı
     inceltme yelpazesinin (aralık 0,25°) yerel en küçükleri ve işaret
     değişimleri;
  3. hiçbir inceltme yelpazesinin örtmediği, komşu iki kaba ışın arasındaki
     işaret değişimleri: P2 iki hattın arasında kalır, aradaki bir hat P2'den
     geçer. Bu başlangıç kaustik yakınındaki (m12 ≈ 0) çiftler içindir; orada
     kaçırma mesafesi geniş bir azimut aralığında küçüktür ve yerel en küçüğü
     P2'den geçen hattan birkaç hücre uzakta kalabilir. Bulunan örnek (CAYLEY,
     tohum 31'li sentetik set): `(50.862682105, 9.729093444) →
     (−50.864195166783205, 159.053383641444498)`; kaçırmanın en küçüğü 88°'de,
     doğru hat 93,18°'de; bu başlangıç yokken çözücü 0,6 b daha uzun bir hat
     döndürüyordu. Sözleşme vektörü `triaxial-caustic.csv` bu çifti, elipsoidin
     ayna simetrileri altındaki görüntülerini ve noktaları yer değiştirilmiş
     hallerini taşır (16 satır, `Geod3Solve -i -p 15`; eski arama 16'sında da
     0,6 b uzun hat veriyordu).
  4. birbirinden en çok iki kaba ışın aralığı (4°) uzak, azimutları 1e-6°'den
     fazla farklı her iki yakınsamış çözümden birinin öbürüne göre yansıması
     (`2 α_b − α_a`, uzunluk `s_a`, azimut adımı `|α_a − α_b|`). 1. noktanın
     cut locus'unda (β2 = −β1) eşlenik noktaya yakın çiftlerde iki eş uzunlukta
     en kısa hat (α ve 180 − α) ile aralarında biraz daha uzun üçüncü bir hat
     0,5°'den dar bir aralıktan çıkar; inceltme yelpazesi bunlardan ikisini
     bulup üçüncüsünü kaçırabiliyordu. Ortadaki hat ile bir dış hat bulunmuşsa
     öbür dış hat yansımadadır. Bulunan örnekler Geod3Test hold-out koşusunun
     iki satırıdır (497448: `(−32, 102) → (32, −155)`, en kısa hatlar 89,7903° ve
     90,2097°, ortadaki 90,00016° ve 8,6e-11 b daha uzun; 497603:
     `(−55, −60) → (55, 44)`); `ambiguous` `false` dönüyordu. Sözleşme vektörü
     `triaxial-cut-locus.csv` iki çifti 16'şar simetrik biçimiyle taşır (32
     satır; eski arama 32'sinin hiçbirinde `ambiguous` vermiyordu).

  Newton `(α, s)` üzerinde çalışır: `Δs = r·V`, `Δα = r·W / m`, burada `W`
  azimut değişiminin Jacobi alanının birim yönüdür; azimut adımı başlangıcın
  yelpaze aralığıyla sınırlıdır. İlk aşama ucuz integratörle (`u.step/4` sabit
  adımlı RK4, hata yaklaşık 1e-5 b) kaçırma 1e-4 b'nin altına inene kadar
  sürer; inemeyen başlangıç bırakılır. İkinci aşama doğru integratörle (GBS)
  kaçırma `1e-14 · a`'nın altına inene ya da üç yinelemede küçülmez olana kadar
  sürer. Her aşamanın en çok 40 yinelemesi vardır. Kaçırması 1e-12'nin altında
  kalan çözümlerin en kısası döndürülür (eş uzunlukta çözümler arasındaki
  seçim için "Eş uzunlukta jeodezikler ve umbilik yön kuralları" bölümüne
  bakın).
- **Bilinen sınır.** Yelpaze ayrıklığı nedeniyle çok yakın iki çözüm
  (eşlenik noktaya yakın durumlar) birleşebilir; inceltme yelpazesi ve işaret
  değişimi başlangıçları bunun içindir. `find-triaxial-misses.mjs` 20.000
  çiftte (tohum 1) 1440 ışınlık bir aramaya göre kaçırılmış daha kısa bir hat
  bulmadı (17 Kasım 2026). Tam umbilik–karşı umbilik çiftinde sonsuz sayıda en
  kısa geodezik vardır; döndürülen biri onlardan biridir.

## API

JavaScript (`@omcoskun/convert-tools` ve `@omcoskun/convert-tools/geodesy`):
`inverseTriaxialGeodesic(start, end, { ellipsoid: { a, b, c } })` →
`distance`, `initialAzimuthDegrees`, `finalAzimuthDegrees` ([0, 360); çakışık
noktalarda `null`), `reducedLength`, `geodesicScale12`, `geodesicScale21`,
`ambiguous` (bkz. "Eş uzunlukta jeodezikler ve umbilik yön kuralları");
`directTriaxialGeodesic(start, azimuthDegrees, distance, { ellipsoid })` →
`beta`, `omega`, `finalAzimuthDegrees`, `reducedLength`, `geodesicScale12`,
`geodesicScale21`; `triaxialToCartesian`, `cartesianToTriaxial` (yüzey dışındaki
nokta merkezden geçen doğru üzerinde yüzeye taşınır). Noktalar `{ beta, omega }`
derece (β −90..90, ω −180..180). Java: `TriaxialGeodesic.inverse`, `direct`,
`toCartesian`, `fromCartesian`; kayıtlar `Axes`, `Point`, `Cartesian`,
`InverseResult`, `DirectResult`. Hatalar mevcut kodlarla verilir:
`INVALID_ARGUMENT` (yarı eksenler, negatif uzunluk, merkez noktası),
`INVALID_NUMBER`, `LATITUDE_OUT_OF_RANGE` (β), `LONGITUDE_OUT_OF_RANGE` (ω),
`NO_CONVERGENCE` (ters problemde hiçbir Newton başlangıcı yakınsamazsa),
`INPUT_LIMIT_EXCEEDED` (aşağıdaki "Sınırlar"). Yeni hata kodu yoktur.

### Sınırlar

Jeodezik çözücüler iki sınır koyar; ikisi de `INPUT_LIMIT_EXCEEDED` verir ve
`contracts/error-cases.csv` ile iki çekirdekte sınanır (19 Kasım 2026):

- **Eksen oranı a/c ≤ 10** (ters ve doğrudan; Kartezyen dönüşümler her şekli
  kabul eder). Ters problemin işi yaklaşık (a/c)² ile büyür: a/c = 10'da genel
  çiftler 0,2–0,8 s, a = 10¹²'de hiç bitmiyordu. Hazır elipsoitler ve sözleşme
  vektörleri en çok 2 kullanır; bilinen gök cisimleri 4'ün altındadır.
- **Doğrudan uzunluk ≤ 20 000 makro adım** (adım 0,4 c²/a): Cayley'de ≈ 2828
  birim (≈ 450 tur), Dünya üç eksenlisinde ≈ 5,07 × 10¹⁰ m (≈ 1260 tur). En
  uzun hat 0,3–0,6 s sürer.

Adım kabul ölçütü (`STEP_TOLERANCE` = 2e-15) 1'den büyük değerlerde değerin
büyüklüğüne göredir. Mutlak ölçütte uzun hatlarda büyüyen Jacobi değerleri
(|m| ≳ 9) bu hassasiyeti kayan noktada hiç tutturamıyor, her adım `MAX_SPLIT`
derinliğine (4096 parça) bölünüyordu: Cayley'de 100 birimlik hat 3,9 s sürüyor,
1000 birimlik hat bitmiyordu; şimdi 9 ms (Java'da 2877 ms'den 6 ms'ye). Tam
Geod3Test (500 000 satır) bu değişiklikten sonra 19 Kasım'da iki dilde yeniden
koşuldu: 0 başarısız satır, 701 alternatif, iki dilde farklı yargılanan satır
0; Java 147 s. En büyük farklar iki dilde aynı: ters mesafe 1,87e-14,
`|Δα1|·|m12|` 2,60e-14, doğrudan konum 1,88e-14, m12 3,49e-14, M12 4,40e-14,
M21 6,39e-14 (aşağıdaki 17 Kasım tablosunda JavaScript sırasıyla 1,87e-14 /
2,36e-14 / 1,89e-14 / 3,00e-14 / 3,93e-14 / 6,88e-14).

Bilinen yavaş durum: b = c (prolate) bir elipsoitte karşıt noktalar arasında
sonsuz sayıda en kısa jeodezik vardır (`ambiguous: true`); ters çözüm bu
çiftlerde, oran küçük olsa da, 7–9 s (a/c = 10'da ≈ 25 s) sürer. Bu, sınırlardan
önce de böyleydi.

## Geliştirme kanıtı

Tüm sayılar bu çalışmada çalıştırılan komutlardan; birim `b`.

- **Sözleşme vektörleri** (`contracts/test-vectors/triaxial-inverse.csv`, 70
  satır; `triaxial-direct.csv`, 80 satır; `Geod3Solve -p 15`, beş elipsoit:
  Cayley (√2, 1, 1/√2), Dünya benzeri (6378172, 6378102, 6356752), hafif üç
  eksenli (1,2; 1,1; 1), oblate (a = b) ve prolate (b = c); rastgele, yakın
  antipodal, asal elips, umbilik başlangıç/bitiş, yakın umbilik, kısa).
  Tolerans tek tip `1e-10 · b`. Ölçülen (JS ve Java aynı): ters mesafe en çok
  1,2e-11 (`MILD-near-umbilic-12`), `|Δα1|·|m12|` 7,6e-12, doğrudan konum
  4,1e-14.
- **Yakın umbilik.** Bu satırlarda yanlış taraf Geod3Solve'dur: Geod3Solve'un
  kendi ters cevabı kendi doğrudan çözümüyle P2'yi 2,1e-11 ıskalar, bizimki
  3,3e-14; bizim cevabımızı Geod3Solve'un doğrudan çözümüne verince ıskalama
  6,7e-12 olur.
- **Tam antipodlar** (β2 = −β1, ω2 = ω1 + 180). Geod3Solve `-i` bazı
  satırlarda negatif s12 ya da P2'ye ulaşmayan bir hat verir (bizim doğrudan
  çözümümüzle ıskalama 0,4 b ve 5,9e-4 b). Geçerli olduğu her satırda bizim
  cevabımızla 1e-14 düzeyinde aynıdır. Bu yüzden vektör dosyalarında tam antipod
  yoktur.
- **Geod3Solve ile rastgele karşılaştırma** (kendi tohumlu girdilerimiz):
  doğrudan ≤ 5e-14; ters, Cayley'de rastgele 3,7e-14, antipoda ±1°/±2° 4,1e-14,
  asal elips 2,0e-14, umbilik 3,5e-14, kısa 7,9e-16; Dünya benzeri ve hafif
  elipsoitte ≤ 3,9e-14.
- **Özellikler** (`triaxial-geodesic.test.mjs`, `TriaxialGeodesicTest`): ters
  problemde simetri (s12 1e-13, m12 1e-12, M12 = ters yönün M21'i 1e-12),
  ters → doğrudan kapanış 1e-13; m12 = |∂R2/∂α1| ve M21 = ∂m12/∂s sonlu
  farklarla; iki eksenli sınırlarda iki eksenli çözücüyle, rastgele ve yakın
  antipodal çiftlerde (s12 ≈ 20.000 km, M12 ≈ −1): oblate a = b (β parametrik
  enlem, tan φ = (a/c) tan β) mesafe, azimut, m12, M12, M21 farkı ≤ 3e-14
  (bağıl); prolate b = c (simetri ekseni X: parametrik enlem 90 − |ω|, boylam
  ω > 0 iken β, ω < 0 iken 180 − β, azimut ±90° döner) yakın antipodal
  çiftlerde mesafe farkı ≤ 2,1e-14 (bağıl), test sınırı 1e-13;
  kürede büyük çember kapalı formları ≤ 1,2e-14.
- **Hız.** `node contracts/tools/bench-triaxial-inverse.mjs --count 1000
  --seed 9` (CAYLEY, iki nokta da kürede düzgün dağılımlı, JS, tek çekirdek):
  ters problem ortanca 4,1 ms, p95 10,4 ms; ucuz yelpaze ve iki aşamalı
  Newton'dan önce ortanca 104 ms, p95 175 ms (17 Kasım 2026). Aynı 1000 çiftte
  `s12` farkı en çok 1,0e-14 b, `α₁` farkı 3,0e-12°. Rastgele 200'er çiftte
  ortalama: Dünya benzeri 1,2 ms, hafif üç eksenli 1,7 ms, oblate 1,3 ms,
  prolate 2,0 ms, (3, 2, 1) 14 ms, (1; 0,9; 0,3) 19 ms; eski sonuçlarla fark
  her birinde ≤ 1,6e-14 b. Tam Geod3Test (500.000 satır) yine çok çekirdekle
  çalıştırılır (`validate-geod3test.mjs` worker thread'leri,
  `Geod3TestFullSet` paralel akış). JavaScript ve Java bit düzeyinde aynı
  değildir (trigonometrik fonksiyonlar farklıdır): tohum 31'li 3000 satırlık
  sentetik sette `s12` bağıl farkı en çok 1,3e-14, her satırın yargısı iki
  dilde aynı.
- **Risk.** Yakın umbilik satırlarda bizim mesafe farkımız 7e-14'e kadar
  çıktı; taban 1e-13'e yakındır. Geod3Solve bu blokta 1e-11 düzeyinde
  hatalı olduğundan "2 × referans" kuralı orada daha geniştir; genel blokta
  taban 1e-13 geçerlidir.

## Eş uzunlukta jeodezikler ve umbilik yön kuralları

Bazı nokta çiftlerinde aynı uzunlukta birden çok en kısa jeodezik vardır;
umbilik bir noktada da bir yönün iki azimut etiketi (α ve α + 180) bulunur.
Kütüphane böyle durumlarda doğru bir cevap verir, ama GeographicLib'in
(`Geod3Solve`) seçtiği cevabı her zaman vermez ve cevabın tek olmadığını
söylemez. Aşağıdaki kurallar `Geod3Solve` 2.7'ye karşı CAYLEY, MILD ve EARTH3
elipsoitlerinde 16 Kasım 2026'da ölçüldü ve her örnekle uyuştu (R0 hariç; R0
17 Kasım 2026'da eklendi). R0 en iyi çözümü seçer; R1–R3 ondan sonra
`solveTriaxialInverse` içinde, bu sırayla uygulanır;
açılar motorda `[sin, cos]` çiftleridir ve `alp1`, `alp2` döndürülen
azimutlardır.

Tanımlar: `umb1`, elipsoidin umbilik noktası varsa ve 1. nokta umbilikse
(`cos β₁ = 0` ve `sin ω₁ = 0`) doğrudur; `umb2` 2. nokta için aynıdır.
`onPlane(β, ω)`, nokta `y = 0` düzlemindeyse (`cos β = 0` veya `sin ω = 0`)
doğrudur. `side(ω)`, `sin ω < 0` ise −1, değilse +1'dir. `opposite`, `umb1` ve
`umb2` iken noktaların antipodal umbilikler olmasıdır
(`sin β₂ = −sin β₁` ve `cos ω₂ = −cos ω₁`).

- **R0 (eş uzunlukta hatlar arasında seçim).** Yakınsamış çözümlerin en
  kısasından uzunluğu en çok 1e-13 (b birimi) farklı ve azimutu 1e-6°'den
  fazla farklı çözümler arasından `cos α₁`'i 1e-9'dan fazla büyük olan,
  kosinüsler 1e-9 içinde eşitse `sin α₁`'i büyük olan seçilir; `umb1` ya da
  `umb2` iken en kısa çözüm kalır. Bu kural GeographicLib'in seçimini
  taklit etmez: cut-locus çiftlerinde `Geod3Solve`'un ve Geod3Test'in seçimi
  β, ω işaretleriyle ya da `α₁`'in kosinüs/sinüsüyle açıklanamadı ve ikisi
  aynı satırda farklı hatlar verebilir. Amacı JavaScript ile Java'nın
  yuvarlamadan bağımsız olarak aynı hattı döndürmesidir (önceden
  Geod3Test'in 120 satırında farklıydı). Bu satırlarda `ambiguous` (aşağıdaki
  3. koşul) `true`'dur.
- **R1 (iki nokta da β = 0 elipsinde).** `sin β₁ = sin β₂ = 0` ve
  `cos α₁ > 0` ise `α₁` ve `α₂`'nin kosinüsü negatife çevrilir (z = 0
  düzlemindeki yansıma); `s12`, `m12`, `M12`, `M21` değişmez. GeographicLib
  her zaman negatif β'ya doğru yola çıkar.
- **R2 (umbilik başlangıç).** `umb1`, `opposite` değil, 2. nokta `y = 0`
  düzleminde ve `|cos α₁| ≤ 1e-9` ise
  `α₁ = [sign(cos ω₁) · side(ω₂), 0]` olur.
- **R3 (umbilik bitiş).** `umb2`, `opposite` değil, 1. nokta `y = 0`
  düzleminde ve `|cos α₂| ≤ 1e-9` ise `α₂ = [sign(cos ω₂), 0]` (`umb1` iken)
  ya da `α₂ = [−sign(cos ω₂) · side(ω₁), 0]` olur.

Ters problem sonucundaki `ambiguous` alanı, aşağıdakilerden en az biri
doğruysa `true`, değilse `false`'dur:

1. R1'in noktalar için koşulu sağlanıyor ve `|cos α₁| > 1e-9` (jeodezik
   düzlemden ayrılıyor; ayna görüntüsü de aynı uzunlukta);
2. `opposite` (umbilikten her yön, karşı umbilike aynı uzunlukta varır);
3. yakınsayan Newton çözümleri arasında, en iyiden uzunluğu en çok 1e-13
   (b birimi) farklı ve başlangıç azimutu 1e-6 dereceden fazla farklı (360
   modunda; 1. nokta umbilikse 180 modunda) başka bir çözüm var. Eşik 1e-9°
   iken kısa ya da eşleniğe yakın hatlarda aynı hatta yakınsayan iki Newton
   çözümünün azimutları 1e-8° düzeyinde ayrılıp yanlışlıkla `true` veriyordu
   (tohum 31'li sentetik sette `s12 = 2e-4` olan satır).

Çakışık noktalarda (`s12 = 0`) `ambiguous` daima `false`'dur.

Ölçülen örnekler (CAYLEY; `Geod3Solve` α₁, α₂): `(0, 58.974796) →
(0, −43.642967)`: −119.768981, −56.063741 (R1). `(90, 180) → (20, 0)`:
−90, −180; `(−90, 0) → (20, 180)`: 90, 0; `(90, 0) → (90, −163.205108)`:
−90, −90 (R2). `(20, 0) → (90, 0)`: 0, −90; `(20, 180) → (90, 180)`: 0, 90;
`(−90, −50.908837) → (90, 0)`: 90, 90; `(90, 0) → (−90, 0)`: 180, 90 (R3).

Sözleşme vektörleri `contracts/test-vectors/triaxial-conventions.csv`
dosyasındadır (212 satır, `Geod3Solve -i -t a b c -p 15`; 15 satırda
`ambiguous = 1`): β = 0 elipsinde 40 CAYLEY ve 20 MILD çifti, umbilik
başlangıç/bitiş çiftleri, antipodal olmayan umbilik çiftleri ve umbilikten
küreye rastgele çiftler.

## Hold-out sonuçları

Geod3Test (DOI 10.5281/zenodo.12510796) bu geliştirme sırasında kullanılmadı.
Test aşaması bittiği için `holdout.txt` artık `enabled`: 1000 satırlık
`geod3test-sample.csv` her push'ta iki dilde denetlenir; tam set
`.github/workflows/full-validation.yml` ile elle tetiklenerek çalışır.
`Geod3TestFullSet <veri> <satırlar.tsv>` her satırın çıktısını
(`row s12 alp1 alp2 ambiguous closure x y z m12 M12 M21`) dosyaya yazar ve
hiçbir şeyi yargılamaz; satırları
`contracts/tools/validate-geod3test.mjs --java-rows <satırlar.tsv>`
JavaScript satırlarıyla aynı kodla yargılar. Bloklar satırın uç
noktalarından türetilir (umbilik, asal elips, yakın umbilik, genel); aynı
nokta çifti birden çok kez listelenmişse ters cevap en iyi eşleşen satıra
göre değerlendirilir.

| Ölçüt | Taban | JavaScript | Java |
|---|---:|---|---|
| Ters mesafe | 1e-13 | 1,87e-14 | 1,87e-14 |
| Doğrudan konum | 1e-13 | 1,89e-14 | 1,89e-14 |
| `\|Δα1\|·\|m12\|` | 1e-13 | 2,36e-14 | 2,12e-14 |
| m12 | 1e-11 | 3,00e-14 | 3,00e-14 |
| M12 | 1e-11 | 3,93e-14 | 4,31e-14 |
| M21 | 1e-11 | 6,88e-14 | 6,88e-14 |
| Başarısız satır / alternatif | 0 | 0 / 701 | 0 / 701 |

Ölçüm 17 Kasım 2026, 500.000 satır, satır bazında kural (aşağıda); iki dilde
aynı karar (`rows judged differently in the two languages: 0`) ve aynı
başlangıç azimutu (1e-6°'den fazla farklı satır yok). Java 500.000 satırı
153 s'de çözdü. "Alternatif", çözücünün `ambiguous` bildirdiği, veri setinden
farklı ama aynı uzunlukta ve 2. noktada biten bir hat verdiği satırdır (β = 0
elipsinde 214, genel blokta 487). 19 Kasım'daki yeniden koşu (bağıl adım
ölçütü ve sınırlardan sonra) "Sınırlar" bölümündedir.

İlk koşuda iki dilde de 2 satır kaldı (497448 ve 497603, `|Δα1|·|m12|`
2,4e-7 ve 4,2e-6): 1. noktanın cut locus'unda (β2 = −β1), eşlenik noktaya
yakın çiftlerdi; çözücü iki eş uzun hattan birini ve aradaki biraz daha uzun
hattı bulup öbür en kısa hattı kaçırdı, `ambiguous` bildirmedi (yöntem, 4.
başlangıç). Ayrıca 120 satırda JavaScript ve Java farklı (ikisi de geçerli,
ikisi de `ambiguous`) eş uzun hatlar döndürdü; yuvarlama seçiyordu (R0 ile
giderildi). Düzeltmeden sonra tam küme yeniden koşuldu (yukarıdaki tablo). Düzeltme
hold-out sonucuna bakılarak yapıldığı için bu iki satır için yeniden koşu
artık kör değildir: kör ölçüm ilk koşudur (500.000 satırın 499.998'i
geçti).
Kör sentetik set (test aşamasının kendi tohumu, 20.000 satır, `Geod3Solve`
doğru kabul) düzeltmeden önce ve sonra iki dilde 0 başarısız satır verdi.
Hız değişmedi (CAYLEY'de 1000 rastgele çiftte ortanca 4,35 ms; sonuçlar eski
kodla en çok 7,4e-15 b farklı).

## Satır bazında doğrulama kuralı

`contracts/tools/validate-geod3test.mjs` her satırı veri setinin kendi değerlerine göre, sabit sınırlarla yargılar
(birim b = 1):

| Ölçü | Sınır |
|---|---|
| inv-distance: \|s12 − s12\*\| | 1e-13 |
| inv-azimuth: \|Δα1\| · \|m12\*\| | 1e-13 |
| dir-position: ileri çözümün ucunun (β2\*, ω2\*) noktasına Kartezyen uzaklığı | 1e-13 |
| m12, M12, M21 | 1e-11 |

Bir ölçüsü sınırı aşan ya da NaN olan satır başarısızdır. Tek istisna: ters çözüm başka bir azimut verir, ama uzunluk
tutar, bildirdiği doğru 2. noktada biter (kapanış ≤ 1e-13) ve çözücü `ambiguous` bildirirse satır "alternatif"
sayılır ve azimut ölçüsünden kalmaz. Kural `contracts/tools/lib/geod3-judge.mjs` içindedir; JavaScript ve Java
satırlarını aynı kod yargılar (`--rows-out`, `--java-rows`), başarısız ölçüler `--outliers` dosyasına yazılır.

`Geod3Solve` yalnızca bilgi amaçlı koşulur ve hiçbir kararı değiştirmez. GeographicLib 2.7'nin `Geod3Solve -i` aracı
Geod3Test'in 500.000 satırının 102'sinde `ERROR: Bad inputs Geodesic3::findroot` yazıp 1 koduyla çıkar, 756 satırda
da veri setinden 1e-9'dan fazla farklı (en çok 6,85 b) bir uzunluk verir (ölçüm: 15 Kasım 2026). Bu yüzden eski
"sınır = 2 × referans en büyüğü" kuralı kaldırıldı.

Hold-out verisi olmadan araçları denemek için sentetik dosya:

    node contracts/tools/make-geod3-synthetic.mjs 2000 7 /tmp/g3s.txt
    node contracts/tools/validate-geod3test.mjs /tmp/g3s.txt --synthetic \
      --reference "$(command -v Geod3Solve)" --rows-out /tmp/g3s-js.tsv --outliers /tmp/g3s-outliers.tsv

Sentetik dosyada doğru kabul edilen değer `Geod3Solve`'un ters çözümüdür. Kütüphanenin daha kısa bulduğu satır
referansın eksiğidir; daha uzun bulduğu satır kütüphane hatasıdır.
