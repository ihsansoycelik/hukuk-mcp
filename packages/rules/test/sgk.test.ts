/**
 * SGK / GSS kural motoru testleri.
 *
 * Her kural en az 15 tablo güdümlü vakayla sınanır; sınır değerleri, artık yıl,
 * ay sonu, eksik/geçersiz girdi ve parametre yokluğu ayrıca ele alınır.
 * Testlerde `bugun` sabittir (2026-10-22); kural motoru sistem saatini okumaz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BUGUN,
  calistir,
  tarihMi,
  vakalariDogrula,
  type Vaka,
} from "./yardim.ts";
import {
  KAYITLAR,
  ORNEK_GIRDI,
  StatikParametreOkuyucu,
  VARSAYILAN_OKUYUCU,
  kuralCalistir,
} from "../src/index.ts";

const D67 = "m:5510/67@2008-10-01";
const D60 = "m:5510/60@2008-10-01";
const D97 = "m:5510/97@2008-10-01";
const D93 = "m:5510/93@2008-10-01";
const D13 = "m:5510/13@2008-10-01";
const D21 = "m:5510/21@2008-10-01";
const D101 = "m:5510/101@2008-10-01";
const D4447 = "m:4447/50@2008-05-26";
const D4447_51 = "m:4447/51@2008-05-26";

/* ------------------------- 1) sgk_saglik_hakki -------------------------- */

const SAGLIK_VAKALARI: Vaka[] = [
  {
    ad: "son bir yılda 120 prim günü → 10 + 90 gün",
    girdi: { isten_cikis_tarihi: "2026-06-15", son_bir_yil_prim_gun: 120 },
    sonuc: { tarih: "2026-09-23" },
    dayanak: [D67],
    uyariIcerir: ["eşiğini karşılıyor"],
  },
  {
    ad: "tam 90 prim günü sınırda ek süre doğar",
    girdi: { isten_cikis_tarihi: "2026-06-15", son_bir_yil_prim_gun: 90 },
    sonuc: { tarih: "2026-09-23" },
  },
  {
    ad: "89 prim günü → yalnızca 10 gün",
    girdi: { isten_cikis_tarihi: "2026-06-15", son_bir_yil_prim_gun: 89 },
    sonuc: { tarih: "2026-06-25" },
    uyariIcerir: ["altında"],
  },
  {
    ad: "prim günü verilmedi → yalnızca 10 gün",
    girdi: { isten_cikis_tarihi: "2026-06-15" },
    sonuc: { tarih: "2026-06-25" },
    uyariIcerir: ["prim gün sayısı verilmedi"],
  },
  {
    ad: "yıl sonu + 100 gün yıl aşar",
    girdi: { isten_cikis_tarihi: "2026-12-25", son_bir_yil_prim_gun: 200 },
    sonuc: { tarih: "2027-04-04" },
  },
  {
    ad: "artık yıl 29 Şubat çıkış + 10 gün",
    girdi: { isten_cikis_tarihi: "2024-02-29", son_bir_yil_prim_gun: 0 },
    sonuc: { tarih: "2024-03-10" },
  },
  {
    ad: "ay sonu 31 Aralık + 100 gün",
    girdi: { isten_cikis_tarihi: "2025-12-31", son_bir_yil_prim_gun: 95 },
    sonuc: { tarih: "2026-04-10" },
  },
  {
    ad: "yıl başı 1 Ocak + 100 gün",
    girdi: { isten_cikis_tarihi: "2026-01-01", son_bir_yil_prim_gun: 90 },
    sonuc: { tarih: "2026-04-11" },
  },
  {
    ad: "31 Ağustos + 100 gün",
    girdi: { isten_cikis_tarihi: "2026-08-31", son_bir_yil_prim_gun: 90 },
    sonuc: { tarih: "2026-12-09" },
  },
  {
    ad: "bugün çıkış + 100 gün",
    girdi: { isten_cikis_tarihi: "2026-10-22", son_bir_yil_prim_gun: 90 },
    sonuc: { tarih: "2027-01-30" },
  },
  {
    ad: "prim 0 verilmiş → 10 gün",
    girdi: { isten_cikis_tarihi: "2026-06-15", son_bir_yil_prim_gun: 0 },
    sonuc: { tarih: "2026-06-25" },
    uyariIcerir: ["0 prim günü"],
  },
  {
    ad: "parametrenin yürürlük başlangıcı 2008-10-01",
    girdi: { isten_cikis_tarihi: "2008-10-01", son_bir_yil_prim_gun: 90 },
    sonuc: { tarih: "2009-01-09" },
  },
  {
    ad: "parametre öncesi çıkış → belirsiz",
    girdi: { isten_cikis_tarihi: "2008-09-30", son_bir_yil_prim_gun: 90 },
    sonuc: "belirsiz",
    uyariIcerir: ["PARAMETRE_GECMIS_YOK"],
  },
  {
    ad: "imkânsız tarih → belirsiz",
    girdi: { isten_cikis_tarihi: "2026-02-30", son_bir_yil_prim_gun: 90 },
    sonuc: "belirsiz",
    eksik: ["isten_cikis_tarihi"],
  },
  {
    ad: "girdi yok → belirsiz",
    girdi: {},
    sonuc: "belirsiz",
    eksik: ["isten_cikis_tarihi"],
  },
  {
    ad: "2027 çıkış + 100 gün",
    girdi: { isten_cikis_tarihi: "2027-01-15", son_bir_yil_prim_gun: 90 },
    sonuc: { tarih: "2027-04-25" },
  },
  {
    ad: "negatif prim günü → belirsiz",
    girdi: { isten_cikis_tarihi: "2026-06-15", son_bir_yil_prim_gun: -1 },
    sonuc: "belirsiz",
    eksik: ["son_bir_yil_prim_gun"],
  },
  {
    ad: "ondalık prim günü → belirsiz",
    girdi: { isten_cikis_tarihi: "2026-06-15", son_bir_yil_prim_gun: 90.5 },
    sonuc: "belirsiz",
    eksik: ["son_bir_yil_prim_gun"],
  },
];

