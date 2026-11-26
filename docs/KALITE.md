# Kalite kapıları — ölçülen durum

Bu dosya, planın 12. bölümündeki kapıların **gerçek korpus** üzerindeki ölçümünü tek yerde toplar.
Hiçbir sayı burada tahmin değildir; kaynağı `eval/`, `bench/report.md` ve `packages/retrieval/NOTES.md`'dir.
Korpus anlık görüntüsü: **`v20261022.436046465`** (14 kanun / 5.266 madde / 239 karar / 65 düğüm / 49 kart / 58 parametre).
Kapsam: tüketici hukuku (`t/`) **+ sosyal güvenlik, SGK** (`s/`) — ayrıntı `docs/adr/ADR-005-sgk-kapsami.md`.

| Kapı | Hedef | Ölçülen | Durum |
|---|---|---|---|
| Yönlendirme top-1 | ≥ %85 | **%97,4** (152/156) | ✅ |
| Yönlendirme top-3 | ≥ %97 | **%99,4** (155/156) | ✅ |
| Alan dışı tuzak yakalama | tümü belirsiz | **26/26** | ✅ |
| Kural testleri | %100 | **%100** (60 test, 313 tablo vakası) | ✅ |
| Atıf çözümlenebilirliği | %100 | **64/64** (bench) · **%100** (eval) | ✅ |
| Token bütçesi | 21/21 | **21/21** | ✅ |
| Gecikme p95 | < 400 ms | **21,6 ms** (bench) · **15,35 ms** (eval, tüm çağrılar) | ✅ |
| **İçtihat Recall@5** | **≥ %85** | **%50,1** | ❌ |
| İçtihat Precision@5 | — | **%29,3** | bilgi |
| nDCG@10 / MRR | — | **0,695 / 0,644** | bilgi |

Yönlendirme altın seti artık **182 satır** (156 pozitif + 26 tuzak): tüketici satırları korunmuş,
her SGK yaprağı için en az 2 bağımsız örnek eklenmiş (r167–r182), r160/r166 pozitife taşınmış,
r157 ("ilaç yan etki") tuzak olarak bırakılmıştır. Kalan tek top-3 kaçağı tüketici tarafındadır
(r132, `[iki]`); SGK satırlarının tamamı top-1'dedir.

## Neden Recall@5 düşük — dürüst teşhis

1. **Korpus küçük.** 239 karar, tüketici hukukunun tamamı değil. Etiketleme "havuzlanmış"
   (pooled): getirilen adaylardan etiketlenenler pozitif, etiketlenmeyenler negatif sayılıyor.
   Bu yöntem, henüz getirilmemiş ama ilgili kararı cezalandırır → recall'ı yapay olarak düşürür.
2. **Etiketleme mekanik.** İlgililik "sorgu köklerinin ≥%60'ı + tüm nadir kökler" kuralıyla
   üretildi; hukuki ilgililik değil, sözcüksel örtüşme ölçüyor.
3. **Sonuç önsavı (outcome prior) bilinçli bir tercih.** `ret` kararları ×0,6, `bozma` ×0,95 ve
   `temsilci_uygun=false`. Bu, vatandaşa "reddedildi" kararını çözüm gibi göstermemeyi sağlıyor
   ama ölçülen recall'ı ~11 puan düşürüyor. Önsav kapalıyken aynı korpusta:
   **Recall@5 %61,1 · P@5 %34,3 · nDCG 0,782 · MRR 0,749**.
4. **Fixture'daki %98,3 anlamlı değil.** Sentetik korpus kendi kendini ölçer; gerçek kalite
   hakkında kanıt sayılmaz.

## Kapıyı geçmek için ne gerekir

- Korpusu büyütmek (toplayıcı hazır: `SKIP_SEARCH=1 TARGET=900`), sonra altın seti bağımsız
  (mekanik olmayan) etiketlemek.
- Sözlüksel skora anlamsal katman eklemek — ADR-004'te arayüz hazır, v1'de bilinçli olarak yok.
- `t/ayipli-mal/konut` gibi hatalı konu etiketlerini triage aşamasında düzeltmek
  (iki 4. HD `ret` kararı bu yüzden arama sonuçlarında görünüyor; retrieval pipeline'ın
  etiketine güvenmek zorunda).

Bu kapı **kapatılmadan** "içtihat araması %85 isabetli" denemez. Sunucunun `hukuk_sor` akışı
bu kapıya bağımlı değildir: yönlendirme + kart + kural üçlüsü kendi kapılarını geçiyor;
`ara` aracı ise bugün itibarıyla **deneysel** sayılmalıdır.

## Bilinen küçük kusurlar (yanlış izlenim bırakmasın)

- **`arguman` tablosu boş.** Kararlardan taraf/iddia etiketi güvenilir biçimde çıkarılamadığı
  için uydurulmadı (`meta.known_gaps`). Bu yüzden `hukuk_sor` yanıtında `ARGÜMANLAR` bölümü
  görünmez; yapı hazır, veri Faz 3'te gelecek.
- **L2/L3 katmanları yok.** Korpus yalnızca L0/L1 taşır (tam metin saklanmıyor,
  `tam_metin_key` sha256). `derinles(seviye="L2"|"L3")` artık bunu **açıkça söylüyor**,
  sessizce L1 döndürmüyor.
- **BAM kimliklerinde fazlalık:** `k:bam-ist-bam-12hd-…` (iki kez "bam"). Kimlikler kararlı ve
  çözümleniyor; kozmetik. Değiştirmek altın setlerdeki karar kimliklerini kıracağı için
  bilinçli olarak dokunulmadı.
- **`y:` (yönetmelik) dayanakları** korpusta yok; sunucu bunları `[+1 ikincil mevzuat]`
  diye sayıyor, çözülemeyen kimlik üretmiyor.
- **`karar.dugum_id` bir yönlendirme sezgiseli**, hukuki tespit değil. Yanlış etiketlenmiş
  kararlar `KARARLAR`/`ara` sonuçlarına sızabilir; düzeltmesi triage aşamasında olur.
- **SGK'da GSS prim borcu zamanaşımı girdisi eksik.** `gss_prim_zamanasimi` kuralı
  `odeme_suresi_son` ister; `HukukSorInput` yalnızca `olay_tarihi` taşıdığı ve sunucu onu
  `odeme_tarihi`ne eşlediği için `gss-prim-borcu` senaryosunda kural dürüstçe
  **"eksik: prim ödemesinin son günü"** döner. Yanıt boş kalmaz (kart + `EKSİK OLGULAR`), ama
  zamanaşımı tarihi hesaplanmaz. Ayrıntı ve gerekçe: ADR-005 "Bilinen açıklar".
- **Emeklilik yaşı/aylık hesabı v1 kapsamı dışıdır** (5510 m.28); "emekli maaşım eksik" sorusu
  yalnızca itiraz yolu (`s/usul/kurum-karari-itiraz`) bakımından yanıtlanır.
