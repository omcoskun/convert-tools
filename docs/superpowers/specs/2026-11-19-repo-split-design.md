# Kütüphaneyi ve haritayı iki repoya ayırmak — tasarım

Tarih: 2026-11-19. Büyüklük: bir proje.

## Amaç

Bugün her şey tek repoda (`omcoskun/convert-tools`, npm workspaces):

- `packages/core-js`: JS çekirdeği, `@convert-tools/core` 3.0.0;
- `packages/core-java`: Java 17 eşi;
- `contracts/`: iki çekirdeğin ortak test vektörleri ve hata kodları;
- `app/`: harita tanıtım sitesi.

Sahip bunları ayırmak istiyor: kütüphaneyi kullanmak isteyen biri haritayı
istemeyebilir.

- Harita yalnızca bir tanıtım sitesidir; başka projelere gömülecek bir paket
  değildir.
- Kütüphane reposu ileride gizli (private) olacak. Bütün tasarım buna göre
  yapılır.
- GitHub ve GitHub Pages şimdilik yalnızca test aşaması içindir. Harita sitesi
  daha sonra sahibin kendi sitesinde yayımlanacak.

## Hedefler

- **İki repo olacak.**
  - `omcoskun/convert-tools`: kütüphane. Bugünkü repodur ve bütün geçmişi
    korunur. JS, Java ve `contracts/` bu repoda birlikte kalır.
  - `omcoskun/convert-tools-map`: harita. Yeni bir repodur ve şimdilik herkese
    açıktır. `app/` geçmişiyle birlikte bu reponun köküne taşınır.
- **Kütüphane gizli bir paket olarak dağıtılır.** Yer GitHub Packages'tır:
  - npm paketi `@omcoskun/convert-tools`, `npm.pkg.github.com` üzerinde ve
    gizli;
  - Maven paketi `io.github.omcoskun:convert-tools`,
    `maven.pkg.github.com/omcoskun/convert-tools` üzerinde;
  - her sürümde `.tgz` ve `.jar` dosyaları da bir GitHub Release'e eklenir.
    GitHub erişimi olmayan ekipler bunları kullanır.
- **Harita kütüphaneye yalnızca paket yoluyla bağlanır.** Kütüphaneyi bu
  paketten, sıradan bir bağımlılık olarak kurar. Kütüphanenin repodaki
  dosyalarını (`contracts/`, `packages/`) okumaz.
- **Kütüphane reposu gizli yapıldığında hiçbir şey kırılmaz.** Harita CI'ı,
  Pages ve sahibin yerel geliştirmesi aynen çalışır.
- **Canlı site yeni adrese taşınır:** `omcoskun.github.io/convert-tools-map/`.

## Hedef olmayanlar

- Kütüphane reposunu şimdi gizli yapmak. Bunu sahip ileride kendisi yapar.
- Sitenin sahibin kendi sunucusuna taşınması. Bu ayrı bir iştir.
- npmjs.com'a veya Maven Central'a yayımlamak.
- Kütüphane API'sini değiştirmek. Yalnızca adlar değişir; dışa açılan
  fonksiyonlar ve alt yollar aynı kalır.
- JS ve Java'yı ayrı repolara bölmek.
- Prolate antipodal ters çözümün yavaşlığı (ayrı iş).

## Asla olmaması gerekenler

- Kütüphanenin npmjs.com'a herkese açık yayımlanması.
- GitHub'daki npm paketinin herkese açık yapılması. GitHub'da bir paket
  herkese açık yapılınca bir daha gizli yapılamıyor.
- Bir token'ın, MapTiler anahtarının ya da kişisel bilginin herhangi bir
  repoya girmesi.
- Haritanın kütüphanenin iç dosyalarına bağlı kalması. Bunlar `src/` alt
  yolları, `contracts/` ve `../packages` gibi göreli yollardır.
