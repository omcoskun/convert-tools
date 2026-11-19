# convert-tools-map

[`@omcoskun/convert-tools`](https://github.com/omcoskun/convert-tools) kütüphanesinin
harita tanıtım sitesi. Site hesap yapmaz: gösterdiği her değer kütüphaneden
gelir. React 18, Webpack 5, MUI v5 ve MapLibre 6 ile yazılmıştır.

## Kurulum

Node.js 22.15 veya üstü ve npm gerekir.

Kütüphane GitHub Packages'tan gelir ve kurulum bir token ister. GitHub'da
`read:packages` yetkili bir classic kişisel erişim token'ı (PAT) oluşturun
ve `~/.npmrc` dosyanıza şu satırı ekleyin:

```text
//npm.pkg.github.com/:_authToken=<token>
```

Repodaki `.npmrc`, `@omcoskun` paketlerinin nereden geleceğini söyler; token
içermez ve token hiçbir zaman repoya girmez. Ardından:

```bash
npm ci --ignore-scripts
npm run dev
```

Site `http://localhost:3008/` adresinde açılır. macOS'ta `Baslat.command`
çift tıklamayla paketleri kurar ve siteyi açar.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | geliştirme sunucusu, `http://localhost:3008/` |
| `npm run build` | üretim derlemesi (`build/`) |
| `npm test` | lang/config uyumu, render ve sınır kuralları testleri |
| `npm run lint` | ESLint 9 |

## Yayımlanmamış bir kütüphane değişikliğini denemek

Kütüphane reposunda paketi bir dosyaya paketleyin ve haritada o dosyayı
kurun. Bu değişikliği commit etmeyin; `package.json` ve kilit dosyası
yayımlanmış sürümü göstermeye devam etmelidir.

```bash
cd ../convert-tools/packages/core-js && npm pack --pack-destination /tmp
cd - && npm install /tmp/omcoskun-convert-tools-<sürüm>.tgz
```

Geri dönmek için `git checkout package.json package-lock.json && npm ci --ignore-scripts`.

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

Ölçümlerin ayrıntıları kütüphane reposundadır:
[omcoskun/convert-tools](https://github.com/omcoskun/convert-tools).

## Site

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
- **Kütüphane çağrısı.** Her araç, sonucu üreten `@omcoskun/convert-tools`
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

- Bütün değerler `@omcoskun/convert-tools` kök girişinden gelir. Arayüzde hesap
  formülü yoktur; `test/boundaries.test.mjs` ve ESLint bunu denetler.
- `public/config.json` başlangıç değerlerini, örnekleri ve ön ayarları,
  `public/lang.json` Türkçe ve İngilizce metinleri ve hata kodlarının
  yerelleştirilmiş açıklamalarını tutar. İkisi açılışta okunur ve
  doğrulanır. Yayımlanmış bir derlemede yeniden derlemeden değiştirilebilirler.
  `test/lang.test.mjs` ve `config.test.mjs` anahtarların kodla ve
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
  importları yalnız `src/ui/index.js` üzerinden geçer; çatala geçmek o
  dosyayı ve `package.json`'u değiştirmek demektir.
- Tarayıcı tabanı: arayüz için MUI v5'in desteklediği Chrome 90, Edge 91,
  Firefox 78, Safari 14 ve iOS 12.5; çekirdek tek başına Chrome 67,
  Firefox 68 ve Safari 14'te çalışır (BigInt).
- Üretim derlemesi göreli URL kullanır (GitHub Pages alt yolunda da çalışır)
  ve Content-Security-Policy meta etiketi taşır.
- Harita, MapLibre GL JS 6 ile çizilen bir vektör haritasıdır: uzaktan
  bakınca küre, yakınlaşınca (12. düzeyden sonra) Web Mercator; 2D modu
  her ölçekte düz Web Mercator kullanır. Kürenin arkasındaki uzay siyahtır;
  yıldızlar yerel bir canvas'ta iki küçük, kendini tekrarlayan desene bir kez
  çizilir ve kamera dönünce, kuzeye-güneye kayınca ya da eğilince kürenin
  çok gerisindeymiş gibi kayar (kare başına üç dolgu; sürekli animasyon veya
  ek görsel isteği yoktur, "hareketi azalt" ayarında yerinde durur).
  Kürenin kenarında atmosfer efekti bulunur.
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
  "liberty"dir (gölgeli rölyef ile); "uydu" EOX Sentinel-2 cloudless 2025
  görüntüsüdür (CC BY-NC-SA 4.0: yalnız ticari olmayan kullanım; bu site
  ticari değildir. 2017 katmanında Avrupa dışındaki karalar veri olmadığı
  için beyazdır, 2025 katmanı tüm karaları kapsar); altında NASA GIBS Blue
  Marble (kamu malı, en çok 8. düzey) kaba bir yedek olarak çizilir, böylece
  EOX karosu gelmediğinde boşluk yerine kaba görüntü görünür. Sınırlar ile
  yer adları vektör stilinden gelir; deniz ve okyanus adları mavi, kıta
  adları (`map.basemaps` → `continents`, adları `lang.json`) uzak
  görünümde aralıklı büyük harflerle yazılır. Uydu haritasında gecenin
  olduğu yarı, Güneş'in o anki konumuna göre (cihaz saati, 5 dakikada bir)
  karartılır ve NASA Black Marble şehir ışıklarıyla çizilir (`night`;
  kamu malı); bu katman 3. düzeyden sonra söner, 6. düzeyde hiç görünmez. Altlığın "bazı parçalar yüklenemedi" uyarısı, son 10
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
  kopyalanır. `loaders/blank-import-meta-url.cjs`, webpack'in
  kütüphanedeki `import.meta.url` ifadesine derleme makinesinin dosya yolunu
  gömmesini engeller.
- Harita WebGL2 ve modül web worker'ı ister (MapLibre 6). Bunlar olmayan
  tarayıcıda harita yerine bir açıklama çıkar; formlar ve sonuçlar yine
  çalışır.

## Güvenlik

[`SECURITY.md`](SECURITY.md)
