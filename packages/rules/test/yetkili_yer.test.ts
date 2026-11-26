import test from "node:test";
import assert from "node:assert/strict";
import { vakalariDogrula, calistir, type Vaka } from "./yardim.ts";

const D73 = "m:6502/73@2014-05-28";
const D_HEYET = "m:6502/68@2022-10-01";

const VAKALAR: Vaka[] = [
  { ad: "heyet: yalnız yerleşim yeri", girdi: { asama: "hakem_heyeti", tuketici_yerlesim_yeri: "Kadıköy" }, sonuc: "Kadıköy", dayanak: [D_HEYET] },
  { ad: "heyet: iki yer seçimlik", girdi: { asama: "hakem_heyeti", tuketici_yerlesim_yeri: "Kadıköy", islem_yeri: "Beşiktaş" }, sonuc: "Kadıköy veya Beşiktaş" },
  { ad: "heyet: yalnız işlem yeri", girdi: { asama: "hakem_heyeti", islem_yeri: "Şişli" }, sonuc: "Şişli" },
  { ad: "heyet: yer yok → belirsiz", girdi: { asama: "hakem_heyeti" }, sonuc: "belirsiz", eksik: ["tuketici_yerlesim_yeri", "islem_yeri"] },
  { ad: "heyet itirazı: m.70/3", girdi: { asama: "hakem_heyeti", itiraz_mi: true, tuketici_yerlesim_yeri: "Üsküdar" }, sonuc: "tuketici_mahkemesi_itiraz", uyariIcerir: ["m.70/5", "icrasını durdurmaz"] },
  { ad: "heyet itirazı: yerleşim yeri yok → belirsiz", girdi: { asama: "hakem_heyeti", itiraz_mi: true }, sonuc: "belirsiz", eksik: ["tuketici_yerlesim_yeri"] },
  { ad: "mahkeme: genel + ek yetki", girdi: { asama: "tuketici_mahkemesi", davali_yerlesim_yeri: "Şişli", tuketici_yerlesim_yeri: "Kadıköy" }, sonuc: "Şişli veya Kadıköy", dayanak: [D73] },
  { ad: "mahkeme: yalnız davalı yeri", girdi: { asama: "tuketici_mahkemesi", davali_yerlesim_yeri: "Şişli" }, sonuc: "Şişli" },
  { ad: "mahkeme: yalnız tüketici yeri (m.73/5)", girdi: { asama: "tuketici_mahkemesi", tuketici_yerlesim_yeri: "Kadıköy" }, sonuc: "Kadıköy", uyariIcerir: ["ek/alternatif yetki"] },
  { ad: "mahkeme: yer yok → belirsiz", girdi: { asama: "tuketici_mahkemesi" }, sonuc: "belirsiz", eksik: ["davali_yerlesim_yeri", "tuketici_yerlesim_yeri"] },
  { ad: "mahkeme: yalnız işlem yeri yetmez", girdi: { asama: "tuketici_mahkemesi", islem_yeri: "Beşiktaş" }, sonuc: "belirsiz" },
  { ad: "işlem yeri uyarısı", girdi: { asama: "tuketici_mahkemesi", davali_yerlesim_yeri: "Şişli", islem_yeri: "Beşiktaş" }, sonuc: "Şişli", uyariIcerir: ["doğrudan başlık değildir"] },
  { ad: "mahkeme itirazı", girdi: { asama: "tuketici_mahkemesi", itiraz_mi: true, tuketici_yerlesim_yeri: "Üsküdar" }, sonuc: "Üsküdar", uyariIcerir: ["m.70/3"] },
  { ad: "geçersiz aşama → belirsiz", girdi: { asama: "bilinmeyen" }, sonuc: "belirsiz", eksik: ["asama"] },
  { ad: "tek harfli yer → belirsiz", girdi: { asama: "hakem_heyeti", tuketici_yerlesim_yeri: "X" }, sonuc: "belirsiz", eksik: ["tuketici_yerlesim_yeri"] },
  { ad: "parametre gerektirmez, onay uzman", girdi: { asama: "hakem_heyeti", tuketici_yerlesim_yeri: "Kadıköy" }, sonuc: "Kadıköy", onay: "uzman_onayli" },
];

test("yetkili_yer: 16 tablo vakası", () => {
  vakalariDogrula("yetkili_yer", VAKALAR);
  assert.ok(VAKALAR.length >= 15);
});

test("yetkili_yer: mahkeme yetkisi münhasır değil ('de açılabilir')", () => {
  const r = calistir("yetkili_yer", {
    asama: "tuketici_mahkemesi",
    davali_yerlesim_yeri: "Şişli",
    tuketici_yerlesim_yeri: "Kadıköy",
  });
  assert.ok(r.uyarilar.some((u) => u.includes("ek/alternatif yetki")));
  assert.ok(r.dayanak.includes("m:6100/17@2011-02-04"));
});