test("sgk_saglik_hakki: 18 tablo vakası", () => {
  vakalariDogrula("sgk_saglik_hakki", SAGLIK_VAKALARI);
  assert.ok(SAGLIK_VAKALARI.length >= 15);
});

test("sgk_saglik_hakki: prim günü yoksa 90 gün UYDURULMAZ", () => {
  const r = calistir("sgk_saglik_hakki", { isten_cikis_tarihi: "2026-06-15" });
  assert.equal(tarihMi(r), "2026-06-25");
  assert.ok(r.uyarilar.some((u) => u.includes("şarta bağlı") || u.includes("ek süre")));
});

/* ------------------- 2) sgk_saglik_hakki_kosullari ---------------------- */

const KOSUL_VAKALARI: Vaka[] = [
  {
    ad: "4a, tam 30 prim günü → uygun",
    girdi: { son_bir_yil_prim_gun: 30 },
    sonuc: "uygun",
    dayanak: [D67],
  },
  {
    ad: "4a, 29 prim günü → uygun değil",
    girdi: { son_bir_yil_prim_gun: 29 },
    sonuc: "uygun_degil",
  },
  {
    ad: "4a, 0 prim günü → uygun değil",
    girdi: { son_bir_yil_prim_gun: 0 },
    sonuc: "uygun_degil",
  },
  {
    ad: "60g, tam 60 gün borç eşiği aşılmamış → uygun",
    girdi: { son_bir_yil_prim_gun: 40, prim_borcu_gun: 60, sigortalilik_turu: "60g" },
    sonuc: "uygun",
  },
  {
    ad: "60g, 61 gün borç → uygun değil",
    girdi: { son_bir_yil_prim_gun: 40, prim_borcu_gun: 61, sigortalilik_turu: "60g" },
    sonuc: "uygun_degil",
    kisaIcerir: "60 günden fazla borç",
  },
  {
    ad: "60g, 91 gün borç ama tecil var → uygun",
    girdi: {
      son_bir_yil_prim_gun: 40,
      prim_borcu_gun: 91,
      sigortalilik_turu: "60g",
      tecil_var: true,
    },
    sonuc: "uygun",
    uyariIcerir: ["tecil"],
  },
  {
    ad: "4b, 61 gün borç → uygun değil (m.67/1-b)",
    girdi: { son_bir_yil_prim_gun: 40, prim_borcu_gun: 61, sigortalilik_turu: "4b" },
    sonuc: "uygun_degil",
  },
  {
    ad: "4a, 200 gün borç sağlık hakkını engellemez",
    girdi: { son_bir_yil_prim_gun: 40, prim_borcu_gun: 200 },
    sonuc: "uygun",
    uyariIcerir: ["engel değildir"],
  },
  {
    ad: "4c, borç verilse de uygun",
    girdi: { son_bir_yil_prim_gun: 40, prim_borcu_gun: 500, sigortalilik_turu: "4c" },
    sonuc: "uygun",
  },
  {
    ad: "iki şart da sağlanmıyor → uygun değil",
    girdi: { son_bir_yil_prim_gun: 20, prim_borcu_gun: 61, sigortalilik_turu: "60g" },
    sonuc: "uygun_degil",
  },
  {
    ad: "prim yetersiz, borç tecilli → yine uygun değil",
    girdi: {
      son_bir_yil_prim_gun: 20,
      prim_borcu_gun: 61,
      sigortalilik_turu: "60g",
      tecil_var: true,
    },
    sonuc: "uygun_degil",
  },
  {
    ad: "60g, borç günü yok → belirsiz",
    girdi: { son_bir_yil_prim_gun: 40, sigortalilik_turu: "60g" },
    sonuc: "belirsiz",
    eksik: ["prim_borcu_gun"],
  },
  {
    ad: "60g, borç günü yok ama tecil var → uygun",
    girdi: { son_bir_yil_prim_gun: 40, sigortalilik_turu: "60g", tecil_var: true },
    sonuc: "uygun",
  },
  {
    ad: "prim günü yok → belirsiz",
    girdi: {},
    sonuc: "belirsiz",
    eksik: ["son_bir_yil_prim_gun"],
  },
  {
    ad: "negatif prim günü → belirsiz",
    girdi: { son_bir_yil_prim_gun: -1 },
    sonuc: "belirsiz",
  },
  {
    ad: "bilinmeyen sigortalılık türü → belirsiz",
    girdi: { son_bir_yil_prim_gun: 40, sigortalilik_turu: "4d" },
    sonuc: "belirsiz",
    eksik: ["sigortalilik_turu"],
  },
  {
    ad: "60g, sıfır borç → uygun",
    girdi: { son_bir_yil_prim_gun: 30, prim_borcu_gun: 0, sigortalilik_turu: "60g" },
    sonuc: "uygun",
  },
  {
    ad: "ondalık prim günü → belirsiz",
    girdi: { son_bir_yil_prim_gun: 30.5 },
    sonuc: "belirsiz",
  },
];

test("sgk_saglik_hakki_kosullari: 18 tablo vakası", () => {
  vakalariDogrula("sgk_saglik_hakki_kosullari", KOSUL_VAKALARI);
  assert.ok(KOSUL_VAKALARI.length >= 15);
});

test("sgk_saglik_hakki_kosullari: acil hâl ve iş kazası istisnası söylenir", () => {
  const r = calistir("sgk_saglik_hakki_kosullari", { son_bir_yil_prim_gun: 10 });
  assert.equal(r.sonuc, "uygun_degil");
  assert.ok(r.uyarilar.some((u) => u.includes("Acil hâller")));
  assert.ok(r.dayanak.includes(D60));
});

/* ---------------------- 3) gss_alacak_zamanasimi ------------------------ */