- Kütüphane geçmişinin kaybolması.
- Eski sitenin, yeni adres doğrulanmadan kapatılması.

## Kısıtlar

- **Ücretsiz, kart yok.** GitHub Free'de gizli paketlerin hakkı şöyle:
  - 500 MB depolama ve ayda 1 GB indirme var. Bir sürüm yaklaşık 90 KB.
  - Actions'ın `GITHUB_TOKEN` ile yaptığı indirmeler bu kotaya sayılmıyor.
  - Kayıtlı kart olmadığı için kota dolunca indirme durur; para kesilmez.
- **Pages.** GitHub Free'de Pages yalnızca herkese açık repolardan çalışıyor.
  Site Pages'te kaldıkça harita reposu herkese açık kalır.
- **Kurulum için kimlik doğrulama.** GitHub Packages'tan npm ya da Maven
  paketi kurmak her zaman kimlik doğrulama ister; paket herkese açık olsa
  bile. Kabul edilenler yalnızca iki tane:
  - classic kişisel erişim token'ı (PAT);
  - workflow içinde `GITHUB_TOKEN`.
- **Paket görünürlüğü.**
  - npm paketi ilk yayımda gizlidir ve görünürlüğünü repodan almaz.
    GitHub'ın belgesine göre kişisel hesaba ait bir paket ilk yayımlandığında
    gizli olur. Bağlı repodan izinleri devralır, görünürlüğü devralmaz. Bu
    yüzden repo şu an herkese açık olsa da ilk yayım gizli çıkar. Hiçbir
    workflow ya da adım paketin görünürlüğünü değiştirmez.
  - Maven paketi repo kapsamlıdır ve görünürlüğü repoyu izler: repo herkese
    açıkken paket açıktır, repo gizli olunca paket de gizli olur.
- **Sahibin yaptıkları.** Hesap, repo, token, paket ayarı ve Pages ayarını ya
  sahip yapar ya da onun açık onayıyla yapılır. Her push ve tag için önce onay
  alınır.
- **Teknoloji.** Ekibin yığını değişmez: React 18 JSX, Webpack 5, Babel 7,
  TypeScript yok, az bağımlılık. Node ≥ 22.15.

## Yaklaşımlar

### Kaç repo

1. **İki repo: kütüphane (JS + Java + contracts) ve harita (seçilen).**
   - JS ve Java aynı vektörleri ve aynı 23 hata kodunu paylaşıyor.
   - Aynı repoda kaldıkça iki çekirdek tek değişiklikte birlikte değişir.
   - Ortak dosyalar tek yerde durur.
2. **Üç repo: JS, Java ve harita.**
   - `contracts/` ya iki yere kopyalanır ya da üçüncü bir repoya taşınır.
   - Bir hata kodunun eklenmesi üç repoda eşzamanlı değişiklik ister.
3. **Tek repo, yalnızca paketi ayrı yayımlamak.**
   - Kütüphane gizli olunca harita da gizli repoda kalır ve ücretsiz Pages
     çalışmaz.
   - Kütüphaneyi isteyen yine haritayı da almış olur.

### Kütüphanenin dağıtımı

1. **GitHub Packages (seçilen).**
   - Gizlidir ve ücretsizdir.
   - npm ve Maven aynı yerde durur.
   - `^1.0.0` gibi sürüm aralıkları çalışır.
   - Harita CI'ı saklı bir token olmadan kurar.
2. **Paketlenmiş dosya (`.tgz` / `.jar`).**
   - Hesap ve ağ gerektirmez, ama her güncelleme elle yapılır.
   - Tek başına seçilmedi. Her sürümde yedek olarak Release'e eklenir.
3. **Git bağımlılığı (`git+ssh`): elendi.**
   - JS paketinin repo köküne taşınması gerekir.
   - Her kurulumda derleme yapılır.
   - Her kullanıcı yine de repo erişimine ihtiyaç duyar.
