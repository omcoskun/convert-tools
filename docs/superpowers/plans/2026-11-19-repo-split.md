# Kütüphaneyi ve haritayı iki repoya ayırma — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Hedef:** `omcoskun/convert-tools` kütüphane olarak kalır. Harita
`omcoskun/convert-tools-map` reposuna taşınır ve kütüphaneyi GitHub
Packages'taki gizli `@omcoskun/convert-tools` paketinden kurar.

**Mimari:**

- **Adlar ve haritanın bağımsızlığı (Görev 1–2).** Repo henüz tek parçayken
  adlar değiştirilir. Haritanın testleri de `app/` dışındaki hiçbir dosyayı
  okumayacak hale getirilir. Böylece tek repoda yeşil kalan testler bölmenin
  güvenli olduğunu kanıtlar.
- **İlk sürüm (Görev 3).** Sürüm workflow'u eklenir ve 1.0.0 yayımlanır.
- **Harita reposu (Görev 4–5).** `git subtree split` ile `app/` geçmişiyle
  birlikte yeni repoya geçer. Harita reposu kendi CI'ı ve Pages'iyle
  yayına alınır.
- **Temizlik (Görev 6).** Harita kütüphaneden çıkarılır ve eski site
  kaldırılır.

**Teknoloji:** npm workspaces, Node `node:test`, Java 17 (javac betiği),
GitHub Actions, GitHub Packages (npm ve Maven), GitHub Pages ve `gh` CLI.

**Tasarım:** `docs/superpowers/specs/2026-11-19-repo-split-design.md`

## Genel kısıtlar

- **Adlar:**
  - npm `@omcoskun/convert-tools`;
  - Maven `io.github.omcoskun:convert-tools`;
  - Java paketi `io.github.omcoskun.converttools`;
  - harita paketi `convert-tools-map` (`private: true`).
- **Sürümler:** JS, Java ve kök `package.json` 1.0.0; harita 1.0.0. Harita
  kütüphaneye `"@omcoskun/convert-tools": "^1.0.0"` ile bağlanır.
- **Kayıt adresleri:**
  - npm: `https://npm.pkg.github.com`;
  - Maven: `https://maven.pkg.github.com/omcoskun/convert-tools`, sunucu
    kimliği `github`.
- **Repo adresi:** `git+https://github.com/omcoskun/convert-tools.git`.
- **Yeni site adresi:** `https://omcoskun.github.io/convert-tools-map/`.
- **Asla yapılmayacaklar:**
  - npmjs.com'a yayım;
  - paket görünürlüğünü değiştirmek;
  - bir repoya token ya da MapTiler anahtarı koymak.
- **Onay gerekenler.** Şunların her biri ayrıca sahibin sohbette açık onayını
  ister:
  - push, tag ve `gh repo create`;
  - Pages açma ve kapatma.
- **Sahibin kendisinin yaptıkları:**
  - classic PAT oluşturmak ve `~/.npmrc` dosyasına yazmak;
  - paketin "Manage Actions access" ayarı.
- **Hiçbir repoya girmeyenler:** `docs/TEST_REPORT_2026-11-19.md` ve `.claude/`.
- **Commit mesajları** İngilizcedir ve şu satırla biter:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Teknoloji yığını değişmez:** Node ≥ 22.15; CI Node 22.23.4 ve 24.22.2;
  React 18 JSX, Webpack 5, Babel 7; TypeScript yok; yeni bağımlılık yok.

## İnceleme odağı

1. **Token olmadan alınmış kopya.** Harita reposunda `npm ci` çalışınca açık
   bir Türkçe ipucu görünmeli; anlaşılmaz bir E401 değil (Görev 4, Adım 9 ve
   10).
2. **Commit edilen bir dosyada token.** `.npmrc` ya da kilit dosyası
   `_authToken` içermemeli (Görev 4, Adım 11).
3. **`npm publish` yanlış yere gitmesin.** Yerelde de, workflow'da da
   npmjs.com'a gitmemeli (Görev 3, Adım 2).
4. **Kütüphane `node_modules` içine taşınınca site değişmesin.** CSP, toplam
   boyut ve derleme makinesinin yolu kontrol edilir (Görev 4, Adım 12).
5. **Tag ile sürümler uyuşmazsa yayım hiç başlamasın** (Görev 3, Adım 1).

---

### Task 1: Yeni adlar ve 1.0.0, repo henüz bölünmeden

**Dosyalar:**

- **Değişen:**
  - `packages/core-js/package.json`: `name`, `version`, `repository.url`;
  - `packages/core-java/pom.xml`: `groupId`, `artifactId`, `version` ve
    `<name>Convert Tools</name>`;
  - `package.json`: `version` ve `--workspace` adları;
  - `app/package.json`: bağımlılık `"@omcoskun/convert-tools": "^1.0.0"` ve
    açıklama;
  - `@convert-tools/core` yazan bütün dosyalar (listeler aşağıda);
  - `io.github.mertc0604` yazan bütün dosyalar;
  - `packages/core-js/CHANGELOG.md`, `README.md` ve `package-lock.json`.
- **Taşınan:**
  - `packages/core-java/src/main/java/io/github/mertc0604` →
    `packages/core-java/src/main/java/io/github/omcoskun`;
  - `packages/core-java/src/test/java/io/github/mertc0604` →
    `packages/core-java/src/test/java/io/github/omcoskun`.
- **Testler:** `packages/core-js/scripts/pack-smoke.mjs` ve
  `packages/core-java/scripts/test.sh`.

