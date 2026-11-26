# Türk Hukuku MCP — Mimari ve Uygulama Planı

> Çalışma planı. Bu depodaki uygulamanın neyi, neden böyle yaptığını kaydeder.
> Uygulama durumu ve ölçümler için `README.md`, kararlar için `docs/adr/`.

## 1. Amaç, ilkeler ve başarı ölçütleri

**Hedef:** Türk hukukunu (mevzuat, içtihat, AYM, AİHM-Türkiye) önceden derleyip MCP
üzerinden 2.000 token altında, kaynaklı ve doğrulanabilir yanıt veren bir sistem.
İlk alanlar tüketici hukuku ve sosyal güvenlik (SGK); mimari yeni alanlara altyapı değişmeden
genişler. Kullanıcı kitlesi avukat değil: mağdur, tekil, sade vatandaş.

**Kapsam içi:** kamuya açık mevzuat ve kararlar, uyuşmazlık kartları, deterministik
hesaplamalar (süre, eşik, görev/yetki), yol haritaları, atıf doğrulama; tüketici hukuku
(6502 ve ilgili mevzuat) **+ sosyal güvenlik** (5510, 4447).
**Kapsam dışı (v1):** kişiye özel hukuki danışmanlık, UYAP'a dava/dilekçe gönderimi,
ücretli içtihat veritabanları, kullanıcı hesabı ve kişisel dosya saklama.

**Tasarım ilkeleri**
1. **Derle, sonra oku.** Ağır iş toplu yapılır. Sorgu yolunda üretken LLM çağrısı yoktur.
2. **Olgu çıkarımı istemcide.** Araç şeması yapısal alanlar ister; sunucu eşler ve hesaplar.
3. **Kural varsa hesapla.** Süre, eşik, görev/yetki kod olarak çalışır, LLM tahmin etmez.
4. **Her iddianın kaynağı var.** Her öğe kararlı bir id ve resmî URL taşır.
5. **Token bütçesi birinci sınıf parametredir.** Her araç `butce` alır.
6. **Olay tarihindeki hukuk.** Madde metni bir tarihe göre çözülür.
7. **Tek çekirdek, ince cepheler.** Veri ve arama ortak; uç noktalar dar.
8. **Uzman onayı kapısı.** Uzman onayı olmadan hiçbir şey "onaylı" etiketi alamaz.

**Başarı ölçütleri** (başlangıç hedefleri; ilk ölçümden sonra kalibre edilir)

| Metrik | Hedef | Ölçüm |
|---|---|---|
| `hukuk_sor` p95 gecikme | < 400 ms | edge yük testi |
| Varsayılan yanıt boyutu | ≤ 2.000 token | araç loglarında token sayımı |
| Düğüm eşleme doğruluğu (top-1/top-3) | ≥ %85 / ≥ %97 | yönlendirme altın seti |
| İçtihat Recall@5 | ≥ %85 | arama altın seti |
| Çözülemeyen/uydurma atıf | %0 | dönen her id'nin çözülmesi |
| Kural testleri | %100 | CI |
| Kart sadakati | ≥ %98 | LLM-yargıç + uzman örneklemi |
| Mevzuat değişikliğinin kartlara yansıması | ≤ 48 saat | RG izleyici logları |

## 2. Genel mimari

Sistem iki zamana ayrılır: **derleme zamanı** (toplu, pahalı) ve **sorgu zamanı**
(anında, ucuz, deterministik). Aradaki tek bağ, sürümlenmiş yayınlanmış derlenmiş
hukuk grafiğidir.

Bu ayrım üç şeyi garanti eder: sorgu gecikmesi LLM hızına bağlı değildir; aynı girdi
aynı yanıtı verir ve test edilebilir; kötü bir derleme yayın kapısında durur.

## 3. Monorepo yapısı ve teknoloji seçimleri

