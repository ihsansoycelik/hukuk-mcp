# ADR-003 — Token bütçesi: etiketli düz metin ve build zamanında token'lama

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-22
- **Karar:** `hukuk_sor` yanıtı **JSON değil, etiketli düz metindir** (tek `text` içerik bloğu).
  Yanıtın bölümleri **build zamanında** token'lanır (`bolum.token`, `madde.token_l1`,
  `karar.token_l1`); sorgu yolunda bütçe **sayı toplamıyla** yönetilir, son kesme aynı
  tokenizer'la yapılır. Varsayılan bütçe **1500**, üst sınır **4000**.
- **İlgili:** `packages/schema` (`KartBolumu`, `Kart`, `butce`), ADR-002, ADR-004, `bench/encoding.ts`

## Bağlam

MCP'de araç sonucu modele **metin olarak** girer. Üç kısıt aynı anda geçerli:

1. **Her token para.** Araç tanımları her turda ödenir; sonuç token'ı da bağlama yazılır.
   Çıktı büyüdükçe modelin asıl işi (kullanıcıya anlatmak) için alan daralır.
2. **Tek çağrı sözü.** Kullanıcı 5-10 çağrılık zincir beklemiyor; `hukuk_sor` bir kez çağrılır
   ve içinde "ne yapmalıyım" sorusunun cevabı olmalı.
3. **Her iddia çözümlenebilir bir kimlik taşımalı** (`m:6502/11`, `k:…`). Kimlik ayrı bir
   alanda durursa model onu yanıttan düşürür; bu projede atıfsız cümle kabul edilemez.

Buna ek olarak: yanıt **bütçeyle sınırlı** olmalı ve kırpma **öngörülebilir** olmalı. "Model
kısaltır" yaklaşımı deterministik değildir; bütçe kodda uygulanır.

## Ölçüm: JSON mu, etiketli metin mi?

`bench/encoding.ts` aynı anlamsal içeriği iki kodlamada üretip `gpt-tokenizer` ile sayar.
İçerik gerçek karar metninden alınan özetle sabittir; tek değişken kodlamadır (anahtar tekrarı,
tırnak/kaçış, süslü parantez, girinti).

| özet uzunluğu | JSON (kompakt) | JSON (pretty) | etiketli metin | kompakt'a göre | pretty'ye göre |
| --- | --- | --- | --- | --- | --- |
| 600 karakter | 611 token | 743 token | 568 token | %7,0 tasarruf | %23,6 tasarruf |
| 1.800 karakter | 983 token | 1.115 token | 940 token | %4,4 tasarruf | %15,7 tasarruf |
| 4.000 karakter | 1.380 token | 1.512 token | 1.337 token | %3,1 tasarruf | %11,6 tasarruf |

**Ortalama: kompakt JSON'a göre %4,8, pretty JSON'a göre %17,0 tasarruf** (ÖLÇÜLDÜ,
`bench/results/encoding.json`).

**Dürüst yorum:** Bu fark tek başına JSON'u reddetmeye yetmez. Kompakt JSON'a karşı kazanç
küçüktür (%3–7) ve içerik uzadıkça azalır, çünkü anahtar yükü sabit, içerik değişkendir.
Kararın gerçek gerekçeleri aşağıdadır.

## Karar

1. **Biçim: etiketli düz metin.** Bölüm başlıkları sabit ve büyük harfli:
   `DÜĞÜM`, `ÖZET`, `KURALLAR`, `HAKLAR`, `YOL`, `EKSİK OLGULAR`, `ARGÜMANLAR`,
   `KARARLAR`, `DERİNLEŞ`, `NOT`. Kimlikler metnin **içinde** durur (ayrı alan yok).
2. **Tek içerik bloğu.** Yanıt bir `text` bloğudur; çoklu blok yok. İstemci tarafında
   birleştirme/sıralama işi kalmaz, log'da okunabilir.
3. **Bölümler build zamanında token'lanır.** Her `KartBolumu` kendi token sayısını taşır;
   bütçe paketleyicisi `oncelik` sırasına göre **sayı toplar**, gerekirse bölümü satır sınırında
   keser ve kesildiğini `NOT` bölümünde söyler.
4. **Son doğrulama aynı tokenizer'la.** `gpt-tokenizer` hem build'de hem son kesme doğrulamasında
   kullanılır; iki farklı tokenizer karışırsa bütçe yalan söyler.
