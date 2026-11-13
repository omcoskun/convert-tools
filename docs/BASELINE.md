# Başlangıç durumu (yeniden düzenleme öncesi)

Kayıt tarihi: 13 Kasım 2026. Kaynak commit: `066afc3`.

Bu dosya, "önce kütüphane" yeniden düzenlemesine başlamadan önceki ölçülebilir
durumu saklar. Sonraki aşamalardaki iyileşmeler bu rakamlarla karşılaştırılır.

## Ortam

| Araç | Sürüm |
|---|---|
| Node.js | v26.11.1 |
| npm | 11.20.0 |
| javac / java | OpenJDK 21.0.11 (`--release 17` ile derlendi) |
| GeographicLib (`GeoConvert`, `GeodSolve`, `TransverseMercatorProj`) | 2.7 (Homebrew) |
| pnpm, Maven | kurulu değil |

## Testler

Çekirdek testleri `@convert-tools/core` adını çözemediği için çalışmıyordu
(pnpm workspace bağlantısı yoktu). Testler `packages/core-js/test/` altına
taşındı; Node'un paket öz-referansı (`exports` + `name`) sayesinde bağlantı
gerekmeden çalışırlar.

```bash
cd packages/core-js && node --test test/
```

Sonuç: 48 test, 48 geçti, 0 kaldı.

Java (Maven yerine CI'daki gibi `javac` ile):

```bash
mkdir -p build/java-contract
find packages/core-java/src/main/java packages/core-java/src/test/java -name '*.java' -print0 \
  | xargs -0 javac --release 17 -Xlint:all -Werror -d build/java-contract
java -ea -cp build/java-contract io.github.mertc0604.converttools.ContractTest contracts/test-vectors
java -ea -cp build/java-contract io.github.mertc0604.converttools.CoordinateContractTest contracts/test-vectors
```

Sonuç: `Java contract tests passed.` ve `Java coordinate contract tests passed.`

`tests/rendered-html.test.mjs` ve `tests/api.test.mjs` vite derlemesi ve pnpm
bağımlılıkları gerektirdiği için çalıştırılmadı.

## UTM ölçümü

Yöntem: zon 36 (merkez meridyen 33°D) için 80°G–84°K arası 1° adımlı enlem ve
merkez meridyenden ±6°'ye 0,125° adımlı boylam ızgarası. Referans:
GeographicLib `TransverseMercatorProj -l 33 -k 0.9996 -p 10` (Lee/Karney kesin
transverse Mercator). Karşılaştırılan: `utmForward(lat, lon, 36)` ve
`utmInverse(36, kuzey, E, N)`.

| Merkez meridyene uzaklık | İleri dönüşüm en büyük hata | Ters dönüşüm en büyük hata |
|---|---:|---:|
| ≤ 3° (standart zon) | 0,956 mm | 0,952 mm |
| 3°–4,5° | 1,572 mm | 1,436 mm |
| 4,5°–6° | 11,487 mm (0°, 27°D) | 4,780 mm |

Ters dönüşüm, eski kesik seriyi sayısal türevle kendi ileri dönüşümüne doğru
"düzeltiyordu"; bu yüzden gidiş-dönüş testi geçerken gerçek konuma göre hata
milimetre düzeyindeydi.

`contracts/test-vectors/coordinate-projections.csv` içindeki `utm_ankara`
satırı:

| Kaynak | Kuzey (m) |
|---|---:|
| Vektör dosyası | 4420370.8437769115 |
| `utmForward` çıktısı | 4420370.8437769115 (17 basamak aynı) |
| `GeoConvert -u -p 9` | 4420370.843637543 |

Fark 0,139 mm: vektör dosyasının bu satırı test edilen koddan üretilmiş.
