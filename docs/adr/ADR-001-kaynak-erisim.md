# ADR-001 — Kaynak erişimi: hangi kaynaktan nasıl okuyoruz

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-22
- **Karar:** v1 korpusu yalnızca resmî/kamuya açık kaynaklardan, **derleme (build) zamanında**,
  kendini tanıtan bir User-Agent ve **host başına 1 istek/sn** tavanıyla toplanır. Sorgu
  yolunda (query path) **hiçbir canlı istek yapılmaz**. CAPTCHA/erişim engeli aşılmaz.
- **İlgili:** `pipeline/collect/decisions.py`, `docs/RAKIPLER.md`, `.gitignore` (ham veri repoda tutulmaz)

## Bağlam

Vatandaşın sorusuna tek çağrıda yanıt verebilmek için üç tür metne ihtiyacımız var:

1. **Mevzuat** (kanun/yönetmelik/tebliğ/CBK) — `mevzuat.gov.tr`, Cumhurbaşkanlığı Mevzuat Bilgi Sistemi.
2. **Resmî Gazete** — `resmigazete.gov.tr`, yürürlük tarihi ve değişiklik takibi için.
3. **İçtihat** — `karararama.yargitay.gov.tr` (Yargıtay) ve `emsal.uyap.gov.tr` (UYAP Emsal: BAM + ilk derece).

Kısıtlar birbirini sıkıştırıyor:

- Kullanıcı gecikmeye tahammülsüz (hedef: tek çağrı, yüzlerce ms). Canlı crawl bu hedefle uyumsuz.
- Bu siteler kamu hizmeti veriyor; yükümüz onların hizmetini bozmamalı. Yavaş ve az istek = hem
  etik hem operasyonel zorunluluk (429 duvarına çarpan bir crawler ilerleyemez).
- Kaynak metinler hukuki sonuç doğuruyor: yanlış/eskimiş metin, yanlış hak kaybı demek.
  Bu yüzden her kaydın **kaynak URL'si ve "as-of" tarihi** taşınmak zorunda.
- Hukuk metinlerinde kişisel veri de var (karar tarafları). Toplama hacmi ve saklama süresi
  keyfî büyütülemez.

## Bulgular — ölçülen/okunan gerçekler (2026-10-22)

Tüm istekler tek tek, 1 sn aralıkla, tanıtıcı UA ile yapıldı:
`hukuk-mcp/0.1 (belge; +https://github.com/ihsansoycelik/hukuk-mcp; 1 istek/sn)`.

| host | istenen yol | HTTP | Content-Type | boyut | bulgu |
| --- | --- | --- | --- | --- | --- |
| www.mevzuat.gov.tr | `/robots.txt` | 200 | text/plain | 2.728 B | 65 satır: 1 `User-agent: Googlebot`, 64 `Noindex:`; **`Disallow` yok** |
| www.resmigazete.gov.tr | `/robots.txt` | 200 | text/plain | 1.582 B | 36 satır: 4 `User-agent` (Googlebot, Bingbot, Slurp, Yandex), 32 `Noindex:`; **`Disallow` yok** |
| karararama.yargitay.gov.tr | `/robots.txt` | **200** | application/json | 430 B | gövde: `ADALET_RUNTIME_EXCEPTION — "No static resource robots.txt"` → **robots.txt yok** |
| emsal.uyap.gov.tr | `/robots.txt` | **200** | application/json | 426 B | aynı hata gövdesi → **robots.txt yok** |