4. **npmjs.com: elendi.** Orada gizli paket ücretli; ücretsiz yayım ise
   herkese açık.

## Tasarım

### Adlar

| | Şimdi | Sonra |
|---|---|---|
| npm paketi | `@convert-tools/core` | `@omcoskun/convert-tools` |
| Maven | `io.github.mertc0604:convert-tools-core` | `io.github.omcoskun:convert-tools` |
| Java paketi | `io.github.mertc0604.converttools` | `io.github.omcoskun.converttools` |
| `repository.url` | `github.com/mertc0604/convert-tools` (böyle bir hesap yok) | `github.com/omcoskun/convert-tools` |
| Harita paketi | `@convert-tools/app` | `convert-tools-map` (`private: true`) |
| Site | `omcoskun.github.io/convert-tools/` | `omcoskun.github.io/convert-tools-map/` |

- **Paket öneki.** GitHub Packages, npm paketinin önekinin sahibin adıyla aynı
  olmasını şart koşuyor. Bu yüzden önek `@omcoskun/` oldu.
  - Bir GitHub organizasyonu açılmadı (benim kararım).
  - Bir org açılırsa `@convert-tools/` öneki korunabilirdi. Ancak iki repo da
    o org'a taşınmak zorunda kalırdı.
- **`repository.url` doğru olmak zorunda.** GitHub Packages npm paketini repoya
  bu alanla bağlıyor. Paket bağlanmazsa:
  - repodaki workflow'un yayımlama yetkisi olmaz;
  - paket, repodaki erişim izinlerini devralmaz.
- **Alt yollar aynı kalır:** `./units`, `./length`, `./geodesy`,
  `./package.json`.
- **İlk sürüm 1.0.0 (sahibin kararı).** Yeni adlarla ilk yayım 1.0.0 olur.
  Bu sürüm JS, Java ve kök `package.json` için ortaktır.
  - 3.0.0 bugüne kadar yalnızca repo içinde kullanılan bir etiketti; bu
    sürümle hiçbir yayım yapılmadı.
  - Ad değiştiği için bu yeni bir pakettir. Ad değişikliği kimseyi kırmaz.
- **`CHANGELOG.md`.**
  - En üste bir "1.0.0" bölümü eklenir. Bu bölüm yeni adları yazar ve bugünkü
    "Sürüm yayımlanmadı" bölümünü kapsar.
  - Eski girdiler "Yayım öncesi geçmiş" başlığı altında kalır. Bu başlık,
    girdilerin eski `@convert-tools/core` adına ve iç 3.0.0 etiketine ait
    olduğunu yazar.
  - README'de geçen "3.0.0'ın kırıcı değişiklikleri" cümlesi de buna göre
    düzeltilir.

### Kütüphane reposu, ayırmadan sonra (`omcoskun/convert-tools`)

**Repoda kalanlar:**

- `packages/core-js/`, `packages/core-java/` ve `contracts/`;
- `docs/BASELINE.md`, `GEODESIC_VALIDATION.md`, `TRIAXIAL_VALIDATION.md`,
  `UTM_MGRS_VALIDATION.md`;
- kütüphaneyle ilgili tasarım ve planlar (`test-conformance`, `known-gaps` ve
  bu belge);
- `SECURITY.md`, `full-validation.yml` ve `dependabot.yml`;
- `eslint.config.mjs`, uygulamaya ait bölümleri çıkarılmış olarak;
- `README.md`, yalnızca kütüphaneyi anlatacak biçimde. Tanıtım bölümünün
  yerini harita reposuna giden bir bağlantı alır.

**Haritaya taşınanlar:** `app/`, `Baslat.command`, `pages.yml` ve haritayla
ilgili tasarım ve planlar.

**Değişen dosyalar:**

- **Kök `package.json`.**
  - `workspaces` artık yalnızca `packages/core-js` içerir.
  - `dev`, `build:app` ve `test:app` betikleri gider.
  - `build` ve `test` yalnızca çekirdeği çalıştırır.