```text
hukuk-mcp/
  packages/
    schema/        # araç G/Ç sözleşmeleri (Zod) — tek doğruluk kaynağı
    ontology/      # uyuşmazlık ağacı (YAML) + elle yazılmış kartlar + doğrulayıcı
    tr-text/       # Türkçe normalizasyon, kök bulma, n-gram benzerlik (TS)
    retrieval/     # SQLite FTS5 + hibrit skor + deterministik yönlendirici
    rules/         # kural motoru (saf fonksiyon) + tarihli parametre tabloları
    mcp-server/    # MCP uç noktaları: 5 araç, bütçe paketleyici, düz metin render
  pipeline/        # Python derleme hattı: topla → ayrıştır → katmanla → yayınla
  data/build/      # schema.sql ve derlenmiş hukuk.db (üretilir)
  eval/            # altın setler ve değerlendirme kapıları
  bench/           # token/gecikme ölçümü ve rakip kıyası
  docs/adr/        # mimari karar kayıtları
```

| Katman | Seçim | Gerekçe |
|---|---|---|
| Derleme veritabanı | PostgreSQL 16 + pgvector (hedef) / v1: SQLite | v1'de sorgu yolu tek dosya, sıfır servis |
| Sorgu servisi | Cloudflare Workers (hedef) / v1: Node 26 stdio | Düşük gecikme, Streamable HTTP |
| Servis verisi | D1 + Vectorize + R2 + KV (hedef) / v1: SQLite FTS5 | Okuma ağırlıklı, küçük yapısal veri |
| Embedding | v1'de yok; char-3gram + tetikleyici skoru | Gecikme, maliyet, determinizm (ADR-004) |
| Türkçe kök bulma | Kendi hafif gövdeleyici, Py+TS eşi | İndeks ve sorgu aynı anahtara iner |
| Uzman arayüzü | Faz 3'te basit web uygulaması | Az kullanıcı, düşük karmaşıklık |

Seçimler öneridir; her biri `docs/adr/` altında kayıtlıdır.

## 4. Veri kaynakları ve erişim kuralları

| Öncelik | Kaynak | İçerik | Not |
|---|---|---|---|
| P0 | mevzuat.gov.tr | Kanun, CBK, yönetmelik, tebliğ | Windows-1254 HTML; `1.<tertip>.<no>.htm` |
| P0 | resmigazete.gov.tr | Günlük sayılar, değişiklik kanunları | Değişiklik yayılımının tetikleyicisi |
| P0 | emsal.uyap.gov.tr | BAM + ilk derece kararları | JSON arama/ham veri API'si |
| P0 | karararama.yargitay.gov.tr | Daire, HGK, İBK | JSON arama/ham veri API'si |
| P0 | ticaret.gov.tr | Tüketici yönetmelikleri, heyet sınırları | Kural parametrelerinin kaynağı |
| P1 | Danıştay, AYM norm denetimi, AYM bireysel başvuru | İdari yargı, hak ihlali | Faz 5 |
| P2 | HUDOC (AİHM, Türkiye) | Türkiye aleyhine kararlar | Faz 5 |

