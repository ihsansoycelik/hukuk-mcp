import test from "node:test";
import assert from "node:assert/strict";
import { vakalariDogrula, calistir, tarihMi, type Vaka } from "./yardim.ts";

const D12 = "m:6502/12@2014-05-28";
const D11 = "m:6502/11@2014-05-28";

const VAKALAR: Vaka[] = [
  { ad: "taşınır 2 yıl", girdi: { teslim_tarihi: "2025-03-10", dava_tarihi: "2026-10-22" }, sonuc: { tarih: "2027-03-10" }, dayanak: [D12] },
  { ad: "artık yıl 29 Şubat kırpma", girdi: { teslim_tarihi: "2024-02-29", dava_tarihi: "2026-01-01" }, sonuc: { tarih: "2026-02-28" } },
  { ad: "konut 5 yıl", girdi: { teslim_tarihi: "2025-06-01", mal_turu: "konut_tatil_amazli_tasinmaz" }, sonuc: { tarih: "2030-06-01" } },
  { ad: "ikinci el taşınır, sözleşme yok → 2 yıl + uyarı", girdi: { teslim_tarihi: "2025-03-10", ikinci_el: true }, sonuc: { tarih: "2027-03-10" }, uyariIcerir: ["m.12/2"] },
  { ad: "ikinci el sözleşme 180 gün → 1 yıl tabanı", girdi: { teslim_tarihi: "2025-03-10", ikinci_el: true, sozlesme_suresi_gun: 180 }, sonuc: { tarih: "2026-03-10" }, uyariIcerir: ["m.12/2", "1 yıldan az olamaz"] },
  { ad: "ikinci el konut sözleşme 1 yıl → 3 yıl tabanı", girdi: { teslim_tarihi: "2025-03-10", mal_turu: "konut_tatil_amazli_tasinmaz", ikinci_el: true, sozlesme_suresi_gun: 365 }, sonuc: { tarih: "2028-03-10" } },
  { ad: "sözleşmede daha uzun süre 3 yıl", girdi: { teslim_tarihi: "2025-03-10", sozlesme_suresi_gun: 1095 }, sonuc: { tarih: "2028-03-09" } },
  { ad: "hile → zamanaşımı işlemez", girdi: { teslim_tarihi: "2020-01-01", hile_veya_agir_kusur: true }, sonuc: "zamanaşımı_işlemez", uyariIcerir: ["ispat"] },
  { ad: "ağır kusur + konut → zamanaşımı işlemez", girdi: { teslim_tarihi: "2015-05-05", mal_turu: "konut_tatil_amazli_tasinmaz", hile_veya_agir_kusur: true }, sonuc: "zamanaşımı_işlemez" },
  { ad: "süre dolmuş → uyarı", girdi: { teslim_tarihi: "2023-01-10", dava_tarihi: "2026-10-22" }, sonuc: { tarih: "2025-01-10" }, uyariIcerir: ["ZAMANAŞIMI_DOLDU"] },
  { ad: "son gün bugün → doldu uyarısı yok", girdi: { teslim_tarihi: "2024-10-22", dava_tarihi: "2026-10-22" }, sonuc: { tarih: "2026-10-22" } },
  { ad: "m.11/4 onarım 30 iş günü", girdi: { teslim_tarihi: "2025-05-10", onarim_talep_tarihi: "2026-03-16" }, sonuc: { tarih: "2027-05-10" }, dayanak: [D11], uyariIcerir: ["ihbar süresi DEĞİL", "29 Nisan 2026"] },
  { ad: "konutta m.11/4 onarım 60 iş günü", girdi: { teslim_tarihi: "2025-05-10", mal_turu: "konut_tatil_amazli_tasinmaz", onarim_talep_tarihi: "2026-03-16" }, sonuc: { tarih: "2030-05-10" }, uyariIcerir: ["60 iş günü"] },
  { ad: "teslim eksik → belirsiz", girdi: {}, sonuc: "belirsiz", eksik: ["teslim_tarihi"] },
  { ad: "imkânsız tarih → belirsiz", girdi: { teslim_tarihi: "2025-02-30" }, sonuc: "belirsiz", eksik: ["teslim_tarihi"] },
  { ad: "ikinci el sözleşme çok kısa (30 gün) taban uygulanır", girdi: { teslim_tarihi: "2025-03-10", ikinci_el: true, sozlesme_suresi_gun: 30 }, sonuc: { tarih: "2026-03-10" } },
  { ad: "dava tarihi geçersiz → belirsiz", girdi: { teslim_tarihi: "2025-03-10", dava_tarihi: "2026-02-31" }, sonuc: "belirsiz", eksik: ["dava_tarihi"] },
];

test("ayip_zamanasimi: 17 tablo vakası", () => {
  vakalariDogrula("ayip_zamanasimi", VAKALAR);
  assert.ok(VAKALAR.length >= 15);
});

test("ayip_zamanasimi: 30 günlük ihbar süresi UYDURULMAZ", () => {
  const r = calistir("ayip_zamanasimi", { teslim_tarihi: "2025-03-10" });
  assert.ok(r.varsayimlar.some((u) => u.includes("30 günlük ayıp ihbarı süresi yoktur")));
  assert.ok(
    !r.varsayimlar.some((v) => /ihbar.*30 gün/.test(v) && !/yoktur/.test(v)),
    "ihbar süresi varsayımı üretilmemeli",
  );
});

test("ayip_zamanasimi: teslim tarihi esas, sözleşme değil", () => {
  const erken = tarihMi(calistir("ayip_zamanasimi", { teslim_tarihi: "2025-03-10" }));
  const gec = tarihMi(calistir("ayip_zamanasimi", { teslim_tarihi: "2025-03-11" }));
  assert.notEqual(erken, gec);
  assert.equal(erken, "2027-03-10");
});