const ALACAK_VAKALARI: Vaka[] = [
  {
    ad: "öğrenme + 2 yıl",
    girdi: { odeme_tarihi: "2026-03-10", ogrenme_tarihi: "2026-05-01" },
    sonuc: { tarih: "2028-05-01" },
    dayanak: [D97],
  },
  {
    ad: "öğrenme yok → ödeme + 2 yıl",
    girdi: { odeme_tarihi: "2026-03-10" },
    sonuc: { tarih: "2028-03-10" },
    uyariIcerir: ["Öğrenme tarihi verilmedi"],
  },
  {
    ad: "artık yıl 29 Şubat + 2 yıl → 28 Şubat",
    girdi: { odeme_tarihi: "2024-02-29", ogrenme_tarihi: "2024-02-29" },
    sonuc: { tarih: "2026-02-28" },
  },
  {
    ad: "ay sonu 31 Ocak + 2 yıl",
    girdi: { odeme_tarihi: "2024-01-31" },
    sonuc: { tarih: "2026-01-31" },
  },
  {
    ad: "2 yıllık süre 5 yıllık sınırdan önce",
    girdi: { odeme_tarihi: "2021-01-01" },
    sonuc: { tarih: "2023-01-01" },
    uyariIcerir: ["ZAMANAŞIMI_DOLDU"],
  },
  {
    ad: "5 yıllık dış sınır talep süresinden önce → sınır uygulanır",
    girdi: { odeme_tarihi: "2020-01-01", ogrenme_tarihi: "2024-06-01" },
    sonuc: { tarih: "2025-01-01" },
    uyariIcerir: ["dış sınır"],
  },
  {
    ad: "öğrenme ödemeden önce → ödeme esas alınır",
    girdi: { odeme_tarihi: "2026-01-10", ogrenme_tarihi: "2026-01-05" },
    sonuc: { tarih: "2028-01-10" },
    uyariIcerir: ["önce olamaz"],
  },
  {
    ad: "yıl sonu 31 Aralık + 2 yıl",
    girdi: { odeme_tarihi: "2026-12-31" },
    sonuc: { tarih: "2028-12-31" },
  },
  {
    ad: "imkânsız ödeme tarihi → belirsiz",
    girdi: { odeme_tarihi: "2026-02-29" },
    sonuc: "belirsiz",
    eksik: ["odeme_tarihi"],
  },
  {
    ad: "ödeme tarihi yok → belirsiz",
    girdi: {},
    sonuc: "belirsiz",
    eksik: ["odeme_tarihi"],
  },
  {
    ad: "geçersiz öğrenme tarihi → belirsiz",
    girdi: { odeme_tarihi: "2026-03-10", ogrenme_tarihi: "2026-13-01" },
    sonuc: "belirsiz",
    eksik: ["ogrenme_tarihi"],
  },
  {
    ad: "süre dolmuş → uyarı",
    girdi: { odeme_tarihi: "2019-01-01" },
    sonuc: { tarih: "2021-01-01" },
    uyariIcerir: ["ZAMANAŞIMI_DOLDU"],
  },
  {
    ad: "son gün bugün → doldu uyarısı yok",
    girdi: { odeme_tarihi: "2024-10-22" },
    sonuc: { tarih: "2026-10-22" },
  },
  {
    ad: "öğrenme sonrası 2 yıl, dış sınır sonra",
    girdi: { odeme_tarihi: "2023-05-15", ogrenme_tarihi: "2025-09-30" },
    sonuc: { tarih: "2027-09-30" },
  },
  {
    ad: "ay sonu 30 Haziran + 2 yıl",
    girdi: { odeme_tarihi: "2026-06-30", ogrenme_tarihi: "2026-07-01" },
    sonuc: { tarih: "2028-07-01" },
  },
  {
    ad: "parametre başlangıcı 2008-10-01",
    girdi: { odeme_tarihi: "2008-10-01" },
    sonuc: { tarih: "2010-10-01" },
  },
  {
    ad: "parametre öncesi ödeme → belirsiz",
    girdi: { odeme_tarihi: "2008-09-30" },
    sonuc: "belirsiz",
    uyariIcerir: ["PARAMETRE_GECMIS_YOK"],
  },
  {
    ad: "öğrenme = ödeme tarihi",
    girdi: { odeme_tarihi: "2026-03-10", ogrenme_tarihi: "2026-03-10" },
    sonuc: { tarih: "2028-03-10" },
  },
];

test("gss_alacak_zamanasimi: 18 tablo vakası", () => {
  vakalariDogrula("gss_alacak_zamanasimi", ALACAK_VAKALARI);
  assert.ok(ALACAK_VAKALARI.length >= 15);
});

test("gss_alacak_zamanasimi: son gün bugünse ZAMANAŞIMI_DOLDU üretilmez", () => {
  const r = calistir("gss_alacak_zamanasimi", { odeme_tarihi: "2024-10-22" });
  assert.equal(tarihMi(r), "2026-10-22");
  assert.ok(!r.uyarilar.some((u) => u.includes("ZAMANAŞIMI_DOLDU")));
});

/* -------------------------- 4) gss_gelir_testi -------------------------- */

