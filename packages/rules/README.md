# @hukuk/rules — deterministik tüketici hukuku kural motoru

6502 sayılı Tüketicinin Korunması Hakkında Kanun ve ilgili mevzuat için **saf fonksiyonlarla**
hesaplanan süreler, parasal eşikler, görevli merci, usul şartları ve faiz. Yorum üretmez;
girdi + tarihli parametre tablosundan **aritmetik** üretir. Sistem saatini okumaz, ağa/DB'ye
gitmez.

```bash
node --test packages/rules/test/*.test.ts   # 40 test bloğu, 150 tablo vakası
pnpm typecheck                              # tüm çalışma alanı
```

## Sözleşme

```ts
import { kuralCalistir, VARSAYILAN_OKUYUCU } from "@hukuk/rules";

const sonuc = kuralCalistir(
  "gorevli_merci",
  { uyusmazlik_degeri_tl: 150_000, basvuru_tarihi: "2026-05-04" },
  VARSAYILAN_OKUYUCU, // DB'den gelen aynı satırlarla da beslenebilir
  "2026-10-22",       // "bugün" DAİMA çağırandan gelir
);
```

Dönen nesne `@hukuk/schema` içindeki `KuralSonucu`dur:

| alan | anlamı |
| --- | --- |
| `sonuc` | `"belirsiz"`, bir karar metni (`"tuketici_hakem_heyeti"`, `"gerekli"`, `"muaf"`, `"zamanaşımı_işlemez"`), bir sayı (faiz) veya **tam olarak** `{ tarih: "YYYY-AA-GG" }` |
| `kisa` | vatandaşın okuyacağı tek cümlelik cevap |
| `dayanak` | tarihli madde kimlikleri: `m:6502/12@2014-05-28`, `m:3095/1@2026-07-31` |
| `varsayimlar` | hesaplaşmanın dayandığı açık kabuller |
| `eksik_girdiler` | geçersiz/eksik alan adları (doluysa `sonuc = "belirsiz"`) |
| `uyarilar` | hukuki risk, kaynak ve makine-okur kodlar (`PARAMETRE_GUNCEL_DEGIL`, `TATIL_TABLOSU_YOK`, …) |
| `parametre_surumu` | kullanılan parametre kayıtlarının sürümleri (`hakem-sinir-2026.1+…`) |
| `onay_durumu` | `uzman_onayli` veya `teyit_bekliyor` (en zayıf halka kazanır) |

Kurallar değişmez: eksik/geçersiz girdi → `belirsiz` + `eksik_girdiler`; onaysız parametre →
`onay_durumu = "teyit_bekliyor"` + kaynak URL'li uyarı; istenen yılın değeri yoksa **eski yılın
değeri kullanılmaz** → `belirsiz` + `PARAMETRE_GUNCEL_DEGIL`.

## Parametre okuyucu

```ts
interface ParametreOkuyucu {
  get(kuralId: string, anahtar: string, tarih: string): {
    deger: unknown; kaynak_url: string;
    durum: "uzman_onayli" | "teyit_bekliyor";
    gecerlilik_bas: string; surum: string;
  } | null;
}
```

`VARSAYILAN_OKUYUCU`, `data/build/schema.sql` içindeki `kural_parametre` tablosunun bellekteki
eşidir (`src/parametreler.ts`); kayıt `gecerlilik_bas ≤ tarih ≤ gecerlilik_bit` penceresine
göre seçilir. DB kopyası dolduğunda aynı satırlar `SELECT … FROM kural_parametre` ile verilir;
kural kodu değişmez. DB satırlarında `deger` TEXT (JSON) ve `surum` kolonu yoktur; köprü:

```ts
import { dbSatirlarindanOkuyucu, kuralCalistir } from "@hukuk/rules";

const p = dbSatirlarindanOkuyucu(rows); // JSON çözülür, surum türetilir
kuralCalistir("gorevli_merci", girdi, p, bugun);
```

DB kazanır; koddaki tablo yalnız yedektir ve ikisi birebir aynıdır (37 satır, tarihsiz 0).
Parametrelerin kaynağı/güven düzeyi: [NOTES.md](NOTES.md).

## Kurallar ve çalışmış örnekler

### 1) `gorevli_merci` — hakem heyeti mi, mahkeme mi? (6502 m.68/1, m.73/1)

Eşik her yıl Tebliğ ile güncellenir (2023: 66.000 / 2024: 104.000 / 2025: 149.000 /
2026: **186.000 TL**). 7392 sayılı Kanun (1/10/2022) il/ilçe/büyükşehir kademelerini kaldırdı:
tek eşik, coğrafî yetki.