- **`ci.yml`.**
  - JavaScript işinden "App tests" adımı çıkar.
  - "Build core and demo" adımı "Build core" olur.
  - Java işi aynı kalır.
- **`packages/core-js/package.json`.**
  - `name` ve `repository.url` yeni değerleri alır.
  - `publishConfig.registry` alanına `https://npm.pkg.github.com` yazılır.
    Böylece `npm publish` yanlışlıkla npmjs.com'a gidemez.
- **`pom.xml`.**
  - `groupId` ve `artifactId` yeni adları alır.
  - `distributionManagement` (id `github`) şu adresi gösterir:
    `https://maven.pkg.github.com/omcoskun/convert-tools`.
- **`release.yml` (yeni).** Bir `v*` tag'i atılınca sırasıyla:
  1. Tag'in `package.json` ve `pom.xml` sürümleriyle aynı olduğunu denetler.
  2. Çekirdek ve Java testlerini çalıştırır.
  3. `npm pack` tarball'ını ve jar'ı üretir.
  4. `mvn deploy` yapar (`GITHUB_TOKEN`, `github` sunucusu üzerinden).
  5. `npm publish` yapar (`GITHUB_TOKEN`, `packages: write`).
  6. Bir GitHub Release açar ve 3. adımda üretilen dosyaları ekler
     (`contents: write`).

  **Sıranın nedeni (benim kararım).** Geri alınamayan adımlar sona
  bırakıldı. Bunlar, önce Maven'a sonra npm'e yayımlamaktır; ikisi de aynı
  sürümün üzerine yazmayı reddeder.

  **Yarıda kalan yayım.** Yayım yarıda kalırsa aynı tag yeniden
  çalıştırılmaz. Hata düzeltilir ve bir sonraki yama sürümü (örneğin 1.0.1)
  yayımlanır. "İlk sürüm 1.0.0" kararı buna engel değildir.
- **README'ye kurulum bölümü eklenir.**
  - npm için:
    - projenin `.npmrc` dosyasına `@omcoskun:registry=https://npm.pkg.github.com`;
    - `~/.npmrc` dosyasına `read:packages` yetkili bir classic PAT.
  - Maven için `settings.xml` ayarı ve repository tanımı.
  - GitHub erişimi olmayanlar için Release dosyaları.

### Harita reposu (`omcoskun/convert-tools-map`)

```text
src/  test/  public/  loaders/       bugünkü app/ içeriği, kökte
webpack.config.js  package.json  package-lock.json
.npmrc              @omcoskun:registry=https://npm.pkg.github.com   (token yok)
eslint.config.mjs   bugünkü yapılandırmanın uygulama bölümleri
.github/workflows/  ci.yml, pages.yml
.github/dependabot.yml   npm ve actions; kütüphane hariç tutulur
Baslat.command  README.md  SECURITY.md  .gitignore
docs/superpowers/specs, plans   haritaya ait olanlar
```

**Geçmiş (benim kararım).**

- `git subtree split --prefix=app` komutu `app/` klasörünün geçmişini, klasör
  kökte olacak biçimde çıkarır. Bugün bu geçmiş 35 commit. Komut git'in
  içinde geliyor; ek bir araç kurmak gerekmiyor.
- Diğer dosyalar tek bir commit'le eklenir. Bu commit, dosyaların hangi
  kütüphane commit'inden geldiğini yazar.

**`package.json`.**

- Paketin adı `convert-tools-map`; `private: true`.
- Sürüm 1.0.0'dan başlar (benim kararım; harita kendi sürümünü tutar).
- Kütüphane `"@omcoskun/convert-tools": "^1.0.0"` olarak bağımlıdır. Tam
  sürümü kilit dosyası sabitler.

**Importlar.** Bugün yaklaşık 20 kaynak ve test dosyası `@convert-tools/core`
yazıyor. Hepsi `@omcoskun/convert-tools` olur.