const GELIR_VAKALARI: Vaka[] = [
  {
    ad: "kişi başı tam eşik → prim borcu doğar",
    girdi: { hane_aylik_gelir_tl: 30_000, hane_kisi_sayisi: 3, asgari_ucret_brut_tl: 30_000 },
    sonuc: "prim_borcu_dogar",
    dayanak: [D60],
  },
  {
    ad: "eşiğin bir kuruş altı → kapsamda",
    girdi: { hane_aylik_gelir_tl: 29_999, hane_kisi_sayisi: 3, asgari_ucret_brut_tl: 30_000 },
    sonuc: "gelir_testi_kapsaminda",
  },
  {
    ad: "15.000 / 3 kişi, 30.000 asgari → kapsamda",
    girdi: { hane_aylik_gelir_tl: 15_000, hane_kisi_sayisi: 3, asgari_ucret_brut_tl: 30_000 },
    sonuc: "gelir_testi_kapsaminda",
  },
  {
    ad: "45.000 / 3 kişi, 30.000 asgari → prim borcu",
    girdi: { hane_aylik_gelir_tl: 45_000, hane_kisi_sayisi: 3, asgari_ucret_brut_tl: 30_000 },
    sonuc: "prim_borcu_dogar",
  },
  {
    ad: "asgari ücret verilmedi → belirsiz",
    girdi: { hane_aylik_gelir_tl: 15_000, hane_kisi_sayisi: 3 },
    sonuc: "belirsiz",
    eksik: ["asgari_ucret_brut_tl"],
  },
  {
    ad: "sıfır hane geliri → kapsamda",
    girdi: { hane_aylik_gelir_tl: 0, hane_kisi_sayisi: 4, asgari_ucret_brut_tl: 30_000 },
    sonuc: "gelir_testi_kapsaminda",
  },
  {
    ad: "tek kişi tam eşik → prim borcu",
    girdi: { hane_aylik_gelir_tl: 10_000, hane_kisi_sayisi: 1, asgari_ucret_brut_tl: 30_000 },
    sonuc: "prim_borcu_dogar",
  },
  {
    ad: "6 kişilik hane, 36.000 asgari → kapsamda",
    girdi: { hane_aylik_gelir_tl: 18_000, hane_kisi_sayisi: 6, asgari_ucret_brut_tl: 36_000 },
    sonuc: "gelir_testi_kapsaminda",
  },
  {
    ad: "hane kişi sayısı 0 → belirsiz",
    girdi: { hane_aylik_gelir_tl: 30_000, hane_kisi_sayisi: 0, asgari_ucret_brut_tl: 30_000 },
    sonuc: "belirsiz",
    eksik: ["hane_kisi_sayisi"],
  },
  {
    ad: "negatif hane kişi sayısı → belirsiz",
    girdi: { hane_aylik_gelir_tl: 30_000, hane_kisi_sayisi: -1, asgari_ucret_brut_tl: 30_000 },
    sonuc: "belirsiz",
  },
  {
    ad: "negatif hane geliri → belirsiz",
    girdi: { hane_aylik_gelir_tl: -5, hane_kisi_sayisi: 3, asgari_ucret_brut_tl: 30_000 },
    sonuc: "belirsiz",
    eksik: ["hane_aylik_gelir_tl"],
  },
  {
    ad: "gelir metin olarak verilmiş → belirsiz",
    girdi: { hane_aylik_gelir_tl: "30000", hane_kisi_sayisi: 3, asgari_ucret_brut_tl: 30_000 },
    sonuc: "belirsiz",
  },
  {
    ad: "asgari ücret 0 → belirsiz",
    girdi: { hane_aylik_gelir_tl: 30_000, hane_kisi_sayisi: 3, asgari_ucret_brut_tl: 0 },
    sonuc: "belirsiz",
    eksik: ["asgari_ucret_brut_tl"],
  },
  {
    ad: "1 TL gelir, 3 TL asgari, 1 kişi → tam eşik",
    girdi: { hane_aylik_gelir_tl: 1, hane_kisi_sayisi: 1, asgari_ucret_brut_tl: 3 },
    sonuc: "prim_borcu_dogar",
  },
  {
    ad: "2 kişilik hane, 3 TL asgari → tam eşik",
    girdi: { hane_aylik_gelir_tl: 2, hane_kisi_sayisi: 2, asgari_ucret_brut_tl: 3 },
    sonuc: "prim_borcu_dogar",
  },
  {
    ad: "7 kişilik hane, 70.000 gelir → tam eşik",
    girdi: { hane_aylik_gelir_tl: 70_000, hane_kisi_sayisi: 7, asgari_ucret_brut_tl: 30_000 },
    sonuc: "prim_borcu_dogar",
  },
  {
    ad: "100.000 / 4 kişi, 100.000 asgari → kapsamda",
    girdi: { hane_aylik_gelir_tl: 100_000, hane_kisi_sayisi: 4, asgari_ucret_brut_tl: 100_000 },
    sonuc: "gelir_testi_kapsaminda",
  },
  {
    ad: "3 TL gelir, 1 kişi, 10 TL asgari → kapsamda",
    girdi: { hane_aylik_gelir_tl: 3, hane_kisi_sayisi: 1, asgari_ucret_brut_tl: 10 },
    sonuc: "gelir_testi_kapsaminda",
  },
];

test("gss_gelir_testi: 18 tablo vakası", () => {
  vakalariDogrula("gss_gelir_testi", GELIR_VAKALARI);
  assert.ok(GELIR_VAKALARI.length >= 15);
});

test("gss_gelir_testi: asgari ücret koda gömülmez, eksik olarak raporlanır", () => {
  const r = calistir("gss_gelir_testi", { hane_aylik_gelir_tl: 15_000, hane_kisi_sayisi: 3 });
  assert.equal(r.sonuc, "belirsiz");
  assert.ok(r.eksik_girdiler.includes("asgari_ucret_brut_tl"));
  assert.ok(r.uyarilar.some((u) => u.includes("koda gömülmez")));
});

/* ------------------------- 5) gss_prim_zamanasimi ----------------------- */

