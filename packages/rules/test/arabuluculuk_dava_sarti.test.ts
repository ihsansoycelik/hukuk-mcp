import test from "node:test";
import assert from "node:assert/strict";
import { vakalariDogrula, type Vaka } from "./yardim.ts";

const D73A = "m:6502/73-A@2023-09-01";

const VAKALAR: Vaka[] = [
  { ad: "eşik üstü 2026 → gerekli", girdi: { uyusmazlik_degeri_tl: 250_000, dava_tarihi: "2026-05-04" }, sonuc: "gerekli", dayanak: [D73A] },
  { ad: "eşik altı 2026 → gerekli değil (heyet)", girdi: { uyusmazlik_degeri_tl: 185_999, dava_tarihi: "2026-05-04" }, sonuc: "gerekli_degil", dayanak: [D73A], kisaIcerir: "m.73/A/1-a" },
  { ad: "tam eşik → gerekli", girdi: { uyusmazlik_degeri_tl: 186_000, dava_tarihi: "2026-05-04" }, sonuc: "gerekli" },
  { ad: "eşik+1 → gerekli", girdi: { uyusmazlik_degeri_tl: 186_001, dava_tarihi: "2026-05-04" }, sonuc: "gerekli" },
  { ad: "yürürlük öncesi 31/8/2023 → gerekli değil", girdi: { uyusmazlik_degeri_tl: 500_000, dava_tarihi: "2023-08-31" }, sonuc: "gerekli_degil", kisaIcerir: "yürürlükte değildi" },
  { ad: "yürürlük günü 1/9/2023 → gerekli", girdi: { uyusmazlik_degeri_tl: 500_000, dava_tarihi: "2023-09-01" }, sonuc: "gerekli" },
  { ad: "2024 eşik altı → gerekli değil", girdi: { uyusmazlik_degeri_tl: 103_999, dava_tarihi: "2024-06-03" }, sonuc: "gerekli_degil" },
  { ad: "2024 tam eşik → gerekli", girdi: { uyusmazlik_degeri_tl: 104_000, dava_tarihi: "2024-06-03" }, sonuc: "gerekli" },
  { ad: "2025 eşik altı → gerekli değil", girdi: { uyusmazlik_degeri_tl: 148_999, dava_tarihi: "2025-06-03" }, sonuc: "gerekli_degil" },
  { ad: "2025 eşik üstü → gerekli", girdi: { uyusmazlik_degeri_tl: 149_000, dava_tarihi: "2025-06-03" }, sonuc: "gerekli" },
  { ad: "hakem heyeti kararına itiraz istisnası", girdi: { uyusmazlik_degeri_tl: 400_000, dava_tarihi: "2026-05-04", hakem_heyeti_kararina_itiraz: true }, sonuc: "gerekli_degil", dayanak: [D73A, "m:6502/70@2014-05-28"], kisaIcerir: "m.70/3" },
  { ad: "m.73/6 istisnası", girdi: { uyusmazlik_degeri_tl: 400_000, dava_tarihi: "2026-05-04", m73_6_kapsaminda: true }, sonuc: "gerekli_degil", kisaIcerir: "m.73/6" },
  { ad: "m.74 istisnası", girdi: { uyusmazlik_degeri_tl: 400_000, dava_tarihi: "2026-05-04", m74_kapsaminda: true }, sonuc: "gerekli_degil", kisaIcerir: "seri mal" },
  { ad: "taşınmazın aynına ilişkin istisna", girdi: { uyusmazlik_degeri_tl: 400_000, dava_tarihi: "2026-05-04", ayni_hakka_iliskin_tasinmaz: true }, sonuc: "gerekli_degil", kisaIcerir: "aynına ilişkin" },
  { ad: "2027 → belirsiz (güncel değil)", girdi: { uyusmazlik_degeri_tl: 400_000, dava_tarihi: "2027-03-01" }, sonuc: "belirsiz", uyariIcerir: ["PARAMETRE_GUNCEL_DEGIL"] },
  { ad: "2022 → yürürlük öncesi, gerekli değil", girdi: { uyusmazlik_degeri_tl: 400_000, dava_tarihi: "2022-12-01" }, sonuc: "gerekli_degil", kisaIcerir: "yürürlükte değildi" },
  { ad: "değer eksik → belirsiz", girdi: { dava_tarihi: "2026-05-04" }, sonuc: "belirsiz", eksik: ["uyusmazlik_degeri_tl"] },
  { ad: "geçersiz tarih → belirsiz", girdi: { uyusmazlik_degeri_tl: 1000, dava_tarihi: "2026-13-01" }, sonuc: "belirsiz", eksik: ["dava_tarihi"] },
  { ad: "tarih yoksa bugun kullanılır", girdi: { uyusmazlik_degeri_tl: 300_000 }, sonuc: "gerekli" },
];

test("arabuluculuk_dava_sarti: 19 tablo vakası", () => {
  vakalariDogrula("arabuluculuk_dava_sarti", VAKALAR);
  assert.ok(VAKALAR.length >= 15);
});

test("arabuluculuk: eşik, yürürlük ve istisna birlikte çalışır", () => {
  // Eşik altı + itiraz bayrağı: itiraz gerekçesi önce gelir.
  const r = vakalariDogrula("arabuluculuk_dava_sarti", [
    { ad: "itiraz + eşik altı", girdi: { uyusmazlik_degeri_tl: 10_000, dava_tarihi: "2026-05-04", hakem_heyeti_kararina_itiraz: true }, sonuc: "gerekli_degil" },
  ]);
  assert.equal(r, undefined);
});