```ts
kuralCalistir("gorevli_merci", { uyusmazlik_degeri_tl: 150_000, basvuru_tarihi: "2026-05-04" }, p, "2026-10-22")
// sonuc: "tuketici_hakem_heyeti"
// kisa:  150.000,00 TL değerindeki uyuşmazlık için 4 Mayıs 2026 Pazartesi tarihinde geçerli
//        sınır 186.000,00 TL: görevli merci tüketici hakem heyeti.
// dayanak: m:6502/68@2022-10-01, m:6502/73@2014-05-28, m:6502/84@2014-05-28
```

200.000 TL aynı tarihte `"tuketici_mahkemesi"` döner. 2023'te 100.000 TL mahkemeye giderken
2026'da heyete gider — **tarih parametresi** budur. Eşikte tam eşitlik (186.000) mahkemeye
yazılır; bu bir yorumdur ve `teyit_bekliyor` + uyarı döner.

### 2) `arabuluculuk_dava_sarti` — dava şartı mı? (6502 m.73/A)

1/9/2023'ten itibaren tüketici mahkemesi davalarında zorunlu; eşik altı (heyet görevli),
heyet kararına itiraz, m.73/6, m.74 ve taşınmazın aynına ilişkin uyuşmazlıklar istisna.

```ts
kuralCalistir("arabuluculuk_dava_sarti", { uyusmazlik_degeri_tl: 250_000, dava_tarihi: "2026-05-04" }, p, "2026-10-22")
// sonuc: "gerekli"
// kisa:  … 186.000,00 TL sınırını aştığı için tüketici mahkemesinde dava açmadan önce
//        arabuluculuk dava şartıdır (m.73/A).
```

### 3) `ayip_zamanasimi` — ayıplı malda son gün (6502 m.12)

Teslimden itibaren 2 yıl; konut/tatil amaçlı taşınmazda 5 yıl; ikinci elde 1/3 yıl tabanı;
hile/ağır kusurda zamanaşımı işlemez. (6502'de **30 günlük ayıp ihbarı yoktur**; m.11/4'teki
30/60 **iş günü** satıcının onarım süresidir ve ayrı uyarı olarak hesaplanır.)

```ts
kuralCalistir("ayip_zamanasimi", { teslim_tarihi: "2025-03-10" }, p, "2026-10-22")
// sonuc: { tarih: "2027-03-10" }
// uyarilar: m.11/4 onarım süresi… (ihbar süresi DEĞİL)
```

### 4) `cayma_suresi` — 14 gün (6502 m.48 + Mesafeli Sözleşmeler Yönetmeliği m.7)

Malda teslim, satıcı kurulum yaptıysa kurulum; hizmette sözleşme tarihi. Son gün tatile denk
gelirse ilk iş günü.

```ts
kuralCalistir("cayma_suresi", { teslim_tarihi: "2026-03-06" }, p, "2026-10-22")
// sonuc: { tarih: "2026-03-23" }   (14. gün 20 Mart = Ramazan Bayramı → 23 Mart)
```

### 5) `yetkili_yer` — nereye başvurulur? (m.68/3, m.70/3, m.73/5, HMK m.6)

Hakem heyeti: tüketicinin yerleşim yeri **veya** işlem yeri. Mahkeme: genel yetkili mahkeme
davalının yerleşim yeri; ayrıca tüketici davaları tüketicinin yerleşim yerinde **de** açılabilir
(m.73/5 — ek yetki, münhasır değil). İtiraz: heyetin veya tüketicinin yerleşim yeri (m.70/3).

```ts
kuralCalistir("yetkili_yer", { asama: "tuketici_mahkemesi", tuketici_yerlesim_yeri: "Kadıköy", davali_yerlesim_yeri: "Şişli" }, p, "2026-10-22")
// sonuc: "Şişli veya Kadıköy"
```

### 6) `harc_durumu` — kim, hangi aşamada harç öder? (m.73/2)

Kanun: "Tüketici mahkemeleri nezdinde Bakanlık, tüketiciler ve tüketici örgütleri tarafından
açılan davalar … harçlardan muaftır." Muafiyet **davacı sıfatına** bağlıdır; satıcı davacıysa
yoktur. Heyet başvurusu ücretsizdir. İstinaf/temyiz metinde düzenlenmediği için `belirsiz`.

```ts
kuralCalistir("harc_durumu", { asama: "ilk_derece", davaci: "tuketici" }, p, "2026-10-22") // "muaf"
kuralCalistir("harc_durumu", { asama: "ilk_derece", davaci: "satici"   }, p, "2026-10-22") // "harca_tabi"
```