**Kütüphanenin dosyalarını okuyan testler bağımsız hale gelir:**

- **`test/support/files.mjs`.**
  - `readVectors`, artık `test/fixtures/` altındaki kopyaları okur.
  - Kopyalar, testlerin kullandığı dört satırdır. Her biri başlık satırıyla,
    `contracts/test-vectors` içindeki haliyle aynen alınır:
    - `geodesic-wgs84.csv` içinden `ankara-istanbul`;
    - `coordinate-projections.csv` içinden `crs-mercator-ankara`;
    - `gars.csv` içinden `ankara-p2`;
    - `georef.csv` içinden `ankara-p4`.
  - `test/fixtures/README.md` satırların hangi kütüphane sürümünden
    alındığını yazar.
  - `REPO_ROOT`, reponun kökü olur (artık `APP_ROOT` ile aynıdır).
- **`lang.test.mjs`.** Hata kodlarını `contracts/error-codes.json` yerine
  paketin dışa açtığı `ERROR_CODES` dizisinden alır. 23 kod denetimi yerinde
  kalır.
- **`reference.test.mjs`.**
  - Sitede gösterilen altı doğruluk satırı bundan sonra haritanın kendi
    README'siyle karşılaştırılır.
  - Bu README, bugün kök README'de duran altı satırlık "Doğruluk" tablosunu
    alır.
  - Kütüphanenin rakamları değişirse harita, kütüphane sürümünü yükselttiği
    commit'te bu tabloyu da günceller.
- **`boundaries.test.mjs`.**
  - İzin verilen kütüphane importu `@omcoskun/convert-tools` olur.
  - "Eski yığın gitti" testi yeni köke göre yeniden yazılır. Listedeki
    `public` girdisi artık uygulamanın kendi `public/` klasörüne çarpar.
    `app/...` girdileri de kök yollar olur.
- **`eslint.config.mjs`.** `no-restricted-imports` kuralı
  `@omcoskun/convert-tools/*` ve `**/packages/**` importlarını yasaklar.

**Derleme.**

- `babel-loader` bugün yalnızca `src/` klasörünü işliyor. Yani kütüphane
  hiçbir zaman Babel'den geçmedi.
- Bu yüzden kütüphanenin `node_modules` içine taşınması paketin içeriğini
  değiştirmemeli. Yapan kişi, ayırmadan önceki ve sonraki üretim derlemelerini
  karşılaştırır:
  - dosya boyutları;
  - CSP;
  - pakette derleme makinesinin yolunun bulunmaması.

**CI.**

- `actions/setup-node` şu ayarlarla çalışır:
  - `registry-url: https://npm.pkg.github.com`;
  - `scope: "@omcoskun"`;
  - `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`;
  - `permissions: packages: read`.
- İşler: lint, test ve build. Node 22.23.4 ve 24.22.2 ile çalışır.

**Pages.**

- `pages.yml` aynı kalır; yalnızca yüklenen klasörün yolu `build` olur.
- Derleme göreli adresler kullanıyor, bu yüzden `/convert-tools-map/` altında
  ayar gerektirmeden çalışır.
- Yorumlarda geçen `/convert-tools/` yazıları güncellenir.

**`Baslat.command`.**

- Yeni kökte olduğu gibi çalışır.
- `npm ci` 401 ya da 403 hatası verirse Türkçe bir ipucu yazar:
  `~/.npmrc` dosyasındaki token eksik veya geçersiz.

**Yayımlanmamış bir kütüphane değişikliğini haritada denemek.**

- Kütüphanede `npm pack` çalıştırılır.
- Haritada `npm install <tgz yolu>` ile kurulur ve commit edilmez.
- Harita README'si bu adımları anlatır.

**Yerel klasör (benim kararım).** Harita, kütüphanenin yanında şu klasörde
durur: `/Users/omcoskun/Desktop/Projects/convert-tools-map`.

