# hukuk-mcp v0.3 planı

Tarih: 26 Kasım 2026. Dayanak: son altı ayda güncellenen en yüksek yıldızlı hukuk MCP'lerinin
kaynak kodu (korean-law-mcp, tw-legal-rag, Ansvar German-law ve Magyar-jogszabaly, ayunis-legal-mcp,
eur-lex-mcp-server, uk-legal-mcp, legal-mcp) ve MCP'nin 2026-07-28 spesifikasyonu. Okunan dosyalar
ve kanıt satırları bu belgenin sonundaki listede.

## Karşılaştırma

| Proje (yıldız) | Veri | Arama | Araç | Zaman ve grafik | MCP özellikleri |
| --- | --- | --- | --- | --- | --- |
| korean-law-mcp (2,9k) | canlı resmî API | yerel indeks yok, kural tabanlı yönlendirme | 10 görünür, 60+ gizli | yürürlük tarihi sorgusu, mülga kanun arama, içtihat atıf denetimi | başlık, readOnlyHint, instructions |
| tw-legal-rag (356) | kapalı barındırılan API, 22,8 milyon karar | sunucuda, doğrulanamadı | 6 | 3,3 milyon temyiz bağı, geçerlilik kaydı | HTTP + OAuth, registry |
| Ansvar German / Magyar (23 / 27) | yerel SQLite, açılışta indirme | FTS5 bm25, genişletme zinciri | 8 ile 19 | sürüm tablosu yalnız ücretli katmanda | annotations, Docker |
| ayunis-legal-mcp (91) | Postgres + pgvector | yalnız vektör (2.560 boyut) | 3 | valid_from / valid_to | FastMCP HTTP |
| eur-lex-mcp-server (13) | canlı SPARQL | yapılandırılmış süzgeç | 7 | ELI/ECLI çözümleme, ilişki grafiği | outputSchema, tipli hata, .mcpb |
| uk-legal-mcp (22) | canlı resmî API'ler | yok | 8 | belirli tarihteki metin | outputSchema, tipli hata |
| hukuk-mcp | gömülü SQLite, çevrimdışı | FTS5 + alt küme zinciri + halk dili köprüsü + RRF | 5 | yok | instructions, prompt, kaynak |

Bizim önde olduğumuz yerler: tamamen çevrimdışı ve pakete gömülü korpus (incelenenlerin hiçbiri
böyle değil), kuralla hesaplanan süre ve merci, Türkçe ek yapısını hesaba katan arama, yayımlanmış
bir arama ölçümü (incelenen repoların hiçbirinde görülmedi).

Geride olduğumuz yerler, önem sırasıyla:

1. Zaman boyutu yok. Bir maddenin hangi tarihte hangi metinle yürürlükte olduğunu bilmiyoruz.
   Süre ve eşik yanıtları değişikliklerle değişir.
2. İçtihat atıf bilgisi yok. Bir BAM kararının Yargıtay'da bozulup bozulmadığını, bir kararın
   hangi maddelere dayandığını göstermiyoruz.
3. Mülga kanun yönlendirmesi yok. "818 sayılı BK m.41" yazan bir taslak bugün yalnızca "kapsam
   dışı" alıyor; doğrusu "mülga, yerini 6098 aldı" demek.
4. MCP yüzeyi eski: araç başlığı, readOnly/idempotent açıklamaları, `outputSchema` ve
   `structuredContent`, tipli hata yok. Claude dizini güvenlik açıklamalarını istiyor.
5. Arama yanıtı hangi genişletme adımıyla bulunduğunu söylemiyor; ajan sonucun gevşetildiğini
   bilemiyor.

## İlkeler

Sorgu yolunda LLM yok, çevrimdışı çalışma bozulmaz, araç sayısı 5 kalır, paket 25 MB sıkıştırılmış
boyutun altında kalır. Her adım ölçümle girer: önce ölçü, sonra değişiklik, sonra aynı ölçü.

## Faz 1: MCP yüzeyi ve hızlı kazanımlar (küçük)

- Beş araca `title` ve `annotations` (`readOnlyHint: true`, `idempotentHint: true`,
  `openWorldHint: false`). `tools/list` sırası sabit.
