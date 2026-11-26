# ADR-005 — SGK alanı: tüketici hukukunun yanına sosyal güvenlik

- **Durum:** Kabul edildi (v1)
- **Tarih:** 2026-10-22
- **Karar:** Sunucu v1 kapsamı **tüketici hukuku + sosyal güvenlik (SGK)** olacak şekilde genişletildi.
  Yeni alan aynı ontolojide, aynı yönlendiricide ve **aynı 5 araçta** yaşar; yeni araç eklenmez.
  SGK düğümleri `s/…` kimlik uzayını kullanır, kaynak metinler **5510** ve **4447** sayılı
  kanunlardır. Değerler tarihli parametre tablosundan okunur; çıplak süre/eşik koda gömülmez.
- **İlgili:** `docs/SGK-TASARIM.md`, `packages/ontology/sgk.yaml`, `packages/ontology/cards/sgk-kartlar.yaml`,
  `packages/rules/src/kurallar/sgk_*.ts`, `packages/schema`, `packages/retrieval`,
  `packages/mcp-server`, `eval/golden/routing.jsonl`, `bench/scenarios.jsonl`, ADR-003, ADR-004

## Bağlam

v1 ilk sürüm yalnızca tüketici hukukunu kapsıyordu. SGK soruları geldiğinde sunucu ya
`KAPSAM_DISI` dönüyor ya da soruyu tüketici düğümüne zorluyordu. İkisi de yanlış:

- **Vatandaş için SGK, tüketici hukuku kadar gündelik.** İşten ayrılma sonrası sağlık hakkı,
  GSS prim borcu, işsizlik ödeneği ve iş kazası bildirimi en sık sorulan konular arasında.
- **Zorlama yanlış cevap üretir.** "10+90 gün sağlık hakkı" sorusu `t/abonelik` veya
  `t/ayipli-hizmet` düğümüne giderse kural motoru yanlış parametreyi çalıştırır; kullanıcı
  yanlış süre okur. AGENTS.md §1.6: emin değilsen yanıt verme.
- **Mimari zaten genişlemeye göre yazılmıştı.** `PLAN.md` §1 "mimari yeni alanlara altyapı
  değişmeden genişler" diyor; Faz 5 kuyruğunda iş hukuku, kira, idare, AYM, HUDOC var.
  SGK bu kuyruğun **ilk uygulanan** alanıdır.

Bu ADR, AGENTS.md §4'teki "yeni araç / parametre" kapısını karşılar: yeni parametre
(`prim_gun_sayisi`) ve yeni alan vardır; araç sayısı değişmez.

## Karar 1 — Alan genişlemesi: aynı ontoloji, iki kimlik uzayı

Tüketici ve SGK **ayrı sunucu, ayrı araç seti veya ayrı ontoloji dosyası** değildir:

- Tek yönlendirici (`DugumYonlendirici`) iki alanın düğümleri üzerinde yarışır.
- Tek kural motoru, tek bütçe paketleyici, tek render katmanı kullanılır.
- `ara(alan=…)` filtresi `t/…` ve `s/…` öneklerini kabul eder; `sgk`, `s`, `sosyal`,
  `sosyal-guvenlik` kısaltmaları `s/` uzayına çözülür (`alanOneki`).

## Karar 2 — `s/` kimlik sözleşmesi

| Tür | Biçim | Örnek |
|---|---|---|
| Tüketici düğümü | `t/<dal>/<yaprak>` | `t/ayipli-mal/arac` |
| SGK düğümü | `s/<dal>/<yaprak>` | `s/saglik/isten-ayrilma-sonrasi-hak` |
| Kökler | `t/tuketici`, `s/sgk` | — |
| Madde | `m:<kanun>/<madde>[@tarih]` | `m:5510/67`, `m:5510/67@2008-10-01` |
| Karar | `k:<mahkeme>-…` | `k:ygt-…` |

Kurallar:

- `ID_PATTERNS.dugum = /^(t|s)\//`; `derinles` kimliği `t/` **veya** `s/` olabilir.
- Her hukuki cümle çözümlenebilir bir kimlik taşır (AGENTS.md §1.4). SGK cümleleri
  `[m:5510/…]` / `[m:4447/…]` taşır; bench atıf dedektörü ve rapor çözümleyicisi `s/`
  kimliklerini `dugum` tablosundan çözer.