### Kim kurabilir

- **Harita CI'ı.** Sahip, paketin ayarlarındaki "Manage Actions access"
  bölümünden `convert-tools-map` reposunu Read yetkisiyle ekler. Bu, ilk
  yayımdan ve harita reposu GitHub'da açıldıktan sonra yapılır. 1.0.0
  herkese açık çıktığı için bu şimdilik gerekmedi; paket gizli olarak yeniden
  yayımlanınca gerekir (adım 6).
- **Sahibin bilgisayarı.** Sahip, `read:packages` yetkili bir classic PAT
  oluşturur. Onu `~/.npmrc` dosyasına
  `//npm.pkg.github.com/:_authToken=...` satırı olarak kendisi yazar.
- **İleride başka ekipler.** Repo ya da paket erişimi ve kendi PAT'leriyle
  kurarlar. GitHub erişimi olmayanlar Release dosyalarını kullanır.

### Sıra

Her aşamanın sonunda her şey çalışır durumdadır.

1. **Adlar, repo henüz bölünmeden.**
   - Değişenler:
     - npm adı, `repository.url` ve `publishConfig`;
     - Java'nın `groupId`, `artifactId` ve paket adı;
     - sürüm, JS, Java ve kökte 1.0.0;
     - uygulamadaki importlar;
     - README ve CHANGELOG.
   - `release.yml` eklenir.
   - Bütün testler geçer: çekirdek, uygulama, Java, lint ve paket testi.
   - Değişiklikler yerelde commit edilir.
2. **İlk yayım.** Sahip onaylarsa:
   - önce main push edilir, sonra `v1.0.0` tag'i;
   - `release.yml` Maven paketini, npm paketini (gizli) ve Release'i
     yayımlar;
   - paketin gizli olduğu, yayımın hemen ardından paket sayfasında
     doğrulanır.
     - Paket beklenmedik biçimde herkese açık çıkarsa iş burada durur ve
       sahibe sorulur.
     - Görünürlük ayarına kimse dokunmaz.

   Site bu sırada eskisi gibi monorepodan yayımlanmaya devam eder.
3. **Harita reposu, yerelde.**
   - `subtree split` çalıştırılır ve yeni klasör açılır.
   - Eksik dosyalar eklenir; testler, CI ve lint yeni köke uyarlanır.
   - Sahip PAT'i `~/.npmrc` dosyasına yazar.
   - `npm install` kütüphaneyi GitHub Packages'tan kurar.
   - Testler ve derleme geçer; üretim derlemesi öncekiyle karşılaştırılır.
4. **Harita reposu, GitHub'da.** Sahip onaylarsa:
   - `gh repo create omcoskun/convert-tools-map --public` ile repo açılır;
   - sahip paket ayarından bu repoya Actions erişimi verir;
   - repo push edilir;
   - Pages, kaynak olarak GitHub Actions seçilerek açılır.

   CI ve yeni adresteki canlı site tarayıcıda denetlenir. Denetim önceki
   canlı kontrollerle aynıdır: harita açılıyor mu, araçlar hesaplıyor mu,
   CSP hatası var mı.
5. **Haritanın kütüphaneden çıkarılması.**
   - `app/`, `Baslat.command`, `pages.yml` ve haritayla ilgili belgeler
     silinir.
   - Kök `package.json`, kilit dosyası, eslint, `ci.yml` ve README
     güncellenir.
   - Testler geçince, sahip onaylarsa push edilir.
   - Yeni site doğrulandıktan sonra eski site kaldırılır. Bunu ya sahip
     Settings → Pages bölümünden yapar ya da sahibin onayıyla şu komut
     çalıştırılır: `gh api -X DELETE repos/omcoskun/convert-tools/pages`.
