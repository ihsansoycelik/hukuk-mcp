# SGK alanı — tasarım sözleşmesi (v1)

> Bu dosya, SGK (sosyal güvenlik) alanının mevcut 5 araçlı MCP sunucusuna nasıl
> eklendiğini tanımlar. Kaynak metinler `5510` ve `4447` sayılı kanunlardır;
> her hukuki cümle `[m:5510/…]` / `[m:4447/…]` kimliği taşır.
> Tasarım ilkesi değişmez: **sorgu yolunda üretken LLM yok**, değerler tarihli
> parametre tablosunda, süreler kuralla hesaplanır, bilinmeyen olgu uydurulmaz.

## 1. Kapsam ve bilinçli sınırlar

**Kapsam içi (v1)**
- İşten ayrılma sonrası sağlık hakkı (5510 m.67: 10 gün + şartlı 90 gün).
- Müstehaklık/provizyon sorunu (5510 m.67: 30 gün prim, 60 gün borç eşiği).
- Muayene/ilaç katılım payı ve cepten yapılan sağlık harcamalarının iadesi
  (5510 m.68, m.69, m.97).
- GSS gelir testi ve GSS prim borcu (5510 m.60, m.61, m.67, m.89, m.93).
- İşsizlik ödeneği (4447 m.50–52).
- İş kazası bildirimi ve temel haklar (5510 m.13, m.16, m.18, m.21).
- SGK işlemlerine itiraz ve görevli mahkeme (5510 m.101).

**Kapsam dışı (v1, açıkça söylenir)**
- Emeklilik yaşı/aylık hesabı (5510 m.28'in kademeli yaş tablosu ve geçiş
  hükümleri ayrı bir çalışma gerektirir).
- Kıdem/ihbar tazminatı, ücret alacağı (iş hukuku; ayrı alan).
- Sağlık hukuku/malpraktis (hekim hatası) — SGK finansmanıyla karıştırılmaz.
- Somut dosyaya dilekçe yazımı; sunucu yol ve dayanak verir, dilekçe üretmez.

## 2. Kimlik sözleşmesi

| Tür | Biçim | Örnek |
|---|---|---|
| Tüketici düğümü | `t/<dal>/<yaprak>` | `t/ayipli-mal/arac` |
| SGK düğümü | `s/<dal>/<yaprak>` | `s/saglik/isten-ayrilma-sonrasi-hak` |
| Kökler | `t/tuketici`, `s/sgk` | — |
| Madde | `m:<kanun>/<madde>[@tarih]` | `m:5510/67`, `m:5510/67@2008-10-01` |

`t/` ile `s/` aynı ontolojide, aynı yönlendiriciyle yarışır. `ara(alan=…)`
filtresi `t/…` ve `s/…` öneklerini kabul eder; `sgk` kısaltması `s/`ye çözülür.
Yeni bir alan eklendiğinde araç sayısı **artmaz** (5 araç sabit).

## 3. Korpus

`pipeline/collect/laws.py` içindeki `DEFAULT_LAWS` listesine eklenir:

| Kanun | Ad | URL |
|---|---|---|
| 5510 | Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu | `https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5510.htm` |
| 4447 | İşsizlik Sigortası Kanunu | `https://www.mevzuat.gov.tr/MevzuatMetin/1.5.4447.htm` |

`pipeline/build.py` `REQUIRED_ARTICLES` listesine en az şunlar girer:
`m:5510/13`, `m:5510/60`, `m:5510/61`, `m:5510/67`, `m:5510/68`,
`m:5510/93`, `m:5510/97`, `m:5510/101`, `m:4447/50`, `m:4447/51`.
Build, bu maddeler yoksa yayınlamaz.

## 4. Ontoloji ağacı (root `s/sgk`)

Toplam: 1 kök + 5 dal + 8 yaprak = **14 düğüm**; her yaprağa **elle yazılmış**
bir kart (8 kart). Yaprak düğümler kendi `kurallar` ve `maddeler` listesini
taşır; dal listesi yalnızca varsayılandır.

