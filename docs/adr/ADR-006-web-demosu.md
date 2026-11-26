# ADR-006 — Kurulumsuz deneme yüzeyi: gizli adresli web demosu

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-22
- **Karar:** Çekirdek aynı kalır; `hukuk_sor` çıktısı, MCP kurmayı bilmeyen kişilerin
  tarayıcıdan deneyebilmesi için **tek sayfalık, JavaScript'siz bir HTTP yüzeyi** olarak da
  sunulur (`packages/demo`). Yüzey **listelenmez**: adreste tahmin edilemez bir yol parçası
  (`DEMO_TOKEN`) vardır, sayfa `noindex` döner ve hiçbir yerden bağlantı verilmez.
- **İlgili:** `packages/demo`, `packages/mcp-server/src/hukukSor.ts`, ADR-002 (altyapı),
  ADR-003 (token bütçesi), `docs/PAYLASIM.md`

## Bağlam

Ürünün hedef kitlesi avukat değil, vatandaş (ADR-002). MCP kurulumu — istemci seç, JSON
yaz, Node sürümünü ayarla — bu kitlenin çoğu için aşılamaz bir duvardır. Kullanıcı
"arkadaşım deneyebilsin" dediğinde iki seçenek kalıyordu:

1. **Kurulumu kolaylaştırmak** (tek tık paket, tek komut): hâlâ bir istemci, bir dosya indirme
   ve çoğu zaman Node.js gerektirir.
2. **Hiç kurulum istemeyen bir yüzey** (tarayıcı): bağlantıyı açan herkes, MCP'den habersiz,
   ürünün gerçek çıktısını görür.

İkincisi seçildi. Amaç bir "ürün" yayınlamak değil; **çekirdeğin ne ürettiğini göstermek**.

## Karar

1. **Ayrı paket, ortak çekirdek.** `packages/demo` yalnızca taşıma ve HTML üretir; hukuk
   mantığı `hukukSor()` içinde, MCP sunucusuyla **aynı** fonksiyondadır. Demo, korpustan
   farklı bir yanıt üretmez. Sorgu yolunda üretken LLM yoktur (değişmez #1).
2. **Tek yön.** Yalnızca `hukuk_sor` sunulur. `ara` (Recall@5 %50,1), `derinles`, `hesapla`,
   `dogrula` demoda yoktur: deneme yüzeyi, güvenilirliği ölçülmüş akışı temsil etmeli.
   Diğer dört araç MCP istemcisinde kalır.
3. **Listelenmemişlik, kimlik doğrulama değildir.** Gizlilik, adreste 128 bit'lik rastgele
   yoldan gelir (`/^[A-Za-z0-9_-]{16,64}$/`), `X-Robots-Tag: noindex` ve dış bağlantı
   olmamasından gelir. Bu, "linki bilen görür" demektir; **link paylaşılırsa görülür**.
   Gerçek erişim denetimi (kullanıcı/şifre/OAuth) bu ADR'nin kapsamı dışındadır ve
   eklenirse yeni bir ADR gerektirir.
4. **Sıfır istemci tarafı.** HTML'de JavaScript, çerez, üçüncü taraf istek yoktur; form
   klasik POST ile gönderilir. Bu yüzden `Content-Security-Policy: default-src 'none'`
   uygulanabilir ve sayfa eski/ucuz telefonlarda da açılır.
5. **Soru saklanmaz.** Gövde yalnızca istek boyunca bellekte tutulur; diske, log'a veya
   analitiğe yazılmaz. Log satırı yalnızca `yöntem · yol-türü · durum · süre` içerir.
   (Değişmez: kullanıcı verisi loglanmaz.)
6. **Kötüye kullanım sınırları koda gömülü.** IP başına dakikada **12** istek (pencere
   kaydırmalı), gövde sınırı **8 KB**, özet **400 karakter**. Sınırlar hukuki değer değil,
   işletim parametresidir; bu yüzden `kural_parametre` tablosuna girmez.
7. **Loopback'e bağlanır.** Süreç `127.0.0.1` dinler; dışarıya açılım ters vekil veya
   tünel ile yapılır. Uygulama, önünde TLS sonlandıran bir katman olduğunu varsayar.
8. **Ölçüm iddiası yok.** Demo, bench raporundaki sayıları değiştirmez; gecikme/token
   ölçümleri stdio MCP sunucusu içindir. Demo için "şu kadar hızlı" denmez.

## Sonuçlar

**Olumlu**

- Kurulumu bilmeyen biri, telefonundan, 30 saniyede gerçek çıktıyı görür.
- Çekirdek tek yerde kaldığı için demo ile MCP sunucusu arasında anlam kayması olmaz.
- Sunucu tarafında yeni bağımlılık yok: `node:http` + mevcut paketler; derleme adımı yok.

**Olumsuz / kabul edilen maliyet**

- **Kimlik doğrulama yok.** Adres sızarsa herkes kullanır; tek savunma token'ı döndürmek
  (servisi yeni `DEMO_TOKEN` ile yeniden başlatmak).
- **Tek süreç, tek korpus.** Eşzamanlı yük için tasarlanmadı; ADR-002'deki ölçeklenme
  hedefi (Workers + D1) değişmedi.
- **Demo, ürünün tamamı değil.** Dört araç ve MCP protokolü görünmez; bu, "MCP'yi göster"
  değil "sonucu göster" demektir.
- **Kalıcı adres ayrı bir iştir.** Tünel/alan adı seçimi bu ADR'ye girmez; `docs/PAYLASIM.md`
  iki yolu (geçici tünel, kalıcı alt alan adı) anlatır.