6. **Daha sonra (bu işin dışında).** Sahip hazır olduğunda kütüphane reposunu
   gizli yapar.

   **İlk yayımda olan (2026-11-19).** Herkese açık repodan `GITHUB_TOKEN`
   ile yapılan 1.0.0 yayımında npm paketi belgenin söylediğinin tersine
   herkese açık çıktı. Paket sayfası oturum açmadan açılıyor. Herkese açık
   bir paket gizli yapılamaz. Sahip paketi şimdilik bırakmaya karar verdi,
   çünkü kaynak kod da şu an herkese açık.

   **Repo gizli yapılırken sırayla:**
   1. Repo gizli yapılır. Maven paketi repoyla birlikte gizli olur.
   2. Sahip npm paketini siler: paket ayarları → Danger Zone → Delete this
      package. Bu, 5000 indirmenin altında mümkündür.
   3. Bir sonraki sürüm tag'i (örneğin `v1.0.1`) gizli repodan paketi yeniden
      yayımlar.
   4. Paketin gizli çıktığı oturum açmadan denetlenir: paket sayfası 404
      dönmeli.
   5. Sahip, yeni pakette `convert-tools-map` reposuna yeniden "Manage
      Actions access" verir.
   6. Harita kilit dosyasını yeni sürüme günceller.
   7. Haritanın Dependabot'u gizli paketi kendiliğinden okuyamaz. Haritanın
      `.github/dependabot.yml` dosyasına GitHub Packages için bir
      `registries` girdisi ve `read:packages` yetkili bir token tutan bir
      Dependabot secret'ı eklenir. Eklenmezse Dependabot'un npm güncellemeleri
      durur.

   Harita, sahibin sitesine taşınana kadar herkese açık kalır.

### Dokunulmayanlar

- İki çalışma ağacı yerinde kalır. Dalları main'e tamamen birleşmiş durumda.
  - `convert-tools-conformance` (`claude/known-gaps`);
  - `.claude/worktrees/library-first-restructure-7e08cc`.
- Bir sonraki dış site testi harita reposundan yapılır.
- Commit edilmemiş tasarım ve plan dosyaları:
  - haritaya ait olanlar harita klasörüne taşınır ve commit edilmemiş kalır;
  - kütüphaneye ait olanlar yerinde kalır.
- `docs/TEST_REPORT_2026-11-19.md` ve `.claude/` hiçbir repoya girmez.

## Başarı ölçütü

- **Kütüphane reposu.**
  - Hiçbir dosya `app/` klasörüne ya da haritaya başvurmaz.
  - Çekirdek testleri, Java testleri, lint ve `test:pack` geçer.
  - `npm pack` çıktısının adı `omcoskun-convert-tools-1.0.0.tgz` olur.
- **Paket sayfaları.**
  - npm paketi gizli, repoya bağlı ve 1.0.0 sürümünde.
  - Maven paketi de 1.0.0 sürümünde.
- **Harita reposu.**
  - CI yalnızca `GITHUB_TOKEN` ile geçer.
  - Bütün uygulama testleri geçer.
  - `src/` altında `contracts` ya da `packages/` aranınca sonuç çıkmaz.
    Bu arama testlere uygulanmaz: sınır testleri, lint kuralı ve fixture
    README'si bu sözcükleri bilerek içerir. Testlerde kontrol edilecek şey,
    kütüphanenin dosyalarını okuyan bir yol kalmamasıdır.
  - Site yeni adreste çalışır.
- **Token olmadan kurulum.** Token olmadan alınmış bir kopyada `Baslat.command`
  açık bir Türkçe mesajla durur. Token eklenince çalışır.

## Yapana bırakılanlar

- Workflow YAML dosyalarının tam hali.
- `release.yml` dosyasının sürüm denetimini nasıl yaptığı.
- README metinleri ve `Baslat.command` ipucunun metni.
- Fixture dosyalarının biçimi: dosya başına bir CSV ya da tek dosya.
- `test:tools` betiğinin CI'a eklenip eklenmeyeceği. Bugün CI'da çalışmıyor.
