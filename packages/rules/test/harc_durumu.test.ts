import test from "node:test";
import assert from "node:assert/strict";
import { vakalariDogrula, calistir, type Vaka } from "./yardim.ts";

const D73 = "m:6502/73@2014-05-28";

const VAKALAR: Vaka[] = [
  { ad: "heyet başvurusu ücretsiz (taraf ne olursa olsun)", girdi: { asama: "hakem_heyeti", davaci: "satici" }, sonuc: "muaf", dayanak: [D73] },
  { ad: "ilk derece, tüketici davacı → muaf", girdi: { asama: "ilk_derece", davaci: "tuketici" }, sonuc: "muaf", dayanak: [D73] },
  { ad: "ilk derece, Bakanlık davacı → muaf", girdi: { asama: "ilk_derece", davaci: "bakanlik" }, sonuc: "muaf" },
  { ad: "ilk derece, tüketici örgütü davacı → muaf", girdi: { asama: "ilk_derece", davaci: "tuketici_orgutu" }, sonuc: "muaf" },
  { ad: "ilk derece, satıcı davacı → harça tabi", girdi: { asama: "ilk_derece", davaci: "satici" }, sonuc: "harca_tabi" },
  { ad: "ilk derece, diğer davacı → harça tabi", girdi: { asama: "ilk_derece", davaci: "diger" }, sonuc: "harca_tabi" },
  { ad: "satıcı davacı / tüketici davalı → harça tabi + gider uyarısı", girdi: { asama: "ilk_derece", davaci: "satici", davali: "tuketici" }, sonuc: "harca_tabi", uyariIcerir: ["davalı konumundadır"] },
  { ad: "itiraz, tüketici → muaf (teyitli)", girdi: { asama: "itiraz", davaci: "tuketici" }, sonuc: "muaf", onay: "teyit_bekliyor", uyariIcerir: ["m.70/3"] },
  { ad: "itiraz, satıcı → harça tabi", girdi: { asama: "itiraz", davaci: "satici" }, sonuc: "harca_tabi" },
  { ad: "istinaf → belirsiz", girdi: { asama: "istinaf", davaci: "tuketici" }, sonuc: "belirsiz", uyariIcerir: ["Kanun yolu harçları"] },
  { ad: "temyiz → belirsiz", girdi: { asama: "temyiz", davaci: "tuketici" }, sonuc: "belirsiz" },
  { ad: "hakem heyeti aşaması teyitli", girdi: { asama: "hakem_heyeti", davaci: "tuketici" }, sonuc: "muaf", onay: "teyit_bekliyor" },
  { ad: "geçersiz aşama → belirsiz", girdi: { asama: "yok", davaci: "tuketici" }, sonuc: "belirsiz", eksik: ["asama"] },
  { ad: "geçersiz taraf → belirsiz", girdi: { asama: "ilk_derece", davaci: "vekil" }, sonuc: "belirsiz", eksik: ["davaci"] },
  { ad: "davacı eksik → belirsiz", girdi: { asama: "ilk_derece" }, sonuc: "belirsiz", eksik: ["davaci"] },
  { ad: "muafiyet gider muafiyeti değildir uyarısı", girdi: { asama: "ilk_derece", davaci: "tuketici" }, sonuc: "muaf", uyariIcerir: ["yargılama giderleri muafiyeti değildir"] },
];

test("harc_durumu: 16 tablo vakası", () => {
  vakalariDogrula("harc_durumu", VAKALAR);
  assert.ok(VAKALAR.length >= 15);
});

test("harc_durumu: muafiyet taraf + aşama + davacı sıfatına bağlı", () => {
  const tuketici = calistir("harc_durumu", { asama: "ilk_derece", davaci: "tuketici", davali: "satici" });
  const satici = calistir("harc_durumu", { asama: "ilk_derece", davaci: "satici", davali: "tuketici" });
  assert.equal(tuketici.sonuc, "muaf");
  assert.equal(satici.sonuc, "harca_tabi");
  assert.notEqual(tuketici.sonuc, satici.sonuc);
});