**Arayüzler:**

- **Üretir:** paket adı `@omcoskun/convert-tools` ve alt yolları `/units`,
  `/length`, `/geodesy`. Java sınıfları `io.github.omcoskun.converttools.*`.

- [ ] **Adım 1: Testleri yeni adlara çevir (kırmızı)**

  Önce testler yeni adları kullanacak, kodun kendisi daha değişmeyecek:

  - `pack-smoke.mjs` içindeki dört `load("@convert-tools/core...")` çağrısını
    `load("@omcoskun/convert-tools...")` yap.
  - `test.sh` içinde `io.github.mertc0604.converttools.$test` yazan yeri
    `io.github.omcoskun.converttools.$test` yap.

- [ ] **Adım 2: Testlerin başarısız olduğunu gör**

  Komut: `npm run test:pack`. Beklenen: başarısız,
  `Cannot find package '@omcoskun/convert-tools'` ya da
  `ERR_MODULE_NOT_FOUND`.

  Komut: `npm run test:java`. Beklenen: başarısız,
  `ClassNotFoundException: io.github.omcoskun.converttools.ContractTest`.

- [ ] **Adım 3: Java paketini taşı**

  Önce iki klasörü taşı:

  ```bash
  git mv packages/core-java/src/main/java/io/github/mertc0604 packages/core-java/src/main/java/io/github/omcoskun
  git mv packages/core-java/src/test/java/io/github/mertc0604 packages/core-java/src/test/java/io/github/omcoskun
  ```

  Sonra metindeki adı değiştir:

  ```bash
  git grep -l "io.github.mertc0604" -- packages/core-java .github contracts/tools docs/BASELINE.md docs/GEODESIC_VALIDATION.md README.md \
    | xargs sed -i '' 's/io\.github\.mertc0604/io.github.omcoskun/g'
  ```

  `pom.xml` içinde şunları değiştir:

  - `groupId` → `io.github.omcoskun`;
  - `artifactId` → `convert-tools`;
  - `version` → `1.0.0`;
  - `name` → `Convert Tools`.

  `README.md:29` satırında `convert-tools-core` yazan yer `convert-tools`
  olur.

- [ ] **Adım 4: JS adını değiştir**

  ```bash
  git grep -l "@convert-tools/core" -- app packages/core-js/test packages/core-js/scripts packages/core-js/README.md README.md eslint.config.mjs contracts/error-codes.json docs/TRIAXIAL_VALIDATION.md package.json \
    | xargs sed -i '' 's#@convert-tools/core#@omcoskun/convert-tools#g'
  ```

  Bu komut bilerek dışarıda bırakılan geçmiş kayıtlarına dokunmaz:

  - `CHANGELOG.md`, bu görevin 6. adımında elle düzenlenir;
  - `docs/BASELINE.md:20`;
  - `docs/superpowers/**`.

  Sonra `packages/core-js/package.json` içinde şunları değiştir:

  - `name` → `@omcoskun/convert-tools`;
  - `version` → `1.0.0`;
  - `repository.url` → `git+https://github.com/omcoskun/convert-tools.git`.

  Kök `package.json` içinde `version` → `1.0.0`.

  `app/package.json` içinde:

  - bağımlılık `"@omcoskun/convert-tools": "^1.0.0"` olur;
  - açıklama
    `"@omcoskun/convert-tools tanıtım arayüzü (React 18, Webpack 5)"` olur.

- [ ] **Adım 5: Kilit dosyasını yenile**

  Komut: `npm install --ignore-scripts --no-audit --no-fund`

  Beklenen: `node_modules/@omcoskun/convert-tools` →
  `../../packages/core-js` bağlantısı oluşur. Kilit dosyasında
  `npm.pkg.github.com` geçmez; paket workspace'ten bağlanır.

- [ ] **Adım 6: CHANGELOG**

  `packages/core-js/CHANGELOG.md` içinde dört değişiklik var.

  - **3. satır** şu olur:

    ```markdown
    Bu dosya `@omcoskun/convert-tools` (JavaScript) ve `io.github.omcoskun:convert-tools` (Java) için ortaktır; iki çekirdek aynı sürüm numarasını taşır.
    ```

  - **`## Sürüm yayımlanmadı` başlığı** `## 1.0.0 — 2026-11-19` olur. Başlığın
    altına şu paragraf eklenir:

    ```markdown
    İlk yayım. Paketler yeni adlarıyla GitHub Packages'ta yayımlanır: JavaScript `@omcoskun/convert-tools`, Java `io.github.omcoskun:convert-tools` (Java paketi `io.github.omcoskun.converttools`). Eski adlar (`@convert-tools/core`, `io.github.mertc0604:convert-tools-core`) hiç yayımlanmadı. Aşağıdakiler iç 3.0.0 etiketinden bu yana yapılan değişikliklerdir.
    ```

  - **`## 3.0.0 — 2026-11-13` satırından hemen önce** şu bölüm eklenir:

    ```markdown
    ## Yayım öncesi geçmiş

    Aşağıdaki girdiler eski `@convert-tools/core` ve `io.github.mertc0604:convert-tools-core` adlarına aittir. Bu numaralarla hiçbir yayım yapılmadı; yalnızca repo içinde kullanıldılar.
    ```

  - **O satırdan dosyanın sonuna kadar** her başlık bir düzey aşağı iner (`#`
    eklenir). 3.0.0 başlığı da `### 3.0.0 (iç etiket) — 2026-11-13` olur.

  Bu bölümler `README.md:129` satırında anılıyor. Oradaki "Sürüm
  değişiklikleri ve 3.0.0'ın kırıcı değişiklikleri:" ifadesi "Sürüm
  değişiklikleri (1.0.0 ve yayım öncesi geçmiş):" olur.