const PRIM_ZAMANASIMI_VAKALARI: Vaka[] = [
  {
    ad: "30 Nisan 2026 → 31 Aralık 2036",
    girdi: { odeme_suresi_son: "2026-04-30" },
    sonuc: { tarih: "2036-12-31" },
    dayanak: [D93],
  },
  {
    ad: "31 Aralık 2025 → 31 Aralık 2035",
    girdi: { odeme_suresi_son: "2025-12-31" },
    sonuc: { tarih: "2035-12-31" },
  },
  {
    ad: "1 Ocak 2026 → 31 Aralık 2036",
    girdi: { odeme_suresi_son: "2026-01-01" },
    sonuc: { tarih: "2036-12-31" },
  },
  {
    ad: "31 Aralık 2026 → 31 Aralık 2036",
    girdi: { odeme_suresi_son: "2026-12-31" },
    sonuc: { tarih: "2036-12-31" },
  },
  {
    ad: "artık yıl 29 Şubat 2024 → 31 Aralık 2034",
    girdi: { odeme_suresi_son: "2024-02-29" },
    sonuc: { tarih: "2034-12-31" },
  },
  {
    ad: "parametre başlangıcı 2008-10-01 → 31 Aralık 2018",
    girdi: { odeme_suresi_son: "2008-10-01" },
    sonuc: { tarih: "2018-12-31" },
  },
  {
    ad: "parametre öncesi ödeme → belirsiz",
    girdi: { odeme_suresi_son: "2008-09-30" },
    sonuc: "belirsiz",
    uyariIcerir: ["PARAMETRE_GECMIS_YOK"],
  },
  {
    ad: "15 Haziran 2016 → 31 Aralık 2026",
    girdi: { odeme_suresi_son: "2016-06-15" },
    sonuc: { tarih: "2026-12-31" },
  },
  {
    ad: "31 Aralık 2015 → 31 Aralık 2025, süre dolmuş",
    girdi: { odeme_suresi_son: "2015-12-31" },
    sonuc: { tarih: "2025-12-31" },
    uyariIcerir: ["ZAMANAŞIMI_DOLDU"],
  },
  {
    ad: "31 Aralık 2016 → 31 Aralık 2026, henüz dolmadı",
    girdi: { odeme_suresi_son: "2016-12-31" },
    sonuc: { tarih: "2026-12-31" },
  },
  {
    ad: "1 Ocak 2015 → 31 Aralık 2025, süre dolmuş",
    girdi: { odeme_suresi_son: "2015-01-01" },
    sonuc: { tarih: "2025-12-31" },
    uyariIcerir: ["ZAMANAŞIMI_DOLDU"],
  },
  {
    ad: "imkânsız tarih → belirsiz",
    girdi: { odeme_suresi_son: "2026-02-30" },
    sonuc: "belirsiz",
    eksik: ["odeme_suresi_son"],
  },
  {
    ad: "tarih yok → belirsiz",
    girdi: {},
    sonuc: "belirsiz",
    eksik: ["odeme_suresi_son"],
  },
  {
    ad: "5 Mayıs 2030 → 31 Aralık 2040",
    girdi: { odeme_suresi_son: "2030-05-05" },
    sonuc: { tarih: "2040-12-31" },
  },
  {
    ad: "1 Ocak 2014 → 31 Aralık 2024, süre dolmuş",
    girdi: { odeme_suresi_son: "2014-01-01" },
    sonuc: { tarih: "2024-12-31" },
    uyariIcerir: ["ZAMANAŞIMI_DOLDU"],
  },
  {
    ad: "31 Mayıs 2026 → 31 Aralık 2036",
    girdi: { odeme_suresi_son: "2026-05-31" },
    sonuc: { tarih: "2036-12-31" },
  },
  {
    ad: "1 Haziran 2026 → 31 Aralık 2036",
    girdi: { odeme_suresi_son: "2026-06-01" },
    sonuc: { tarih: "2036-12-31" },
  },
  {
    ad: "31 Aralık 2009 → 31 Aralık 2019",
    girdi: { odeme_suresi_son: "2009-12-31" },
    sonuc: { tarih: "2019-12-31" },
  },
];

test("gss_prim_zamanasimi: 18 tablo vakası", () => {
  vakalariDogrula("gss_prim_zamanasimi", PRIM_ZAMANASIMI_VAKALARI);
  assert.ok(PRIM_ZAMANASIMI_VAKALARI.length >= 15);
});

test("gss_prim_zamanasimi: takip eden takvim yılı başından işler", () => {
  const r = calistir("gss_prim_zamanasimi", { odeme_suresi_son: "2026-04-30" });
  assert.equal(tarihMi(r), "2036-12-31");
  assert.ok(r.kisa.includes("1 Ocak 2027"));
  assert.ok(r.varsayimlar.some((u) => u.includes("takvim yılı başından")));
});

/* --------------------------- 6) issizlik_odenegi ------------------------ */

const ISSIZLIK_VAKALARI: Vaka[] = [
  {
    ad: "tam 600 prim günü → 180 gün",
    girdi: { prim_gun_sayisi: 600, son_120_gun_hizmet_akdi: true },
    sonuc: 180,
    dayanak: [D4447, D4447_51],
  },
  {
    ad: "599 prim günü → hak yok",
    girdi: { prim_gun_sayisi: 599, son_120_gun_hizmet_akdi: true },
    sonuc: "hak_yok",
  },
  {
    ad: "tam 900 prim günü → 240 gün",
    girdi: { prim_gun_sayisi: 900, son_120_gun_hizmet_akdi: true },
    sonuc: 240,
  },
  {
    ad: "899 prim günü → 180 gün",
    girdi: { prim_gun_sayisi: 899, son_120_gun_hizmet_akdi: true },
    sonuc: 180,
  },
  {
    ad: "tam 1080 prim günü → 300 gün",
    girdi: { prim_gun_sayisi: 1080, son_120_gun_hizmet_akdi: true },
    sonuc: 300,
  },
  {
    ad: "1079 prim günü → 240 gün",
    girdi: { prim_gun_sayisi: 1079, son_120_gun_hizmet_akdi: true },
    sonuc: 240,
  },
  {
    ad: "5000 prim günü → 300 gün",
    girdi: { prim_gun_sayisi: 5000, son_120_gun_hizmet_akdi: true },
    sonuc: 300,
  },
  {
    ad: "0 prim günü → hak yok",
    girdi: { prim_gun_sayisi: 0, son_120_gun_hizmet_akdi: true },
    sonuc: "hak_yok",
    uyariIcerir: ["en az 600 gün"],
  },
  {
    ad: "son 120 gün şartı sağlanmıyor → hak yok",
    girdi: { prim_gun_sayisi: 650, son_120_gun_hizmet_akdi: false },
    sonuc: "hak_yok",
    uyariIcerir: ["son 120 gün"],
  },
  {
    ad: "son 120 gün şartı verilmedi → uyarıyla hesap",
    girdi: { prim_gun_sayisi: 700 },
    sonuc: 180,
    uyariIcerir: ["şartı verilmedi"],
  },
  {
    ad: "kazanç ve asgari ücretle aylık ödenek",
    girdi: {
      prim_gun_sayisi: 700,
      son_120_gun_hizmet_akdi: true,
      son_4_ay_ortalama_gunluk_brut_kazanc_tl: 1000,
      aylik_asgari_ucret_brut_tl: 20_000,
    },
    sonuc: 180,
    onay: "teyit_bekliyor",
    kisaIcerir: "12.000,00 TL",
  },
  {
    ad: "tavan aşılınca tavan uygulanır",
    girdi: {
      prim_gun_sayisi: 900,
      son_120_gun_hizmet_akdi: true,
      son_4_ay_ortalama_gunluk_brut_kazanc_tl: 2000,
      aylik_asgari_ucret_brut_tl: 20_000,
    },
    sonuc: 240,
    uyariIcerir: ["tavanı"],
    kisaIcerir: "16.000,00 TL",
  },
  {
    ad: "asgari ücret yok → tavan hesaplanmaz",
    girdi: {
      prim_gun_sayisi: 900,
      son_120_gun_hizmet_akdi: true,
      son_4_ay_ortalama_gunluk_brut_kazanc_tl: 2000,
    },
    sonuc: 240,
    uyariIcerir: ["tavanı hesaplanmadı"],
    kisaIcerir: "24.000,00 TL",
  },
  {
    ad: "kazanç yok → aylık tutar hesaplanmaz",
    girdi: { prim_gun_sayisi: 900, son_120_gun_hizmet_akdi: true },
    sonuc: 240,
    uyariIcerir: ["kazanç verilmedi"],
  },
  {
    ad: "prim günü yok → belirsiz",
    girdi: {},
    sonuc: "belirsiz",
    eksik: ["prim_gun_sayisi"],
  },
  {
    ad: "negatif prim günü → belirsiz",
    girdi: { prim_gun_sayisi: -5 },
    sonuc: "belirsiz",
  },
  {
    ad: "ondalık prim günü → belirsiz",
    girdi: { prim_gun_sayisi: 600.5 },
    sonuc: "belirsiz",
  },
  {
    ad: "1080 prim, kazanç yok → 300 gün",
    girdi: { prim_gun_sayisi: 1080, son_120_gun_hizmet_akdi: true },
    sonuc: 300,
  },
  {
    ad: "600 prim, düşük kazanç → tavan altı ödenek",
    girdi: {
      prim_gun_sayisi: 600,
      son_120_gun_hizmet_akdi: true,
      son_4_ay_ortalama_gunluk_brut_kazanc_tl: 500,
      aylik_asgari_ucret_brut_tl: 20_000,
    },
    sonuc: 180,
    kisaIcerir: "6.000,00 TL",
  },
];