- `s/` ile `t/` **aynı ad alanında değildir**: bir düğüm id'si iki uzayda birden yaşamaz.
  Bir konu iki alana da dokunuyorsa (ör. sağlık hizmeti faturası) doğru yaprak seçilir;
  iki düğüme birden "güvenli" cevap verilmez.

## Karar 3 — Kaynaklar: 5510 ve 4447

| Kanun | Ad | URL |
|---|---|---|
| 5510 | Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu | `https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5510.htm` |
| 4447 | İşsizlik Sigortası Kanunu | `https://www.mevzuat.gov.tr/MevzuatMetin/1.5.4447.htm` |

Korpusa giren ve `REQUIRED_ARTICLES` ile zorunlu tutulan maddeler (BELGE, `docs/SGK-TASARIM.md` §3):
`m:5510/13`, `m:5510/60`, `m:5510/61`, `m:5510/67`, `m:5510/68`, `m:5510/93`,
`m:5510/97`, `m:5510/101`, `m:4447/50`, `m:4447/51`. Build bu maddeler yoksa yayınlamaz.

Ölçülen korpus (ÖLÇÜLDÜ, `bench/report.md`): **14 mevzuat / 5266 madde / 239 karar /
65 düğüm / 49 kart / 58 parametre satırı**, sürüm `v20261022.436046465`.

## Karar 4 — Ağaç ve kurallar

SGK ağacı: **1 kök + 5 dal + 8 yaprak = 14 düğüm**, her yaprağa elle yazılmış bir kart
(BELGE: `docs/SGK-TASARIM.md` §4).

| Yaprak | Kural |
|---|---|
| `s/saglik/isten-ayrilma-sonrasi-hak` | `sgk_saglik_hakki` |
| `s/saglik/provizyon-alinamama` | `sgk_saglik_hakki_kosullari` |
| `s/saglik/katilim-payi-iadesi` | `gss_alacak_zamanasimi` |
| `s/gss/gelir-testi` | `gss_gelir_testi` |
| `s/gss/prim-borcu` | `gss_prim_zamanasimi` |
| `s/gelir/issizlik-odenegi` | `issizlik_odenegi` |
| `s/is-kazasi/bildirim-ve-haklar` | `is_kazasi_bildirim` |
| `s/usul/kurum-karari-itiraz` | `sgk_dava_yolu` |

Kural fonksiyonları saftır, `bugun` çağırandan gelir, `Date.now()`/`new Date()` kullanmaz
(AGENTS.md §1.3). Tüm hukuki sayılar `kural_parametre` satırlarından okunur; DB kazanır,
`packages/rules/src/parametreler.ts` yalnızca yedektir. Tarihsiz parametre satırı = 0.

## Karar 5 — 5 araç sabit

Yeni alan için **araç eklenmedi**. Tek şema değişikliği `HukukSorInput`'a opsiyonel
`prim_gun_sayisi` alanıdır:

- Gerekçe: 10+90 gün ek süresi, 30 gün müstehaklık şartı ve işsizlik ödeneği aynı olguyu
  (son bir yıldaki / son üç yıldaki prim günü) kullanır.
- Alan verilmezse kurallar **dürüstçe "eksik olgu"** döner; tahmin etmez.
- `kuralGirdileri`: `olay_tarihi` → `isten_cikis_tarihi`, `kaza_tarihi`, `odeme_tarihi`;
  `prim_gun_sayisi` → `son_bir_yil_prim_gun`, `prim_gun_sayisi`. Tüketici alanları değişmez;
  Zod bilinmeyen anahtarları eler.
- `derinles` id şeması `t/` **veya** `s/`; `ontoloji://tuketici` yanına `ontoloji://sgk` kaynağı.
- Kapsam dışı listesinden SGK çıkarıldı. Kalan kapsam dışı: iş hukuku (kıdem/ihbar), kira,
  vergi, ceza, aile.

## Karar 6 — Kapsam sınırları (v1, açıkça söylenir)

**Kapsam içi:** işten ayrılma sonrası sağlık hakkı; müstehaklık/provizyon; muayene ve ilaç
katılım payı iadesi; GSS gelir testi ve prim borcu; işsizlik ödeneği; iş kazası bildirimi ve
temel haklar; SGK işlemlerine itiraz ve görevli mahkeme.

**Kapsam dışı (yanıt bunu söyler, zorlamaz):**