- [ ] **Adım 7: Bütün testleri çalıştır (yeşil)**

  ```bash
  npm run lint && npm run test:core && npm run test:app && npm run build && npm run test:pack && npm run test:java && npm run test:tools
  ```

  Beklenen: hepsi geçer. `test:pack` şu çıktıyı verir:

  ```text
  tarball: omcoskun-convert-tools-1.0.0.tgz
  pack smoke test passed
  ```

- [ ] **Adım 8: Eski adın kalmadığını denetle**

  Komut: `git grep -n "@convert-tools/core\|mertc0604" -- . ':!docs/superpowers' ':!package-lock.json'`

  Beklenen: yalnızca iki yer çıkar:

  - `CHANGELOG.md` içindeki yayım öncesi girdiler ve 1.0.0 paragrafı;
  - `docs/BASELINE.md:20`.

- [ ] **Adım 9: Commit**

  ```bash
  git add -A packages package.json package-lock.json app README.md eslint.config.mjs contracts .github docs/BASELINE.md docs/GEODESIC_VALIDATION.md docs/TRIAXIAL_VALIDATION.md
  git commit -m "Rename the library to @omcoskun/convert-tools 1.0.0 and the Java core to io.github.omcoskun"
  ```

### Task 2: Haritanın testleri `app/` dışından dosya okumasın

**Dosyalar:**

- **Yeni:**
  - `app/test/fixtures/geodesic-wgs84.csv`;
  - `app/test/fixtures/coordinate-projections.csv`;
  - `app/test/fixtures/gars.csv`;
  - `app/test/fixtures/georef.csv`;
  - `app/test/fixtures/README.md`;
  - `app/README.md`.
- **Değişen:**
  - `app/test/support/files.mjs`: `REPO_ROOT` dışa açılmaz;
    `readVectors` artık `APP_ROOT/test/fixtures` klasöründen okur;
  - `app/test/lang.test.mjs:13` ve `app/test/lang.test.mjs:94`;
  - `app/test/reference.test.mjs:59`;
  - `app/test/boundaries.test.mjs`: 12. satır, 123–149. satırlar ve yeni test.

**Arayüzler:**

- **Kullanır:** `ERROR_CODES` (dondurulmuş, 23 kodluk bir dizi). Kaynak:
  `@omcoskun/convert-tools`.
- **Üretir:** `test/support/files.mjs` şunları dışa açar:
  - `APP_ROOT`, `SRC`, `PUBLIC`;
  - `readJson`, `readVectors(name)`, `vector(name, id)`;
  - `listFiles`, `sourceFiles`.

  `REPO_ROOT` artık yoktur. Görev 4 dosyaları bu haliyle taşır.

- [ ] **Adım 1: Sınır testini yaz**

  Test `boundaries.test.mjs` dosyasına eklenir. Dosyanın başında
  `fileURLToPath` (`node:url`) ve `APP_ROOT` import edilir.

  ```js
  test("the demo's tests read no file outside the app folder", () => {
    const self = fileURLToPath(import.meta.url);
    const reaches = /REPO_ROOT|["'`][./]*contracts\/|["'`][./]*packages\//;
    const offenders = listFiles(path.join(APP_ROOT, "test"))
      .filter((file) => /\.m?js$/.test(file) && file !== self)
      .filter((file) => reaches.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(APP_ROOT, file));
    assert.deepEqual(offenders, []);
  });
  ```

- [ ] **Adım 2: Testin başarısız olduğunu gör**

  Komut: `node --test app/test/boundaries.test.mjs`

  Beklenen: başarısız. Bulunan dosyalar şunlar olur:

  - `test/lang.test.mjs`;
  - `test/reference.test.mjs`;
  - `test/support/files.mjs`.

- [ ] **Adım 3: Fixture dosyalarını oluştur**

  Her dosya `contracts/test-vectors/` içindeki aynı adlı dosyanın başlık
  satırını ve şu satırları aynen içerir:

  | Dosya | Satır |
  |---|---|
  | `geodesic-wgs84.csv` | `ankara-istanbul` |
  | `coordinate-projections.csv` | `crs-mercator-ankara` |
  | `gars.csv` | `ankara-p2` |
  | `georef.csv` | `ankara-p4` |

  Komut: `head -1` ile başlık alınır, `grep "^<id>,"` ile satır.

  `fixtures/README.md` dosyası şunları yazar:

  - satırların `omcoskun/convert-tools` 1.0.0 sürümündeki
    `contracts/test-vectors` dosyalarından aynen alındığını;
  - kütüphane bu satırları değiştirirse, harita sürüm yükselttiği commit'te
    bunları da güncellediğini.

- [ ] **Adım 4: `files.mjs`, `lang.test.mjs` ve `reference.test.mjs`
  dosyalarını düzelt**

  - **`files.mjs`.**
    - `REPO_ROOT` satırı silinir.
    - `readVectors` artık `path.join(APP_ROOT, "test/fixtures", name)`
      yolundan okur.
    - Açıklama yorumu da buna göre değişir.
  - **`lang.test.mjs`.**
    - `errorCodes` artık `[...ERROR_CODES]` olur. `ERROR_CODES` dizisi
      `@omcoskun/convert-tools` paketinden import edilir.
    - Test adı şu olur: `"the errors group covers exactly the library's
      ERROR_CODES"`.
  - **`reference.test.mjs`.**
    - README artık `path.join(APP_ROOT, "README.md")` yolundan okunur.
    - Import `APP_ROOT` olur.