| Yaprak | Ad | Maddeler | Kurallar |
|---|---|---|---|
| `s/saglik/isten-ayrilma-sonrasi-hak` | İşten ayrılma sonrası sağlık hakkı (10+90 gün) | 5510/67 | `sgk_saglik_hakki` |
| `s/saglik/provizyon-alinamama` | Müstehaklık yok / provizyon alınamıyor | 5510/60, 5510/67 | `sgk_saglik_hakki_kosullari` |
| `s/saglik/katilim-payi-iadesi` | Muayene ve ilaç katılım payının iadesi | 5510/68, 5510/69, 5510/97 | `gss_alacak_zamanasimi` |
| `s/gss/gelir-testi` | GSS gelir testi ve tescil | 5510/60, 5510/61 | `gss_gelir_testi` |
| `s/gss/prim-borcu` | GSS prim borcu ve sağlık hakkına etkisi | 5510/67, 5510/89, 5510/93 | `gss_prim_zamanasimi` |
| `s/gelir/issizlik-odenegi` | İşsizlik ödeneği | 4447/50, 4447/51, 4447/52 | `issizlik_odenegi` |
| `s/is-kazasi/bildirim-ve-haklar` | İş kazası bildirimi ve haklar | 5510/13, 5510/16, 5510/18, 5510/21 | `is_kazasi_bildirim` |
| `s/usul/kurum-karari-itiraz` | SGK kararına itiraz ve dava yolu | 5510/101 | `sgk_dava_yolu` |

Her yaprakta en az 5 örnek kullanıcı cümlesi ve ayırt edici tetikleyiciler
bulunur. Örnekler yönlendirme altın setinden bağımsız yazılır.

## 5. Kurallar (saf fonksiyon, `bugun` parametre)

Tüm hukuki sayılar `kural_parametre` satırından okunur; kodda çıplak süre/eşik
yoktur. Kaynak URL'ler `mevzuat.gov.tr` maddesidir; `durum` = `uzman_onayli`
yalnızca kanun metni sayıyı doğrudan yazıyorsa.

### 5.1 `sgk_saglik_hakki`
- Girdi: `isten_cikis_tarihi` (ISO, zorunlu), `son_bir_yil_prim_gun` (int, ops.).
- Parametre: `temel_gun=10`, `ek_gun=90`, `ek_gun_kosul_prim_gun=90`.
- Çıktı: temel son gün = çıkış + 10 gün. Prim günü verilmiş ve ≥90 ise son gün
  = çıkış + 10 + 90 gün. Prim günü yoksa yalnızca temel süre hesaplanır; 90 günlük
  ek sürenin şarta bağlı olduğu `uyarilar`da söylenir (uydurulmaz).
- Dayanak: `m:5510/67@2008-10-01`.

### 5.2 `sgk_saglik_hakki_kosullari`
- Girdi: `son_bir_yil_prim_gun` (int, zorunlu), `prim_borcu_gun` (int, ops.),
  `sigortalilik_turu` (`4a|4b|4c|60g`, ops., varsayılan `4a`), `tecil_var` (bool, ops.).
- Parametre: `asgari_prim_gun=30`, `azami_borc_gun=60`.
- Çıktı: `uygun` / `uygun_degil` + hangi şartın sağlanmadığı. 60/g türünde
  60 günden fazla borç (tecil yoksa) sağlık hizmetine engeldir; acil/iş kazası
  gibi istisnalar `uyarilar`da belirtilir (m.67/1).
- Dayanak: `m:5510/67@2008-10-01`.

### 5.3 `gss_alacak_zamanasimi`
- Girdi: `odeme_tarihi` (ISO, zorunlu), `ogrenme_tarihi` (ISO, ops.).
- Parametre: `talep_sure_yil=2`, `dusme_sure_yil=5`.
- Çıktı: `sonuc={tarih: talep_son}` (öğrenme/talep tarihi + 2 yıl);
  `kisa` ve `uyarilar` 5 yıllık dış sınırı da söyler.
- Dayanak: `m:5510/97@2008-10-01`.

