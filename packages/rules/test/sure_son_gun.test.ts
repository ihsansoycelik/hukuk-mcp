import test from "node:test";
import assert from "node:assert/strict";
import { vakalariDogrula, calistir, type Vaka } from "./yardim.ts";
import { haftaGunu, gunEkle } from "../src/tarih.ts";

const D93 = "m:6100/93@2011-02-04";
const D102 = "m:6100/102@2011-02-04";
const D2429 = "m:2429/2@1981-03-19";

const VAKALAR: Vaka[] = [
  { ad: "7 gün düz", girdi: { baslangic: "2026-03-16", sure_degeri: 7, sure_birimi: "gun" }, sonuc: { tarih: "2026-03-23" }, dayanak: [D93, D2429] },
  { ad: "son gün bayram → 23 Mart", girdi: { baslangic: "2026-03-16", sure_degeri: 4, sure_birimi: "gun" }, sonuc: { tarih: "2026-03-23" }, uyariIcerir: ["ertelendi"] },
  { ad: "arife günü son gün sayılır", girdi: { baslangic: "2026-03-18", sure_degeri: 1, sure_birimi: "gun" }, sonuc: { tarih: "2026-03-19" } },
  { ad: "1 gün", girdi: { baslangic: "2026-03-16", sure_degeri: 1, sure_birimi: "gun" }, sonuc: { tarih: "2026-03-17" } },
  { ad: "Kurban Bayramı sonrasına taşma", girdi: { baslangic: "2026-05-25", sure_degeri: 5, sure_birimi: "gun" }, sonuc: { tarih: "2026-06-01" }, uyariIcerir: ["ertelendi"] },
  { ad: "28 Ekim yarım gün son gün → iş günü", girdi: { baslangic: "2026-10-27", sure_degeri: 1, sure_birimi: "gun" }, sonuc: { tarih: "2026-10-28" }, uyariIcerir: ["yarım gün"] },
  { ad: "29 Ekim tatil, son gün 30 Ekim", girdi: { baslangic: "2026-10-29", sure_degeri: 1, sure_birimi: "gun" }, sonuc: { tarih: "2026-10-30" } },
  { ad: "29 Ekim + 3 gün → hafta sonu sonrası", girdi: { baslangic: "2026-10-29", sure_degeri: 3, sure_birimi: "gun" }, sonuc: { tarih: "2026-11-02" } },
  { ad: "yılbaşı 2027 ertelemesi", girdi: { baslangic: "2026-12-31", sure_degeri: 1, sure_birimi: "gun" }, sonuc: { tarih: "2027-01-04" } },
  { ad: "2026 yılbaşı ertelemesi", girdi: { baslangic: "2025-12-31", sure_degeri: 1, sure_birimi: "gun" }, sonuc: { tarih: "2026-01-02" } },
  { ad: "ay birimi ay sonu kırpma", girdi: { baslangic: "2026-01-31", sure_degeri: 1, sure_birimi: "ay" }, sonuc: { tarih: "2026-03-02" } },
  { ad: "yıl birimi 29 Şubat", girdi: { baslangic: "2024-02-29", sure_degeri: 1, sure_birimi: "yil" }, sonuc: { tarih: "2025-02-28" } },
  { ad: "adli tatil askıya alma", girdi: { baslangic: "2026-07-15", sure_degeri: 14, sure_birimi: "gun", adli_tatil_uygula: true }, sonuc: { tarih: "2026-09-10" }, dayanak: [D102], uyariIcerir: ["USULÎ"] },
  { ad: "adli tatil kapalıyken normal", girdi: { baslangic: "2026-07-15", sure_degeri: 14, sure_birimi: "gun" }, sonuc: { tarih: "2026-07-29" } },
  { ad: "10 iş günü", girdi: { baslangic: "2026-08-07", sure_degeri: 10, sure_birimi: "is_gunu" }, sonuc: { tarih: "2026-08-21" } },
  { ad: "6 iş günü bayram sonrası", girdi: { baslangic: "2026-08-24", sure_degeri: 6, sure_birimi: "is_gunu" }, sonuc: { tarih: "2026-09-01" } },
  { ad: "yarım gün iş günü sayılır (varsayılan; 19 Mayıs tatili atlanır)", girdi: { baslangic: "2026-05-15", sure_degeri: 7, sure_birimi: "is_gunu" }, sonuc: { tarih: "2026-06-01" } },
  { ad: "yarım gün sayılmaz seçeneği", girdi: { baslangic: "2026-05-15", sure_degeri: 7, sure_birimi: "is_gunu", yarim_gun_is_gunu: false }, sonuc: { tarih: "2026-06-02" } },
  { ad: "baslangic_dahil", girdi: { baslangic: "2026-03-16", sure_degeri: 1, sure_birimi: "gun", baslangic_dahil: true }, sonuc: { tarih: "2026-03-16" } },
  { ad: "2024 tablo dışı → belirsiz", girdi: { baslangic: "2024-03-01", sure_degeri: 5, sure_birimi: "gun" }, sonuc: "belirsiz", uyariIcerir: ["TATIL_TABLOSU_YOK"] },
  { ad: "ay + adli tatil desteklenmiyor", girdi: { baslangic: "2026-07-01", sure_degeri: 1, sure_birimi: "ay", adli_tatil_uygula: true }, sonuc: "belirsiz", uyariIcerir: ["DESTEKLENMIYOR"] },
  { ad: "sıfır süre → belirsiz", girdi: { baslangic: "2026-03-16", sure_degeri: 0, sure_birimi: "gun" }, sonuc: "belirsiz", eksik: ["sure_degeri"] },
  { ad: "geçersiz başlangıç → belirsiz", girdi: { baslangic: "2026-02-30", sure_degeri: 3, sure_birimi: "gun" }, sonuc: "belirsiz", eksik: ["baslangic"] },
  { ad: "bilinmeyen birim → belirsiz", girdi: { baslangic: "2026-03-16", sure_degeri: 3, sure_birimi: "saat" }, sonuc: "belirsiz", eksik: ["sure_birimi"] },
];