### 7) `sure_son_gun` — genel süre aritmetiği (HMK m.92, m.93; 2429; HMK m.102)

`gun | is_gunu | hafta | ay | yil`; hafta sonu/resmî tatil ertelemesi; isteğe bağlı adli tatil
askıya alması (yalnız usulî süreler).

```ts
kuralCalistir("sure_son_gun", { baslangic: "2026-03-16", sure_degeri: 4, sure_birimi: "gun" }, p, "2026-10-22")
// sonuc: { tarih: "2026-03-23" }   (20–22 Mart bayram → 23 Mart)

kuralCalistir("sure_son_gun", { baslangic: "2026-07-15", sure_degeri: 14, sure_birimi: "gun", adli_tatil_uygula: true }, p, "2026-10-22")
// sonuc: { tarih: "2026-09-10" }   (20 Temmuz–31 Ağustos sayılmaz)
```

### 8) `yasal_faiz` — 3095 sayılı Kanun

**Basit faiz**: 3095 m.3 mürekkep faizi yasaklar, 6502 m.4/7 tüketici işlemlerinde bileşik
faizi yasaklar. Oran dönem içinde değişirse günlük kırılır; 2026'da %9 → 31/7/2026'dan
itibaren %31 (reeskont %38,75 × 0,80). Ticari temerrütte m.2/2 avans oranı karşılaştırması.

```ts
kuralCalistir("yasal_faiz", { anapara_tl: 10_000, baslangic: "2026-01-01", bitis: "2026-12-31" }, p, "2026-10-22")
// sonuc: 1819.73
// kisa: … 1.819,73 TL (364 gün, basit faiz). Oranlar:
//        01.01.2026–30.07.2026 %9 (211 gün); 31.07.2026–30.12.2026 %31 (153 gün).
```

## Uyarı kodları (makine-okur önekler)

| kod | anlamı |
| --- | --- |
| `PARAMETRE_GUNCEL_DEGIL` | İstenen yıl için doğrulanmış değer yok (yeni Tebliğ/oran bekleniyor) |
| `PARAMETRE_GECMIS_YOK` | Tablo bu kadar geriye gitmiyor |
| `TATIL_TABLOSU_YOK` | Son gün 2025–2027 tatil tablosu dışında; erteleme doğrulanamaz |
| `UC_KADEMELI_SISTEM_YURURLUKTEN_KALKTI` | 1/10/2022 öncesi il/ilçe/büyükşehir dönemi |
| `ZAMANAŞIMI_DOLDU` / `ZAMANASIMI_SON_GUN_TATIL` | Süre geçmiş / son gün tatile denk geliyor |
| `BILGILENDIRME_EKSIK` | Cayma bilgilendirmesi yapılmamış; ek süre doğrulanmadı |
| `KURAL_YOK` | Bilinmeyen kural kimliği |

## Sınırlar (bilinçli)

- 2022 öncesi üç kademeli hakem heyeti yapısı ve 1/10–31/12/2022 dönemi modellenmedi.
- 2027 hakem sınırı ve 2027 faiz oranı, resmî veri yayımlanana kadar `belirsiz`.
- Cayma hakkı bilgilendirmesi yapılmaması hâlindeki ek süre doğrulanmadı.
- Kanun yolu harçları (istinaf/temyiz) m.73/2'de açıkça düzenlenmediği için `belirsiz`.
- Adli tatil bayrağı ay/yıl birimleriyle birlikte desteklenmez (takvim ayı ↔ gün dönüşümü
  varsayım gerektirir; `belirsiz` döner).
- Hukuki nitelendirme (hangi dava türü, hile iddiasının ispatı, hangi taraf) çağıranın
  beyanına dayanır; motor bunu `varsayimlar`/`uyarilar` içinde açıkça söyler.

## Dosya düzeni

```
src/
  index.ts          KURALLAR, kuralCalistir, ORNEK_GIRDI
  types.ts          Kural<G>, ParametreOkuyucu, ParametreKaydi
  tarih.ts          Date kullanmayan takvim aritmetiği
  tatiller.ts       2025–2027 resmî tatiller + HMK m.102 adli tatil
  parametre.ts      StatikParametreOkuyucu, DB köprüsü, parametreOku, sonuç kurucuları
  parametreler.ts   TARİHLİ PARAMETRE TABLOSU (tek kaynak)
  kurallar/         8 kural + ortak yardımcılar
test/               40 test bloğu; 150 tablo vakası, özellik ve saflık testleri
NOTES.md            her parametrenin kaynağı, tarihi ve güven düzeyi
```
