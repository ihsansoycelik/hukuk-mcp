# NOTES — parametre defteri, kaynaklar ve güven düzeyleri

Bu dosya, kural motorunun kullandığı **her sayısal/tekil hukuki değerin** nereden geldiğini,
hangi dönemde geçerli olduğunu ve ne kadar güvenilir olduğunu kaydeder. Bir değeri
güncellemeden önce buradaki satırı ve `src/parametreler.ts` içindeki kaydı birlikte değiştirin;
ikisi ayrışırsa test `parametre tablosu` kontrolünde yakalar.

## 1. Güven politikası

| durum | anlamı |
| --- | --- |
| `uzman_onayli` | Resmî kaynak (Resmî Gazete / mevzuat.gov.tr / TCMB / Bakanlık) **sayıyı doğrudan yazıyor** ve bu depoda bizzat görüldü. |
| `teyit_bekliyor` | Sayı türetilmiş (örn. reeskont oranının %80'i), kaynak sayıyı doğrudan göstermiyor, veya kaynak yalnız ikincil/kesilmiş metin. Sonuç `onay_durumu = teyit_bekliyor` döner ve `uyarilar` içinde kaynak URL'si verilir. |

Bir değer `teyit_bekliyor` ise **yanlış olduğu iddia edilmiyor**; yalnızca "bir insan son kez
baksın" deniyor. Yanlış bir son gün gerçek zarar olduğu için şüphede kalan değer asla
`uzman_onayli` yapılmaz.

## 2. Hakem heyeti parasal sınırı (`gorevli_merci/hakem_heyeti_ust_sinir`)

7392 sayılı Kanun (yürürlük **1/10/2022**) 6502 m.68/1'i değiştirdi ve **ilçe/il/büyükşehir**
şeklindeki üç kademeli parasal yapıyı kaldırdı. 2023'ten itibaren **tek eşik** vardır; il/ilçe
heyeti ayrımı parasal değil coğrafî/idarîdir (ilgili yıl Tebliği m.4). Bu yüzden tabloda
`ilce_sinir` / `il_sinir` / `buyuksehir_sinir` anahtarları **yoktur**; tek anahtar kullanılır.

| yıl | değer (TL) | kaynak | durum |
| --- | --- | --- | --- |
| 2023 | 66.000 | Ticaret Bakanlığı duyurusu (RG 16/12/2022, 32045 tebliğine bağlantılı): https://tuketici.ticaret.gov.tr/haberler/tuketici-hakem-heyetlerine-basvurularda-2023-yili-parasal-degerleri-yeniden-belirlendi | uzman_onayli |
| 2024 | 104.000 | RG 20/12/2023, 32405: https://www.resmigazete.gov.tr/eskiler/2023/12/20231220-3.htm | uzman_onayli |
| 2025 | 149.000 | RG 20/12/2024, 32758: https://www.resmigazete.gov.tr/eskiler/2024/12/20241220-2.htm | uzman_onayli |
| 2026 | 186.000 | RG 23/12/2025, 33116 (Tebliğ m.3; yürürlük 1/1/2026): https://resmigazete.gov.tr/eskiler/2025/12/20251223-5.htm | uzman_onayli |

- 2026 Tebliği **22.10.2026 itibarıyla yürürlüktedir** (1/1/2026'dan itibaren). 2026 için ikinci
  bir tebliğ yoktur; tabloda `gecerlilik_bit = 2026-12-31`.
- `gorevli_merci/kanun_temel_sinir = 30.000` yalnız **kanun metnindeki taban** rakamdır
  (m.68/1); operasyonel eşik değildir, sonuç üretiminde kullanılmaz → `teyit_bekliyor`.
- **Boşluk:** 1/10/2022–31/12/2022 arası (7392 sonrası ilk dönem) ve 2022 öncesi üç kademeli
  dönem doğrulanmadı. Bu tarihlerde kural `belirsiz` + `PARAMETRE_GECMIS_YOK` /
  `UC_KADEMELI_SISTEM_YURURLUKTEN_KALKTI` döner; eski yıl değeri kullanılmaz.
- **Boşluk:** 2027 Tebliği (Aralık 2026'da yayımlanacak) henüz yok → `PARAMETRE_GUNCEL_DEGIL`.

## 3. Dava şartı arabuluculuk (`arabuluculuk_dava_sarti/yururluk_bas`)

- 7446 sayılı Kanun, RG 1/3/2023, 32119. Tüketici uyuşmazlıklarında dava şartı **1/9/2023**'te
  yürürlüğe girdi. Kaynak: https://www.resmigazete.gov.tr/eskiler/2023/03/20230301-1.htm
- durum: `teyit_bekliyor` — yürürlük tarihi kanun metninden doğrudan okunmadı; Lead'in
  mevzuat.gov.tr okuması ve yerleşik uygulama ile teyitli.
- İstisnalar (m.73/A/1): (a) hakem heyeti görev alanı, (b) heyet kararına itiraz, (c) m.73/6
  kamu yararına davalar, (ç) m.74 seri mal/toplatma davaları, (d) taşınmazın aynına ilişkin
  uyuşmazlık. Bayraklar kullanıcı beyanına göre uygulanır; hukuki nitelendirme gerektirdiği
  sonuçta `uyarilar` ile bildirilir.

## 4. Cayma süresi (`cayma_suresi/sure_gun = 14`)

- 6502 m.48 + Mesafeli Sözleşmeler Yönetmeliği m.7. Kaynak (kanun):
  https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6502.htm
- durum: `teyit_bekliyor` — m.48'in 14 gün ifadesi bu depoda doğrudan okunmadı; Yönetmelik
  metni de araç kesmesi nedeniyle alınamadı.
- **Bilinçli karar:** cayma hakkı bilgilendirmesi yapılmadığında sürenin uzadığına dair
  (bazı hukuk düzenlerindeki 12 ay) kural **doğrulanmadığı için uygulanmaz**. Girdi
  `bilgilendirme_yapildi=false` ise sonuç `belirsiz` + `BILGILENDIRME_EKSIK` uyarısıdır.
- Süre sonu resmî tatile denk gelirse takip eden ilk iş günü (Yönetmelik'teki ifade
  doğrulanmadı; HMK m.93 kıyasıyla uygulanır ve `varsayimlar` içinde yazılır).

## 5. Ayıplı mal süreleri (`ayip_zamanasimi/*`)

6502 m.12 ve m.11/4; metin 28/11/2013 RG 28835'ten doğrudan okundu
(https://www.resmigazete.gov.tr/eskiler/2013/11/20131128-1.htm, sayfa 1).

| anahtar | değer | dayanak | durum |
| --- | --- | --- | --- |
| `temel_sure_yil` | 2 | m.12/1 | uzman_onayli |
| `konut_sure_yil` | 5 | m.12/1 (konut/tatil amaçlı taşınmaz) | uzman_onayli |
| `ikinci_el_taban_yil` | 1 | m.12/2 | uzman_onayli |
| `konut_ikinci_el_taban_yil` | 3 | m.12/2 | uzman_onayli |
| `onarim_is_gunu` | 30 | m.11/4 | uzman_onayli |
| `onarim_is_gunu_konut` | 60 | m.11/4 | uzman_onayli |

- m.12/3: hile veya ağır kusurla gizlenen ayıpta zamanaşımı **işlemez**; kural sabit gün
  üretmez, `sonuc = "zamanaşımı_işlemez"` döner.
- **YOKTUR:** 6502'de 30 günlük "ayıp ihbarı" süresi yoktur. 4077 dönemine ait bu kural
  uygulanmaz. m.11/4'teki 30/60 **iş günü**, satıcının onarım/değişim talebini yerine getirme
  süresidir ve yalnız `uyarilar` içinde hesaplanır.
- İkinci elde süre sözleşmeyle kısaltılabilir, ancak m.12/2 tabanının altına inemez; sözleşme
  yoksa m.12/1 süresi uygulanır. Bu yorum `varsayimlar` ve `uyarilar` içinde açıkça yazılır.
- Zamanaşımının son günü hafta sonu/tatile denk gelirse tarih **kaydırılmaz**; HMK m.93'ün
  maddi hukuk zamanaşımına doğrudan uygulanmayacağı `ZAMANASIMI_SON_GUN_TATIL` uyarısıyla
  bildirilir (hâkim görüşü tartışmalıdır).

## 6. Yasal / temerrüt faizi (3095)

### 6.1 Kanuni faiz oranı (`yasal_faiz/kanuni_oran`)

| dönem | oran | kaynak | durum |
| --- | --- | --- | --- |
| 1/5/2005 – 30/7/2026 | %9 | 5335 sayılı Kanun'la değişik 3095 m.1: https://www.mevzuat.gov.tr/MevzuatMetin/1.5.3095.htm | teyit_bekliyor (konsolide metin 9% ifadesini artık göstermiyor) |
| 31/7/2026 – 31/12/2026 | %31,00 | 7589/10 md. (16/7/2026) formülü × TCMB reeskont: 38,75 × 0,80 | teyit_bekliyor (TÜRETİLMİŞ) |

- 7589 sayılı Kanun 3095 m.1'i 16/7/2026'da değiştirdi; **yürürlük 31/7/2026** (mevzuat.gov.tr
  değişiklik tablosu). Yeni kural: kanuni faiz = önceki yılın 31 Aralık günü kısa vadeli kredi
  (reeskont) oranının **%80'i**; 30 Haziran oranı 31 Aralık oranından **5 puan veya daha fazla**
  farklıysa yılın ikinci yarısında 30 Haziran oranının %80'i geçerli.
- 2026 ikinci yarısı: 31.12.2025 reeskont %38,75; 30.6.2026'da değişiklik yok → %31,00.
- **Boşluk:** 2027 oranı 31.12.2026 reeskont oranına bağlı; o tarih gelmeden hesaplanamaz →
  `PARAMETRE_GUNCEL_DEGIL`.
- `kanuni_oran_carpani = 0,8` doğrudan madde metnindedir (uzman_onayli).

### 6.2 TCMB reeskont / avans oranları

Kaynak tablo (20.12.2025'e kadar): https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Reeskont+ve+Avans+Faiz+Oranlari
→ tüm satırlar `uzman_onayli` (sayı tabloda doğrudan yazılı).

- reeskont 20.12.2025: **%38,75** (31.12.2025'te yürürlükte olan oran; 2026 için esas).
- avans oranları: 31.12.2016 %9,75 → … → 8.3.2025 %44,25 → 17.9.2025 %42,25 →
  20.12.2025 **%39,75**. Tablo 2026 için kapanır (`gecerlilik_bit = 2026-12-31`); 2027
  değerleri uydurulmaz.

### 6.3 Hesap yöntemi

- **Basit faiz.** 3095 m.3: "Kanuni faiz ve temerrüt faizi hesaplanırken mürekkep faiz
  yürütülemez." 6502 m.4/7 de tüketici işlemlerinde bileşik faizi yasaklar. (Görev
  tanımındaki "günlük bileşik" seçeneği bilinçli olarak uygulanmadı; gerekçe m.3.)
- Gün sayısı: yıllık oran / 365 (konvansiyon, `teyit_bekliyor`); başlangıç günü faiz işler,
  bitiş günü işlemez.
- Ticari temerrüt (3095 m.2/2): avans oranı kanuni faizden yüksekse avans oranı; oran yılın
  ilk yarısında önceki 31 Aralık, ikinci yarısında 30 Haziran avans oranı (5 puan kuralı) ile
  belirlenir. Tüketici işlemlerinde varsayılan `tur = "kanuni"`dir.

## 7. Resmî tatiller ve adli tatil

- Sabit millî günler, 28 Ekim 13.00 ve arife 13.00 kuralları: 2429 sayılı Kanun
  (https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2429.htm) → `uzman_onayli`.
- Dinî bayram tarihleri kanunda yazılı değildir; Diyanet takvimine dayanır
  (https://diyanet.gov.tr/dini-gun-geceler) → `teyit_bekliyor`. 2025 ve 2026 tarihleri kamu
  yayınlarıyla (TRT, 1.1.2026) ayrıca teyit edildi; 2027 yalnız Diyanet takvimi.
  - 2025: Ramazan 30.3–1.4 (arife 29.3), Kurban 6–9.6 (arife 5.6)
  - 2026: Ramazan 20–22.3 (arife 19.3), Kurban 27–30.5 (arife 26.5)
  - 2027: Ramazan 9–11.3 (arife 8.3), Kurban 16–19.5 (arife 15.5)
- Yarım günler varsayılan olarak **iş günü** sayılır (o gün 13.00'e kadar işlem yapılabilir);
  `yarim_gun_is_gunu:false` ile kapatılabilir. Bu bir varsayımdır, sonuçta yazılır.
- Adli tatil: HMK m.102, 20 Temmuz–31 Ağustos (https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6100.htm)
  → `teyit_bekliyor`: metin araç kesmesi nedeniyle doğrudan okunamadı; m.93'ün
  "tatil günlerinin etkisi" başlığı ayrıca doğrulandı. Adli tatil yalnız **usulî** sürelerde
  uygulanır; maddi hukuk sürelerinde (cayma, ihbar, zamanaşımı) uygulanmaz.

## 8. Bilinçli boşluklar (dürüstlük listesi)

1. 2022 öncesi üç kademeli hakem heyeti yapısı ve 1/10–31/12/2022 dönemi → `belirsiz`.
2. 2027 hakem heyeti sınırı → `belirsiz` (`PARAMETRE_GUNCEL_DEGIL`).
3. 2027 kanuni/temerrüt faizi → `belirsiz` (31.12.2026 reeskont oranı bilinmiyor).
4. Cayma hakkı bilgilendirmesi yapılmaması hâlinde ek süre → `belirsiz`.
5. İstinaf/temyiz harç rejimi (m.73/2 yalnız "açılan davalar" diyor) → `belirsiz`.
6. 2005 öncesi faiz oranları ve 2016 öncesi avans oranları → `belirsiz`.
7. m.73/6 ve m.74 dava türleri bayrakla (kullanıcı beyanı) alınır; dosya içeriğinden
   otomatik nitelendirme yapılmaz.
8. Eşikte tam eşitlik: kanun "altında"/"üzerinde" dediği için eşitlik mahkemeye yazılır;
   bu bir yorumdur ve sonuç `teyit_bekliyor` + uyarı ile döner.

## 9. Güncelleme prosedürü

1. Yeni yıl Tebliği/faiz değişikliği Resmî Gazete'de yayımlandığında `src/parametreler.ts`
   içine **yeni satır** ekle; eski satırı silme, `gecerlilik_bit` ile kapat.
2. `kaynak_url` alanına doğrudan sayıyı gösteren resmî URL'yi yaz.
3. Sayı resmî metinde yazılı değilse `teyit_bekliyor` bırak ve bu dosyaya not düş.
4. `node --test packages/rules/test/*.test.ts` ve `pnpm typecheck` çalıştır; eşik testleri
   yeni değere göre güncellenmeli (testi zayıflatma, değeri güncelle).
