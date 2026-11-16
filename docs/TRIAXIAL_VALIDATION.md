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
- **Ters problem (en kısa rota).** P1'den eşit aralıklı azimut yelpazesiyle
  geodezikler `π a` uzunluğuna (bir yüzey çapı üst sınırı) kadar izlenir; her
  ışında P2'ye en yakın geçişler (`(P2 − X)·V = 0`) bulunur. Azimut yönünde
  yerel en küçük kaçırma mesafeleri, `(α, s)` üzerinde Newton yöntemine başlangıç
  olur: `Δs = r·V`, `Δα = r·W / m`, burada `W` azimut değişiminin Jacobi
  alanının birim yönüdür. Yakınsayan çözümlerin en kısası döndürülür.
- **Bilinen sınır.** Yelpaze ayrıklığı nedeniyle çok yakın iki çözüm
  (eşlenik noktaya yakın durumlar) birleşebilir; bunun ölçümü aşama 3
  testlerindedir. Tam umbilik–karşı umbilik çiftinde sonsuz sayıda en kısa
  geodezik vardır; döndürülen biri onlardan biridir.

## API

JavaScript (`@convert-tools/core` ve `@convert-tools/core/geodesy`):
`inverseTriaxialGeodesic(start, end, { ellipsoid: { a, b, c } })` →
`distance`, `initialAzimuthDegrees`, `finalAzimuthDegrees` ([0, 360); çakışık
noktalarda `null`), `reducedLength`, `geodesicScale12`, `geodesicScale21`;
`directTriaxialGeodesic(start, azimuthDegrees, distance, { ellipsoid })` →
`beta`, `omega`, `finalAzimuthDegrees`, `reducedLength`, `geodesicScale12`,
`geodesicScale21`; `triaxialToCartesian`, `cartesianToTriaxial` (yüzey dışındaki
nokta merkezden geçen doğru üzerinde yüzeye taşınır). Noktalar `{ beta, omega }`
derece (β −90..90, ω −180..180). Java: `TriaxialGeodesic.inverse`, `direct`,
`toCartesian`, `fromCartesian`; kayıtlar `Axes`, `Point`, `Cartesian`,
`InverseResult`, `DirectResult`. Hatalar mevcut kodlarla verilir:
`INVALID_ARGUMENT` (yarı eksenler, negatif uzunluk, merkez noktası),
`INVALID_NUMBER`, `LATITUDE_OUT_OF_RANGE` (β), `LONGITUDE_OUT_OF_RANGE` (ω),
`NO_CONVERGENCE` (ters problemde hiçbir Newton başlangıcı yakınsamazsa). Yeni
hata kodu yoktur.

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
- **Hız.** Ters problem satır başına yaklaşık 45 ms (JS); tam Geod3Test
  (500.000 satır) bu yüzden çok çekirdekle çalıştırılır
  (`validate-geod3test.mjs` worker thread'leri, `Geod3TestFullSet` paralel
  akış).
- **Risk.** Yakın umbilik satırlarda bizim mesafe farkımız 7e-14'e kadar
  çıktı; taban 1e-13'e yakındır. Geod3Solve bu blokta 1e-11 düzeyinde
  hatalı olduğundan "2 × referans" kuralı orada daha geniştir; genel blokta
  taban 1e-13 geçerlidir.

## Hold-out sonuçları

Geod3Test (DOI 10.5281/zenodo.12510796) bu geliştirme sırasında kullanılmadı.
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
| Ters mesafe, doğrudan konum, `\|Δα1\|·\|m12\|` | 1e-13 | ölçülmedi (hold-out) | ölçülmedi (hold-out) |
| m12, M12, M21 (mutlak) | 1e-11 | ölçülmedi (hold-out) | ölçülmedi (hold-out) |

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