- [ ] **Adım 5: Eski yığın testini yeni köke göre düzelt**

  `boundaries.test.mjs` içinde:

  - **`REPO_ROOT` → `APP_ROOT`.**
  - **TypeScript testi** `listFiles(APP_ROOT)` ile çalışır.
  - **`removed` listesi** şu olur:

    ```js
    ["api", "layout.tsx", "page.tsx", "globals.css", "components", "lib", "worker", "docs/API.md", "next.config.ts", "vite.config.ts", "postcss.config.mjs", "tsconfig.json", "scripts/build-pages.mjs", "tests"]
    ```

    `public` girdisi listeden çıkarılır, çünkü `app/public/` uygulamanın
    kendi klasörüdür.
  - **Manifest** `APP_ROOT/package.json` dosyasından okunur.

- [ ] **Adım 6: `app/README.md` dosyasını yaz**

  Bu dosya, harita reposunun kök README'si olacak.

  - **Başlık ve giriş.** Başlık `# convert-tools-map`. Giriş, sitenin
    `@omcoskun/convert-tools` kütüphanesinin tanıtım sitesi olduğunu ve hesap
    yapmadığını söyler.
  - **Kurulum.**
    - Kütüphane GitHub Packages'tan geliyor ve `read:packages` yetkili bir
      classic PAT istiyor.
    - Token `~/.npmrc` dosyasına
      `//npm.pkg.github.com/:_authToken=...` satırı olarak yazılır.
    - Ardından `npm ci --ignore-scripts` ve `npm run dev` çalıştırılır
      (`http://localhost:3008/`). macOS'ta `Baslat.command` da kullanılabilir.
  - **Komutlar.** `dev`, `build`, `test`, `lint`.
  - **Yayımlanmamış bir kütüphane değişikliğini denemek.**
    - Kütüphanede `npm pack` çalıştırılır.
    - Haritada `npm install <tgz yolu>` ile kurulur ve commit edilmez.
  - **Doğruluk.** Kök `README.md:66-77` aralığındaki tablo, altı satırıyla
    aynen alınır.
  - **Tanıtım bölümü.** Kök `README.md:147-299` aralığındaki
    "Tanıtım arayüzü (`app/`)" bölümü buraya taşınır.
    - Başlık `## Site` olur.
    - `app/` ile başlayan yollar kök yol olur.
    - Kök README bu bölümü Görev 6'ya kadar tutar.
  - **Kütüphane bağlantısı.**
    `[omcoskun/convert-tools](https://github.com/omcoskun/convert-tools)`.

- [ ] **Adım 7: Testleri çalıştır (yeşil)**

  Komut: `npm run test:app && npm run lint`. Beklenen: hepsi geçer.

  Fixture satırlarının kaynakla aynı olduğunu denetle:

  ```bash
  for f in geodesic-wgs84 coordinate-projections gars georef; do diff <(head -1 contracts/test-vectors/$f.csv) <(head -1 app/test/fixtures/$f.csv) && tail -n +2 app/test/fixtures/$f.csv | while read -r l; do grep -qxF "$l" contracts/test-vectors/$f.csv || echo "MISMATCH $f: $l"; done; done
  ```

  Beklenen: hiçbir çıktı yok.

  Komut: `git grep -n "contracts\|packages/" -- app/src app/public`

  Beklenen: boş.

- [ ] **Adım 8: Commit**

  ```bash
  git add app
  git commit -m "Make the demo's tests read nothing outside app/"
  ```

### Task 3: Sürüm workflow'u ve ilk yayım (1.0.0)

**Dosyalar:**

- **Yeni:**
  - `scripts/check-release-tag.sh`;
  - `.github/workflows/release.yml`.
- **Değişen:**
  - `packages/core-js/package.json`: şu alan eklenir:
    `"publishConfig": { "registry": "https://npm.pkg.github.com" }`.
  - `packages/core-java/pom.xml`: `distributionManagement` eklenir:
    - `repository` kimliği `github`, adı `GitHub Packages`;
    - adresi `https://maven.pkg.github.com/omcoskun/convert-tools`.
  - `README.md`, `packages/core-js/README.md` ve
    `packages/core-java/README.md`: "Kurulum" bölümü eklenir.

**Arayüzler:**

- **Üretir:** `sh scripts/check-release-tag.sh <tag>`. Çıkış kodu:
  - tag `v` artı sürümse ve üç sürümle de uyuşuyorsa 0;
  - aksi halde 1, `stderr` çıktısında hangisinin uyuşmadığı yazar.

  Kontrol edilen üç sürüm:

  - kök `package.json`;
  - `packages/core-js/package.json`;
  - `pom.xml` içindeki proje sürümü: iki boşlukla girintilenmiş tek
    `<version>` satırı.

- [ ] **Adım 1: Tag denetimini yaz ve dene**

  Betiği `node -p` ile ve `sed -n 's:^  <version>\(.*\)</version>$:\1:p'`
  ifadesiyle yaz.

  Denemeler:

  - `sh scripts/check-release-tag.sh v9.9.9` → çıkış kodu 1, üç uyuşmazlık
    yazar;
  - `sh scripts/check-release-tag.sh 1.0.0` → çıkış kodu 1, tag `v` ile
    başlamıyor;
  - `sh scripts/check-release-tag.sh v1.0.0` → çıkış kodu 0.