- **Emeklilik yaşı/aylık hesabı** (5510 m.28'in kademeli yaş tablosu ve geçiş hükümleri ayrı
  bir çalışma gerektirir). "Emekli maaşım eksik" sorusu yalnızca **itiraz yolu** (`s/usul/…`)
  bakımından ele alınır; aylık hesabı yapılmaz.
- **Kıdem/ihbar tazminatı, ücret alacağı** (iş hukuku; ayrı alan).
- **Sağlık hukuku/malpraktis** (hekim hatası, ilaç yan etkisi) — SGK finansmanıyla karıştırılmaz.
- **Somut dosyaya dilekçe yazımı** — sunucu yol ve dayanak verir, dilekçe üretmez.

## Karar 7 — Uzman onayı durumu

- `durum` iki değerlidir: **`uzman_onayli`** yalnızca kanun metni sayıyı doğrudan yazıyorsa;
  aksi hâlde **`teyit_bekliyor`**. Bu, PLAN.md'deki "uzman onayı kapısı" ilkesinin uygulamasıdır.
- Kartlar bugün `taslak`; parametrelerde kanun metni sayıyı doğrudan yazıyorsa
  `uzman_onayli`, türetilmiş/konvansiyonel değer (`issizlik_odenegi/ay_gun`) ise
  `teyit_bekliyor` kullanılır. Yanıtta `[teyit bekliyor]` etiketi görünür. **Uzman (avukat)
  onayı alınmadan hiçbir SGK kartı "onaylı" sayılmaz** ve bu ADR toplu bir onay iddiası taşımaz.
- `sgk_dava_yolu` parametre içermez (`parametre_surumu = "kanun-5510-m101.1"`); sabit bir
  dava açma süresi **uydurulmaz**.

## Karar 8 — 10 gün / 90 gün yorumu

