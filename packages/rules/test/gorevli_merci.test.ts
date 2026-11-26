import test from "node:test";
import assert from "node:assert/strict";
import { gorevliMerci, UC_KADEMELI_SISTEM_BITIS } from "../src/kurallar/gorevli_merci.ts";
import { vakalariDogrula, calistir, type Vaka } from "./yardim.ts";

const HEYET = "tuketici_hakem_heyeti";
const MAHKEME = "tuketici_mahkemesi";
const D68 = "m:6502/68@2022-10-01";

const VAKALAR: Vaka[] = [
  { ad: "2026 sıfır değer → heyet", girdi: { uyusmazlik_degeri_tl: 0, basvuru_tarihi: "2026-01-02" }, sonuc: HEYET, dayanak: [D68] },
  { ad: "2026 eşik-1 TL → heyet", girdi: { uyusmazlik_degeri_tl: 185_999, basvuru_tarihi: "2026-05-04" }, sonuc: HEYET },
  { ad: "2026 tam eşik → mahkeme (varsayım, teyit)", girdi: { uyusmazlik_degeri_tl: 186_000, basvuru_tarihi: "2026-05-04" }, sonuc: MAHKEME, onay: "teyit_bekliyor", uyariIcerir: ["Tam eşik"] },
  { ad: "2026 eşik+1 TL → mahkeme", girdi: { uyusmazlik_degeri_tl: 186_001, basvuru_tarihi: "2026-05-04" }, sonuc: MAHKEME },
  { ad: "2026 son gün 31 Aralık → 2026 tablosu", girdi: { uyusmazlik_degeri_tl: 185_999, basvuru_tarihi: "2026-12-31" }, sonuc: HEYET },
  { ad: "2025 eşik-1 → heyet", girdi: { uyusmazlik_degeri_tl: 148_999, basvuru_tarihi: "2025-06-02" }, sonuc: HEYET },
  { ad: "2025 tam eşik → mahkeme", girdi: { uyusmazlik_degeri_tl: 149_000, basvuru_tarihi: "2025-06-02" }, sonuc: MAHKEME, onay: "teyit_bekliyor" },
  { ad: "2025 eşik+1 → mahkeme", girdi: { uyusmazlik_degeri_tl: 149_001, basvuru_tarihi: "2025-06-02" }, sonuc: MAHKEME },
  { ad: "2024 eşik-1 → heyet", girdi: { uyusmazlik_degeri_tl: 103_999, basvuru_tarihi: "2024-03-01" }, sonuc: HEYET },
  { ad: "2024 tam eşik → mahkeme", girdi: { uyusmazlik_degeri_tl: 104_000, basvuru_tarihi: "2024-03-01" }, sonuc: MAHKEME },
  { ad: "2023 eşik-1 → heyet", girdi: { uyusmazlik_degeri_tl: 65_999, basvuru_tarihi: "2023-04-03" }, sonuc: HEYET },
  { ad: "2023 tam eşik → mahkeme", girdi: { uyusmazlik_degeri_tl: 66_000, basvuru_tarihi: "2023-04-03" }, sonuc: MAHKEME },
  { ad: "aynı tutar farklı yıl: 2023'te mahkeme", girdi: { uyusmazlik_degeri_tl: 100_000, basvuru_tarihi: "2023-04-03" }, sonuc: MAHKEME },
  { ad: "aynı tutar farklı yıl: 2026'da heyet", girdi: { uyusmazlik_degeri_tl: 100_000, basvuru_tarihi: "2026-04-03" }, sonuc: HEYET },
  { ad: "2022-09-30 üç kademeli dönem → belirsiz", girdi: { uyusmazlik_degeri_tl: 10_000, basvuru_tarihi: "2022-09-30" }, sonuc: "belirsiz", uyariIcerir: ["UC_KADEMELI_SISTEM_YURURLUKTEN_KALKTI"] },
  { ad: "2022-10-01 sonrası doğrulanmamış dönem → belirsiz", girdi: { uyusmazlik_degeri_tl: 10_000, basvuru_tarihi: "2022-11-15" }, sonuc: "belirsiz", uyariIcerir: ["PARAMETRE_GECMIS_YOK"] },
  { ad: "2027 → PARAMETRE_GUNCEL_DEGIL", girdi: { uyusmazlik_degeri_tl: 10_000, basvuru_tarihi: "2027-01-05" }, sonuc: "belirsiz", uyariIcerir: ["PARAMETRE_GUNCEL_DEGIL"] },
  { ad: "değer eksik → belirsiz", girdi: {}, sonuc: "belirsiz", eksik: ["uyusmazlik_degeri_tl"] },
  { ad: "negatif değer → belirsiz", girdi: { uyusmazlik_degeri_tl: -1 }, sonuc: "belirsiz", eksik: ["uyusmazlik_degeri_tl"] },
  { ad: "geçersiz tarih → belirsiz", girdi: { uyusmazlik_degeri_tl: 1000, basvuru_tarihi: "2026-02-30" }, sonuc: "belirsiz", eksik: ["basvuru_tarihi"] },
  { ad: "tarih verilmezse bugun kullanılır", girdi: { uyusmazlik_degeri_tl: 185_999 }, sonuc: HEYET, bugun: "2026-10-22" },
];

test("gorevli_merci: 21 tablo vakası", () => {
  vakalariDogrula("gorevli_merci", VAKALAR);
  assert.ok(VAKALAR.length >= 15);
});

test("gorevli_merci: eşik değeri kaynak + sürüm taşır", () => {
  const r = calistir("gorevli_merci", { uyusmazlik_degeri_tl: 100_000, basvuru_tarihi: "2026-03-02" });
  assert.equal(r.onay_durumu, "uzman_onayli");
  assert.equal(r.parametre_surumu, "hakem-sinir-2026.1");
  assert.ok(r.kisa.includes("186.000,00 TL"));
});

test("gorevli_merci: üç kademeli sistem sabiti 1/10/2022", () => {
  assert.equal(UC_KADEMELI_SISTEM_BITIS, "2022-10-01");
  assert.equal(gorevliMerci.id, "gorevli_merci");
});

test("gorevli_merci: bugun değişince sonuç değişebilir (saat okunmaz)", () => {
  const g = { uyusmazlik_degeri_tl: 100_000 };
  assert.equal(calistir("gorevli_merci", g, "2023-06-01").sonuc, MAHKEME);
  assert.equal(calistir("gorevli_merci", g, "2026-06-01").sonuc, HEYET);
});