test("sure_son_gun: 24 tablo vakası", () => {
  vakalariDogrula("sure_son_gun", VAKALAR);
  assert.ok(VAKALAR.length >= 15);
});

test("sure_son_gun özellik: ertelenen son gün asla cumartesi/pazar değil", () => {
  const baslangiclar = [
    "2025-01-01",
    "2025-03-28",
    "2025-06-04",
    "2025-10-27",
    "2026-01-01",
    "2026-03-18",
    "2026-05-25",
    "2026-07-14",
    "2026-10-28",
    "2026-12-30",
    "2027-03-05",
    "2027-05-14",
  ];
  const sureler = [1, 2, 3, 5, 7, 14, 30, 45];
  for (const b of baslangiclar) {
    for (const n of sureler) {
      const r = calistir("sure_son_gun", { baslangic: b, sure_degeri: n, sure_birimi: "gun" });
      assert.notEqual(r.sonuc, "belirsiz", `${b} + ${n}`);
      assert.ok(typeof r.sonuc === "object" && r.sonuc !== null && "tarih" in r.sonuc);
      const t = r.sonuc.tarih;
      const g = haftaGunu(t);
      assert.ok(g !== 0 && g !== 6, `${b} + ${n} → ${t} hafta sonu`);
    }
  }
});

test("sure_son_gun özellik: süre arttıkça son gün monoton artar", () => {
  let onceki = "";
  for (const n of [1, 2, 3, 5, 7, 10, 20, 40, 90]) {
    const r = calistir("sure_son_gun", { baslangic: "2026-02-02", sure_degeri: n, sure_birimi: "gun" });
    assert.ok(typeof r.sonuc === "object" && r.sonuc !== null && "tarih" in r.sonuc);
    if (onceki) assert.ok(r.sonuc.tarih >= onceki, `${n}: ${r.sonuc.tarih} < ${onceki}`);
    onceki = r.sonuc.tarih;
  }
});

test("sure_son_gun özellik: 1 yıl = 365/366 gün, 29 Şubat kırpılır", () => {
  assert.deepEqual(calistir("sure_son_gun", { baslangic: "2024-02-29", sure_degeri: 1, sure_birimi: "yil" }).sonuc, {
    tarih: "2025-02-28",
  });
  assert.deepEqual(calistir("sure_son_gun", { baslangic: "2025-03-01", sure_degeri: 1, sure_birimi: "yil" }).sonuc, {
    tarih: "2026-03-02",
  });
  assert.deepEqual(calistir("sure_son_gun", { baslangic: "2025-01-31", sure_degeri: 1, sure_birimi: "ay" }).sonuc, {
    tarih: "2025-02-28",
  });
});

test("sure_son_gun özellik: aynı tarih + aynı süre deterministik", () => {
  const g = { baslangic: "2026-03-16", sure_degeri: 4, sure_birimi: "gun" };
  assert.deepEqual(calistir("sure_son_gun", g), calistir("sure_son_gun", g));
});

test("sure_son_gun: gün ekleme aritmetiği ile tutarlı", () => {
  const r = calistir("sure_son_gun", { baslangic: "2026-04-01", sure_degeri: 7, sure_birimi: "gun" });
  assert.ok(typeof r.sonuc === "object" && r.sonuc !== null && "tarih" in r.sonuc);
  assert.equal(r.sonuc.tarih, gunEkle("2026-04-01", 7));
});