- `hukuk_sor`, `hesapla`, `dogrula` için `outputSchema` ve `structuredContent`: düğüm, güven,
  kurallar (kural, sonuç, son gün, dayanak), eksik olgular, atıflar ve durumları. Metin çıktı
  birincil kanal olarak kalır; istemcilerin yapılandırılmış çıktıyı gösterip göstermediği
  doğrulanmadı.
- `ara` çıktısına `STRATEJİ` satırı: `and`, `altkume`, `or`, `esanlam`. Sonuç yoksa hangi
  adımların denendiği ve sonraki öneri.
- `hukuk_sor` başlığına yönlendirme gerekçesi (`NEDEN tetik: "şanzıman", "bayi"`), yakın iki
  konuda mevcut `DİĞER OLASILIK` satırı korunur.
- Mülga kanun tablosu: 818 → 6098, 4077 → 6502, 1086 → 6100, 743 → 4721, 506/1479/5434 → 5510,
  6762 → 6102, 765 → 5237. `dogrula` bunları `⚠ MÜLGA KANUN, yerini … aldı` diye işaretler.
  Madde karşılığı verilmez (eşleme tablosu olmadan uydurma olur).
- Kapı testleri: her aracın başlığı ve açıklamaları var; açıklamalarda adı geçen her araç gerçekten
  var; araç tanımı toplamı 1.100 tokenı geçmez.

Bitti sayılır: Claude Code'da beş araç başlıklarıyla görünüyor, mevcut testler ve kabul testi
geçiyor, yeni kapı testleri geçiyor.

## Faz 2: ölçüm (değişikliklerden önce)

- Kaynağa dayalı altın set, 150 ile 300 satır. İki kaynak:
  - Kararların kendi madde atıfları. Bir kararın özetini sorgu sayıp, kararın metinde andığı
    maddeleri (m:6502/11 gibi) ilgili madde kabul eden madde-getirme ölçüsü.
  - Mevcut halk dili seti (27 + 20) yönlendirme altın setinin 156 sorusuyla genişletilir.
    İlgililik yine bedesten'in kavram aramasından gelir.
- Rapor: Recall@5/10 ve MRR, varyant başına (yalnız FTS, + köprü, + kök sütunu, + vektör).
- Ayrı set kuralı sürer: tabloyu ve ağırlıkları ayarlarken ayrı sete bakılmaz.

Bitti sayılır: `pnpm eval` tek komutla tüm varyant tablosunu basıyor, README tablosu bundan
üretiliyor.

## Faz 3: zaman ve atıf grafiği (asıl fark)

- Madde sürüm tarihleri. 1.107 maddedeki `(Değişik: 24/3/2022-7392/6 md.)`, `(Ek:`, `(Mülga:`,
  `(İptal:` notları ayrıştırılıp `madde_degisiklik(madde_id, tur, tarih, kanun_no, kaynak)` tablosuna
  yazılır. Ayrıştırma oranı derleme özetine girer; ayrıştırılamayan not sessizce düşmez, sayılır.
  `derinles` maddeyi "son değişiklik 24.03.2022, 7392 s. K." diye gösterir. `hesapla` olay tarihinden
  sonra değişmiş bir dayanak maddesi için `DİKKAT dayanak madde olaydan sonra değişti` uyarısı verir.
  Eski metnin kendisi yoktur; bunu söyler, eski metni uydurmaz.
- Karar → madde atıfları. Derleme sırasında `atif.ts` ayrıştırıcısı ham karar metnine uygulanır,
  `karar_atif(karar_id, madde_id)` tablosu dolar. Kullanım: `derinles(m:6502/11)` bu maddeye en çok
  dayanan kararları verir; `ara` sıralamasında soruyla aynı maddeye dayanan karar öne çıkar.