> **Düzeltme (brief'e göre):** brief "Adalet hostları `/robots.txt` için 404 döner" diyordu.
> Ölçüm **404 değil, 200 + JSON hata gövdesi** gösteriyor; anlamı aynı: bu hostlarda robots.txt
> dosyası yok, dolayısıyla robots kuralı yok. Gerekçeyi 404 varsayımına değil, bu ölçüme dayandırıyoruz.

### robots.txt ne diyor, ne demiyor

- `mevzuat.gov.tr` ve `resmigazete.gov.tr` dosyaları **Googlebot/Bingbot/Slurp/Yandex'e yönelik
  `Noindex:` listeleridir**. `Noindex` standart bir robots.txt direktifi bile değildir; "şu belgeyi
  arama motorunda indeksleme" demektir, "şu dizini tarama" demek değildir.
- **Hiçbir `Disallow` satırı yok** → robots.txt açısından bu sitelerde bize yasaklı yol yok.
  `Crawl-delay` de yok; bu yüzden kendi 1 istek/sn tavanımızı kendimiz koyuyoruz.
- Bu, "her şey serbest" demek **değildir**: robots.txt tek sinyaldir. `Noindex` listesindeki
  belgeleri öne çıkarmamak, ham metni toplu yeniden yayımlamamak ve kaynağı göstermek bizim
  ek kuralımız (aşağıda Karar m.4–m.6).

### İçtihat kaynakları: JSON arama API'leri

- İki Adalet hostu da kimlik doğrulaması istemeyen **JSON POST** uçları sunuyor:
  - `POST /aramalist` — arama; gövde: `{"data":{"arananKelime":…,"pageNumber":…,"pageSize":10,"siralama":"1","siralamaDirection":"desc"},"applicationName":"Uyap"}`
  - `GET /getDokuman?id=<id>` — kararın HTML/JSON tam metni.
- Bu yüzden "yargı kararlarına erişim yok" varsayımı yanlıştı; erişim var, sadece resmî bir
  **kullanım sözleşmesi/arayüz dokümanı yok**. Arayüz dokümanı olmadan `aramalist` şemasına
  bağlı kalmak kırılganlık riskidir (bkz. Açık kalanlar).
- Doğrulama: `data/raw/candidates.jsonl` içinde **1.020** benzersiz aday (650 Yargıtay, 370 Emsal),
  `data/raw/decisions.jsonl` içinde **9** tam metin karar (2 Yargıtay, 7 Emsal) bu uçlardan
  gerçekten çekildi. Repo ham veriyi tutmaz (`.gitignore: data/raw/`).

### Hız sınırı: 429 gerçek

- Adalet hostlarında **~1 istek/sn ve üzerinde HTTP 429** gözlendi. Bu bir varsayım değil,
  `pipeline/collect/decisions.py` içindeki 429 dalının sebebi: `exc.code == 429` → `sleep(45 + 15*attempt)`.
- Collector bugün iki host için **daha yavaş** çalışıyor: `PACE = {"yargitay": 2.0, "emsal": 1.3}`
  (yani 0,5 ve 0,77 istek/sn), üstüne 0–250 ms jitter. Yani tasarım tavanımız 1 istek/sn,
  uygulama onun da altında.
- 429 dışı hatalarda üstel geri çekilme var (`1.5 * 2**attempt`), en fazla 4 deneme.

## Karar

1. **Canlı crawl sorgu yolundan çıkarıldı.** Toplama `pipeline/` içinde, ayrı ve tekrar
   başlatılabilir bir iştir; MCP sunucusu yalnızca derlenmiş SQLite korpusunu okur. Sonuç:
   sorgu gecikmesi ağa bağlı değil, 429 ihtimali kullanıcıya yansımıyor.
2. **Host başına 1 istek/sn tavanı**, tanıtıcı UA, jitter, `Retry-After`'a uyma, 429'da en az 45 sn
   bekleme. Tavan kod içinde sabittir; "hızlı mod" yoktur.
3. **CAPTCHA/erişim engeli aşılmaz.** 403/429/CAPTCHA görülürse o kaynak o turda **atlanır** ve
   `collect.log`'a yazılır; proxy rotasyonu, sahte tarayıcı başlığı, çerez hilesi yoktur.
4. **Her kayıt kaynak URL'si + as-of tarihi taşır** (`kaynak_url`, `rg_tarih`, `tarih`). Kaynaksız
   metin korpusa girmez.
5. **Ham metni yeniden yayımlamıyoruz.** Kullanıcıya gösterilen her alıntı kısa tutulur ve
   `kaynak_url` ile birlikte verilir; tam metin yalnızca yerel korpusta, atıf çözümlemesi için durur.
6. **`Noindex:` listesindeki belgeleri arama motorlarına açık biçimde öne çıkarmayız**; derlenmiş
   korpusu toplu olarak servis etmeyiz (MCP yanıtı bütçeyle sınırlıdır — ADR-003).
7. **Güncellik iddiası tarihle sınırlanır.** Her yanıt, kullandığı parametre sürümünü ve
   `as-of` tarihini söyler; "en güncel mevzuat" iddiası yalnızca korpus tarihine kadar geçerlidir.

## Sonuçlar

**Olumlu**

- Sorgu yolu ağdan bağımsız: p50 gecikme yerel SQLite maliyetiyle sınırlı (ölçüm: `bench/report.md`).
- 429/erişim engeli kullanıcıya hiç yansımıyor; kaynak sitelere yük binmiyor.
- Her cümle çözümlenebilir bir kimliğe bağlanabiliyor (`m:6502/11`, `k:…`), çünkü toplama
  anında URL ve künye kaydediliyor.

**Olumsuz / kabul edilen maliyet**

- **Tazelik gecikmesi** var: korpus en son derleme tarihine kadar doğru. Mevzuat değişikliği
  ile derleme arasındaki pencerede yanıt eskiyebilir; bunu "as-of" etiketiyle açıkça söylüyoruz.
- Derleme işi saatler sürebilir (1 istek/sn tavanı + 1.020 aday). Bu yüzden artımlı ve
  kaldığı yerden devam eden (resumable) bir collector var.
- Resmî API sözleşmesi olmadığı için `aramalist` gövdesi habersiz değişebilir; kırılma
  sessiz olmasın diye collector "0 aday" durumunu hata sayar.

## Açık kalanlar

1. **Hukuki zemin teyidi.** Resmî metinlerin telif kapsamı ve karar metinlerinin yeniden
   kullanımı için FSEK/KVKK değerlendirmesi **hukukçu teyidi bekliyor** (`doğrulanamadı`).
   Bu ADR teknik bulguyu kaydeder; hukuki görüş yerine geçmez.
2. **Kullanım koşulları sayfası** (`mevzuat.gov.tr`, `adalet.gov.tr` kullanım şartları) okunup
   kayda geçirilmedi. Okunmadan "izin var" denmez.
3. **KVKK:** kararlarda taraf adları geçiyor. UYAP kararlarında taraf isimlerinin maskelenmesi
   politikası netleşmedi; v1'de yalnızca hukuki gerekçe bölümü alıntılanıyor, taraf isimleri
   alıntılanmıyor.
4. **Danıştay / AYM / Bölge İdare** kaynakları v1 kapsamı dışında; robots ve API davranışları
   ölçülmedi (`doğrulanamadı`).
5. **429 eşiğinin tam ölçümü** yapılmadı (kasıtlı olarak zorlamadık). "~1 istek/sn üzerinde 429"
   gözlemi bizim koşumuzdan; eşiğin hassas ölçümü kaynağı yormadan yapılamaz.
6. **Resmî Gazete arşiv erişimi** (eski tarihli sayılar, PDF/HTML tutarlılığı) denenmedi.
7. Sürdürülebilir güncelleme sıklığı (günlük/haftalık) ve izleme (collector başarısız olursa
   kim, nasıl uyarılır) henüz tanımlı değil.

## Kanıt dizini

```bash
# robots.txt bulguları (tek tek, 1 sn aralıkla, tanıtıcı UA)
curl -sS -A "hukuk-mcp/0.1 (belge; +https://github.com/ihsansoycelik/hukuk-mcp; 1 istek/sn)" \
  https://www.mevzuat.gov.tr/robots.txt | grep -c Disallow      # 0
curl -sS -A "…" https://www.resmigazete.gov.tr/robots.txt | grep -c Disallow   # 0
curl -sS -A "…" https://karararama.yargitay.gov.tr/robots.txt                  # 200 + JSON hata
curl -sS -A "…" https://emsal.uyap.gov.tr/robots.txt                           # 200 + JSON hata

# 429 davranışı ve tavan
grep -n "429\|PACE\|User-Agent" pipeline/collect/decisions.py
```