### 5.4 `gss_gelir_testi`
- Girdi: `hane_aylik_gelir_tl` (sayı, zorunlu), `hane_kisi_sayisi` (int>0, zorunlu),
  `asgari_ucret_brut_tl` (sayı, ops.).
- Parametre: `gelir_esik_pay=1/3` (JSON `{pay:1,payda:3}`).
- Çıktı: kişi başı gelir < asgari ücret/3 ise `gelir_testi_kapsaminda`;
  değilse `prim_borcu_dogar`. `asgari_ucret_brut_tl` yoksa **belirsiz** +
  `eksik_girdiler` (2026 asgari ücret değeri doğrulanmadan koda gömülmez).
- Dayanak: `m:5510/60@2008-10-01`.

### 5.5 `gss_prim_zamanasimi`
- Girdi: `odeme_suresi_son` (ISO, zorunlu).
- Parametre: `zamanaşımı_yil=10`.
- Çıktı: ödeme süresinin dolduğu tarihi takip eden takvim yılı başından
  10 yıllık sürenin son günü (`{tarih}`).
- Dayanak: `m:5510/93@2008-10-01`.

### 5.6 `issizlik_odenegi`
- Girdi: `prim_gun_sayisi` (int, zorunlu), `son_120_gun_hizmet_akdi` (bool, ops.),
  `son_4_ay_ortalama_gunluk_brut_kazanc_tl` (sayı, ops.),
  `aylik_asgari_ucret_brut_tl` (sayı, ops.).
- Parametre: `son_hizmet_gun=120`, `asgari_prim_gun_180=600`,
  `asgari_prim_gun_240=900`, `asgari_prim_gun_300=1080`,
  `sure_180=180`, `sure_240=240`, `sure_300=300`,
  `kazanc_orani=0.40`, `tavan_orani=0.80`, `ay_gun=30`.
- Çıktı: süre (gün) veya `hak_yok`; kazanç verilmişse aylık ödenek =
  günlük ort. × 0.40 × 30, tavan = brüt asgari ücret × 0.80.
- Dayanak: `m:4447/50@2008-05-26`, `m:4447/51@2008-05-26`.

### 5.7 `is_kazasi_bildirim`
- Girdi: `kaza_tarihi` (ISO, zorunlu), `bildirim_tarihi` (ISO, ops.).
- Parametre: `bildirim_is_gunu=3`, `kendi_adina_gec_bildirim_ay=1`.
- Çıktı: kaza + 3 **iş günü** son bildirim günü; bildirim geç ise uyarı.
  İşverenin derhal kolluğa bildirim yükümlülüğü ayrıca söylenir.
- Dayanak: `m:5510/13@2008-10-01`.

### 5.8 `sgk_dava_yolu`
- Girdi: `konu` (enum, ops.), `kuruma_basvuru_tarihi` (ISO, ops.).
- Parametre yok; `parametre_surumu = "kanun-5510-m101.1"`.
- Çıktı: `sonuc="is_mahkemesi"`; 5510 kapsamındaki uyuşmazlıklarda görevli
  mahkemenin iş mahkemesi olduğu; sabit bir dava açma süresi **uydurulmaz**.
- Dayanak: `m:5510/101@2008-10-01`.

## 6. Parametre tablosu

`packages/rules/src/parametreler.ts` içine yukarıdaki anahtarlar eklenir.
Her satır: `gecerlilik_bas`, `gecerlilik_bit` (kanunda değişiklik yoksa `null`),
`kaynak_url`, `durum`, `surum`.

| kural_id | anahtar(lar) | değer | gecerlilik_bas |
|---|---|---|---|
| sgk_saglik_hakki | temel_gun / ek_gun / ek_gun_kosul_prim_gun | 10 / 90 / 90 | 2008-10-01 |
| sgk_saglik_hakki_kosullari | asgari_prim_gun / azami_borc_gun | 30 / 60 | 2008-10-01 |
| gss_alacak_zamanasimi | talep_sure_yil / dusme_sure_yil | 2 / 5 | 2008-10-01 |
| gss_gelir_testi | gelir_esik_pay | `{pay:1,payda:3}` | 2008-10-01 |
| gss_prim_zamanasimi | zamanaşımı_yil | 10 | 2008-10-01 |
| issizlik_odenegi | 10 anahtar (yukarıda) | 4447 m.50 | 2008-05-26 |
| is_kazasi_bildirim | bildirim_is_gunu / kendi_adina_gec_bildirim_ay | 3 / 1 | 2008-10-01 |

