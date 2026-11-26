# ADR-004 — v1'de embedding yok: char-n-gram + tetikleyici skoru

- **Durum:** Kabul edildi (v1)
- **Tarih:** 2026-10-22
- **Karar:** Sorgu yönlendirmesi (hangi düğüm / hangi kural / hangi maddeler) v1'de **char-n-gram
  benzerliği + tetikleyici ifade skoru + FTS5/BM25** ile yapılır. **Embedding modeli yok**,
  vektör indeksi yok. Embedding sağlayıcısı için **tek bir arayüz** tanımlanır ve bugün
  implementasyonu yoktur.
- **İlgili:** `packages/retrieval`, `packages/tr-text`, ADR-002 (göç tetikleyicisi 5), `bench/`

## Bağlam

`hukuk_sor` tek çağrıda doğru düğüme (`t/ayipli-mal`, `t/mesafeli-satis`, …) ve doğru kurala
iniş yapmalı. Yönlendirme yanlışsa yanıtın geri kalanı ne kadar iyi olursa olsun işe yaramaz:
kullanıcı yanlış süre, yanlış merci, yanlış zamanaşımı okur. Yani yönlendirme **hukuki bir
çıktıdır**, sadece arama kalitesi değil.

v1'in kısıtları:

- **Gecikme:** Tek çağrı sözü verdik; yönlendirme için 100 ms üstü harcamak bu sözü bozar.
- **Maliyet:** Kişisel kurulum; API faturası veya model indirmesi olmamalı.
- **Determinizm:** Aynı girdi aynı düğüme gitmeli. Model sürümü değişince yönlendirme
  değişirse "neden geçen hafta farklı cevap aldım" sorusu cevapsız kalır.
- **Çevrimdışı:** İlk açılışta internet olmayabilir; model indirme bir kurulum adımıdır.
- **Hukuki metin:** "şanzıman" ile "vites kutusu" aynı şey; kullanıcı lay diliyle yazıyor.
  Bu, klasik sözlük tabanlı aramanın en zayıf olduğu yer.

## Neden v1'de embedding yok

