# ADR-002 — Altyapı: Node 26 + `node:sqlite` (v1) → Cloudflare Workers/D1/Vectorize (ölçeklenme)

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-22
- **Karar:** v1 sorgu yolu **Node 26 + yerleşik `node:sqlite` (FTS5)** üzerinde, tek dosya
  SQLite korpusu ve tek süreçle çalışır. Ölçeklenme hedefi **Cloudflare Workers + D1 +
  Vectorize**'dır; şema her iki tarafın da anlayacağı SQLite/FTS5 alt kümesinde tutulur.
- **İlgili:** `data/build/schema.sql`, `packages/mcp-server`, ADR-003 (token bütçesi), ADR-004 (embedding yok)

## Bağlam

Hedef kitle avukat değil, vatandaş. Bu, altyapı seçimini normalden farklı kısıtlıyor:

1. **Kurulum sürtünmesi ölümcül.** Kullanıcı Claude Desktop/Codex'e tek bir JSON satırı ekleyip
   çalıştırmalı. `pip install`, `docker compose`, veritabanı sunucusu, `node-gyp`/Xcode
   araçları kabul edilemez.
2. **Sorgu yolu bağımlılıksız olmalı.** Tek çağrılık yanıt üretmek için ağ, API anahtarı veya
   dış servis gerekmemeli; çevrimdışı da çalışmalı.
3. **Deterministik olmalı.** Aynı girdi + aynı korpus sürümü = aynı çıktı. Canlı crawl veya
   uzak vektör servisi bunu bozar (bkz. ADR-004).
4. **Maliyet sıfıra yakın olmalı.** Kişisel bir MCP sunucusu için aylık sunucu faturası yok.
5. **Yol tek yönlü olmamalı.** Ücretsiz/yerel v1'den barındırılan çok kullanıcılı sürüme geçiş
   veriyi ve şemayı yeniden yazdırmamalı.

## Ölçülen/okunan gerçekler (2026-10-22)

**Yerel (bu makinede ölçüldü).** `node v26.10.0`, `node:sqlite` → **SQLite 3.53.4**,
derleme seçenekleri arasında `ENABLE_FTS5`, `ENABLE_FTS3`, `ENABLE_RTREE` var.

- `data/build/schema.sql` gerçek dosyası `:memory:` üzerinde **hatasız** kuruldu:
  **25 nesne** (13 tablo + 2 sanal FTS5 tablosu + 8 yardımcı `*_fts_*` tablosu + 2 indeks).
- FTS5 sorgusu çalıştı: `madde_fts` üzerinde `MATCH 'ayipli'` → `bm25()` skoru döndü.
- Yani şema, **hiçbir npm bağımlılığı ve native derleme olmadan** ayakta. `better-sqlite3`
  gibi `node-gyp`/platform binary hattı yok.

**Bulut (Cloudflare dokümanlarından okundu, bizde denenmedi).**

- D1, **FTS5'i destekliyor** ("Supported SQLite extensions": FTS5 module, including
  `fts5vocab`) → [D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/).
  Bu, "D1'de tam metin arama olmaz" varsayımını çürütür; şema taşınabilirliği bu yüzden gerçekçi.
