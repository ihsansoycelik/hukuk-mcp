import test from "node:test";
import assert from "node:assert/strict";
import { vakalariDogrula, calistir, type Vaka } from "./yardim.ts";

const D48 = "m:6502/48@2014-05-28";

const VAKALAR: Vaka[] = [
  { ad: "14 gün, son gün Ramazan bayramı → 23 Mart", girdi: { teslim_tarihi: "2026-03-06" }, sonuc: { tarih: "2026-03-23" }, dayanak: [D48], uyariIcerir: ["ertelendi"] },
  { ad: "14 gün normal", girdi: { teslim_tarihi: "2026-04-01" }, sonuc: { tarih: "2026-04-15" } },
  { ad: "14 gün, hafta sonu → pazartesi", girdi: { teslim_tarihi: "2026-06-01" }, sonuc: { tarih: "2026-06-15" } },
  { ad: "hizmet sözleşmesi tarihinden", girdi: { sozlesme_turu: "mesafeli_hizmet", sozlesme_tarihi: "2026-01-02" }, sonuc: { tarih: "2026-01-16" } },
  { ad: "kurulum tarihi teslimden sonra → kurulum esas", girdi: { teslim_tarihi: "2026-03-01", kurulum_tarihi: "2026-03-10" }, sonuc: { tarih: "2026-03-24" } },
  { ad: "yılbaşı tatili ertelemesi", girdi: { teslim_tarihi: "2026-12-20" }, sonuc: { tarih: "2027-01-04" }, uyariIcerir: ["ertelendi"] },
  { ad: "2027 arife yarım gün iş günü sayılır", girdi: { teslim_tarihi: "2027-02-22" }, sonuc: { tarih: "2027-03-08" } },
  { ad: "2027 Ramazan bayramı içi → 12 Mart", girdi: { teslim_tarihi: "2027-02-23" }, sonuc: { tarih: "2027-03-12" }, uyariIcerir: ["ertelendi"] },
  { ad: "2025 Kurban bayramı", girdi: { teslim_tarihi: "2025-05-23", bugun: "2025-06-01" }, sonuc: { tarih: "2025-06-10" }, uyariIcerir: ["ertelendi"] },
  { ad: "2025 yılbaşı", girdi: { teslim_tarihi: "2024-12-20" }, sonuc: { tarih: "2025-01-03" } },
  { ad: "tablo dışı yıl → belirsiz", girdi: { teslim_tarihi: "2024-01-10" }, sonuc: "belirsiz", uyariIcerir: ["TATIL_TABLOSU_YOK"] },
  { ad: "bilgilendirme yapılmadı → belirsiz", girdi: { teslim_tarihi: "2026-04-01", bilgilendirme_yapildi: false }, sonuc: "belirsiz", uyariIcerir: ["BILGILENDIRME_EKSIK"] },
  { ad: "cayma bildirimi süre içinde", girdi: { teslim_tarihi: "2026-04-01", cayma_bildirim_tarihi: "2026-04-15" }, sonuc: { tarih: "2026-04-15" }, uyariIcerir: ["süre içinde"] },
  { ad: "cayma bildirimi geç", girdi: { teslim_tarihi: "2026-04-01", cayma_bildirim_tarihi: "2026-04-16" }, sonuc: { tarih: "2026-04-15" }, uyariIcerir: ["sonra"] },
  { ad: "teslim eksik → belirsiz", girdi: {}, sonuc: "belirsiz", eksik: ["teslim_tarihi"] },
  { ad: "hizmette sözleşme tarihi eksik → belirsiz", girdi: { sozlesme_turu: "mesafeli_hizmet" }, sonuc: "belirsiz", eksik: ["sozlesme_tarihi"] },
  { ad: "imkânsız tarih → belirsiz", girdi: { teslim_tarihi: "2026-04-31" }, sonuc: "belirsiz", eksik: ["teslim_tarihi"] },
  { ad: "süre parametresi teyit bekliyor", girdi: { teslim_tarihi: "2026-04-01" }, sonuc: { tarih: "2026-04-15" }, onay: "teyit_bekliyor", uyariIcerir: ["uzman onayı taşımıyor"] },
];

test("cayma_suresi: 18 tablo vakası", () => {
  vakalariDogrula("cayma_suresi", VAKALAR);
  assert.ok(VAKALAR.length >= 15);
});

test("cayma_suresi: 14 gün sabit ve gün farkı tam 14", () => {
  const r = calistir("cayma_suresi", { teslim_tarihi: "2026-06-01" });
  assert.deepEqual(r.sonuc, { tarih: "2026-06-15" });
  assert.ok(r.varsayimlar.some((v) => v.includes("Başlangıç günü süreye dahil edilmez")));
});