test("issizlik_odenegi: 19 tablo vakası", () => {
  vakalariDogrula("issizlik_odenegi", ISSIZLIK_VAKALARI);
  assert.ok(ISSIZLIK_VAKALARI.length >= 15);
});

test("issizlik_odenegi: aylık tutar konvansiyonu teyit bekliyor", () => {
  const r = calistir("issizlik_odenegi", {
    prim_gun_sayisi: 700,
    son_120_gun_hizmet_akdi: true,
    son_4_ay_ortalama_gunluk_brut_kazanc_tl: 1000,
    aylik_asgari_ucret_brut_tl: 20_000,
  });
  assert.equal(r.onay_durumu, "teyit_bekliyor");
  assert.ok(r.uyarilar.some((u) => u.includes("onay")));
  assert.equal(r.sonuc, 180);
});

/* -------------------------- 7) is_kazasi_bildirim ----------------------- */

const KAZA_VAKALARI: Vaka[] = [
  {
    ad: "Pazartesi kaza → Perşembe son gün",
    girdi: { kaza_tarihi: "2026-06-01" },
    sonuc: { tarih: "2026-06-04" },
    dayanak: [D13],
    uyariIcerir: ["kolluk", "Kuruma"],
  },
  {
    ad: "Cuma kaza → hafta sonu atlanır",
    girdi: { kaza_tarihi: "2026-06-05" },
    sonuc: { tarih: "2026-06-10" },
  },
  {
    ad: "Cumartesi kaza → ilk iş günlerinden sayılır",
    girdi: { kaza_tarihi: "2026-06-06" },
    sonuc: { tarih: "2026-06-10" },
  },
  {
    ad: "Kurban Bayramı'na denk kaza",
    girdi: { kaza_tarihi: "2026-05-29" },
    sonuc: { tarih: "2026-06-03" },
    onay: "teyit_bekliyor",
  },
  {
    ad: "28 Ekim yarım günü iş günü sayılır",
    girdi: { kaza_tarihi: "2026-10-27" },
    sonuc: { tarih: "2026-11-02" },
  },
  {
    ad: "Cumhuriyet Bayramı'nda kaza",
    girdi: { kaza_tarihi: "2026-10-29" },
    sonuc: { tarih: "2026-11-03" },
  },
  {
    ad: "yıl sonu kaza → yıl aşar",
    girdi: { kaza_tarihi: "2026-12-31" },
    sonuc: { tarih: "2027-01-06" },
  },
  {
    ad: "Ramazan Bayramı arifesinde kaza",
    girdi: { kaza_tarihi: "2026-03-19" },
    sonuc: { tarih: "2026-03-25" },
    onay: "teyit_bekliyor",
  },
  {
    ad: "tatil tablosu kapsamı dışı → belirsiz",
    girdi: { kaza_tarihi: "2027-12-30" },
    sonuc: "belirsiz",
    uyariIcerir: ["TATIL_TABLOSU_KAPSAM_DISI"],
  },
  {
    ad: "bildirim süresi içinde",
    girdi: { kaza_tarihi: "2026-06-01", bildirim_tarihi: "2026-06-04" },
    sonuc: { tarih: "2026-06-04" },
    uyariIcerir: ["süresi içinde"],
  },
  {
    ad: "bildirim geç → uyarı ve m.21 dayanağı",
    girdi: { kaza_tarihi: "2026-06-01", bildirim_tarihi: "2026-06-05" },
    sonuc: { tarih: "2026-06-04" },
    dayanak: [D21],
    uyariIcerir: ["GEC_BILDIRIM"],
  },
  {
    ad: "kaza günü bildirim → süresi içinde",
    girdi: { kaza_tarihi: "2026-06-01", bildirim_tarihi: "2026-06-01" },
    sonuc: { tarih: "2026-06-04" },
  },
  {
    ad: "kaza tarihi yok → belirsiz",
    girdi: {},
    sonuc: "belirsiz",
    eksik: ["kaza_tarihi"],
  },
  {
    ad: "imkânsız kaza tarihi → belirsiz",
    girdi: { kaza_tarihi: "2026-06-31" },
    sonuc: "belirsiz",
    eksik: ["kaza_tarihi"],
  },
  {
    ad: "imkânsız bildirim tarihi → belirsiz",
    girdi: { kaza_tarihi: "2026-06-01", bildirim_tarihi: "2026-02-30" },
    sonuc: "belirsiz",
    eksik: ["bildirim_tarihi"],
  },
  {
    ad: "Yılbaşı günü kaza",
    girdi: { kaza_tarihi: "2026-01-01" },
    sonuc: { tarih: "2026-01-06" },
  },
  {
    ad: "1 Mayıs'ta kaza",
    girdi: { kaza_tarihi: "2026-05-01" },
    sonuc: { tarih: "2026-05-06" },
  },
  {
    ad: "Perşembe kaza, aynı gün bildirim",
    girdi: { kaza_tarihi: "2026-06-04", bildirim_tarihi: "2026-06-04" },
    sonuc: { tarih: "2026-06-09" },
  },
  {
    ad: "31 Ağustos'ta kaza",
    girdi: { kaza_tarihi: "2026-08-31" },
    sonuc: { tarih: "2026-09-03" },
  },
  {
    ad: "bugün kaza",
    girdi: { kaza_tarihi: "2026-10-22" },
    sonuc: { tarih: "2026-10-27" },
  },
  {
    ad: "bildirim çok geç → m.21",
    girdi: { kaza_tarihi: "2026-06-01", bildirim_tarihi: "2026-06-10" },
    sonuc: { tarih: "2026-06-04" },
    uyariIcerir: ["işverenden tahsil edilir"],
  },
];

