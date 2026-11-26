import test from "node:test";
import assert from "node:assert/strict";
import { vakalariDogrula, calistir, sayiMi, type Vaka } from "./yardim.ts";

const D1 = "m:3095/1@2005-05-01";
const D1YENI = "m:3095/1@2026-07-31";
const D3 = "m:3095/3@1984-12-19";

const VAKALAR: Vaka[] = [
  {
    ad: "2026 tam yıl: %9 → %31 kırılımı",
    girdi: { anapara_tl: 10_000, baslangic: "2026-01-01", bitis: "2026-12-31" },
    sonuc: 1819.73,
    dayanak: [D1, D1YENI, D3],
    onay: "teyit_bekliyor",
    uyariIcerir: ["türetilmiş değerdir"],
    kisaIcerir: "%31",
  },
  { ad: "2026 ilk yarı yalnız %9", girdi: { anapara_tl: 10_000, baslangic: "2026-01-01", bitis: "2026-07-31" }, sonuc: 520.27 },
  { ad: "2026 Ocak (30 gün)", girdi: { anapara_tl: 10_000, baslangic: "2026-01-01", bitis: "2026-01-31" }, sonuc: 73.97 },
  { ad: "31/7/2026 tek gün %31", girdi: { anapara_tl: 10_000, baslangic: "2026-07-31", bitis: "2026-08-01" }, sonuc: 8.49 },
  { ad: "30 Temmuz tek gün %9", girdi: { anapara_tl: 10_000, baslangic: "2026-07-30", bitis: "2026-07-31" }, sonuc: 2.47 },
  { ad: "2025 tam yıl %9", girdi: { anapara_tl: 10_000, baslangic: "2025-01-01", bitis: "2025-12-31" }, sonuc: 897.53 },
  { ad: "2023 tam yıl %9", girdi: { anapara_tl: 10_000, baslangic: "2023-01-01", bitis: "2023-12-31" }, sonuc: 897.53 },
  { ad: "2024 Ocak %9", girdi: { anapara_tl: 10_000, baslangic: "2024-01-01", bitis: "2024-01-31" }, sonuc: 73.97 },
  { ad: "ticari temerrüt 2026: avans %39,75", girdi: { anapara_tl: 10_000, baslangic: "2026-01-01", bitis: "2026-12-31", tur: "ticari_temerrut" }, sonuc: 3964.11, uyariIcerir: ["5 puan fark"] },
  { ad: "ticari temerrüt Ağustos 2026", girdi: { anapara_tl: 10_000, baslangic: "2026-07-31", bitis: "2026-08-30", tur: "ticari_temerrut" }, sonuc: 326.71 },
  { ad: "ticari 2025 H1: 49,25", girdi: { anapara_tl: 10_000, baslangic: "2025-06-01", bitis: "2025-06-30", tur: "ticari_temerrut" }, sonuc: 391.3 },
  { ad: "ticari 2025 H2: 5 puan fark → 44,25", girdi: { anapara_tl: 10_000, baslangic: "2025-07-01", bitis: "2025-07-31", tur: "ticari_temerrut" }, sonuc: 363.7 },
  { ad: "2027 faiz tablosu yok → belirsiz", girdi: { anapara_tl: 10_000, baslangic: "2027-01-01", bitis: "2027-02-01" }, sonuc: "belirsiz", uyariIcerir: ["PARAMETRE_GUNCEL_DEGIL"] },
  { ad: "2005 öncesi oran doğrulanmadı → belirsiz", girdi: { anapara_tl: 10_000, baslangic: "2004-12-01", bitis: "2005-01-31" }, sonuc: "belirsiz", uyariIcerir: ["PARAMETRE_GECMIS_YOK"] },
  { ad: "ticari 2016 avans yok → belirsiz", girdi: { anapara_tl: 10_000, baslangic: "2016-01-01", bitis: "2016-02-01", tur: "ticari_temerrut" }, sonuc: "belirsiz", uyariIcerir: ["PARAMETRE_GECMIS_YOK"] },
  { ad: "ters dönem → belirsiz", girdi: { anapara_tl: 10_000, baslangic: "2026-02-01", bitis: "2026-02-01" }, sonuc: "belirsiz", kisaIcerir: "pozitif olmalı" },
  { ad: "sıfır anapara → belirsiz", girdi: { anapara_tl: 0, baslangic: "2026-01-01", bitis: "2026-02-01" }, sonuc: "belirsiz", eksik: ["anapara_tl"] },
  { ad: "eksik bitis → belirsiz", girdi: { anapara_tl: 1000, baslangic: "2026-01-01" }, sonuc: "belirsiz", eksik: ["bitis"] },
  { ad: "geçersiz tarih → belirsiz", girdi: { anapara_tl: 1000, baslangic: "2026-02-31", bitis: "2026-03-01" }, sonuc: "belirsiz", eksik: ["baslangic"] },
];

test("yasal_faiz: 19 tablo vakası", () => {
  vakalariDogrula("yasal_faiz", VAKALAR);
  assert.ok(VAKALAR.length >= 15);
});

test("yasal_faiz özellik: dönem bölünmesi toplamsal (basit faiz)", () => {
  const tam = sayiMi(calistir("yasal_faiz", { anapara_tl: 10_000, baslangic: "2026-01-01", bitis: "2026-12-31" }));
  const a = sayiMi(calistir("yasal_faiz", { anapara_tl: 10_000, baslangic: "2026-01-01", bitis: "2026-06-30" }));
  const b = sayiMi(calistir("yasal_faiz", { anapara_tl: 10_000, baslangic: "2026-06-30", bitis: "2026-12-31" }));
  assert.ok(Math.abs(tam - (a + b)) <= 0.02, `${tam} != ${a}+${b}`);
});

test("yasal_faiz özellik: anapara ile doğrusal, süre ile monoton", () => {
  const bir = sayiMi(calistir("yasal_faiz", { anapara_tl: 1_000, baslangic: "2026-01-01", bitis: "2026-07-31" }));
  const iki = sayiMi(calistir("yasal_faiz", { anapara_tl: 2_000, baslangic: "2026-01-01", bitis: "2026-07-31" }));
  assert.ok(Math.abs(iki - 2 * bir) <= 0.02);

  const kisa = sayiMi(calistir("yasal_faiz", { anapara_tl: 10_000, baslangic: "2026-01-01", bitis: "2026-03-01" }));
  const uzun = sayiMi(calistir("yasal_faiz", { anapara_tl: 10_000, baslangic: "2026-01-01", bitis: "2026-06-01" }));
  assert.ok(uzun > kisa);
});

test("yasal_faiz: bileşik faiz YOK (3095 m.3)", () => {
  const r = calistir("yasal_faiz", { anapara_tl: 10_000, baslangic: "2026-01-01", bitis: "2026-12-31" });
  assert.ok(r.varsayimlar.some((v) => v.includes("Basit faiz")));
  assert.ok(r.dayanak.includes("m:3095/3@1984-12-19"));
});

test("yasal_faiz: 3095 m.1 değişikliği 31/7/2026 ile tarih kapılı", () => {
  const eski = calistir("yasal_faiz", { anapara_tl: 10_000, baslangic: "2026-01-01", bitis: "2026-07-30" });
  assert.ok(!eski.dayanak.includes("m:3095/1@2026-07-31"), "eski dönem yeni maddeye dayanmamalı");
  const yeni = calistir("yasal_faiz", { anapara_tl: 10_000, baslangic: "2026-07-31", bitis: "2026-08-30" });
  assert.ok(yeni.dayanak.includes("m:3095/1@2026-07-31"));
});