DB kopyası `scripts/export-parametreler.ts` ile üretilir; `pipeline/build.py`
çağırır. Tarihsiz satır = 0 olmalıdır.

## 7. Sunucu entegrasyonu (5 araç sabit)

- `HukukSorInput`'a tek yeni opsiyonel alan: `prim_gun_sayisi` (SGK prim günü).
  Gerekçe: 10+90 gün, 30 gün şartı ve işsizlik ödeneği aynı olguyu kullanır;
  alan yoksa bu kurallar dürüstçe "eksik olgu" döner.
- `kuralGirdileri`: `olay_tarihi` → `isten_cikis_tarihi`, `kaza_tarihi`,
  `odeme_tarihi`; `prim_gun_sayisi` → `son_bir_yil_prim_gun`, `prim_gun_sayisi`.
  Tüketici alanları değişmez; Zod bilinmeyen anahtarları eler.
- `kapsam dışı` yanıtı: SGK artık kapsam içi; kapsam dışı listesinden çıkarılır.
  Kalan kapsam dışı: iş hukuku (kıdem/ihbar), kira, vergi, ceza, aile.
- `instructions` ve `hukuk_sor` açıklaması: "tüketici + sosyal güvenlik".
- `derinles` id şeması: `t/` **veya** `s/`.
- Kaynak: `ontoloji://tuketici` yanına `ontoloji://sgk`.
- `ID_PATTERNS.dugum = /^(t|s)\//`; `alanOneki("sgk") = "s/"`.
- Bench atıf dedektörü `s/` kimliklerini de tanır; rapor çözümleyicisi
  `s/` için `dugum` tablosuna bakar.

## 8. Değerlendirme

- `eval/golden/routing.jsonl`: SGK tuzakları (r160, r166) pozitife taşınır;
  her yeni yaprak için en az 2 bağımsız örnek eklenir. Eski ölçüm
  `bench/results/` altında korunur; not alanına "SGK alanı eklendi" yazılır.
- `bench/scenarios.jsonl`: 3 SGK senaryosu (10+90 gün, GSS borcu, işsizlik).
  Toplam senaryo sayısı raporda dinamik okunur; README sayıları yeniden ölçülür.
- Kapılar: `pnpm typecheck`, `pnpm test`, `node bench/bench.ts`,
  atıf çözümlenebilirliği N/N, bütçe uyumu tüm senaryolar.

## 9. Dosya sahipliği (paralel çalışma)

| Kapsam | Dosyalar |
|---|---|
| Lead (hukuki içerik) | `packages/ontology/sgk.yaml`, `packages/ontology/cards/sgk-kartlar.yaml`, bu dosya |
| Derleme hattı | `pipeline/ontology.py`, `pipeline/collect/laws.py`, `pipeline/build.py`, `packages/ontology/src/*.ts`, `pipeline/test/test_ontology.test.py`, `packages/ontology/test/*.ts` |
| Kural motoru | `packages/rules/src/kurallar/sgk_*.ts`, `packages/rules/src/index.ts`, `packages/rules/src/parametreler.ts`, `packages/rules/test/sgk.test.ts` |
| Sunucu/retrieval | `packages/schema/src/index.ts`, `packages/retrieval/src/router.ts`, `packages/mcp-server/src/{server,hukukSor,render}.ts`, `packages/mcp-server/test/{hukukSor,e2e}.test.ts`, `bench/measure.ts`, `bench/report.ts` |
| Eval/docs | `eval/golden/routing.jsonl`, `bench/scenarios.jsonl`, `docs/adr/ADR-005-*`, `README.md`, `docs/KALITE.md`, `docs/PLAN.md` |

Çakışan dosya yoktur; her ekip yalnızca kendi kapsamına yazar. Lead son diff'i
inceler ve tüm kapıları çalıştırır.