test("is_kazasi_bildirim: 21 tablo vakası", () => {
  vakalariDogrula("is_kazasi_bildirim", KAZA_VAKALARI);
  assert.ok(KAZA_VAKALARI.length >= 15);
});

test("is_kazasi_bildirim: derhal kolluk bildirimi ayrıca söylenir", () => {
  const r = calistir("is_kazasi_bildirim", { kaza_tarihi: "2026-06-01" });
  assert.equal(tarihMi(r), "2026-06-04");
  assert.ok(r.uyarilar.some((u) => u.includes("derhal yetkili kolluk")));
  assert.ok(r.uyarilar.some((u) => u.includes("1 ayı geçmemek")));
});

/* ---------------------------- 8) sgk_dava_yolu -------------------------- */

const DAVA_VAKALARI: Vaka[] = [
  { ad: "varsayılan konu", girdi: {}, sonuc: "is_mahkemesi", dayanak: [D101] },
  { ad: "prim borcu", girdi: { konu: "prim_borcu" }, sonuc: "is_mahkemesi" },
  { ad: "sağlık hakkı", girdi: { konu: "saglik_hakki" }, sonuc: "is_mahkemesi" },
  { ad: "gelir/aylık", girdi: { konu: "gelir_aylik" }, sonuc: "is_mahkemesi" },
  { ad: "iş kazası", girdi: { konu: "is_kazasi" }, sonuc: "is_mahkemesi" },
  { ad: "hizmet tespiti", girdi: { konu: "hizmet_tespiti" }, sonuc: "is_mahkemesi" },
  { ad: "diğer", girdi: { konu: "diger" }, sonuc: "is_mahkemesi" },
  {
    ad: "kuruma başvuru tarihi verilmiş",
    girdi: { konu: "prim_borcu", kuruma_basvuru_tarihi: "2026-01-15" },
    sonuc: "is_mahkemesi",
    uyariIcerir: ["sabit süre yok"],
  },
  {
    ad: "konu ve başvuru birlikte",
    girdi: { konu: "saglik_hakki", kuruma_basvuru_tarihi: "2026-05-04" },
    sonuc: "is_mahkemesi",
  },
  { ad: "bilinmeyen konu → belirsiz", girdi: { konu: "vergi" }, sonuc: "belirsiz", eksik: ["konu"] },
  {
    ad: "imkânsız başvuru tarihi → belirsiz",
    girdi: { kuruma_basvuru_tarihi: "2026-02-30" },
    sonuc: "belirsiz",
    eksik: ["kuruma_basvuru_tarihi"],
  },
  { ad: "konu sayı → belirsiz", girdi: { konu: 123 }, sonuc: "belirsiz", eksik: ["konu"] },
  {
    ad: "2008-10-01 başvuru",
    girdi: { kuruma_basvuru_tarihi: "2008-10-01" },
    sonuc: "is_mahkemesi",
  },
  {
    ad: "bugün başvuru",
    girdi: { kuruma_basvuru_tarihi: "2026-10-22" },
    sonuc: "is_mahkemesi",
  },
  { ad: "konu null → belirsiz", girdi: { konu: null }, sonuc: "belirsiz", eksik: ["konu"] },
  {
    ad: "bilinmeyen alan Zod tarafından elenir",
    girdi: { konu: "prim_borcu", bilinmeyen_alan: 1 },
    sonuc: "is_mahkemesi",
  },
  {
    ad: "kısa yazılmış tarih → belirsiz",
    girdi: { kuruma_basvuru_tarihi: "2026-1-5" },
    sonuc: "belirsiz",
    eksik: ["kuruma_basvuru_tarihi"],
  },
  {
    ad: "başvuru tarihi parametre öncesi de kabul edilir (süre hesabı yok)",
    girdi: { konu: "is_kazasi", kuruma_basvuru_tarihi: "2008-09-30" },
    sonuc: "is_mahkemesi",
  },
];

test("sgk_dava_yolu: 18 tablo vakası", () => {
  vakalariDogrula("sgk_dava_yolu", DAVA_VAKALARI);
  assert.ok(DAVA_VAKALARI.length >= 15);
});