- [ ] **Adım 2: `publishConfig` ve `distributionManagement`**

  İkisini ekle ve dene: `cd packages/core-js && npm publish --dry-run --ignore-scripts`

  Beklenen: çıktıda `Publishing to https://npm.pkg.github.com/` geçer.
  `registry.npmjs.org` geçmez. Bu bir dry-run'dır; hiçbir şey yayımlanmaz.

  Bu makinede Maven yok. Bu yüzden `pom.xml` doğrulaması Görev 3'ün yayım
  adımında, Actions'ta yapılır.

- [ ] **Adım 3: `release.yml`**

  Workflow `on: push: tags: ["v*"]` ile tetiklenir. Varsayılan izin
  `permissions: contents: read`. Tek iş `release` vardır; bu işin izinleri
  `contents: write` ve `packages: write`. İş, `ubuntu-latest` üzerinde şu
  sırayla çalışır:

  1. `actions/checkout@v4`.
  2. `actions/setup-node@v4` şu ayarlarla:
     - `node-version: "24.22.2"`, `cache: npm`;
     - `registry-url: https://npm.pkg.github.com`, `scope: "@omcoskun"`.
  3. `actions/setup-java@v4` şu ayarlarla: `distribution: temurin`,
     `java-version: "17"`, `cache: maven`, `server-id: github`.
  4. `sh scripts/check-release-tag.sh "$GITHUB_REF_NAME"`.
  5. `npm ci --ignore-scripts`.
  6. `npm run lint`, `npm run test:core`, `npm run test:pack` ve
     `npm run test:java`.
  7. `npm run build`, ardından `packages/core-js` içinde
     `npm pack --ignore-scripts --pack-destination "$RUNNER_TEMP/release"`.
  8. `mvn --batch-mode --file packages/core-java/pom.xml deploy`. Bu adım jar
     dosyasını da `packages/core-java/target/` altına üretir. Ortam değişkeni
     `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
  9. Paketi yayımla:

     ```sh
     npm publish "$RUNNER_TEMP/release/omcoskun-convert-tools-${GITHUB_REF_NAME#v}.tgz" --registry https://npm.pkg.github.com
     ```

     Ortam değişkeni `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
  10. Sürümü oluştur:

      ```sh
      gh release create "$GITHUB_REF_NAME" <tgz> packages/core-java/target/convert-tools-*.jar --title "$GITHUB_REF_NAME" --notes "Değişiklikler: packages/core-js/CHANGELOG.md"
      ```

      Ortam değişkeni `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

  Bu sıra tasarımdan gelir: geri alınamayan adımlar en sondadır. Workflow,
  paketin görünürlüğünü değiştiren hiçbir adım içermez.

- [ ] **Adım 4: Kurulum bölümleri**

  - **Kök README ve core-js README:**
    - projenin `.npmrc` dosyasına
      `@omcoskun:registry=https://npm.pkg.github.com` satırı;
    - `~/.npmrc` dosyasına
      `//npm.pkg.github.com/:_authToken=<classic PAT, read:packages>`;
    - ardından `npm install @omcoskun/convert-tools`.
  - **Java README:**
    - `settings.xml` içinde `github` kimlikli bir sunucu tanımı (kullanıcı
      adı ve PAT);
    - `https://maven.pkg.github.com/omcoskun/convert-tools` repository'si;
    - `io.github.omcoskun:convert-tools:1.0.0` bağımlılığı.
  - **İki README'de de** GitHub erişimi olmayanlar için şu not bulunur:
    Release'teki `.tgz` dosyası `npm install ./omcoskun-convert-tools-1.0.0.tgz`
    ile, `.jar` dosyası da classpath'e eklenerek kullanılır.

- [ ] **Adım 5: Testler ve commit**

  Komut: `npm run lint && npm run test:core && npm run test:pack`. Beklenen:
  hepsi geçer.

  ```bash
  git add scripts .github/workflows/release.yml packages/core-js/package.json packages/core-java/pom.xml README.md packages/core-js/README.md packages/core-java/README.md
  git commit -m "Publish releases to GitHub Packages from a version tag"
  ```

- [ ] **Adım 6: Push (sahibin onayıyla)**

  Sahibe Görev 1–3'ün commit'lerini ve şunu söyle: push, Pages'i günceller ve
  site yeni paket adını gösterir. Onay gelirse `git push origin main`
  çalıştır.

  CI ve Pages çalışmaları geçmeli: `gh run watch <id> --exit-status`.

- [ ] **Adım 7: Tag (sahibin ayrı onayıyla)**

  Onay gelirse `git tag v1.0.0 && git push origin v1.0.0` çalıştır. Ardından
  `gh run watch <release run id> --exit-status`.

  Bir adım başarısız olursa aynı tag yeniden denenmez. Hata düzeltilir ve
  sahibe 1.0.1 önerilir.

- [ ] **Adım 8: Görünürlüğü hemen doğrula**

  `gh` token'ında `read:packages` yetkisi yok. Bu yüzden kontrolü sahip
  tarayıcıda yapar: `https://github.com/omcoskun?tab=packages` sayfasında
  iki şeyi doğrular:

  - `convert-tools` npm paketinde "Private" yazıyor;
  - `io.github.omcoskun.convert-tools` Maven paketi 1.0.0 sürümüyle
    listeleniyor.

  - "Public" yazıyorsa iş burada durur ve sahibe sorulur. Görünürlük ayarına
    dokunulmaz.
  - Doğrulama tamamsa `gh release view v1.0.0` çıktısında iki dosya
    görünmeli: `omcoskun-convert-tools-1.0.0.tgz` ve
    `convert-tools-1.0.0.jar`.

