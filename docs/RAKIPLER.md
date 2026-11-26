# RAKİPLER — Türk hukuku MCP sunucuları, kanıtlı karşılaştırma

> **Yöntem.** Her satır 2026-10-22'de GitHub API'si ve depoların **ham README** dosyaları
> okunarak dolduruldu. Bir iddia için kaynak yoksa hücreye **`doğrulanamadı`** yazıldı; hiçbir
> rakibin zayıflığı kaynaksız iddia edilmedi. Araç sayısı ve "sorgu anında canlı fetch"
> bilgileri README'de açıkça yazıyorsa **BELGE**, bizim çıkarımımızsa **ÇIKARIM** olarak işaretlendi.
> Bu dosyadaki hiçbir sayı ölçüm değildir; ölçümler `bench/report.md`'dedir.

## Özet tablo

| # | Rakip | Araç | Taşıma | Sorgu anında canlı fetch | Yanıt token bütçesi | Deterministik kural/süre | Hedef kitle | Lisans |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [`afsozer/dayanak`](https://github.com/afsozer/dayanak) (eski `emsal-mcp`) | **47** (11 core varsayılan + 36 extended) | stdio + streamable-http (`/mcp`) | **Kısmen**: yerel 72 GB korpus + canlı adaptörler | **Yok** (BELGE: yanıt bütçesi geçmiyor; araç tanımı için 20.000 karakter docstring bütçesi var) | **Yok** (BELGE: araç listesinde süre/eşik hesaplayan araç yok) | Avukat / hukukçu | AGPL-3.0-only |
| 2 | [`utkumtin/mevzuat-mcp`](https://github.com/utkumtin/mevzuat-mcp) (fork: [`mertcanureten`](https://github.com/mertcanureten/mevzuat-mcp)) | **18** | stdio (FastMCP/uvx) | **Evet** (mevzuat.gov.tr; 1 saat in-memory cache) | **Yok** | **Yok** | Geliştirici / LLM kullanıcısı | MIT |
| 3 | `saidsurucu/yargi-mcp` — **orijinal depo 404**, aynalar: [`MCYBA/yargi-mcp`](https://github.com/MCYBA/yargi-mcp), [`ozbayenes123-ops/yargi-mcp`](https://github.com/ozbayenes123-ops/yargi-mcp) | **28** (26 aktif + 1 opsiyonel semantik) | stdio (uv) + uzak MCP (`yargimcp.surucu.dev/mcp`) | **Evet** (Bedesten, AYM, Danıştay, Sayıştay, KVKK, GİB…) | **Yok** (BELGE: yalnızca *araç tanımı* için "%61,8 token azaltma / 8.692 token tasarrufu" iddiası) | **Yok** | Avukat | MIT (ayna) |
| 4 | [`aydincan/turk-hukuku-ictihat-mcp`](https://github.com/aydincan/turk-hukuku-ictihat-mcp) | **2** | `doğrulanamadı` (README: "Claude Code / Codex / Gemini CLI uyumlu", masaüstü uygulaması) | **Evet** (Bedesten, UYAP Emsal, Danıştay, AYM) | **Yok** | **Yok** | AI araç kullanıcısı / hukukçu | MIT |
| 5 | [`aydincan/turk-hukuku-mevzuat-mcp`](https://github.com/aydincan/turk-hukuku-mevzuat-mcp) | **4** | `doğrulanamadı` (aynı) | **Evet** (mevzuat.gov.tr PDF → pypdf; ~1 istek/sn, tanıtıcı UA) | **Yok** | **Yok** | AI araç kullanıcısı | MIT |
| 6 | [`ayzekhdawy/turkiye-mcp`](https://github.com/ayzekhdawy/turkiye-mcp) | **31** | Masaüstü uygulaması + MCP sunucusu (HTTP/port) | **Evet** (RG, GİB, SGK, İŞKUR, EKAP, BIST…) | **Yok** | **Yok** (hukuk dışı mali veri de taşıyor) | Genel kullanıcı | "Ticari olmayan" (GitHub: NOASSERTION) |
| 7 | [`matematicsolutions/tr-eli-mcp`](https://github.com/matematicsolutions/tr-eli-mcp) | ~**4** (BELGE: tabloda 4 araç) | stdio (MCP connector) | **Evet** (Bedesten mevzuat JSON API) | **Yok** | **Yok** | Geliştirici | Apache-2.0 |

**Bizim konumumuz (ölçüldü, `bench/report.md`):** 5 araç, **885 token** araç tanımı,
`hukuk_sor` ile **1 çağrı**, yanıt p50 **814 token** (en yüksek 1266), p50 gecikme **4,3 ms**
(p95 21,64 ms, yerel stdio; 3 koşu: 4,3 / 4,51 / 2,92 ms), 21 senaryonun **16**'sı doğrudan
yanıt / **5**'i netleştirme istedi / **0** fallback, **64/64** atıf kimliği
veritabanında çözümlendi, token bütçesine **21/21** uyum. Ölçüm `data/build/hukuk.db` (sürüm
`v20261022.436046465`, 14 mevzuat / 5266 madde / 239 karar / 65 düğüm / 49 kart / 58 parametre)
ile alındı; hash ve satır sayıları `bench/results/measurements.json` içinde.

**Kapsam farkı (BELGE + ÖLÇÜLDÜ):** bizim kapsam tüketici hukuku **+ sosyal güvenlik** (5510/4447;
`docs/adr/ADR-005-sgk-kapsami.md`). Rakiplerin araç listelerinde SGK'ya özgü süre/eşik/prim
hesabı belgelenmedi; `ayzekhdawy/turkiye-mcp` yalnızca canlı SGK verisi çektiğini söylüyor,
hukuki kural hesabı vaat etmiyor (BELGE).

## Rakip bazında kanıt

### 1) afsozer/dayanak — en yakın rakip, en büyük yüzey

- **Araç sayısı:** README rozeti "11 core + 36 extended MCP tools (47 total)";
  `docs/MCP_CONTRACTS.md` aynı sayıyı profile tablosunda doğruluyor.
  Varsayılan profil **core = 11**; tamamı için `DAYANAK_TOOL_PROFILE=full`.
  → [README](https://github.com/afsozer/dayanak#readme) · [MCP_CONTRACTS.md](https://github.com/afsozer/dayanak/blob/master/docs/MCP_CONTRACTS.md)
- **Korpus:** "11.108.242 belge", "72 GB `cache.sqlite3`", FTS5 + FAISS
  (`intfloat/multilingual-e5-small`, 384 boyut); ölçüm tarihi 16 Eylül 2026 (README'de beyan).
- **Taşıma:** stdio (`uvx --from dayanak dayanak-server`) **ve** streamable-http (`http://<host>:<port>/mcp`).
- **Canlı fetch:** evet, "canlı kaynaklar" adaptörleri (Bedesten/Yargıtay, AYM, Danıştay,
  Uyuşmazlık, Rekabet, Sayıştay, GİB, mevzuat.gov.tr, Resmî Gazete, KVKK). Korpus yoksa
  aramalar canlıya düşüyor.
- **Token bütçesi:** yanıt için **yok**. Ama araç tanımı tarafında bir bütçe var:
  "core docstring bütçesi (20 000 karakter) dolduğu için `citation_check`, `prepare_petition`,
  `read_legal_file`, `list_sources`, `legal_research_guide` extended'a alındı" (BELGE).
  Bu, aracın kendi yüzeyinin ne kadar pahalı olduğunun **kendi dokümanındaki** kanıtıdır.
- **Deterministik kural:** yok. Araç listesinde süre, zamanaşımı, görevli merci, harç hesaplayan
  araç bulunmuyor; `citation_check` atıf biçimlendirme/doğrulama yapar, hukuki eşik hesaplamaz.
- **Hedef kitle:** avukat. README'nin dili ("dilekçe hazırlık", "UDF/DOCX dışa aktarma",
  "atıf güvenli", "quote/draft kullanılabilir") doğrudan meslek kullanıcısını gösteriyor (ÇIKARIM, BELGE: README).
- **Lisans:** AGPL-3.0-only (README + GitHub API).
- **İlginç ayrıntı (bizim için ders):** README "Rate limit `DAYANAK_RATE_LIMIT_MAX=12`.
  Ölçüldü: 12'de 429 yok… 15'te 429 cooldown döngüsüne girip hız sıfırlanıyor" diyor.
  Yani 429 duvarı bizim gözlemimizle tutarlı; ama onların varsayılanı **bizim 1 istek/sn
  tavanımızdan çok daha hızlı** (ADR-001).

### 2) utkumtin/mevzuat-mcp (18 araç) — "her mevzuat türü için iki araç" tasarımı

- **18 araç:** 9 mevzuat türü × 2 (`search_<tür>` + `search_within_<tür>`).
  Türler: kanun, khk, tuzuk, kurum_yonetmelik, cbk, cbbaskankarar, cbyonetmelik, cbgenelge, teblig.
- **Canlı fetch:** evet; mevzuat.gov.tr'ye sorgu anında gidiyor, 1 saat TTL'li in-memory cache,
  CB Kararı/Genelgesi için Mistral OCR (PDF).
- **Token bütçesi / deterministik kural / hedef kitle:** yok / yok / geliştirici.
- **Lisans:** MIT. **Not:** `mertcanureten/mevzuat-mcp` bu deponun **fork'u** (GitHub API: `fork: true`,
  `parent: utkumtin/mevzuat-mcp`); fork README'si `uvx --from git+https://github.com/saidsurucu/mevzuat-mcp`
  komutunu hâlâ taşıyor — yani **atıf zinciri karışık**, araç sayısı ise iki depoda aynı (18).
  → [README](https://raw.githubusercontent.com/mertcanureten/mevzuat-mcp/main/README.md)

### 3) saidsurucu/yargi-mcp — orijinal depo kayıp, aynalar 28 araç diyor

- **Durum:** `github.com/saidsurucu/yargi-mcp` ve `saidsurucu/mevzuat-mcp` **2026-10-22 itibarıyla 404**;
  `saidsurucu` kullanıcısı duruyor (42 public repo) ama bu iki depo listede yok.
  Bu yüzden bilgileri **ayna** depolardan alıyoruz: MCYBA/yargi-mcp README'si açıkça
  "Orijinal repo saidsurucu'ye aittir. Orijinal repo kaybolduğu için burada paylaşım yapılmıştır" diyor.
- **Araç sayısı:** "**26 aktif MCP aracı** + **1 opsiyonel semantik arama aracı**" (BELGE, ayna README).
- **Taşıma:** stdio (`uvx`) + uzak MCP (`https://yargimcp.surucu.dev/mcp`); eski
  `yargimcp.fastmcp.app` adresi kullanım dışı.
- **Canlı fetch:** evet; Bedesten/AYM/Danıştay/Sayıştay/KVKK/BDDK/BTK/GİB/Sigorta Tahkim.
- **Token bütçesi:** yanıt için yok. Ama README'de **araç tanımı** için bir optimizasyon iddiası var:
  "%61,8 token azaltma (8.692 token tasarruf)" → bu, optimizasyon **öncesi** tanım yükünün
  ≈14.000 token, sonrasının ≈5.400 token olduğunu ima eder (hesap: 8.692/0,618−8.692).
  Rakam onların iddiası; bizim ölçümümüz değil (BELGE).
- **Deterministik kural / hedef kitle:** yok / avukat (ÇIKARIM).
- **Lisans:** MIT (ayna).
- **Dışlanan:** `ShaironYT59/yargi-mcp` (20 yıldız) aynı adı taşıyor ama README'si
  "zip indir, `./yargi-mcp` çalıştır" diyen bir dağıtım sayfası; gerçek bir MCP sunucu tarifi
  içermiyor. **Rakip olarak sayılmadı** (şüpheli/doğrulanamadı).

### 4–5) aydincan/turk-hukuku-* — küçük yüzeyli ama **kuralsız** rakipler

- `turk-hukuku-ictihat-mcp`: **2 araç** — `ictihat_ara(ifade, mahkeme, adet, sayfa)` ve
  `karar_getir(karar_id, mahkeme)`. Her sonuç hazır `atif` künyesi + resmî `kaynak` bağlantısı taşır.
  → [README](https://github.com/aydincan/turk-hukuku-ictihat-mcp#readme)
- `turk-hukuku-mevzuat-mcp`: **4 araç** — `mevzuat_ara`, `madde_getir`, `kanun_metni_getir`,
  `bilinen_kanunlar`. PDF'i çekip pypdf ile madde ayıklıyor; "tek istek, ~1 istek/sn, tanıtıcı UA,
  CAPTCHA çözmez" diyor.
  → [README](https://github.com/aydincan/turk-hukuku-mevzuat-mcp#readme)
- **Bizim için önemli:** küçük araç yüzeyi **tek başına farklılaştırıcı değil**; bu iki sunucu da
  küçük. Farkımız **kurallar + bütçe + tek çağrıda eylem planı** tarafında olmalı. Bu ADR-003 ve
  README'de bu şekilde yazıldı.

### 6) ayzekhdawy/turkiye-mcp — hukuk + mali veri, geniş yüzey

- **31 araç** ("Sistem · Araçlar — 31 MCP aracının kataloğu", ekran görüntüsü alt yazısı).
- Hukuk dışı kaynaklar da var (GİB, SGK, İŞKUR, EKAP ihaleleri, BIST) → hedef kitle "genel
  kullanıcı" diyebiliriz ama README bir **masaüstü uygulaması** olarak konumlanıyor (ÇIKARIM).
- Lisans: README rozeti "Ticari Olmayan"; GitHub API lisansı `NOASSERTION` → **OSI lisansı
  doğrulanamadı**. Bu, kodun yeniden kullanımı açısından önemli bir belirsizlik.
  → [README](https://github.com/ayzekhdawy/turkiye-mcp#readme)

### 7) matematicsolutions/tr-eli-mcp — mevzuat odaklı, atıf sözleşmeli

- **4 araç:** `tr_search_legislation`, `tr_get_legislation_content`, `tr_get_legislation_toc`,
  `tr_list_legislation_types` (README tablosu; daha fazlası varsa doğrulanamadı).
- Bedesten (`bedesten.adalet.gov.tr/mevzuat`) JSON API'sini kullanıyor; **yargı kararı kapsamıyor**
  (README: Yargıtay'a ağdan ulaşılamadı, AYM SPA olduğu için bağlanmadı — dürüst bir not).
- Lisans Apache-2.0. → [README](https://github.com/matematicsolutions/tr-eli-mcp#readme)

## Ortak desen: piyasa ne yapıyor?

1. **Herkes "atıf" vaat ediyor, kimse "cevap" vaat etmiyor.** Tamamı arama + belge getirme
   sunuyor; hukuki sonucu (süre, eşik, görevli merci) hesaplayan sunucu **yok** (araç listelerine
   göre; BELGE).
2. **Yüzey büyüyor.** 47, 31, 28, 18 araç: hepsi "daha çok kaynak = daha iyi" ekseninde.
   Yalnızca iki küçük yüzeyli rakip var (2 ve 4 araç) ve ikisi de yalnızca mevzuat/içtihat.
3. **Token bütçesi yok.** Hiçbiri yanıtı token ile sınırlamıyor; "token optimizasyonu" iddiaları
   **araç tanımları** için. Bu, bizim ADR-003 kararımızın neden gerekli olduğunu gösteriyor.
4. **Hedef kitle avukat.** README'lerin hiçbirinde "vatandaş", "layperson", "hukuk bilmeyen"
   ifadesi yok; UDF/DOCX, dilekçe, künye formatı var. Bizim farkımız dil ve eylem planı.
5. **Lisanslar karışık.** AGPL (dayanak) ticari kullanımda bulaşıcı; "ticari olmayan" (turkiye-mcp)
   doğrudan kullanımı kısıtlar. MIT/Apache olanlar yeniden kullanılabilir — ama bizim kodumuz
   bağımsız, bu yüzden lisans riski taşımıyoruz.

## Doğrulanamayanlar (açık liste)

- Hangi rakibin **gerçek gecikmesi** ne kadar: hiçbiri ölçülmedi; hiçbir README sayı vermiyor.
  (Ölçmek için kurulum + kaynak sitelere yük bindirmek gerekir; v1 kapsamında yapılmadı.)
- `aydincan/*` depolarının **taşıma tipi** (stdio mu HTTP mi) README'de açık değil.
- `ayzekhdawy/turkiye-mcp` lisansının tam metni (Ticari Olmayan) — hukuken neyi kapsadığı
  `doğrulanamadı`.
- `yargi-mcp` orijinal deposunun neden 404 olduğu (DMCA, silme, taşınma) `doğrulanamadı`.
- Hiçbir rakibin **kalite/doğruluk** ölçümü yok; "iyi" olduklarına dair kanıt, README iddiaları.

## Nasıl güncel tutulur

```bash
# araç sayısı / lisans / son güncelleme
for r in afsozer/dayanak utkumtin/mevzuat-mcp MCYBA/yargi-mcp aydincan/turk-hukuku-ictihat-mcp \
         aydincan/turk-hukuku-mevzuat-mcp ayzekhdawy/turkiye-mcp matematicsolutions/tr-eli-mcp; do
  curl -s "https://api.github.com/repos/$r" | jq -c '{r:.full_name, stars:.stargazers_count, lic:.license.spdx_id, pushed:.pushed_at}'
done
```

Yeni bir rakip eklenecekse: (1) README'yi ham olarak oku, (2) araç sayısını **araç listesinden**
say, (3) her hücreye kanıt bağlantısı koy, (4) doğrulayamadığın hücreye `doğrulanamadı` yaz.