test("sgk_dava_yolu: sabit dava açma süresi UYDURULMAZ", () => {
  const r = calistir("sgk_dava_yolu", { konu: "prim_borcu" });
  assert.equal(r.sonuc, "is_mahkemesi");
  assert.ok(r.uyarilar.some((u) => u.includes("sabit bir dava açma süresi")));
  assert.ok(!r.kisa.includes("gün"));
  assert.equal(r.parametre_surumu, "kanun-5510-m101.1");
  assert.equal(r.onay_durumu, "teyit_bekliyor");
  assert.ok(r.uyarilar.some((u) => u.includes("ONAY_BEKLIYOR")));
});

/* --------------------------- ortak sözleşmeler -------------------------- */

test("ORNEK_GIRDI: SGK kuralları belirsiz olmayan, tek cümlelik kısa yanıt üretir", () => {
  assert.equal(Object.keys(ORNEK_GIRDI).length, 16);
  const sgkIdleri = [
    "sgk_saglik_hakki",
    "sgk_saglik_hakki_kosullari",
    "gss_alacak_zamanasimi",
    "gss_gelir_testi",
    "gss_prim_zamanasimi",
    "issizlik_odenegi",
    "is_kazasi_bildirim",
    "sgk_dava_yolu",
  ];
  for (const id of sgkIdleri) {
    const r = kuralCalistir(id, ORNEK_GIRDI[id], VARSAYILAN_OKUYUCU, BUGUN);
    assert.notEqual(r.sonuc, "belirsiz", `${id}: ${r.uyarilar.join(" | ")}`);
    assert.ok(r.kisa.length > 0, `${id}: kisa boş`);
    assert.ok(
      r.kisa.trim().split(/\s+/).length <= 40,
      `${id}: kisa 40 token'ı aşıyor (${r.kisa})`,
    );
    assert.ok(!r.kisa.trim().slice(0, -1).includes(". "), `${id}: kisa tek cümle değil`);
    for (const alan of ["dayanak", "varsayimlar", "eksik_girdiler", "uyarilar"] as const) {
      assert.ok(Array.isArray(r[alan]), `${id}: ${alan} dizi değil`);
    }
    assert.ok(r.parametre_surumu.length > 0, `${id}: parametre_surumu boş`);
  }
});

test("parametre yokluğu: 7 SGK kuralı PARAMETRE_* uyarısıyla belirsiz döner", () => {
  const bos = new StatikParametreOkuyucu([]);
  const parametreli = [
    "sgk_saglik_hakki",
    "sgk_saglik_hakki_kosullari",
    "gss_alacak_zamanasimi",
    "gss_gelir_testi",
    "gss_prim_zamanasimi",
    "issizlik_odenegi",
    "is_kazasi_bildirim",
  ];
  for (const id of parametreli) {
    const r = kuralCalistir(id, ORNEK_GIRDI[id], bos, BUGUN);
    assert.equal(r.sonuc, "belirsiz", `${id}: parametresiz sonuç belirsiz değil`);
    assert.ok(
      r.uyarilar.some((u) => u.includes("PARAMETRE_")),
      `${id}: PARAMETRE_* uyarısı yok -> ${JSON.stringify(r.uyarilar)}`,
    );
  }
});

test("SGK parametre satırları: tarihli, kaynaklı ve uzman onaylı", () => {
  const sgkIdleri = new Set([
    "sgk_saglik_hakki",
    "sgk_saglik_hakki_kosullari",
    "gss_alacak_zamanasimi",
    "gss_gelir_testi",
    "gss_prim_zamanasimi",
    "issizlik_odenegi",
    "is_kazasi_bildirim",
  ]);
  const satirlar = KAYITLAR.filter((k) => sgkIdleri.has(k.kural_id));
  assert.equal(satirlar.length, 21, "SGK parametre satırı sayısı 21 olmalı");
  for (const k of satirlar) {
    assert.match(k.gecerlilik_bas, /^\d{4}-\d{2}-\d{2}$/, `${k.kural_id}/${k.anahtar}`);
    assert.equal(k.gecerlilik_bit, null, `${k.kural_id}/${k.anahtar}: bit null olmalı`);
    assert.ok(
      k.kaynak_url.startsWith("https://www.mevzuat.gov.tr/"),
      `${k.kural_id}/${k.anahtar}: kaynak mevzuat.gov.tr değil`,
    );
    assert.ok(k.surum.startsWith("sgk-"), `${k.kural_id}/${k.anahtar}: sürüm adı anlamsız`);
  }
  const gssOn = satirlar.find(
    (k) => k.kural_id === "gss_prim_zamanasimi" && k.anahtar === "zamanaşımı_yil",
  );
  assert.ok(gssOn, "gss_prim_zamanasimi/zamanaşımı_yil satırı yok");
  assert.equal(gssOn?.deger, 10);
  assert.equal(gssOn?.durum, "uzman_onayli");

  const ayGun = satirlar.find(
    (k) => k.kural_id === "issizlik_odenegi" && k.anahtar === "ay_gun",
  );
  assert.equal(ayGun?.durum, "teyit_bekliyor", "ay_gun konvansiyonu teyit beklemeli");

  const gecBildirim = satirlar.find(
    (k) => k.kural_id === "is_kazasi_bildirim" && k.anahtar === "kendi_adina_gec_bildirim_ay",
  );
  assert.ok(gecBildirim, "kendi_adina_gec_bildirim_ay satırı yok");
  assert.equal(gecBildirim?.deger, 1);
  assert.ok(
    !satirlar.some((k) => k.anahtar === "isveren_gec_bildirim_ay"),
    "eski isveren_gec_bildirim_ay anahtarı kalmamalı",
  );
});

test("SGK kuralları: parametre sürümü sonuca yansır", () => {
  const r = calistir("sgk_saglik_hakki", {
    isten_cikis_tarihi: "2026-06-15",
    son_bir_yil_prim_gun: 120,
  });
  assert.match(r.parametre_surumu, /sgk-5510-m67/);
  assert.equal(r.onay_durumu, "uzman_onayli");

  const k = calistir("is_kazasi_bildirim", { kaza_tarihi: "2026-06-01" });
  assert.equal(k.onay_durumu, "uzman_onayli");
  assert.match(k.parametre_surumu, /sgk-5510-m13/);
});

