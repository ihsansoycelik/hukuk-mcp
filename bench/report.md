# hukuk-mcp — ölçüm raporu

> Bu rapor `bench/` altındaki harness tarafından üretilir. Her hücrenin kaynağı **ÖLÇÜLDÜ / BELGE / TAHMİN** olarak işaretlenmiştir. Rakip gecikmesi ölçülmemiştir; modellenen süreler TAHMİN'dir.

- Rapor üretimi: 2026-10-22T19:31:31.387Z
- Tokenizer: `gpt-tokenizer/encode (cl100k_base)` (sunucunun bütçede kullandığı tokenizer'ın aynısı)
- Tip kontrolü: **yeşil (0 hata)** (`node_modules/.bin/tsc --noEmit -p tsconfig.json`, 2026-10-22T19:29:58.433Z)
- Sunucu commit: `1667a4f` · Node `v26.10.0`
- Anlık görüntü: sunucu `index.ts#92e163be70c1b68c`, 7 kaynak dosya hash'lendi, db#14a61ecb1abadda6 (repo'da git yok; bu yüzden commit yerine içerik hash'i kaydediliyor)
- Ölçüm: hukuk_sor × 20 tekrar, taşıma `stdio (StdioClientTransport)`, sunucu `<repo>/packages/mcp-server/src/index.ts`
- Ölçülen veritabanı: `<repo>/data/build/hukuk.db` (18.6 MB) · ölçüm anı: 2026-10-22T19:30:46.402Z
- Korpus sürümü: `v20261022.436046465` · 14 mevzuat · 5266 madde · 239 karar · 65 düğüm · 49 kart · 58 parametre satırı

## 1. Her tur ödenen sabit maliyet (araç tanımları)

Araç tanımları modelin her turunda yeniden gönderilir. Aşağıdaki tablo `tools/list` cevabının JSON'u üzerinden `gpt-tokenizer` ile sayılmıştır.

| yüzey | araç | tanım token | kanıt | not |
| --- | --- | --- | --- | --- |
| **hukuk-mcp (bu sunucu)** | 5 | **885** | ÖLÇÜLDÜ | gerçek tools/list payload'ı |
| afsozer/dayanak — core profil | 11 | 713 | BELGE | belgelenen parametrelerden kuruldu, açıklama yok |
| afsozer/dayanak — full profil (47 araç) | 47 | 3053 | KARIŞIK | araç sayısı belgeli, şemalar varsayım |
| saidsurucu/yargi-mcp (ayna: MCYBA/yargi-mcp) — 28 araç | 28 | 1820 | KARIŞIK | araç sayısı belgeli, şemalar varsayım |
| utkumtin/mevzuat-mcp (fork: mertcanureten) — 18 araç | 18 | 1265 | BELGE | belgelenen parametrelerden kuruldu, açıklama yok |
| ayzekhdawy/turkiye-mcp — 31 araç | 31 | 2015 | KARIŞIK | araç sayısı belgeli, şemalar varsayım |
| aydincan/turk-hukuku-ictihat-mcp — 2 araç | 2 | 117 | BELGE | belgelenen parametrelerden kuruldu, açıklama yok |
| aydincan/turk-hukuku-mevzuat-mcp — 4 araç | 4 | 158 | BELGE | belgelenen parametrelerden kuruldu, açıklama yok |

**Dürüst okuma (bu bölüm önemli).** Rakip şemaları **nesir açıklaması olmadan** kuruldu; gerçek payload daha büyüktür, yani o sütun bir **alt sınırdır**. Buna rağmen:

- Bizim 5 aracımız **885 token** (ÖLÇÜLDÜ). dayanak'ın 11 core aracının **açıklamasız** şema alt sınırı **713 token** — yani çıplak şema karşılaştırmasında biz **1.24× daha pahalıyız**. "Az araç = her zaman az token" iddiası **yanlıştır**; araç başına açıklama maliyeti belirleyici.
- dayanak core için **20.000 karakter** docstring bütçesi belgeliyor → ölçtüğümüz 3.35 karakter/token oranıyla ≈ **5970 token**. Şema + bu açıklama ≈ **6683 token** (TAHMİN); bu durumda biz **7.55× daha ucuzuz**.
- 47 araçlı full profilin açıklamasız alt sınırı **3053 token** → biz **3.45× daha ucuzuz**; açıklamalar eklenince fark büyür.
- Sonuç: avantajımız **araç sayısından** çok **tanım başına maliyet** ve **tur başına çağrı** sayısında. Kendi tanımlarımız kısaltıldı (1.200 → 885 token, ölçüldü); en büyük kalem `hukuk_sor` (334 token, toplamın ~%38'ü).

Kaynak (docstring bütçesi): [dayanak MCP_CONTRACTS](https://github.com/afsozer/dayanak/blob/master/docs/MCP_CONTRACTS.md).

### İlk tur toplamı (tanım + tek yanıt)

| yüzey | tanım token | tek yanıt token | ilk tur toplam | kanıt |
| --- | --- | --- | --- | --- |
| hukuk-mcp | 885 | 814 | **1699** | ÖLÇÜLDÜ |
| dayanak core (11 araç), 4 çağrı | 713 | 4018 | 4731 | KARIŞIK |
| dayanak core, iyimser 2 çağrı | 713 | 2009 | 2722 | KARIŞIK |
| dayanak full (47 araç), 4 çağrı | 3053 | 4018 | 7071 | KARIŞIK |

Oran (ilk tur toplamı, rakip/biz): core 4 çağrı **2.78×**, core iyimser 2 çağrı **1.60×**, full **4.16×**.

Taban yanıt token'ı 4018 (2 arama + 2 tam metin; tam metin medyanı 1074 token, kendi korpusumuzdan ÖLÇÜLDÜ). İyimser model tek arama + tek tam metin varsayar: 2009 token.

## 2. Senaryo bazında

Her senaryo gerçekçi bir vatandaş sorusudur (`bench/scenarios.jsonl`). Bizim sütunlarımız gerçek MCP çağrısıdır; taban sütunları modelledir.

| senaryo | biz çağrı (ÖLÇÜLDÜ) | biz yanıt tok (ÖLÇÜLDÜ) | biz p50 ms (ÖLÇÜLDÜ) | taban çağrı (TAHMİN) | taban tok (KARIŞIK) | taban ms (TAHMİN) | token oranı vs core | token oranı vs full | süre oranı (model/biz) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| arac-sanziman | 1 | 1194 | 4.62 | 4 | 4018 | 3760 | 2.28× | 3.40× | 813.85× |
| telefon-kapanma | 1 | 1085 | 5.27 | 4 | 4018 | 3760 | 2.40× | 3.59× | 713.47× |
| koltuk-cayma | 1 | 1000 | 5.81 | 4 | 4018 | 3760 | 2.51× | 3.75× | 647.16× |
| tesisat-yarim-is | 1 | 246 | 1.38 | 4 | 4018 | 3760 | 4.18× | 6.25× | 2724.64× |
| depozito-odemiyor | 1 | 249 | 1.12 | 4 | 4018 | 3760 | 4.17× | 6.24× | 3357.14× |
| kart-aidat | 1 | 814 | 2.5 | 4 | 4018 | 3760 | 2.78× | 4.16× | 1504.00× |
| spor-salonu-uyelik | 1 | 495 | 2.98 | 4 | 4018 | 3760 | 3.43× | 5.12× | 1261.74× |
| otel-iptal | 1 | 879 | 3.06 | 4 | 4018 | 3760 | 2.68× | 4.01× | 1228.76× |
| ucus-rotar | 1 | 218 | 1.72 | 4 | 4018 | 3760 | 4.29× | 6.41× | 2186.05× |
| ikinci-el-arac-motor | 1 | 1055 | 6.69 | 4 | 4018 | 3760 | 2.44× | 3.64× | 562.03× |
| dogalgaz-fatura | 1 | 900 | 3.79 | 4 | 4018 | 3760 | 2.65× | 3.96× | 992.08× |
| mobilya-gecikme | 1 | 241 | 1.9 | 4 | 4018 | 3760 | 4.20× | 6.28× | 1978.95× |
| hakem-heyeti-sure | 1 | 888 | 6.31 | 4 | 4018 | 3760 | 2.67× | 3.99× | 595.88× |
| kidem-tazminat | 1 | 232 | 3.74 | 4 | 4018 | 3760 | 4.24× | 6.33× | 1005.35× |
| kredi-dosya-masrafi | 1 | 856 | 27.67 | 4 | 4018 | 3760 | 2.72× | 4.06× | 135.89× |
| internet-hiz | 1 | 489 | 13.99 | 4 | 4018 | 3760 | 3.44× | 5.15× | 268.76× |
| eticaret-kayip-kargo | 1 | 819 | 6.35 | 4 | 4018 | 3760 | 2.78× | 4.15× | 592.13× |
| servis-aramizda | 1 | 1167 | 10.28 | 4 | 4018 | 3760 | 2.31× | 3.45× | 365.76× |
| sgk-10-90-gun | 1 | 720 | 3.84 | 4 | 4018 | 3760 | 2.95× | 4.41× | 979.17× |
| gss-prim-borcu | 1 | 478 | 3.81 | 4 | 4018 | 3760 | 3.47× | 5.19× | 986.88× |
| issizlik-odenegi-700 | 1 | 682 | 3.34 | 4 | 4018 | 3760 | 3.02× | 4.51× | 1125.75× |

**Gecikme oranı nasıl okunmalı.** Son sütun, modellenen canlı yolun (4 çağrı × 940 ms) bizim ölçülen p50'mize oranıdır. Oranı büyüten şey **ağ varsayımıdır**, ölçülmüş bir rakip değildir; bu yüzden sütun bir yarış iddiası değil, **mimari fark** göstergesidir (sorgu yolunda ağ yok).

## 3. Bizim sunucunun ölçülen ayrıntısı

| araç | tanım token | pay |
| --- | --- | --- |
| `hukuk_sor` | 334 | %37.7 |
| `derinles` | 145 | %16.4 |
| `ara` | 198 | %22.4 |
| `hesapla` | 116 | %13.1 |
| `dogrula` | 90 | %10.2 |

- Toplam tanım: **885 token / 5 araç** (ÖLÇÜLDÜ)
- Soğuk başlangıç (spawn → ilk `tools/list`): **459.66 ms** (ÖLÇÜLDÜ)
- `tools/list` gidiş-dönüşü: **6.38 ms** (ÖLÇÜLDÜ)
- Yanıt token medyanı: **814**, en yüksek: **1266** (ÖLÇÜLDÜ)
- Gecikme (kararlı hal, senaryo başına ilk çağrı hariç): p50 **4.3 ms**, p95 **21.64 ms** (yerel stdio; ÖLÇÜLDÜ)
- Senaryo başına ilk çağrı: p50 **7.45 ms**, p95 **24.82 ms** (ÖLÇÜLDÜ)
- Bütçeye uyum (`butce` alanına göre): **21/21** (ÖLÇÜLDÜ)

Yapısal kontrol (ÖLÇÜLDÜ): 21 yanıtın **21**'inde çözümlenebilir atıf kimliği (`m:`, `k:`, `t/`, `s/`, `a:`), **16**'inde `YOL` (eylem yol haritası) bölümü bulundu.

**Ölçüm tekrarı (ÖLÇÜLDÜ).** 3 koşu: p50 4.3 / 4.51 / 2.92 ms, p95 21.64 / 17.87 / 9.93 ms, soğuk başlangıç 459.66 / 652.72 / 775.66 ms. Kayıtlı ölçüm `measurements-hukuk-run1.json` (medyan p50).
Sebep: Gerçek korpus (data/build/hukuk.db, surum v20261022.436046465) ile 3 koşu; medyan p50'li koşu (measurements-hukuk-run1.json) measurements.json olarak kaydedildi. Makine paylaşımlı. Ölçüm anındaki load average: `4.54, 3.95, 4.92` (8 CPU). Yani bu sayılar **alt sınır değil**, paylaşımlı bir makinede ölçülmüş gerçek değerlerdir.

Bölüm bulunma sayıları: `DÜĞÜM` 16 · `ÖZET` 16 · `KURALLAR` 16 · `HAKLAR` 16 · `YOL` 16 · `EKSİK OLGULAR` 14 · `KARARLAR` 3 · `DERINLES` 16 · `NOT` 1

### Korpus ve kapsam

_Satır sayıları rapor üretim anında okunur; ölçüm anındaki DB hash'i yukarıdadır. Korpus derlemesi sürüyorsa sayılar ölçümden sonra değişmiş olabilir._

| varlık | satır |
| --- | --- |
| mevzuat | 14 |
| madde | 5266 |
| karar | 239 |
| dugum | 65 |
| kart | 49 |
| kural_parametre | 58 |

**Kapsam (ÖLÇÜLDÜ):** 21 senaryonun **16**'i doğrudan yanıt üretti, **5**'i `BELİRSİZ DÜĞÜM` ("hangi konu?") netleştirmesi istedi, **0**'i `DUGUM_BULUNAMADI` fallback'ine düştü. Netleştirme ve fallback, ontoloji o konuyu tanımıyorsa **doğru** davranıştır (yanlış düğüme emin cevap vermekten iyidir) ama kapsam boşluğu olarak raporlanır.

**Atıf çözümlenebilirliği (ÖLÇÜLDÜ):** yanıtlarda geçen **64** benzersiz kimliğin **64**'i ölçülen veritabanında bulundu.

## 4. Veritabanı karşılaştırması (aynı sunucu, farklı korpus)

Sunucu aynı; yalnızca `HUKUK_DB` değişiyor. Bu tablo, cevap kalitesinin koddan çok **korpusun doluluğuna** bağlı olduğunu gösterir. Hepsi ÖLÇÜLDÜ.

| veritabanı | yanıt | fallback | yanıt tok (p50) | p50 ms | p95 ms | ölçüm |
| --- | --- | --- | --- | --- | --- | --- |
| `bench/results/merged.db` | 15 | 3 | 221 | 6.22 | 21.8 | 2026-10-22T15:00:31.918Z |
| `data/build/fixture.db` | 15 | 3 | 221 | 3.89 | 16.2 | 2026-10-22T14:59:48.242Z |
| `data/build/hukuk.db` | 16 | 0 | 814 | 4.3 | 21.64 | 2026-10-22T19:30:46.402Z |

## 5. Yöntem

**Bizim taraf (ÖLÇÜLDÜ).** `bench/measure.ts` sunucuyu gerçek bir MCP istemcisi gibi başlatır (`StdioClientTransport`), `tools/list` payload'ını alır, her senaryo için `hukuk_sor` çağırır ve dönen metnin token'ını `gpt-tokenizer` ile sayar. Gecikme duvar saatiyle ölçülür; ilk çağrı JIT/ısınma etkisini dışlamak için tekrarlanır (`--iterations`).

**Taban taraf (BELGE + TAHMİN).** Rakibin araç yüzeyi, kamuya açık dokümandaki araç sayısı ve parametre listelerinden yeniden kurulur; açıklamalar eklenmez (alt sınır). Sorgu başına çağrı zinciri ve canlı tur süresi varsayımdır ve `bench/baseline.ts` içinde tek tek sabit olarak yazılıdır. Rakip gecikmesi **ölçülmedi**.

**Varsayımlar (tamamı `bench/baseline.ts` içinde):**

| varsayım | değer | kaynak |
| --- | --- | --- |
| arama başına sonuç | 5 | TAHMİN |
| sonuç başına metadata | 80 token | TAHMİN |
| snapshot/snippet | 360 karakter ≈ 107 token | BELGE (360 karakter) + ÖLÇÜLDÜ (token dönüşümü) |
| tam karar metni | 1074 token (medyan) | ÖLÇÜLDÜ — kendi korpusumuz |
| sorgu başına çağrı (standart) | 4 | TAHMİN |
| sorgu başına çağrı (iyimser) | 2 | TAHMİN |
| canlı tur süresi | 900 ms | TAHMİN |
| çağrı başına ayrıştırma | 40 ms | TAHMİN |

## 6. Yeniden üretim

```bash
# 0) bağımlılıklar (gpt-tokenizer + MCP SDK zaten kök package.json'da)
pnpm install

# 1) korpus (gerçek db varsa atlanır; yoksa fixture + gerçek mevzuat birleştirilir)
node bench/merge-dbs.ts              # -> bench/results/merged.db (data/build'e dokunmaz)

# 2) bizim sunucu (server yoksa PENDING kaydı yazar, çıkış kodu 0)
node bench/measure.ts --db data/build/hukuk.db --iterations 20   # --only <id> --verbose

# 3) rakip alt sınırı (ağ gerekmez)
node bench/baseline.ts               # --live-rtt ile tek istek ölçümü (1 req/s, kendi UA)

# 4) raporu yeniden üret (tip kontrolü kaydı bench.ts içinde)
node bench/report.ts
```

Tek komut: `node bench/bench.ts` (sırayla typecheck → measure → baseline → report).

## 7. Sınırlar (dürüstlük bölümü)

1. **Rakip gecikmesi ölçülmedi.** Taban süre sütunu varsayılan tur süresiyle modellenmiştir. `--live-rtt` yalnızca *bu ağdan mevzuat.gov.tr'ye tek isteğin* süresini ölçer; rakip sunucunun uçtan uca süresi değildir.
2. **Rakip şemaları açıklamasız kuruldu.** Gerçek payload daha büyüktür; tablo alt sınırdır. Açıklama payı için dayanak'ın belgelenmiş 20.000 karakter docstring bütçesi ayrıca raporlanır.
3. **Senaryolar 5 aracın kapsamına göre seçildi** ve `bugun` sabitlendi (2026-10-22). Farklı bir gün, kural sonuçlarını değiştirir; token/gidiş-dönüş sayılarını değiştirmez.
4. **Ölçüm yerel stdio üzerindedir.** Ağ taşıması (streamable-http) ve istemci tarafı model gecikmesi kapsam dışıdır.
5. **Korpus hareketli bir hedefti.** Ölçüm tek bir DB sürümüne (`meta.surum`, yukarıda) aittir; korpus derlemesi sürerken yeniden üretim farklı satır sayıları verebilir. Bu yüzden her ölçüm kendi DB hash'ini ve sürümünü taşır.
6. **Token sayısı `gpt-tokenizer` (cl100k_base) iledir.** Başka bir modelin tokenizer'ı farklı sayar; sunucunun bütçesi de bu tokenizer'a göre tanımlıdır, bu yüzden iç tutarlılık var, modeller arası karşılaştırma için +-%10 oynama beklenmelidir.

## 8. Örnek yanıt (kırpılmış)

**arac-sanziman** — 1194 token, 4.62 ms, bütçe içinde: evet

```text
DÜĞÜM t/ayipli-mal/arac (güven 0.52) | kart v1 taslak | sürüm v20261022.436046465 ÖZET Satın aldığınız araçta teslimden sonra ortaya çıkan arıza ayıplı mal sayılabilir; bu durumda satıcıya karşı dört seçimlik haktan birini kullanabilirsiniz
```

**telefon-kapanma** — 1085 token, 5.27 ms, bütçe içinde: evet

```text
DÜĞÜM t/ayipli-mal/elektronik (güven 0.35) | kart v1 taslak | sürüm v20261022.436046465 ÖZET Telefon, bilgisayar veya televizyon gibi bir cihaz arızalandığında ayıplı mal hükümleri uygulanır; satıcıya karşı dört seçimlik hakkınız vardır [m:
```

**koltuk-cayma** — 1000 token, 5.81 ms, bütçe içinde: evet

```text
DÜĞÜM t/mesafeli-sozlesme/cayma-hakki (güven 0.32) | kart v1 taslak | sürüm v20261022.436046465 ÖZET İnternet, telefon veya posta yoluyla kurulan mesafeli sözleşmelerde, gerekçe göstermeden ve cezai şart ödemeden cayma hakkınız vardır [m:65
```

**tesisat-yarim-is** — 246 token, 1.38 ms, bütçe içinde: evet

```text
BELİRSİZ DÜĞÜM | sürüm v20261022.436046465 HANGİ KONU? 1) t/ayipli-hizmet/tamir-servis (0.28) — Onarım sonrası arızanın devam etmesi, yeni hasar oluşması, parça takılmaması veya süresinde tamamlanmaması. 2) s/saglik/katilim-payi-iadesi (0.2
```

---

Üretim: `node bench/report.ts` · Taban modeli: `bench/baseline.ts` · Senaryolar: `bench/scenarios.jsonl` (21 adet) · Rapor zamanı: 2026-10-22T19:31:31.449Z