5. **Kırpma sırası sabittir:** `YOL` ve `KURALLAR` korunur (kullanıcının işine yarayan kısım),
   `ARGÜMANLAR` ve `KARARLAR` en son kırpılır, `EKSİK OLGULAR` asla tamamen düşmez (yanlış
   güveni engeller).
6. **Bütçe aşımı hata değildir**: `butce` alt sınırı 300, üst sınırı 4000; sunucu sözleşmeyi
   `schema` içinde uygular (`z.number().int().min(300).max(4000)`).

## Build zamanında token'lama: neden?

`bench/encoding.ts` tokenizer'ın bir yanıt için maliyetini de ölçtü: **0,333 ms / yanıt**
(200 koşu ortalaması). Yani "token'lamayı build'e taşırsak hızlanırız" iddiası **zayıftır** —
kaybedilen süre milisaniyenin altında. Gerçek gerekçeler:

- **Determinizm:** Aynı korpus sürümü + aynı tokenizer sürümü = aynı bütçe kararı. Build'de
  sayılan token ile sorguda sayılan token ayrışırsa bütçe sessizce kayar.
- **O(1) bütçe hesabı:** Paketleyici yüzlerce aday bölüm arasından seçim yaparken metin
  token'lamaz, hazır sayıları toplar. Aday sayısı büyüdükçe bu önem kazanır.
- **Tokenizer sürüm kayması izlenebilir:** Token sayıları veride durur; `gpt-tokenizer`
  güncellenince fark **ölçülebilir** olur (yeniden build), sessizce değişmez.
- **Build'de toplu sayım ucuz:** Binlerce kartı tek geçişte sayabiliriz; sorgu yolunda
  yapılsaydı her istekte tekrarlanırdı.

## Sonuçlar

**Olumlu**

- Kırpma öngörülebilir ve test edilebilir: `butce` verilince yanıtın token'ı **ölçülerek**
  doğrulanabilir (bench'te bütçe uyumu raporlanır).
- Atıf kimliği metnin içinde olduğu için "atıf alanını doldurmayı unutan model" hatası oluşamaz;
  atıfsız cümle yazıldıysa bu **sunucunun** hatasıdır, modelin değil.
- İnsan tarafından da okunur: kullanıcı ham MCP log'una baktığında anlar; destek/hata ayıklama
  JSON gezintisi gerektirmez.

**Olumsuz / kabul edilen maliyet**

- **Makine tarafında yapısal erişim yok.** Bir istemci "kurallar dizisi" almak isterse metni
  ayrıştırmak zorunda. Karşılığı: `derinles` aracı tek bir kimliği (ör. `k:…`) yapısal olarak
  döndürür; yapısal ihtiyaç oraya yönlendirilir.
- **JSON'a göre kazanç küçük** (kompakt %3–7). Bu ADR, "JSON'dan %40 tasarruf" gibi bir iddiada
  bulunmaz; ölçülen neyse o yazılır.
- **Bölüm öncelikleri elle kalibre edildi.** Hangi bölümün önce kırpılacağı ürün kararıdır;
  yanlış sıra, kullanıcının en çok ihtiyaç duyduğu bilgiyi kesebilir.
- **Etiket sözlüğü sözleşmedir.** Bölüm adı değişirse istemci/test kırılır; bu yüzden
  `DÜĞÜM/ÖZET/…` sabit liste olarak test edilir.

## Açık kalanlar

1. **1500 token gerçekten yeterli mi?** Bu, `bench/measure.ts` ölçümüyle ve gerçek kullanıcı
   yanıtlarıyla doğrulanacak; şu an açık.
2. **Bölüm başına token dağılımı** ölçülmedi (hangi bölüm bütçenin ne kadarını yiyor).
3. **JSON isteyen istemciler** için opsiyonel `format` parametresi reddedildi mi, yoksa v2'ye mi
   kaldı — karar verilmedi; şimdilik reddedildi sayılıyor (5 araç sınırı).
4. **Kırpma bildirimi metni** standartlaşmadı: `NOT` içinde "bütçe nedeniyle kısaltıldı" nasıl
   ifade edilecek, testi nasıl yazılacak.
5. **İngilizce/çok dilli yanıt** kapsam dışı; etiketler Türkçe sabit.
6. **Tokenizer sürüm politikası**: `gpt-tokenizer` majör sürüm atladığında yeniden build
   zorunluluğu ve eski token sayılarının geçersizleşmesi süreci yazılmadı.
