/**
 * Kural — işsizlik ödeneği süresi ve aylık tutarı (4447 m.50–51).
 *
 * 4447 m.50 (5763 sayılı Kanun'la değişik, yürürlük 26/5/2008):
 *  - Günlük işsizlik ödeneği, son dört aylık prime esas kazançlara göre
 *    hesaplanan günlük ortalama brüt kazancın YÜZDE KIRKIDIR.
 *  - Bu tutar, 16 yaşından büyük işçiler için uygulanan aylık asgari ücretin
 *    brüt tutarının YÜZDE SEKSENİNİ geçemez.
 *  - Son 120 gün hizmet akdine tabi olanlardan son üç yıl içinde 600 gün primi
 *    olana 180 gün, 900 güne 240 gün, 1080 güne 300 gün ödenek verilir.
 *
 * Eşikler, süreler ve oranlar `kural_parametre` satırlarından okunur. Aylık
 * tutar yalnızca kazanç bilgisi verildiğinde hesaplanır; asgari ücret de koda
 * gömülmez, çağırandan gelir.
 */
import { z } from "zod";
import type { KuralSonucu } from "@hukuk/schema";
import type { Kural, OnayDurumu, ParametreOkuyucu } from "../types.ts";
import {
  belirsizSonuc,
  eksikGirdiSonucu,
  enZayifOnay,
  parametreOku,
  parametreUyarisi,
  sonucOlustur,
  surumBirlestir,
} from "../parametre.ts";
import { isoGecerliMi } from "../tarih.ts";
import { tlYaz, zodEksikleri } from "./ortak.ts";

const KURAL_ID = "issizlik_odenegi";

