/**
 * Tarihli parametre tablosu (`kural_parametre` satırlarının bellekteki eşi).
 *
 * Her satırda `kaynak_url` + `durum` zorunludur. Kural:
 *  - `uzman_onayli`: resmî kaynak SAYIYI doğrudan yazıyor.
 *  - `teyit_bekliyor`: sayı türetilmiş (örn. reeskont oranının %80'i) veya
 *    resmî metin sayıyı doğrudan göstermiyor.
 *
 * 2023–2026 hakem heyeti sınırları Resmî Gazete tebliğleriyle doğrulandı:
 *  2023: 66.000 TL — RG 16/12/2022, 32045
 *  2024: 104.000 TL — RG 20/12/2023, 32405
 *  2025: 149.000 TL — RG 20/12/2024, 32758
 *  2026: 186.000 TL — RG 23/12/2025, 33116
 * 7392 sayılı Kanun (1/10/2022) il/ilçe/büyükşehir şeklindeki üç kademeli
 * parasal yapıyı kaldırdı; 2023'ten itibaren TEK eşik vardır ve il/ilçe heyeti
 * ayrımı parasal değil coğrafî/idarîdir (Tebliğ m.4).
 */
import type { OnayDurumu, ParametreKaydi } from "./types.ts";
import { StatikParametreOkuyucu } from "./parametre.ts";

export const PARAMETRE_SURUMU = "kural-parametre-2026.2";

const RG = {
  hakem2023:
    "https://tuketici.ticaret.gov.tr/haberler/tuketici-hakem-heyetlerine-basvurularda-2023-yili-parasal-degerleri-yeniden-belirlendi",
  hakem2024: "https://www.resmigazete.gov.tr/eskiler/2023/12/20231220-3.htm",
  hakem2025: "https://www.resmigazete.gov.tr/eskiler/2024/12/20241220-2.htm",
  hakem2026: "https://www.resmigazete.gov.tr/eskiler/2025/12/20251223-5.htm",
  kanun6502: "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6502.htm",
  kanun3095: "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.3095.htm",
  tcmbReeskont:
    "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Reeskont+ve+Avans+Faiz+Oranlari",
  arabuluculuk7446: "https://www.resmigazete.gov.tr/eskiler/2023/03/20230301-1.htm",
  mesafeliYonetmelik:
    "https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=7&MevzuatNo=19689&MevzuatTertip=5",
  kanun5510: "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5510.htm",
  kanun4447: "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.4447.htm",
} as const;

/**
 * SGK kural parametresi üretir. Tüm SGK değerleri kanun metninde sayıyı
 * doğrudan yazdığı için varsayılan durum `uzman_onayli`dır; türetilmiş/
 * konvansiyonel değerler (`ay_gun`) açıkça `teyit_bekliyor` işaretlenir.
 * `gecerlilik_bit` null = kanunda değişiklik olmadıkça açık uçlu.
 */
function sgk(
  kural_id: string,
  anahtar: string,
  deger: unknown,
  gecerlilik_bas: string,
  surum: string,
  kaynak_url: string,
  durum: OnayDurumu = "uzman_onayli",
): ParametreKaydi {
  return {
    kural_id,
    anahtar,
    deger,
    gecerlilik_bas,
    gecerlilik_bit: null,
    kaynak_url,
    durum,
    surum,
  };
}

function hakemSinir(yil: number, deger: number, kaynak_url: string): ParametreKaydi {
  return {
    kural_id: "gorevli_merci",
    anahtar: "hakem_heyeti_ust_sinir",
    deger,
    gecerlilik_bas: `${yil}-01-01`,
    gecerlilik_bit: `${yil}-12-31`,
    kaynak_url,
    durum: "uzman_onayli",
    surum: `hakem-sinir-${yil}.1`,
  };
}

function avansOran(tarih: string, deger: number, bit: string | null = null): ParametreKaydi {
  return {
    kural_id: "yasal_faiz",
    anahtar: "avans_oran",
    deger,
    gecerlilik_bas: tarih,
    gecerlilik_bit: bit,
    kaynak_url: RG.tcmbReeskont,
    durum: "uzman_onayli",
    surum: "faiz-tcmb-avans-2026.1",
  };
}