### Task 4: Harita reposu, yerelde (`/Users/omcoskun/Desktop/Projects/convert-tools-map`)

**Dosyalar (harita reposunda):**

- **`git subtree split` ile gelenler:** bugünkü `app/` içeriği, yani `src/`,
  `test/`, `public/`, `loaders/`, `webpack.config.js`, `package.json` ve
  `README.md`.
- **Yeni ya da kopyalanan:**
  - `.npmrc`, `.gitignore`, `eslint.config.mjs`;
  - `.github/workflows/ci.yml`, `.github/workflows/pages.yml`;
  - `.github/dependabot.yml`;
  - `Baslat.command`, `SECURITY.md`;
  - `docs/superpowers/specs/*` ve `docs/superpowers/plans/*` (haritaya ait
    olanlar).
- **Değişen:**
  - `package.json`: `name`, `version` ve `lint` betiği;
  - `webpack.config.js:105`, yorum.

**Arayüzler:**

- **Kullanır:** Görev 2'nin `test/support/files.mjs` dosyası (`REPO_ROOT`
  yok).
- **Kullanır:** GitHub Packages'taki `@omcoskun/convert-tools` 1.0.0
  (Görev 3).

- [ ] **Adım 1: Karşılaştırma için önceki derlemeyi kaydet**

  Kütüphane reposunda `npm run build` çalıştır, sonra çıktıyı kaydet:

  ```bash
  S=/private/tmp/claude-501/-Users-omcoskun-Desktop-Projects-convert-tools/3dc63f9e-a4ba-4f9a-9330-d46943bd13fe/scratchpad
  (cd app/build && find . -type f | sort | xargs ls -l) > "$S/bundle-before.txt"
  grep -o 'Content-Security-Policy[^>]*' app/build/index.html > "$S/csp-before.txt"
  ```

- [ ] **Adım 2: Sahibin token'ı**

  Sahipten iki şey istenir:

  - `read:packages` yetkili bir classic PAT oluşturması;
  - token'ı kendisinin `~/.npmrc` dosyasına
    `//npm.pkg.github.com/:_authToken=...` satırı olarak yazması.

  Token'ı yalnızca sahip görür ve girer.

  Denetim:

  ```bash
  npm view @omcoskun/convert-tools version --registry https://npm.pkg.github.com
  ```

  Beklenen çıktı: `1.0.0`.

- [ ] **Adım 3: Geçmişiyle yeni repo**

  ```bash
  git subtree split --prefix=app -b map-split
  git init -b main /Users/omcoskun/Desktop/Projects/convert-tools-map
  git -C /Users/omcoskun/Desktop/Projects/convert-tools-map pull /Users/omcoskun/Desktop/Projects/convert-tools map-split
  git branch -D map-split
  ```

  Beklenen: `git -C …-map log --oneline | wc -l` en az 37 commit gösterir;
  kökte `src/`, `test/` ve `README.md` bulunur.

- [ ] **Adım 4: Kütüphaneden gelen dosyalar**

  Kopyalananlar:

  - `cp -p Baslat.command SECURITY.md` harita köküne;
  - `docs/superpowers` altındaki haritaya ait **commit edilmiş** dosyalar,
    harita reposunda aynı yolla:
    - `specs/2026-11-18-map-chrome-and-dark-mode-design.md`;
    - `specs/2026-11-18-satellite-night-and-imagery-design.md`;
    - `specs/2026-11-19-moving-stars-design.md`;
    - `plans/2026-11-18-map-chrome-and-dark-mode.md`;
    - `plans/2026-11-19-satellite-night.md`.

  Taşınanlar (`mv`, commit edilmeden kalırlar): haritaya ait **commit
  edilmemiş** dosyalar. Bunlar `map-first-demo`, `gis-workspace`,
  `map-experience` ve `ui-polish` için hem `specs/…-design.md` hem
  `plans/….md` dosyalarıdır.

- [ ] **Adım 5: `package.json`, `.npmrc`, `.gitignore`**

  - **`package.json`.**
    - `"name": "convert-tools-map"`, `"version": "1.0.0"`.
    - `"description"` şu olur: `"@omcoskun/convert-tools kütüphanesinin
      harita tanıtım sitesi (React 18, Webpack 5)"`.
    - `scripts` alanına `"lint": "eslint ."` eklenir.
    - `devDependencies` alanına `"eslint": "9.39.5"` eklenir.
  - **`.npmrc`** tek satırdır:
    `@omcoskun:registry=https://npm.pkg.github.com`.
  - **`.gitignore`**, kütüphanenin dosyasıyla aynıdır. Farklar:
    - `/app/build/`, `/packages/...` ve `/build/` satırları yerine `/build/`
      gelir;
    - `/outputs/` ve `/work/` satırları kalmaz;
    - `.claude/` eklenir.

- [ ] **Adım 6: `eslint.config.mjs`**

  Kütüphanenin dosyası kopyalanır ve şu değişiklikler yapılır:

  - `packages/core-js/src` bloğu çıkarılır.
  - `globalIgnores` listesinden `packages/...` girdileri çıkarılır.
  - Yollar değişir: `app/src/**` → `src/**`, `app/src/ui/index.js` →
    `src/ui/index.js`.
  - `no-restricted-imports` desenleri `@omcoskun/convert-tools/*` ve
    `**/packages/**` olarak kalır.