- D1 limitleri: **10 GB**/veritabanı (Workers Paid), 500 MB (Free), sorgu süresi **30 sn**,
  SQL ifadesi **100 KB**, bağlı parametre **100**, satır/BLOB **2 MB**
  → [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
- Workers CPU: Free planda **10 ms**/istek; Paid'de varsayılan **30 sn**, 5 dk'ya çıkarılabilir
  → [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- `node:sqlite` olgunluk: Node dokümanına göre v25.7.0'da **"release candidate" (Stability 1.2)**;
  v22.13/v23.4'te bayrak arkasından çıktı ama hâlâ deneysel
  → [node:sqlite](https://nodejs.org/docs/latest-v26.x/api/sqlite.html).

## Karar

1. **v1 = Node 26 + `node:sqlite`**, korpus tek `.sqlite` dosyası, `WAL`, salt-okunur açılış.
   MCP taşıması stdio; süreç başına tek kullanıcı.
2. **Sorgu yolunda sıfır runtime bağımlılığı**: `node:sqlite` Node ile gelir; `gpt-tokenizer`
   yalnızca bütçe doğrulaması için, `@modelcontextprotocol/sdk` yalnızca taşıma için.
3. **Şema taşınabilir tutulur.** `data/build/schema.sql` yalnızca DDL içerir; `PRAGMA journal_mode`
   gibi **kurulum pragmaları** ayrı bir "build" betiğine taşınır (D1 bunları kendi yönetir).
   Özel fonksiyon, özel collation, `load_extension` yok.
4. **Node sürümü sabitlenir** (`engines.node >= 26` + CI'da tek sürüm). `node:sqlite` RC
   olduğu için sürüm aralığı genişletilmez.
5. **Ölçeklenme hedefi Cloudflare**, ama v1 değil: Workers (MCP streamable HTTP) + D1 (aynı DDL)
   + Vectorize (yalnızca ADR-004'teki kapı açılırsa).
6. **Korpus dağıtımı repodan ayrı**: binary dosya git'e girmez; sürümlü bir release artifact
   olarak indirilir, hash ile doğrulanır.

## Sonuçlar

**Olumlu**

- Kurulum: `npx`/tek `node` komutu; native derleme yok → Windows/macOS/Linux'ta aynı deneyim.
- Sorgu yolu ağsız, ücretsiz, deterministik; gecikme yerel disk + CPU ile sınırlı.
- Aynı DDL hem `node:sqlite` hem D1'de çalışabildiği için göç "yeniden yazma" değil,
  "dosyayı yükle + Worker'ı bağla" işine indirgeniyor.
- FTS5 + `bm25()` yerleşik: ayrı arama motoru (Elastic/Meilisearch) operasyonu yok.

**Olumsuz / kabul edilen maliyet**

- **Tek yazar, tek süreç.** Eşzamanlı yazma yok; korpus güncellemesi süreç dışında, atomik
  dosya değişimiyle yapılır. Çok kullanıcılı barındırma bu modelle olmaz.
- **Yatay ölçek yok.** Aynı anda N kullanıcı için N süreç = N dosya kopyası.
- **`node:sqlite` API'si RC.** Gelecek bir Node sürümünde imza değişebilir; bu yüzden sürüm
  pinlendi ve testler Node 26'ya bağlı.
- **Eşzamanlı (senkron) API.** Uzun FTS sorgusu olay döngüsünü bloklar. Bizim ölçeğimizde
  (binlerce madde, tek kullanıcı) sorun değil; milyonlarca kararda olur.
- **D1 10 GB tavanı** ve **100 KB SQL / 100 parametre** sınırı; çok büyük korpus veya
  çok parçalı sorgu tasarımı gerektirir.
- Workers'ta **10 ms CPU (Free)**; FTS sorgusu + biçimlendirme bu bütçeye sığmazsa Paid plan
  şart. Bu yüzden "ücretsiz barındırma" iddiası dikkatli kullanılmalı.

## Göç tetikleyicisi (net sayılar)

Aşağıdakilerden **biri** gerçekleşirse Cloudflare hattı birincil olur, `node:sqlite` çevrimdışı
moda düşer:

1. `bench/report.md`'deki p95 sorgu gecikmesi **> 250 ms** (yerel, sıcak) olursa;
2. korpus dosyası **> 2 GB** olursa (dağıtım + bellek);
3. "kurulum gerektirmeyen" barındırılan MCP talebi gelirse (vatandaş için asıl hedef budur);
4. eşzamanlı kullanıcı **> 1** olursa (stdio tek kullanıcı);
5. ADR-004'teki semantik arama kapısı açılırsa (Vectorize veya yerel vektör indeksi).

## Açık kalanlar

1. **D1 üzerinde şema denenmedi.** `unicode61 remove_diacritics 0` tokenizer'ının D1'de birebir
   aynı davranıp davranmadığı `doğrulanamadı`; göç öncesi zorunlu test.
2. **Korpus dağıtım kanalı** (GitHub Release mi, R2 mi) ve sürüm/hash doğrulama akışı yazılmadı.
3. **Salt-okunur açılış** (`readOnly`) ve WAL ile eşzamanlı okuma davranışı yük testi görmedi.
4. **Windows'ta `node:sqlite`** ve uzun yol/encoding davranışı denenmedi.
5. **Workers'ta MCP streamable HTTP** taşıması ve oturum yönetimi (Durable Objects gerekir mi)
   tasarlanmadı.
6. Node 26 altı sürümlerde çalıştırma denemesi yok; `engines` alanı henüz kök `package.json`'a
   eklenmedi (bu ADR uygulama işi olarak açık).
7. **Yedekleme/geri dönüş**: korpus bozulursa yeniden üretim süresi ölçülmedi.