- Temyiz zinciri. Yargıtay kararlarındaki `MAHKEMESİ : … Bölge Adliye Mahkemesi 12. Hukuk Dairesi /
  SAYISI : 2022/1723 Esas, 2025/1864 Karar` satırları (3.113 ham kararın 1.995'inde var) BAM kararıyla
  eşlenir. Yargıtay kararının sonucu (bozma, onama, düzelterek onama) BAM kararına `üst inceleme`
  olarak bağlanır. Etiket "bağlantılı karar"dır; sonuç sezgiseldir ve öyle yazılır.
- `dogrula` bu tablolardan iki uyarı daha üretir: atıf yapılan BAM kararı Yargıtay'da bozulmuşsa
  ve atıf yapılan madde mülga ya da sonradan değişmişse.

Bitti sayılır: eşleşme oranları derleme özetinde, en az bir kabul testi her yeni uyarı için,
paket boyutu sınırın altında.

## Faz 4: arama kalitesi (ölçüme göre)

- Kararlar için ham ve köklü iki FTS sütunu, sorguya aynı katlama. Faz 2 ölçüsü artış göstermezse
  geri alınır.
- Statik embedding denemesi (Model2Vec, bge-m3'ten damıtılmış çok dilli model). Derleme sırasında
  kart ve karar özetleri vektörlenir, sorgu tarafı saf JS tablo araması olur, RRF ile birleşir.
  Şartlar: Recall@10 ayrı sette en az 5 puan artmalı, sorgu p95'i 50 ms'yi geçmemeli, paket 25 MB
  sınırını aşmamalı. Model ve JS tokenizer boyutu bu sınıra sığmazsa deneme bırakılır.
- sqlite-vec alınmaz: yerel ikili, platform başına paket ister, tek dosyalık dağıtımı bozar.

## Faz 5: dağıtım

- Uzak uç nokta: mevcut Node sunucusu bir VPS'te `--http` ile, HTTPS arkasında. Önce claude.ai'nin
  kimlik doğrulamasız salt-okunur sunucuyu kabul edip etmediği test edilir; edilmiyorsa OAuth ayrı
  karar. Cloudflare D1 (FTS5 var, 56 MB sığar) ancak yük gerekirse.
- Elicitation: 2026-07-28 spesifikasyonu sunucu kaynaklı istekleri `input_required` ile değiştirdi.
  SDK ve istemci desteği doğrulanınca `EKSİK OLGULAR` için ikinci yol olarak eklenir; metin yolu
  kalır.
- Golden hash testi: derlenen veritabanının satır sayıları ve örnek satır hash'leri sabitlenir,
  istemeden kayan veri yakalanır.

## Alınmayanlar

Meta araçlar (`discover_tools` / `execute_tool`: 5 araçta gereksiz), canlı API çağrısı, sorgu
yolunda LLM, büyük embedding modeli ve vektör veritabanı, sampling (spesifikasyonda kullanımdan
kalkıyor), kararların tam metnini saklamak.

## Sıra ve tahmini iş

1. Faz 1, bir oturum.
2. Faz 2, bir oturum. Faz 4'ün karar ölçüsü buna bağlı.
3. Faz 3, iki oturum. Madde sürümleri ve mülga uyarıları önce, temyiz zinciri sonra.
4. Faz 4, ölçüme göre bir oturum ya da hiç.
5. Faz 5, sunucu ve claude.ai testi ayrı karar.

v0.3.0 sürümü Faz 1, 2 ve 3 bitince çıkar.

## Kanıt

Okunan kaynak dosyalar `scratchpad/arch/<repo>/` altına indirildi. Öne çıkanlar:
`korean-law-mcp/src/tools/cite-check.ts`, `src/lib/abolished-laws.ts`, `src/lib/query-router.ts`,
`src/lib/tool-profiles.ts`; `German-law-mcp/data/premium-schema.sql`;
`magyar-jogszabaly-mcp/src/utils/fts-query.ts`; `ayunis-legal-mcp/store/app/models.py`;
`eur-lex-mcp-server/src/mcp-server/tools/definitions/eurlex-lookup-celex.tool.ts`;
`tw-legal-rag/twlegalrag_verify.py`; `uk-legal-mcp/CLAUDE.md`. Spesifikasyon:
https://modelcontextprotocol.io/specification/2026-07-28/changelog. Doğrulanamayanlar: tw-legal-rag'in
sunucu tarafı arama yöntemi, istemcilerin yapılandırılmış çıktı ve elicitation desteği.