- [ ] **Adım 7: Kurulum ve testler**

  Komut: `npm install --ignore-scripts --no-audit --no-fund`. Ardından:

  ```bash
  npm test && npm run lint && npm run build
  ```

  Beklenen:

  - hepsi geçer;
  - `package-lock.json` içinde
    `"resolved": "https://npm.pkg.github.com/download/@omcoskun/convert-tools/1.0.0/…"`
    satırı bulunur.

- [ ] **Adım 8: CI, Pages ve dependabot**

  - **`ci.yml`.**
    - Node matrisi `22.23.4` ve `24.22.2`.
    - İzinler `permissions: { contents: read, packages: read }`.
    - `setup-node` ayarları: `cache: npm`,
      `registry-url: https://npm.pkg.github.com`, `scope: "@omcoskun"`.
    - Adımlar: `npm ci --ignore-scripts` (ortam değişkeni
      `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`), `npm run lint`,
      `npm test` ve `npm run build`.
  - **`pages.yml`.**
    - Kütüphanenin dosyasıyla aynıdır.
    - Kurulum adımı yukarıdaki gibi kimlik doğrulama yapar; derleme
      izinlerine `packages: read` eklenir.
    - Yüklenen klasör `path: build` olur.
    - Yorumdaki `/convert-tools/` → `/convert-tools-map/`.
  - **`dependabot.yml`.**
    - `npm` (`/`), `ignore: [{ dependency-name: "@omcoskun/convert-tools" }]`.
    - `github-actions` (`/`).
    - İkisi de aylık.
  - **`webpack.config.js:105`.** Yorumdaki `/convert-tools/` →
    `/convert-tools-map/`.

- [ ] **Adım 9: `Baslat.command` ipucu**

  `npm ci --ignore-scripts || exit 1` satırı şu blok olur:

  ```zsh
  if ! npm ci --ignore-scripts; then
    echo "Paketler kurulamadı. En olası neden: kütüphane GitHub Packages'tan geliyor ve bir token istiyor."
    echo "~/.npmrc dosyasında şu satır olmalı: //npm.pkg.github.com/:_authToken=<read:packages yetkili classic token>"
    read -r "?Kapatmak için Enter tuşuna basın."
    exit 1
  fi
  ```

- [ ] **Adım 10: Token olmadan alınmış kopyayı dene**

  ```bash
  T=$(mktemp -d)
  git clone -q /Users/omcoskun/Desktop/Projects/convert-tools-map "$T/m"
  (cd "$T/m" && npm_config_userconfig=/dev/null npm ci --ignore-scripts)
  ```

  Beklenen: `E401` ya da `ENEEDAUTH` ile başarısız. Bu deneme, aşağıdaki
  commit'ten sonra yapılır.

- [ ] **Adım 11: Token sızıntısı denetimi**

  Komut: `git -C …-map grep -n "_authToken\|ghp_\|github_pat_"`

  Beklenen: yalnızca `README.md` ve `Baslat.command` içindeki örnek satırlar
  (`...` ya da `<…>`). Gerçek bir token görünmez.

- [ ] **Adım 12: Derlemeyi öncekiyle karşılaştır**

  Kaydet ve karşılaştır:

  ```bash
  (cd build && find . -type f | sort | xargs ls -l) > "$S/bundle-after.txt"
  grep -o 'Content-Security-Policy[^>]*' build/index.html > "$S/csp-after.txt"
  diff "$S/csp-before.txt" "$S/csp-after.txt"
  ```

  Beklenen:

  - `diff` çıktısı boştur;
  - dosya sayısı aynıdır;
  - adlar karma (hash) dışında aynıdır;
  - toplam JS boyutu en fazla %1 farklıdır;
  - `grep -rl "/Users/" build` boş döner.

- [ ] **Adım 13: Commit**

  ```bash
  git -C …-map add -A
  git -C …-map commit -m "Add the map's own tooling, CI and docs (from convert-tools <commit>)"
  ```

  Commit mesajındaki `<commit>`, kütüphanenin o anki `HEAD` kısa
  karmasıdır.

  Bu commit'te olmaması gerekenler: `docs/TEST_REPORT…`, `.claude/` ve
  commit edilmemiş spec/plan dosyaları. `git status` bu dosyaları
  izlenmeyen dosyalar olarak gösterir.

  Ardından Adım 10'u çalıştır.

### Task 5: Harita reposu GitHub'da ve yeni site

**Dosyalar:** yok. Bu görev yalnızca GitHub işlemlerinden oluşur ve her biri
onayla yapılır.

- [ ] **Adım 1: Repoyu aç (onayla)**

  ```bash
  gh repo create omcoskun/convert-tools-map --public --description "@omcoskun/convert-tools kütüphanesinin harita tanıtım sitesi"
  ```

- [ ] **Adım 2: Sahibin paket ayarı**

  Sahip şu sayfayı açar:
  `https://github.com/users/omcoskun/packages/npm/package/convert-tools/settings`

  "Manage Actions access" bölümünde `convert-tools-map` reposunu Read
  yetkisiyle ekler.

- [ ] **Adım 3: Pages'i aç (onayla)**

  ```bash
  gh api -X POST repos/omcoskun/convert-tools-map/pages -f build_type=workflow
  ```

  Repo boş olduğu için 4xx dönerse bu adım push'tan sonra tekrarlanır. Ardından
  `gh workflow run pages.yml` çalıştırılır.