5510 m.67 (5754 sayılı Kanun'la değişik, yürürlük 1/10/2008):

- Zorunlu sigortalılığı sona eren 4/a sigortalısı, sona erme tarihinden itibaren **10 gün**
  GSS'den yararlanır (temel süre).
- Sona erme tarihinden geriye doğru **bir yıl içinde 90 gün** zorunlu sigortalılığı varsa,
  aynı tarihten itibaren **90 gün** (bakmakla yükümlü olunan kişiler dahil) yararlanır. Kanun
  metni 90 günü başlangıçtan sayar; yaygın uygulama 10 günü ayrıca ekleyerek **100 gün** kabul
  eder (aşağıdaki yorum farkı).
- Kural bunu üç parametreyle uygular: `temel_gun=10`, `ek_gun=90`, `ek_gun_kosul_prim_gun=90`.
  Prim günü verilmiş ve ≥90 ise son gün = çıkış + 10 + 90 gün; verilmemişse **yalnızca temel
  süre** hesaplanır ve ek sürenin şarta bağlı olduğu `uyarilar`da söylenir.
- **Yorum farkı bilinçli olarak görünür bırakılır:** kanun metni 90 günlük ek süreyi
  sigortalılığın sona erdiği tarihten başlatır; uygulamada 10 günün ayrıca eklenerek **100 gün**
  kabul edildiği de görülür. Kart ve kural bu farkı söyler; kesin son günün e-Devlet
  SPAS/provizyon kaydından teyit edilmesi istenir. Sunucu tek bir yorumu "kesin" diye
  dayatmaz, iki okumayı da görünür kılar.
- Örnek (ÖLÇÜLDÜ, `bench/scenarios.jsonl` → `sgk-10-90-gun`): çıkış 25.07.2026, prim günü 109
  → temel son gün 04.08.2026, ek süre sonu **02.11.2026**; yanıt bu tarihi `KURALLAR`
  bölümünde `sgk_saglik_hakki` satırında taşır.

## Değerlendirme (ÖLÇÜLDÜ)

**Yönlendirme** (`node eval/run.ts --set all --db data/build/hukuk.db`):

| Metrik | Değer | Eşik | Durum |
|---|---|---|---|
| top-1 | **%97,4** (152/156) | ≥ %85 | ✅ |
| top-3 | **%99,4** (155/156) | ≥ %97 | ✅ |
| Kapsam dışı tuzak (belirsiz) | **%100** (26/26) | bilgi | — |
| Pozitifte gereksiz belirsiz | %7,7 (12/156) | bilgi | — |

Altın set: 182 satır = 156 pozitif + 26 tuzak. SGK için her yaprağa en az 2 bağımsız örnek
eklendi (r167–r182); r160 ve r166 pozitife taşındı; r157 (ilaç yan etkisi) **tuzak olarak
korundu** (ürün/malpraktis, katılım payı değil).

**Bench** (`node bench/bench.ts`, 21 senaryo): 5 araç / **885 token** tanım, yanıt medyanı
**814 token**, bütçe uyumu **21/21**, atıf **64/64**, kapsam **16 doğrudan + 5 netleştirme +
0 fallback**, p50 **4,3 ms** / p95 **21,64 ms** (3 koşu: p50 4,3 / 4,51 / 2,92 ms),
soğuk başlangıç **459,66 ms** (3 koşu: 459,66 / 652,72 / 775,66 ms; paylaşımlı makine —
hepsi ÖLÇÜLDÜ). SGK senaryoları: `sgk-10-90-gun` 720 token, `gss-prim-borcu` 478 token,
`issizlik-odenegi-700` 682 token; işsizlik senaryosu 700 prim gününe karşılık **180 gün**
öderek döndürür (ÖLÇÜLDÜ).

**Arama Recall@5 %50,1 ile FAIL** — bu SGK genişlemesinden bağımsız, bilinen ve belgelenmiş
bir açıktır (KALITE.md). SGK korpusu karar sayısını artırmadı; sayı değişmedi.

## Bilinen açıklar

1. **GSS prim borcunda zamanaşımı girdisi.** `gss_prim_zamanasimi` kuralı
   `odeme_suresi_son` ister; `HukukSorInput` yalnızca `olay_tarihi` taşır ve sunucu onu
   `odeme_tarihi`ne eşler. Bu yüzden `gss-prim-borcu` bench senaryosunda kural dürüstçe
   **"eksik: prim ödemesinin son günü"** döner. Yeni alan eklemek 5 araç/şema sözleşmesini
   büyütür; v1'de bilinçli olarak açık bırakıldı, `EKSİK OLGULAR` bunu kullanıcıya söyler.
2. **Emeklilik hesabı yok.** m.28 kademeli yaş tablosu ve geçiş hükümleri kapsam dışıdır.
3. **Uzman onayı tamamlanmadı.** Değerlerin bir kısmı `teyit_bekliyor`; hukuki yayın öncesi
   avukat onayı gerekir.
4. **Korpus tohumu.** 239 karar SGK içtihadını temsil etmez; SGK yanıtları kart + madde +
   kural üçlüsüne dayanır, zengin içtihat iddiası taşımaz.

## Sonuçlar

**Olumlu**

- SGK soruları artık kapsam dışına düşmüyor; 8 yaprak, 8 kural ve `s/` kimlikleriyle
  çözümlenebilir yanıt üretiliyor.
- Araç sayısı 5'te kaldı; sabit tanım maliyeti 850 → **885 token** (ÖLÇÜLDÜ) arttı, yani
  tüm alan genişlemesinin her turdaki maliyeti **+35 token**.
- Aynı yönlendirme altyapısı iki alanda çalışıyor; yeni alan için ikinci bir sunucu/araç
  seti gerekmedi.

**Olumsuz / kabul edilen maliyet**

- `s/` uzayı ontolojiyi ve altın seti büyüttü; tetikleyici/örnek bakımı iki alanda sürüyor.
- SGK'da olguya bağlı çok sayıda istisna var (4/b, 4/c, tecil, acil, iş kazası); v1 bunların
  bir kısmını yalnızca `uyarilar`da söylüyor.
- Aynı soru hem tüketici hem SGK alanına dokunabiliyor (ör. sağlık hizmeti faturası);
  yönlendirici tek yaprak seçtiği için kullanıcıya "hangi konu?" netleştirmesi kalabilir.

## Açık kalanlar

1. SGK kararlarından oluşan bağımsız bir içtihat altın seti yok; `ara` bu alanda ölçülmedi.
2. `odeme_suresi_son` benzeri SGK olgularının şemaya alınıp alınmayacağı ürün kararı.
3. Uzman onay takvimi ve onaylayan avukatın kim olacağı (`PLAN.md` açık sorusu).
4. Emeklilik hesabı (m.28) ayrı ADR + ayrı parametre tablosu gerektirir.