**Erişim kuralları (pazarlık dışı)** — ayrıntı: ADR-001
- robots.txt ve kullanım koşulları okunur, karar ADR'ye yazılır.
- Kaynak başına varsayılan 1 istek/sn; üstel geri çekilme; gece saatleri tercih edilir.
  (Ölçüldü: Yargıtay arama API'si ~1 istek/sn üzerinde 429 döndürüyor.)
- Açık kimlikli User-Agent ve iletişim adresi kullanılır.
- CAPTCHA, oturum, IP engeli veya bot koruması **aşılmaz**. Engel varsa o kaynak
  "canlı proxy" modunda kalır ve toplu çekim yapılmaz.
- Ham yanıt içerik hash'iyle saklanır; aynı hash yeniden işlenmez.
- Kararlardaki kişisel veriler için maskeleme zorunludur.

## 5. Veri modeli

Derleme veritabanı tek doğruluk kaynağıdır. Şema: `data/build/schema.sql`.

**Kararlı kimlik kuralları**
- Madde: `m:<kanun_no>/<madde>[/<fıkra>]`, ör. `m:6502/11`; ek madde `m:6502/73A`.
- Karar: `k:<mahkeme>-<daire>-<esasYıl>-<esasNo>-<kararYıl>-<kararNo>`,
  ör. `k:ygt-13hd-2013-7601-2013-16449`.
- Düğüm: ontoloji yolu, ör. `t/ayipli-mal/arac`.
- Kimlikler asla yeniden kullanılmaz; birleşen kayıtlar alias ile yönlendirilir.

**Tablolar:** `mevzuat`, `madde`, `madde_fts`, `karar`, `karar_fts`, `dugum`, `kart`,
`arguman`, `kural_parametre`, `atif`, `meta`.
`*_kok` alanları ASCII'ye indirgenmiş kök metnini taşır; FTS5 bu alan üzerinde çalışır.
`bolum_tokenlari` kartın her bölümünün token sayısını önceden tutar; paketleyici sorgu
anında token saymaz.

## 6. Uyuşmazlık ontolojisi

Ontoloji omurgadır: her karar, kart, kural ve sorgu bir düğüme bağlanır.
Tüketici v0: **9 dal, 41 yaprak** — `packages/ontology/tuketici.yaml`.

Tasarım kuralları: derinlik 2-4; yaprak = tek uyuşmazlık konusu + kural seti; düğüm
sınırı hukuki sonuç değiştiğinde çizilir (konut ayıbı 5 yıl, diğer mal 2 yıl); çapraz
konular (arabuluculuk, hakem heyeti, süre) düğüm değil kuraldır; her yaprakta ≥5 örnek
kullanıcı anlatımı; YAML CI'da şema doğrulamasından geçer.

**Bilinçli sapma:** talep tipi (iade/onarım/indirim) ayrı düğüm yapılmadı. 6502 m.11
zaten bir *menü* verir; kullanıcı "paramı geri alabilir miyim" diye sorar, "sözleşmeden
dönme dalı" demez. Talep, kartın HAKLAR bölümünde dört seçenek olarak sunulur ve
`hukuk_sor.talep` alanı yalnızca vurguyu değiştirir. Gerekçe: `packages/ontology/NOTES.md`.

**Büyüme:** düşük güvenli sorgular anonim kuyruğa düşer (yalnızca özet embedding ve
alan); haftalık iş kümeler; büyüyen kümeler "yeni düğüm önerisi" olarak uzman kuyruğuna
gider; onaylanmadan ağaca girmez.

## 7. Derleme hattı

On aşama, her aşama idempotent (girdi hash'i değişmediyse çalışmaz), `jobs` tablosu
üzerinden zincirli. Uygulama: `pipeline/build.py`.

1. **Toplama** — kaynak başına toplayıcı: `listele(since) → [ref]`, `getir(ref) → ham`.
2. **Ayrıştırma ve maskeleme** — NFC, `tr` yerel ayarıyla küçük harf, tireleme temizliği;
   künye çıkarımı; paragraf bölütleme ve rol etiketleme; TCKN/telefon/IBAN/e-posta/plaka
   maskeleme. Ham metin servis katmanına taşınmaz.
3. **Atıf çıkarımı ve çözümleme** — gramer tabanlı ayrıştırıcı ("6502 sayılı Kanun'un
   11. maddesi", "TKHK m.11/1-a", "TBK 227"); kısaltma sözlüğü; madde atıfları karar
   tarihine göre doğru sürüme bağlanır; çözülemeyen atıf `cozulemedi` işaretlenir.
4. **Yapısal çıkarım (LLM, toplu)** — küçük model + Batch API + JSON Schema; prompt'a
   tüm ontoloji değil, embedding ile seçilmiş en yakın 10 aday düğüm konur; şema ve atıf
   doğrulaması; geçmeyen kayıt insan kuyruğuna; %2 kalite örneklemi.
5. **Embedding ve kümeleme** — MinHash/LSH yakın kopya; HDBSCAN; medoid temsilci;
   kayma tespiti (üç ay üst üste pay artışı → `ictihat_kaymasi` uyarısı).
6. **Argüman kanonikleştirme** — düğüm başına iddia kümeleri; kabul/ret sayıları.
7. **Karar zinciri** — ilk derece → BAM → Yargıtay eşleştirme; türetilmiş `nihai_durum`.
8. **Kart üretimi** — deterministik alanlar kodla; anlatı alanları elle/LLM ile; her
   cümle kaynak kimliği taşır; kimliksiz cümle reddedilir; `girdi_hash` değişmediyse
   yeniden üretilmez.
9. **Katman üretimi** — L0 (≈30 token) ve L1 (≈150 token); token sayıları hedef
   tokenizer ile önceden hesaplanır. v1'de L0/L1 **deterministik çıkarımsaldır** (LLM yok).
10. **Değişiklik yayılımı ve yayın** — RG izleyici yeni `madde_surum` açar; atıf grafiği
    üzerinden etkilenen kartlar `eskimis` işaretlenir ve yeniden üretilir; yayın yeni
    sürüm numarasıyla yazılır, `aktif_surum` ancak duman testleri geçince değişir; geri
    alma tek anahtar değişikliğidir.

## 8. Deterministik kural motoru

Kural motoru cevabı yorum değil aritmetik olan soruları kodla çözer: süreler, parasal
eşikler, görevli/yetkili merci, dava şartları. Kurallar saf fonksiyondur; yasal değerler
kodda değil, tarihli `kural_parametre` tablosundadır.

```ts
interface KuralSonucu {
  sonuc: string | number | boolean | { tarih: string };
  kisa: string;                    // tek cümle, ≤ 40 token
  dayanak: string[];               // ['m:6502/12@2026-01-01']
  varsayimlar: string[];
  eksik_girdiler: string[];        // doluysa sonuc = 'belirsiz'
  uyarilar: string[];
  parametre_surumu: string;
  onay_durumu: 'uzman_onayli' | 'teyit_bekliyor';
}
```

"Bugün" girdiden gelir; kural sistem saatini okumaz. Bu, testleri ve geçmiş tarihli
sorguları tekrarlanabilir kılar.

| Kural | Cevapladığı soru | Dayanak |
|---|---|---|
| `gorevli_merci` | Hakem heyeti mi, tüketici mahkemesi mi? | m.68 + yıllık parasal sınır tebliği |
| `arabuluculuk_dava_sarti` | Dava öncesi arabuluculuk zorunlu mu? | m.73/A |
| `ayip_zamanasimi` | Ayıp için son başvuru günü? | m.12 |
| `cayma_suresi` | Cayma hakkının son günü? | m.48 + Mesafeli Sözleşmeler Yönetmeliği |
| `yetkili_yer` | Nerede başvurulur/dava açılır? | m.68/3, m.73/5 |
| `harc_durumu` | Tüketici harç öder mi? | m.73/2 |
| `sure_son_gun` | Genel süre hesabı | HMK süre hükümleri + tatil takvimi |
| `yasal_faiz` | Gecikme faizi ne kadar? | 3095 + dönemsel oranlar |

**Parametre tabloları:** `hakem_heyeti_siniri`, `resmi_tatiller`, `adli_tatil`,
`yasal_faiz_oranlari`. Yıl başında (Ocak) güncelleme zorunlu görevdir; güncellenmemiş yıl
için kural `belirsiz` döner, eski değeri sessizce kullanmaz.

**Test:** her kural için ≥15 tablo güdümlü vaka; özellik testleri (hafta sonu, şubat sonu,
artık yıl, sınırın tam üstü/altı); tarih tutarlılığı; kapsam %100.

## 9. Depolama, yayın ve altyapı

Sorgu yolunun her okuması yerel/edge'dedir; derleme veritabanı sorgu yolunda yoktur.

| Depo | İçerik | Erişim |
|---|---|---|
| SQLite (v1) / D1 (hedef) | `dugum`, `kart`, `madde`, `karar` meta + L0/L1, `arguman`, `kural_parametre`, FTS5 | PK okuma, FTS5 |
| Vektör (hedef: Vectorize) | düğüm ve karar vektörleri | yönlendirme, uzun kuyruk |
| R2 (hedef) | tam metinler, rol etiketli paragraflar, ham belgeler | kimlikle tek nesne |
| KV (hedef) | `aktif_surum`, yanıt önbelleği | kısa TTL |

**Türkçe tam metin arama:** SQLite FTS5'in Türkçe kök bulucusu yoktur. Hat metni
ASCII'ye indirip köklere ayırır (`*_kok`); sorgu aynı algoritmanın TS uygulamasıyla
aynı anahtara iner. İki uygulamanın eşliği 5.000 kelimelik testle CI'da doğrulanır.

**Hibrit skor:** `0.5 × normalize BM25 + 0.5 × sözcüksel örtüşme`, ardından bağlayıcılık
ağırlığı ve güncellik. Katsayılar altın set üzerinde ayarlanır.

**Yayın:** sürüm numarası (`v<yyyymmdd>.<n>`) → yaz → 50 sabit sorguyla duman testi →
geçerse `aktif_surum` güncelle → geçmezse yayın durur. Son üç sürüm tutulur; geri alma
tek anahtar değişikliğidir.

## 10. MCP sorgu servisi

Tek Worker/süreç, alan bazında ayrı uç noktalar, her uç noktada **beş araç**.

| Yol | Alan filtresi | Durum |
|---|---|---|
| `/mcp` | yok | genel |
| `/mcp/tuketici` | `t/` | v1 |
| `/mcp/is`, `/mcp/kira`, `/mcp/idare` | ilgili dal | Faz 5 |

Taşıma: stdio (v1) ve Streamable HTTP (hedef). Kimlik: anonim + IP başına hız limiti.
Sunucu `instructions` alanı kısa bir kullanım sırası verir: önce `hukuk_sor`, gerekirse
`derinles`, konu yoksa `ara`.

**Araçlar**
- `hukuk_sor({ozet, talep?, olay_tarihi?, bugun?, tutar_tl?, kullanici_rolu?, karsi_taraf?, urun_hizmet?, butce?})`
  → kart + çalışan kurallar + eksik olgular + derinleşme kimlikleri.
- `derinles({id, seviye?, odak?, butce?})` — `k:`, `m:@tarih`, `t/`, `a:`.
- `ara({sorgu, alan?, mahkeme?, yil?, sonuc?, limit? ≤10, butce?})` → L0 listesi.
- `hesapla({kural, girdiler})`.
- `dogrula({kunye?, id?})` — var mı, kesinleşti mi, bozuldu mu, resmî URL.

Araç açıklamaları iki cümleyi geçmez; parametre açıklamaları şemada durur. Bu, araç
tanımlarının context maliyetini düşük tutar (rakip 47 araç vs bizim 5).

**`hukuk_sor` iç akışı:** yönlendirme (top-5) → güven kararı (eşik + marj) → kurallar →
bütçeye göre paketleme → oturum içi tekrar önleme.

**Bütçe paketleyici:** öncelik `ozet → kural_sonuclari → haklar → yol_haritasi →
eksik_olgular → argumanlar → temsilci_kararlar → dikkat → derinlesme_kimlikleri`.
Her bölümün token sayısı `bolum_tokenlari`'ndan okunur; sığmayan bölüm çıkarılmaz, tek
satırlık özet + derinleşme kimliğiyle temsil edilir.

**Yanıt biçimi:** JSON değil, kısa etiketli düz metin. Aynı bilgi için belirgin şekilde
daha az token. Sorumluluk notu oturum başına bir kez eklenir.

**Önbellek/gecikme/hatalar:** anahtar `hash(düğüm, normalize olgular, bütçe, aktif_surum)`,
TTL 24 saat. Gecikme bütçesi p95: embedding 60 ms (v1'de yok), arama 40 ms, okuma 60 ms,
kurallar <5 ms, paketleme <5 ms. Hata kodları: `DUGUM_BULUNAMADI`, `BELIRSIZ_DUGUM`,
`KIMLIK_COZULEMEDI`, `PARAMETRE_GUNCEL_DEGIL`, `BUTCE_COK_KUCUK`, `HIZ_LIMITI` — her
hata tek satır ve bir sonraki adım taşır.

## 11. Sıralama ve bağlayıcılık hiyerarşisi

| Kaynak türü | `agirlik` (0-100) | Not |
|---|---|---|
| AYM norm denetimi (iptal) | 100 | Mevzuat sürümünü değiştirir |
| Yargıtay İBK | 95 | Bağlayıcı |
| AYM bireysel, AİHM (TR) | 85 | Hak ihlali çerçevesi |
| Yargıtay HGK | 85 | Fiilen yönlendirici |
| Yargıtay daire | 70 | Daire ve güncellik önemli |
| BAM hukuk dairesi | 50 | Kesinleşmişse +10 |
| İlk derece | 30 | Olgu örneği, emsal değeri düşük |

`skor = 0.40×alaka + 0.25×(agirlik/100) + 0.15×güncellik + 0.10×yerleşiklik + 0.10×kesinleşme`

Sert kurallar skordan önce: bozulmuş karar temsilci olamaz (yalnızca "bozulan görüş"
olarak işaretli gösterilir); terk edilmiş küme `ictihat_degisti` notuyla; iptal edilmiş
hükme dayanan karar "dayandığı hüküm iptal edildi" uyarısıyla.

## 12. Değerlendirme ve kalite kapıları

Hiçbir yayın, altın setlerde bir önceki sürümden kötüleşiyorsa çıkmaz.

| Set | Boyut | Metrik | Kapı |
|---|---|---|---|
| Yönlendirme | 300 | top-1 / top-3 | ≥ %85 / ≥ %97 |
| Arama | 150 | Recall@5, nDCG@10 | ≥ %85 |
| Kurallar | kural başına ≥15 | tam eşleşme | %100 |
| Çıkarım | 200 karar | alan bazında F1 | sonuç ≥%95, argüman ≥%80 |
| Uçtan uca | 100 senaryo | avukat rubriği | ortalama ≥4,2 |
| Atıf bütünlüğü | tüm yanıtlar | her kimlik çözülüyor mu | %100 |
| Token | tüm altın sorgular | p95 | ≤ bütçe |

**Kart sadakati:** her kart üretiminden sonra bir yargıç model her cümleyi işaret ettiği
kaynak paragrafla karşılaştırır. "Desteklenmiyor" içeren kart otomatik yayına giremez.
Aylık %5 uzman örneklemi yargıcı kalibre eder.

**Altın set üretimi:** yönlendirme seti düğümlerin `ornek_sorgular`'ından değil, ayrıca
yazılmış anlatımlardan oluşur (aksi hâlde test kendini ölçer); gündelik dil, yazım hatası
ve eksik bilgi içerir; %20 tuzak vaka (alan dışı, iki düğüme düşen, süresi geçmiş).

**CI sırası:** şema/ontoloji/parametre doğrulaması → birim ve kural testleri + kök bulucu
eşlik testi → staging altın setleri → önceki sürümle fark raporu (kötüleşme varsa kilit).

## 13. Uzman inceleme akışı

Uzman (avukat) zamanı en kıt kaynak; akış onu yalnızca değişen ve riskli şeylere
yönlendirir. Haftada 3-4 saat hedeflenir.

| Tetikleyici | Öncelik | Uzmanın gördüğü |
|---|---|---|
| Yeni/değişmiş kural parametresi | Yüksek | Eski/yeni değer, kaynak linki, etkilenen kurallar |
| Mevzuat değişikliğiyle eskiyen kart | Yüksek | Madde farkı + kart farkı yan yana |
| İçtihat kayması uyarısı | Yüksek | Eski/yeni küme temsilcileri, zaman grafiği |
| Sadakat denetiminde "desteklenmiyor" | Orta | Sorunlu cümle + kaynak paragraf |
| Yeni düğüm önerisi | Orta | Küme örnekleri, önerilen konum |
| Aylık rastgele örneklem | Düşük | Kart + rubrik |

Arayüz: fark görünümü; tek tıkla resmî kaynağa; onayla / düzenleyip onayla / reddet
(gerekçe zorunlu) / ertele; her eylem denetim izine; erişim e-posta tabanlı.

**Onayın yanıta etkisi:** yanıt her kart ve kural sonucu için onay durumunu taşır.
`teyit_bekliyor` olan sonuç "doğrulanmamış hesap" olarak iletilir. 30 günden uzun bekleyen
yüksek öncelikli öğe varsa sistem uyarı üretir.

## 14. Gözlemlenebilirlik, güvenlik ve hukuki çerçeve

Kullanıcılar kendi uyuşmazlıklarını anlatacak; bu yüzden **ham sorgu metni saklanmaz**.
- Kaydedilen: zaman, uç nokta, araç, seçilen düğüm, güven, çalışan kurallar, yanıt token
  sayısı, gecikme, hata kodu, yayın sürümü.
- Kaydedilmeyen: özet metni, tutar, tarih gibi olgu değerleri.
- Panolar: p50/p95 gecikme, düğüm dağılımı, belirsizlik oranı, eşleşmeyen oranı, ortalama
  token, hata oranları; hat için aşama başına iş sayısı, hata oranı, kuyruk yaşı.

**Güvenlik:** karar ve mevzuat metinleri her yerde veridir; çıkarım prompt'larında sınır
etiketleri; sorgu yolunda üretken LLM olmadığı için kullanıcı girdisi sunucuda bir modeli
yönlendiremez; IP başına dakikada 30 istek; sırlar yalnızca ortam değişkeni/sır
yöneticisinde; bağımlılıklar sürüm sabitli ve haftalık taramalı.

**Hukuki çerçeve (avukatla teyit edilecek):** resmî metinler FSEK m.31 kapsamında
korunmaz; ticari veritabanı derlemeleri korunabilir, bu yüzden yalnızca resmî kaynak;
her kaynak için kullanım koşulları ADR'de; KVKK için kararlarda maskeleme, kullanıcı
sorgusu saklanmaz, aydınlatma metni; Avukatlık Kanunu gereği ürün "hukuki bilgiye erişim
aracı" olarak konumlanır ve "bu durumda ne yapmalısınız" değil "ilgili haklar, süreler ve
yollar" dili kullanır; ücretli sunum düşünülürse önceden avukat görüşü.

**Sorumluluk notu:** oturum başına bir kez, kısa: bilgi amaçlıdır, güncelliği ve somut
olaya uygunluğu bir avukatla doğrulanmalıdır.

## 15. Fazlar, görevler ve kabul kriterleri

Her faz bir kapıyla biter; kapı geçilmeden sonraki faza geçilmez. Her görev tek başına
test edilebilir dikey bir dilimdir.

**Faz 0 — Temel (1 hafta)**
- [x] T-001 Monorepo iskeleti, tip kontrolü, test koşucusu. Kabul: boş CI yeşil.
- [x] T-002 `packages/schema`: araç G/Ç sözleşmeleri (Zod). Kabul: iki taraf aynı tipleri kullanıyor.
- [x] T-003 Kaynak erişim denetimi. Kabul: ADR-001 kaynak başına izin/yasak kararıyla.
- [ ] T-004 Altyapı sınırlarının doğrulanması (D1/Vectorize/Worker). Kabul: ADR-002.
- [x] T-005 Ontoloji v0 YAML + doğrulayıcı. Kabul: 41 yaprak, her yaprakta ≥5 örnek, CI'dan geçiyor.
- [~] T-006 Altın set v0. Kabul: avukat onayı (bekliyor).

**Faz 1 — Mevzuat, kurallar, ilk MCP (2 hafta)**
- [x] T-101 Mevzuat toplayıcı: 6502, 6098, 6100, 3095, 6325, 2004, 7201, 4721, 5237, 6102, 2709. Kabul: 4.945 madde, resmî sayfayla birebir.
- [~] T-102 Resmî Gazete izleyici + iki zaman boyutlu sürüm. Kabul: tarihli çözüm.
- [x] T-103 `tr-text`: normalizasyon, Snowball benzeri gövdeleyici (Py+JS), atıf gramerleri. Kabul: eşlik testi.
- [~] T-104 Kural motoru + 8 kural + parametre tabloları.
- [x] T-105 MCP iskeleti: 5 araç, stdio, `hesapla`/`derinles`/`dogrula`.
- [~] T-106 Yayın v0: sürüm işaretçisi, geri alma.

**Kapı 1:** "Ayıplı mal için son günüm ne?" sorusu canlı MCP üzerinden doğru tarih ve
dayanakla yanıtlanıyor.

**Faz 2 — İçtihat korpusu (3 hafta)**
- [x] T-201 Yargıtay + Emsal toplayıcıları, tüketici odaklı filtre, hız limiti.
- [~] T-202 Ayrıştırma, künye, paragraf, rol, maskeleme.
- [ ] T-203 Atıf çıkarımı ve tarihli çözümleme.
- [~] T-204 Yapısal çıkarım hattı (v1'de deterministik).
- [x] T-205 L0/L1 üretimi ve token sayımları (p95: L0 35, L1 167).
- [x] T-206 FTS5 + hibrit arama + `ara` aracı.
- [ ] T-207 Karar zinciri ve `nihai_durum`.

**Faz 3 — Derleme zekâsı (3 hafta)**
- [ ] T-301 Kümeleme, kayma tespiti.
- [ ] T-302 Argüman kanonikleştirme.
- [~] T-303 Kart üretimi + sadakat denetimi.
- [x] T-304 Yönlendirme ve belirsizlik protokolü.
- [x] T-305 `hukuk_sor`, bütçe paketleyici, tekrar önleme, yanıt biçimi.
- [ ] T-306 Uzman arayüzü v1.

**Faz 4 — Üretime hazırlık (2 hafta)**
- [ ] T-401 Değişiklik yayılımı uçtan uca.
- [~] T-402 CI değerlendirme kapıları ve sürüm fark raporu.
- [ ] T-403 Gözlemlenebilirlik panoları.
- [~] T-404 Cepheler, prompts, resources.
- [ ] T-405 Hız limiti, aydınlatma metni.
- [ ] T-406 Kapalı beta.

**Faz 5 — Genişleme (sürekli):** yeni alan = yeni ontoloji dalı + kurallar + kaynak
filtresi + altın set; altyapı değişmez.

**İlk uygulanan alan: SGK (2026-10-22, [ADR-005](adr/ADR-005-sgk-kapsami.md))**
- [x] **T-501 SGK ontolojisi.** `s/sgk` kökü, 5 dal + 8 yaprak = 14 düğüm; her yaprağa elle
  yazılmış kart. Kabul: yönlendirme altın seti SGK örneklerini top-1'de yakalıyor.
- [x] **T-502 SGK korpusu ve parametreleri.** 5510 + 4447 kanun metinleri, 8 kural,
  tarihli parametre satırları (korpus toplamı 58). Kabul: `m:5510/67`, `m:4447/50`
  çözümleniyor; tarihsiz parametre satırı 0.
- [x] **T-503 Sunucu entegrasyonu.** `HukukSorInput.prim_gun_sayisi`, `s/` kimlik sözleşmesi,
  `ontoloji://sgk`; araç sayısı **5'te sabit**. Kabul: `hukuk_sor` SGK sorusuna tek çağrıda
  düğüm + kural + atıf döndürüyor.
- [x] **T-504 SGK değerlendirmesi.** Altın sete 16 bağımsız örnek (r167–r182), 3 bench
  senaryosu, 3 vaka; yönlendirme top-1 %97,4 / top-3 %99,4, bütçe 21/21, atıf 64/64.
- [ ] **T-505 SGK içtihat altın seti.** SGK kararları için bağımsız etiketli arama seti;
  bugünkü 239 karar bu alanı temsil etmiyor (`ara` SGK'da ölçülmedi).
- [ ] **T-506 Emeklilik hesabı (5510 m.28).** Kademeli yaş tablosu + geçiş hükümleri ayrı ADR
  ve ayrı parametre tablosu gerektirir; v1 kapsamı dışı.
- [ ] **T-507 Uzman onayı.** SGK kart ve parametrelerinin avukat onayı; `teyit_bekliyor`
  etiketlerinin kapanması.

Sonraki alan sırası: iş hukuku, kira, idare (Danıştay), AYM bireysel başvuru, HUDOC.

## 16. Agent'a devir

Bu plan depoda `docs/PLAN.md` olarak durur; agent'a her oturumda tek görev (T-xxx)
verilir. `AGENTS.md` depo kökünde, her oturumda okunan kalıcı kuralları taşır.

**Çalışma döngüsü:** görevi seç → önce kabul kriterini ölçen başarısız test yaz → en küçük
uygulamayla geçir → doğrulama komutlarını çalıştır ve çıktıyı görev notuna ekle → görevi
işaretle, yeni karar gerektiyse ADR yaz → fazın son görevinden sonra kapı kriterini
doğrula, sonra sonraki faza geç.

**Sorulması gerekenler (kendi başına karar verme):** hukuki bir değer/süre/madde yorumu
gerekiyorsa; bir kaynağın erişim koşulları belirsizse; bir ontoloji kimliğini değiştirmek
gerekiyorsa; maliyeti 50 USD'yi geçecek toplu LLM işi başlatılacaksa.

**Açık sorular (Faz 0'da kapanmalı):**
- Uzman (avukat) kim olacak ve haftada kaç saat ayırabilir?
- Hizmet ücretsiz mi, ücretli mi?
- Altyapı: Cloudflare mi, AWS mi? (ADR-002)
- Mevcut açık kaynak Türk hukuk MCP'leriyle ilişki: kod bağımlılığı, katkı veya bağımsız
  geliştirme? Lisanslar kontrol edilmeli. (bkz. `docs/RAKIPLER.md`)