- [ ] **Adım 4: Push (onayla)**

  ```bash
  git -C …-map remote add origin https://github.com/omcoskun/convert-tools-map.git
  git -C …-map push -u origin main
  ```

  CI ve Pages çalışmaları
  `gh run watch <id> --exit-status -R omcoskun/convert-tools-map` ile
  izlenir ve ikisi de geçer.

- [ ] **Adım 5: Canlı denetim (yerleşik tarayıcı)**

  Sayfa: `https://omcoskun.github.io/convert-tools-map/`. Beklenenler:

  - harita tuvali çizilir;
  - `#length` aracında 1 deniz mili 1852 m verir;
  - `#measure` aracında Ankara–İstanbul mesafesi kütüphane reposunun
    `geodesic-wgs84.csv` dosyasındaki `ankara-istanbul` satırıyla uyuşur;
  - kütüphane çağrısında `@omcoskun/convert-tools` yazar;
  - konsolda CSP hatası yoktur.

### Task 6: Haritayı kütüphaneden çıkar, eski siteyi kaldır

**Dosyalar (kütüphane reposunda):**

- **Silinen:**
  - `app/`, `Baslat.command`, `.github/workflows/pages.yml`;
  - Görev 4 Adım 4'te kopyalanan beş commit edilmiş belge.
- **Değişen:**
  - `package.json`: `description`, `workspaces` ve `scripts`;
  - `package-lock.json`, `eslint.config.mjs`, `.github/workflows/ci.yml`;
  - `README.md`, `.gitignore` (`/app/build/` satırı).

- [ ] **Adım 1: Sil**

  ```bash
  git rm -r -q app Baslat.command .github/workflows/pages.yml docs/superpowers/specs/2026-11-18-map-chrome-and-dark-mode-design.md docs/superpowers/specs/2026-11-18-satellite-night-and-imagery-design.md docs/superpowers/specs/2026-11-19-moving-stars-design.md docs/superpowers/plans/2026-11-18-map-chrome-and-dark-mode.md docs/superpowers/plans/2026-11-19-satellite-night.md
  ```

- [ ] **Adım 2: Kök `package.json`**

  - `"description"` → `"Kesin uzunluk ve koordinat dönüşüm kütüphanesi (JS + Java)"`.
  - `"workspaces"` → `["packages/core-js"]`.
  - `scripts` alanından `dev`, `build:app`, `build:core` ve `test:app`
    çıkar.
  - `"build"` → `"npm run build --workspace @omcoskun/convert-tools"`.
  - `"test"` → `"npm run test:core"`.
  - `.gitignore` dosyasından `/app/build/` satırı çıkar.

- [ ] **Adım 3: Lint ve CI**

  - **`eslint.config.mjs`.**
    - `app/src/**` blokları çıkar (bugün 141–166. satırlar).
    - `BROWSER_GLOBALS` artık kullanılmadığı için o da çıkar.
  - **`ci.yml`.**
    - "App tests" adımı çıkar.
    - "Build core and demo" adımı `name: Build core` olur.
    - Node matrisinin yorumunda "app's render tests" ifadesi geçiyor. O yorum
      Node 22.15 gereğini artık gerekçelendirmiyor; yorumun yerine şu yazılır:
      "Both LTS lines."

- [ ] **Adım 4: README**

  - **Giriş.** 5–7. satırlarda "`app/` bu kütüphanenin ince bir tanıtım
    arayüzüdür…" cümlesi şu olur: "Harita tanıtım sitesi ayrı bir repodadır:
    [omcoskun/convert-tools-map](https://github.com/omcoskun/convert-tools-map)."
  - **Yapı.** `app/` satırı çıkar.
  - **Komutlar.** Şunlar değişir:
    - `dev` satırı ve `Baslat.command` cümlesi çıkar;
    - `build` satırı yalnızca çekirdeği anlatır;
    - `npm test` satırında yalnızca `test:core` kalır;
    - `test:app` satırı çıkar.
  - **"Tanıtım arayüzü (`app/`)".** Bölümün tamamı (147–299. satırlar) çıkar.

- [ ] **Adım 5: Kilit dosyası ve testler**

  ```bash
  npm install --ignore-scripts --no-audit --no-fund
  npm run lint && npm test && npm run build && npm run test:pack && npm run test:java && npm run test:tools
  ```

  Beklenen: hepsi geçer ve `grep -c '"node_modules/react"' package-lock.json`
  çıktısı `0` olur.

- [ ] **Adım 6: Harita izi kalmasın**

  Komut: `git grep -n "app/\|Baslat\|test:app" -- . ':!docs/superpowers'`

  Beklenen: yalnızca README'deki harita bağlantısı çıkar.

- [ ] **Adım 7: Commit ve push (onayla)**

  ```bash
  git add -A
  git commit -m "Move the demo map to omcoskun/convert-tools-map"
  ```

  `git add -A` komutunun `docs/TEST_REPORT` ve `.claude/` dosyalarını
  eklemediğini `git status` ile doğrula. İkisi de izlenmeyen dosyadır;
  gerekirse dosyalar tek tek eklenir.

  Onay gelirse `git push origin main`. CI geçer.

- [ ] **Adım 8: Eski siteyi kaldır (onayla)**

  Yeni site Görev 5'te doğrulandıktan sonra şunu çalıştır:

  ```bash
  gh api -X DELETE repos/omcoskun/convert-tools/pages
  ```

  Birkaç dakika sonra `curl -s -o /dev/null -w "%{http_code}" https://omcoskun.github.io/convert-tools/`
  çıktısı `404` olur.