| etken | char-n-gram + tetikleyici | embedding |
| --- | --- | --- |
| Gecikme | alt-ms, yerel, sabit | model yükleme (100+ MB) + çıkarım; CPU'da ilk istek saniyeler |
| Maliyet | 0 | ya API ücreti ya model dosyası + bellek |
| Determinizm | tam (girdi → katlama → skor) | model sürümü/quantization/kütüphane sürümü ile kayar |
| Çevrimdışı | evet | model önbellekte değilse hayır |
| Kurulum | yok | model indirme, bellek, (API'de) anahtar |
| Bakım | tetikleyici listesi elle büyür | indeks yeniden üretilir; şema/uzunluk değişince migrasyon |
| Açıklanabilirlik | "hangi tetikleyici eşleşti" görünür → hata ayıklanabilir | skor; nedenini açıklamak zor |

Sonuç: v1 için doğru trade-off, **açıklanabilir ve deterministik** yönlendirme. Yanlış
yönlendirmenin bedeli yüksek olduğu için "kara kutu ama biraz daha isabetli" tercih edilmedi.

## v1 yönlendirme boru hattı

1. **Normalize + katla** (`@hukuk/tr-text`): NFKC → Türkçe küçük harf (`I→ı`, `İ→i`) →
   aksan katlama (ASCII anahtar uzayı) → noktalama temizliği. Build ve sorgu **aynı** fonksiyonu
   kullanır; parite testi 5.000 kelime üzerinde.
2. **Tetikleyici skoru:** Düğümün `tetikleyiciler[]` ve `ornek_sorgular[]` listeleri normalize
   edilmiş ifadelerdir. Tam ifade eşleşmesi yüksek ağırlık, kelime öbeği kısmi eşleşmesi orta.
3. **Char-n-gram benzerliği:** 3–5 gram, katlanmış metin üzerinde Jaccard/cosine; yazım hatası
   ve ek farklarını tolere eder ("şanzumanı" ≈ "şanzıman").
4. **FTS5/BM25:** Madde ve karar metinleri `madde_fts` / `karar_fts` üzerinde aranır; skor
   düğüm skoruna katkı olarak eklenir.
5. **Eşik altında kalırsa:** yönlendirme **zorlanmaz**; yanıt `EKSİK OLGULAR` ile birlikte
   "hangi konuya girdiğini netleştir" der ve `NOT` bunu söyler. Yanlış düğüme emin bir cevap
   vermektense eksik ama dürüst cevap yeğlenir.

## Ne kaybediyoruz (dürüst liste)

- **Eş anlamlılık:** "vites kutusu" ↔ "şanzıman", "iade" ↔ "geri ödeme". Tetikleyici listesine
  elle eklenmezse kaçar.
- **Uzun/örnekli anlatım:** Kullanıcı 5 cümlelik hikâye yazarsa (bizim senaryolarımız gibi)
  char-n-gram seyrek kalır; tetikleyici kelimelerin metinde geçmesine bağımlıyız.
- **Diller arası:** İngilizce/Arapça yazılmış soru eşleşmez.
- **Yazım hatası toleransı sınırlı:** 3–5 gram bir noktaya kadar tolere eder; agresif kısaltma
  ("şanzmn") kaçar.
- **Bakım yükü:** Her yeni düğüm için tetikleyici + örnek sorgu yazılır. Ontoloji büyüdükçe bu
  elle iş artar ve **kapsam boşlukları** oluşur.
- **Ölçülmemiş isabet:** Yönlendirme doğruluğu henüz altın set üzerinde ölçülmedi
  (`doğrulanamadı`; altın set `eval/` altında hazırlanıyor).

## Embedding takılacak yer (tam arayüz)

Amaç: v2'de embedding eklenirse **çağrı yerleri değişmesin**. Tek genişleme noktası
`packages/retrieval/src/aday.ts` içindeki aday üretici:

```ts
/** Sorgudan düğüm/madde/karar adayları üreten tek arayüz. */
export interface AdayUretici {
  /** Ölçüm ve log için kimlik; build hash'ine girer: "ngram-v1" | "vektor:multilingual-e5-small@rev3" */
  kimlik(): string;
  /** Deterministik olmalı: aynı girdi → aynı aday listesi (sıra dahil). */
  adaylar(sorgu: Sorgu, k: number): Promise<Aday[]>;
  /** Bu üretici için build zamanında hangi indeks gerekiyor? */
  gereksinim(): "yok" | "fts5" | "vektor-indeks";
}

export interface VektorSaglayici {
  kimlik(): string;              // model adı + revizyon; kart.girdi_hash'e dahil edilir
  boyut(): number;               // ör. 384
  /** Batch; sorgu yolunda çağrılacaksa gecikme bütçesi ADR-003 ile uyumlu olmalı. */
  gomme(metinler: string[]): Promise<Float32Array[]>;
  /** Kosinüs; normalizasyon sağlayıcının sorumluluğunda. */
  benzerlik(a: Float32Array, b: Float32Array): number;
}

/** v1: char-n-gram + tetikleyici + FTS5 */
export const ngramAdayUretici: AdayUretici;
/** v2: yalnızca sağlayıcı enjekte edilirse kaydedilir; yoksa hiç yüklenmez. */
export function vektorAdayUretici(s: VektorSaglayici): AdayUretici;
```

Bağlama kuralları:

- **Tek enjeksiyon noktası:** sunucu `AdayUretici`yi `createServer({ aday })` ile alır. Başka
  yerde embedding çağrısı yasak (AGENTS.md kuralı).
- **İndeks build'de:** vektörler `vektor_indeks` tablosunda/ dosyada build zamanında üretilir;
  sorgu yolunda **model çağrılmaz** (yalnızca sorgu vektörü hesaplanır; o da sağlayıcı yerel
  ise).
- **Sürüm kimliği:** `kimlik()` değeri `kart.girdi_hash` hesabına girer; model revizyonu
  değişince kart önbelleği geçersizleşir — sessiz kayma olmaz.
- **Zarif düşüş:** sağlayıcı yoksa/hata verirse `ngramAdayUretici`'ye dönülür; yanıt yine
  üretilir, `NOT` bunu söyler.
- **Bütçe:** embedding sağlayıcısı sorgu yolunda çalışacaksa p95 ek maliyeti **< 50 ms** olmalı;
  ölçülmeden açılmaz.

## Sonuçlar

**Olumlu**

- Yönlendirme açıklanabilir: "hangi tetikleyici eşleşti" log'da görünür; yanlış düğüm şikâyeti
  incelenebilir.
- Deterministik: aynı sorgu, aynı korpus, aynı cevap; regresyon testi yazılabilir.
- Kurulum sıfır: model indirme yok, API anahtarı yok, çevrimdışı çalışır.
- ADR-002'deki "sıfır bağımlılıklı sorgu yolu" iddiası korunur.

**Olumsuz / kabul edilen maliyet**

- Eş anlamlı ve uzun serbest metinlerde isabet embedding'e göre düşük olacak; bunu telafi etmek
  için tetikleyici listeleri elle büyütülecek.
- "Yeni düğüm eklemek" bir içerik işi hâline gelir (tetikleyici + örnek sorgu + test).
- Kapsam boşluğu riski: kullanıcı, ontolojide olmayan bir konu sorduğunda düğüm bulunamaz;
  yanıt "bilmiyorum" moduna düşer. Bu, yanlış cevaptan iyidir ama kullanıcı deneyimi açısından
  kayıptır.

## Açık kalanlar

1. **Yönlendirme isabeti ölçülmedi.** `eval/` altındaki altın set ile top-1/top-3 doğruluk
   ölçülecek; eşikler (tetikleyici ağırlığı, n-gram boyu, kabul eşiği) o ölçümle kalibre edilecek.
2. **Tetikleyici sözlüğünün bakımı** kimin işi, hangi gözden geçirme standardıyla — tanımsız.
3. **n-gram parametreleri** (3–5, ağırlıklar) ampirik değil; ölçümle seçilmeli.
4. **Vectorize uygunluğu:** 384 boyut, korpus boyutu, ücretsiz kota ve gecikme test edilmedi.
5. **Model lisansı ve dağıtımı** (çevrimdışı paket boyutu) değerlendirilmedi.
6. **Türkçe morfoloji:** gövdeleme (stemmer) ile n-gram birlikte mi çalışacak, yoksa n-gram
   gövdelemenin yerine mi geçecek — henüz net değil.
7. **Çok dilli sorgu** (İngilizce/Arapça) desteği yok; gerekli mi, ürün kararı verilmedi.