export const KAYITLAR: readonly ParametreKaydi[] = Object.freeze([
  /* ----------------------- 6502 m.68 — görevli merci ---------------------- */
  hakemSinir(2023, 66_000, RG.hakem2023),
  hakemSinir(2024, 104_000, RG.hakem2024),
  hakemSinir(2025, 149_000, RG.hakem2025),
  hakemSinir(2026, 186_000, RG.hakem2026),
  {
    // Kanun metnindeki taban rakam; operasyonel eşik yıllık Tebliğ ile değişir.
    kural_id: "gorevli_merci",
    anahtar: "kanun_temel_sinir",
    deger: 30_000,
    gecerlilik_bas: "2022-10-01",
    gecerlilik_bit: "2026-12-31",
    kaynak_url: RG.kanun6502,
    durum: "teyit_bekliyor",
    surum: "hakem-kanun-taban-2022.1",
  },

  /* --------------------------- 6502 m.73/A ------------------------------- */
  {
    kural_id: "arabuluculuk_dava_sarti",
    anahtar: "yururluk_bas",
    deger: "2023-09-01",
    gecerlilik_bas: "2023-09-01",
    gecerlilik_bit: null,
    kaynak_url: RG.arabuluculuk7446,
    durum: "teyit_bekliyor",
    surum: "arabuluculuk-7446.1",
  },

  /* --------------------- Mesafeli sözleşme — cayma ------------------------ */
  {
    kural_id: "cayma_suresi",
    anahtar: "sure_gun",
    deger: 14,
    gecerlilik_bas: "2014-05-28",
    gecerlilik_bit: null,
    kaynak_url: RG.kanun6502,
    durum: "teyit_bekliyor",
    surum: "cayma-6502-m48.1",
  },

  /* ---------------------------- 3095 — faiz ------------------------------ */
  {
    // 5335 sayılı Kanun'la 2005'ten itibaren sabit oran. 7589 (31/7/2026)
    // yürürlüğe girene kadar uygulanır.
    kural_id: "yasal_faiz",
    anahtar: "kanuni_oran",
    deger: 9,
    gecerlilik_bas: "2005-05-01",
    gecerlilik_bit: "2026-07-30",
    kaynak_url: RG.kanun3095,
    durum: "teyit_bekliyor",
    surum: "faiz-3095-m1-9.1",
  },
  {
    // 7589/10 md. (RG 16/7/2026, yürürlük 31/7/2026): reeskont oranının %80'i.
    // 31.12.2025 reeskont oranı %38,75 → %31,00. TÜRETİLMİŞ değer.
    kural_id: "yasal_faiz",
    anahtar: "kanuni_oran",
    deger: 31,
    gecerlilik_bas: "2026-07-31",
    gecerlilik_bit: "2026-12-31",
    kaynak_url: RG.tcmbReeskont,
    durum: "teyit_bekliyor",
    surum: "faiz-3095-m1-7589.1",
  },
  {
    // 7589/10 md. çarpanı: reeskont oranının yüzde seksen i.
    kural_id: "yasal_faiz",
    anahtar: "kanuni_oran_carpani",
    deger: 0.8,
    gecerlilik_bas: "2026-07-31",
    gecerlilik_bit: "2026-12-31",
    kaynak_url: RG.kanun3095,
    durum: "uzman_onayli",
    surum: "faiz-3095-m1-7589.1",
  },
  {
    kural_id: "yasal_faiz",
    anahtar: "reeskont_oran",
    deger: 38.75,
    gecerlilik_bas: "2025-12-20",
    gecerlilik_bit: "2026-12-31",
    kaynak_url: RG.tcmbReeskont,
    durum: "uzman_onayli",
    surum: "faiz-tcmb-reeskont-2026.1",
  },
  // TCMB kısa vadeli avans faizi (3095 m.2/2 ticari temerrüt karşılaştırması).
  avansOran("2016-12-31", 9.75),
  avansOran("2018-06-29", 19.5),
  avansOran("2019-10-11", 18.25),
  avansOran("2019-12-21", 13.75),
  avansOran("2020-06-13", 10),
  avansOran("2020-12-19", 16.75),
  avansOran("2021-12-31", 15.75),
  avansOran("2022-12-31", 10.75),
  avansOran("2023-06-24", 16.75),
  avansOran("2023-09-01", 26.75),
  avansOran("2023-09-28", 31.75),
  avansOran("2023-11-01", 36.75),
  avansOran("2023-12-01", 41.75),
  avansOran("2023-12-23", 44.25),
  avansOran("2024-04-01", 51.75),
  avansOran("2024-12-28", 49.25),
  avansOran("2025-03-08", 44.25),
  avansOran("2025-09-17", 42.25),
  avansOran("2025-12-20", 39.75, "2026-12-31"),

  /* ------------- 6502 m.12 — ayıplı malda süreler (kanun metni) ------------ */
  // m.12/1: taşınırda iki, konut/tatil amaçlı taşınmazda beş yıllık zamanaşımı.
  // m.12/2: ikinci elde taban bir yıl, konutta üç yıl.
  ...[
    ["temel_sure_yil", 2],
    ["konut_sure_yil", 5],
    ["ikinci_el_taban_yil", 1],
    ["konut_ikinci_el_taban_yil", 3],
  ].map(([anahtar, deger]): ParametreKaydi => ({
    kural_id: "ayip_zamanasimi",
    anahtar: String(anahtar),
    deger: Number(deger),
    gecerlilik_bas: "2014-05-28",
    gecerlilik_bit: null,
    kaynak_url: RG.kanun6502,
    durum: "uzman_onayli",
    surum: "ayip-6502-m12.1",
  })),
  // m.11/4: onarım/değişim en çok otuz iş günü, konutta altmış iş günü.
  {
    kural_id: "ayip_zamanasimi",
    anahtar: "onarim_is_gunu",
    deger: 30,
    gecerlilik_bas: "2014-05-28",
    gecerlilik_bit: null,
    kaynak_url: RG.kanun6502,
    durum: "uzman_onayli",
    surum: "ayip-6502-m11-4.1",
  },
  {
    kural_id: "ayip_zamanasimi",
    anahtar: "onarim_is_gunu_konut",
    deger: 60,
    gecerlilik_bas: "2014-05-28",
    gecerlilik_bit: null,
    kaynak_url: RG.kanun6502,
    durum: "uzman_onayli",
    surum: "ayip-6502-m11-4.1",
  },
  {
    // Hesap konvansiyonu: yıllık oranın günlük karşılığı.
    kural_id: "yasal_faiz",
    anahtar: "yil_gun_sayisi",
    deger: 365,
    gecerlilik_bas: "1984-12-19",
    gecerlilik_bit: null,
    kaynak_url: RG.kanun3095,
    durum: "teyit_bekliyor",
    surum: "faiz-gun-konvansiyonu.1",
  },

  /* ============================ SGK / GSS ============================== */
  // 5510 sayılı Kanun 5754 sayılı Kanun'la değişik; anılan maddeler 1/10/2008'de
  // yürürlüğe girdi. 4447 m.50 ise 5763 sayılı Kanun'la değişik hâliyle
  // 26/5/2008'den itibaren uygulanır.

  /* ------------------ 5510 m.67 — işten ayrılma sonrası ----------------- */
  // m.67: on gün temel süre; son bir yılda doksan gün zorunlu sigortalılık
  // varsa doksan gün ek süre.
  sgk("sgk_saglik_hakki", "temel_gun", 10, "2008-10-01", "sgk-5510-m67-10.1", RG.kanun5510),
  sgk("sgk_saglik_hakki", "ek_gun", 90, "2008-10-01", "sgk-5510-m67-90.1", RG.kanun5510),
  sgk(
    "sgk_saglik_hakki",
    "ek_gun_kosul_prim_gun",
    90,
    "2008-10-01",
    "sgk-5510-m67-90.1",
    RG.kanun5510,
  ),

  /* ------------------ 5510 m.67 — müstehaklık şartları ------------------ */
  // m.67/1-a: son bir yılda toplam otuz gün GSS prim ödeme gün sayısı.
  // m.67/1-b: 60/1-a-2 ve 60/1-g için altmış günden fazla borç engeli.
  sgk(
    "sgk_saglik_hakki_kosullari",
    "asgari_prim_gun",
    30,
    "2008-10-01",
    "sgk-5510-m67-30.1",
    RG.kanun5510,
  ),
  sgk(
    "sgk_saglik_hakki_kosullari",
    "azami_borc_gun",
    60,
    "2008-10-01",
    "sgk-5510-m67-60.1",
    RG.kanun5510,
  ),

  /* ------------------- 5510 m.97 — GSS alacağı zamanaşımı ----------------- */
  // m.97: öğrenmeden itibaren iki yıl; olay tarihinden itibaren beş yıl.
  sgk(
    "gss_alacak_zamanasimi",
    "talep_sure_yil",
    2,
    "2008-10-01",
    "sgk-5510-m97-2.1",
    RG.kanun5510,
  ),
  sgk(
    "gss_alacak_zamanasimi",
    "dusme_sure_yil",
    5,
    "2008-10-01",
    "sgk-5510-m97-5.1",
    RG.kanun5510,
  ),

  /* --------------------- 5510 m.60 — gelir testi eşiği ------------------- */
  // m.60/1-c-1: kişi başı aylık gelir asgari ücretin üçte birinden az ise GSS.
  sgk(
    "gss_gelir_testi",
    "gelir_esik_pay",
    { pay: 1, payda: 3 },
    "2008-10-01",
    "sgk-5510-m60-1-3.1",
    RG.kanun5510,
  ),

  /* ----------------- 5510 m.93 — prim alacağı zamanaşımı ---------------- */
  // m.93/2: ödeme süresini takip eden takvim yılı başından on yıl.
  sgk(
    "gss_prim_zamanasimi",
    "zamanaşımı_yil",
    10,
    "2008-10-01",
    "sgk-5510-m93-10.1",
    RG.kanun5510,
  ),

  /* ------------------ 4447 m.50 — işsizlik ödeneği ---------------------- */
  // m.50/2: son 120 gün hizmet akdine tabi olma; 600/900/1080 gün → 180/240/300.
  sgk("issizlik_odenegi", "son_hizmet_gun", 120, "2008-05-26", "sgk-4447-m50-120.1", RG.kanun4447),
  sgk(
    "issizlik_odenegi",
    "asgari_prim_gun_180",
    600,
    "2008-05-26",
    "sgk-4447-m50-600.1",
    RG.kanun4447,
  ),
  sgk(
    "issizlik_odenegi",
    "asgari_prim_gun_240",
    900,
    "2008-05-26",
    "sgk-4447-m50-900.1",
    RG.kanun4447,
  ),
  sgk(
    "issizlik_odenegi",
    "asgari_prim_gun_300",
    1080,
    "2008-05-26",
    "sgk-4447-m50-1080.1",
    RG.kanun4447,
  ),
  sgk("issizlik_odenegi", "sure_180", 180, "2008-05-26", "sgk-4447-m50-180.1", RG.kanun4447),
  sgk("issizlik_odenegi", "sure_240", 240, "2008-05-26", "sgk-4447-m50-240.1", RG.kanun4447),
  sgk("issizlik_odenegi", "sure_300", 300, "2008-05-26", "sgk-4447-m50-300.1", RG.kanun4447),
  // m.50/1: günlük ödenek, günlük ortalama brüt kazancın yüzde kırkı.
  sgk(
    "issizlik_odenegi",
    "kazanc_orani",
    0.4,
    "2008-05-26",
    "sgk-4447-m50-40.1",
    RG.kanun4447,
  ),
  // m.50/1: ödenek, brüt asgari ücretin yüzde seksenini geçemez.
  sgk(
    "issizlik_odenegi",
    "tavan_orani",
    0.8,
    "2008-05-26",
    "sgk-4447-m50-80.1",
    RG.kanun4447,
  ),
  // Aylık tutar konvansiyonu (günlük × 30); kanun metninde sayı yazmıyor.
  sgk(
    "issizlik_odenegi",
    "ay_gun",
    30,
    "2008-05-26",
    "sgk-4447-m50-ay-30.1",
    RG.kanun4447,
    "teyit_bekliyor",
  ),

  /* ------------------- 5510 m.13 — iş kazası bildirimi ------------------ */
  // m.13/2-a: kolluğa derhal, Kuruma en geç üç işgünü içinde.
  // m.13/2-b: kendi adına çalışan (4/b) için bir ayı geçmemek üzere üç işgünü.
  sgk(
    "is_kazasi_bildirim",
    "bildirim_is_gunu",
    3,
    "2008-10-01",
    "sgk-5510-m13-3.1",
    RG.kanun5510,
  ),
  sgk(
    "is_kazasi_bildirim",
    "kendi_adina_gec_bildirim_ay",
    1,
    "2008-10-01",
    "sgk-5510-m13-1ay.1",
    RG.kanun5510,
  ),
] satisfies ParametreKaydi[]);

/** Varsayılan (bellek içi) okuyucu. DB'den gelen aynı satırlarla eşdeğerdir. */
export const VARSAYILAN_OKUYUCU = new StatikParametreOkuyucu(KAYITLAR);