const Semasi = z.object({
  /** Son üç yıl içinde işsizlik sigortası primi ödenmiş gün sayısı. */
  prim_gun_sayisi: z.number().int().nonnegative(),
  /** Hizmet akdi sona ermeden önceki son 120 gün içinde hizmet akdine tabi mi? */
  son_120_gun_hizmet_akdi: z.boolean().optional(),
  /** Son dört aylık prime esas kazançlara göre ortalama GÜNLÜK brüt kazanç (TL). */
  son_4_ay_ortalama_gunluk_brut_kazanc_tl: z.number().finite().positive().optional(),
  /** Doğrulanmış brüt aylık asgari ücret (TL); koda gömülmez. */
  aylik_asgari_ucret_brut_tl: z.number().finite().positive().optional(),
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK = ["m:4447/50@2008-05-26", "m:4447/51@2008-05-26"];
const KANUN_SURUMU = "kanun-4447-m50-51.1";

export function uygula(g: Girdi, p: ParametreOkuyucu, bugun: string): KuralSonucu {
  const tarih = isoGecerliMi(bugun) ? bugun : "2008-05-26";
  const uyarilar: string[] = [];
  const hatalar: string[] = [];
  const surumler = new Set<string>();
  const durumlar: OnayDurumu[] = [];

  const oku = (anahtar: string, etiket: string): number | null => {
    const s = parametreOku(p, KURAL_ID, anahtar, tarih);
    if (!s.ok) {
      hatalar.push(`${s.kod}: ${s.mesaj}`);
      return null;
    }
    if (typeof s.kayit.deger !== "number" || !Number.isFinite(s.kayit.deger)) {
      hatalar.push(`PARAMETRE_TIPI_HATALI: ${KURAL_ID}/${anahtar} sayı değil.`);
      return null;
    }
    surumler.add(s.kayit.surum);
    durumlar.push(s.kayit.durum);
    const u = parametreUyarisi(etiket, s.kayit);
    if (u) uyarilar.push(u);
    return s.kayit.deger;
  };

  const sonHizmetGun = oku("son_hizmet_gun", "Son hizmet akdi süresi");
  const esik180 = oku("asgari_prim_gun_180", "En kısa ödenek süresi için prim eşiği");
  const esik240 = oku("asgari_prim_gun_240", "Orta ödenek süresi için prim eşiği");
  const esik300 = oku("asgari_prim_gun_300", "En uzun ödenek süresi için prim eşiği");
  const sure180 = oku("sure_180", "En kısa ödenek süresi");
  const sure240 = oku("sure_240", "Orta ödenek süresi");
  const sure300 = oku("sure_300", "En uzun ödenek süresi");

  if (
    sonHizmetGun === null ||
    esik180 === null ||
    esik240 === null ||
    esik300 === null ||
    sure180 === null ||
    sure240 === null ||
    sure300 === null
  ) {
    return belirsizSonuc({
      kisa: "İşsizlik ödeneği süreleri parametre tablosundan okunamadı; sonuç üretilmedi.",
      dayanak: DAYANAK,
      uyarilar: [...uyarilar, ...hatalar],
      parametre_surumu: surumBirlestir([...surumler]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  const kademeler = [
    { esik: esik180, sure: sure180 },
    { esik: esik240, sure: sure240 },
    { esik: esik300, sure: sure300 },
  ].sort((a, b) => b.esik - a.esik);
  const enDusukEsik = kademeler[kademeler.length - 1]?.esik ?? esik180;
  const uygun = kademeler.find((k) => g.prim_gun_sayisi >= k.esik) ?? null;

  let sure: number | null = null;
  if (g.son_120_gun_hizmet_akdi === false) {
    uyarilar.push(
      `m.50/2: hizmet akdi sona ermeden önceki son ${sonHizmetGun} gün hizmet akdine tabi olma ` +
        `şartı sağlanmıyor; işsizlik ödeneği doğmaz.`,
    );
  } else if (uygun === null) {
    uyarilar.push(
      `m.50/2: son üç yıl içinde ${g.prim_gun_sayisi} prim günü var; en az ${enDusukEsik} gün ` +
        `gerektiğinden ödenek doğmaz.`,
    );
  } else {
    sure = uygun.sure;
  }

  if (g.son_120_gun_hizmet_akdi === undefined) {
    uyarilar.push(
      `m.50/2: son ${sonHizmetGun} gün hizmet akdine tabi olma şartı verilmedi; prim gününe göre ` +
        `hesap yapıldı, bu şart ayrıca doğrulanmalıdır.`,
    );
  }

  let aylik: number | null = null;
  let tavan: number | null = null;
  let odenecek: number | null = null;

  if (sure !== null && g.son_4_ay_ortalama_gunluk_brut_kazanc_tl !== undefined) {
    const oran = oku("kazanc_orani", "Ödenek oranı");
    const ayGun = oku("ay_gun", "Aylık gün sayısı konvansiyonu");
    if (oran !== null && ayGun !== null) {
      aylik = g.son_4_ay_ortalama_gunluk_brut_kazanc_tl * oran * ayGun;
      odenecek = aylik;
      if (g.aylik_asgari_ucret_brut_tl !== undefined) {
        const tavanOran = oku("tavan_orani", "Tavan oranı");
        if (tavanOran !== null) {
          tavan = g.aylik_asgari_ucret_brut_tl * tavanOran;
          odenecek = Math.min(aylik, tavan);
          if (aylik > tavan) {
            uyarilar.push(
              `m.50/1: hesaplanan aylık ödenek ${tlYaz(aylik)} tavanı (${tlYaz(tavan)}) aştığı ` +
                `için tavan tutarı uygulandı.`,
            );
          }
        }
      } else {
        uyarilar.push(
          "Brüt asgari ücret verilmedi; ödenek tavanı hesaplanmadı. Asgari ücret güncel tutarı koda gömülmez.",
        );
      }
    }
  } else if (sure !== null) {
    uyarilar.push(
      "Son dört aya ait ortalama günlük brüt kazanç verilmedi; aylık ödenek tutarı hesaplanmadı.",
    );
  }

  if (hatalar.length > 0) {
    return belirsizSonuc({
      kisa: "İşsizlik ödeneği tutarı için parametre okunamadı; sonuç üretilmedi.",
      dayanak: DAYANAK,
      uyarilar: [...uyarilar, ...hatalar],
      parametre_surumu: surumBirlestir([...surumler]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  let kisa: string;
  if (sure === null) {
    kisa =
      g.son_120_gun_hizmet_akdi === false
        ? `Son ${sonHizmetGun} gün hizmet akdi şartı sağlanmadığından işsizlik ödeneği doğmaz.`
        : `Son üç yılda ${g.prim_gun_sayisi} prim günü var; işsizlik ödeneği için en az ` +
          `${enDusukEsik} gün gerektiğinden ödenek doğmaz.`;
  } else if (odenecek !== null) {
    kisa =
      `Son üç yılda ${g.prim_gun_sayisi} prim gününe karşılık ${sure} gün işsizlik ödeneği; ` +
      `aylık ödenek ${tlYaz(odenecek)}` +
      (tavan !== null ? ` (tavan ${tlYaz(tavan)}).` : ".");
  } else {
    kisa =
      `Son üç yılda ${g.prim_gun_sayisi} prim gününe karşılık ${sure} gün işsizlik ödeneği ` +
      `hesaplandı; aylık tutar için kazanç bilgisi gerekli.`;
  }

  return sonucOlustur({
    sonuc: sure === null ? "hak_yok" : sure,
    kisa,
    dayanak: DAYANAK,
    varsayimlar: [
      "Prim gün sayısı, son üç yıl içinde işsizlik sigortası primi ödenmiş günlerdir (m.50/2).",
      "Aylık ödenek, günlük ortalama brüt kazanç × ödenek oranı × aylık gün sayısı ile hesaplanır (m.50/1).",
      "Hak sahipliği ayrıca hizmet akdinin m.51'deki hâllerden biriyle sona ermesine ve süresinde başvuruya bağlıdır; bu kural yalnızca prim günü, süre ve tutar hesabı yapar.",
    ],
    uyarilar,
    parametre_surumu: surumBirlestir([...surumler]),
    onay_durumu: enZayifOnay(durumlar),
  });
}

export const issizlikOdenegi: Kural<Girdi> = {
  id: KURAL_ID,
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: KURAL_ID }, zodEksikleri(hata), DAYANAK, KANUN_SURUMU);
}
