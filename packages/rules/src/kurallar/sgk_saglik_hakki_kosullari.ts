/**
 * Kural — sağlık hizmetinden yararlanma şartları / provizyon (5510 m.67).
 *
 * 5510 m.67/1 (5754 sayılı Kanun'la değişik, yürürlük 1/10/2008):
 *  a) Başvurudan önceki son bir yıl içinde toplam OTUZ GÜN GSS prim ödeme gün
 *     sayısı bulunmalıdır.
 *  b) 60/1-a-2 (4/b) ve 60/1-g kapsamındakiler için ayrıca, 6183 sayılı Kanun
 *     m.48 uyarınca tecil/taksitlendirmesi devam edenler hariç, ALTMIŞ GÜNDEN
 *     FAZLA prim ve prime ilişkin borç bulunmamalıdır.
 *  c) 60/1-b ve (d) kapsamındakiler için hiçbir prim borcu bulunmamalıdır;
 *     bu kural v1'de ayrıca ele alınmaz.
 *
 * Eşikler `kural_parametre` satırlarından okunur; kodda çıplak süre yoktur.
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
import { isoGecerliMi, tarihYaz } from "../tarih.ts";
import { IsoTarih, zodEksikleri } from "./ortak.ts";

const KURAL_ID = "sgk_saglik_hakki_kosullari";

const Semasi = z.object({
  /** Başvurudan önceki son bir yıl içindeki GSS prim ödeme gün sayısı. */
  son_bir_yil_prim_gun: z.number().int().nonnegative(),
  /** Sağlık hizmeti sunucusuna başvuru tarihindeki prim ve prime ilişkin borç (gün). */
  prim_borcu_gun: z.number().int().nonnegative().optional(),
  sigortalilik_turu: z.enum(["4a", "4b", "4c", "60g"]).optional().default("4a"),
  /** 6183 sayılı Kanun m.48 kapsamında tecil/taksitlendirme devam ediyor mu? */
  tecil_var: z.boolean().optional().default(false),
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK = ["m:5510/67@2008-10-01", "m:5510/60@2008-10-01"];
const KANUN_SURUMU = "kanun-5510-m67.1";

/** Borç eşiğine tabi türler: m.67/1-b → 60/1-a-2 (4/b) ve 60/1-g. */
function borcEsigiUygulanir(tur: Girdi["sigortalilik_turu"]): boolean {
  return tur === "4b" || tur === "60g";
}

export function uygula(g: Girdi, p: ParametreOkuyucu, bugun: string): KuralSonucu {
  if (!isoGecerliMi(bugun)) {
    return eksikGirdiSonucu({ id: KURAL_ID }, ["bugun"], DAYANAK, KANUN_SURUMU);
  }
  const basvuru = bugun;
  const uyarilar: string[] = [];
  const hatalar: string[] = [];
  const surumler = new Set<string>();
  const durumlar: OnayDurumu[] = [];

  const oku = (anahtar: string, etiket: string): number | null => {
    const s = parametreOku(p, KURAL_ID, anahtar, basvuru);
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

  const asgariPrim = oku("asgari_prim_gun", "Asgari prim günü");
  const azamiBorc = oku("azami_borc_gun", "Azami borç günü");
  if (asgariPrim === null || azamiBorc === null) {
    return belirsizSonuc({
      kisa: "Sağlık hakkı koşulları parametre tablosundan okunamadı; sonuç üretilmedi.",
      dayanak: DAYANAK,
      uyarilar: [...uyarilar, ...hatalar],
      parametre_surumu: surumBirlestir([...surumler]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  const tur = g.sigortalilik_turu;
  const borcSart = borcEsigiUygulanir(tur);

  if (borcSart && g.prim_borcu_gun === undefined && !g.tecil_var) {
    return belirsizSonuc({
      kisa:
        `${tur} türünde sağlık hakkı, prim borcunun ${azamiBorc} günü geçip geçmediğine bağlı; ` +
        `borç günü verilmediği için sonuç üretilmedi.`,
      dayanak: DAYANAK,
      eksik_girdiler: ["prim_borcu_gun"],
      uyarilar: [
        ...uyarilar,
        `m.67/1-b: ${tur} kapsamındakiler için başvuru tarihinde ${azamiBorc} günden fazla prim borcu ` +
          `sağlık hizmetine engeldir; sayı verilmeden uygunluk doğrulanamaz.`,
      ],
      parametre_surumu: surumBirlestir([...surumler]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  const engeller: string[] = [];
  if (g.son_bir_yil_prim_gun < asgariPrim) {
    engeller.push(
      `Son bir yılda ${g.son_bir_yil_prim_gun} GSS prim günü var; asgari ${asgariPrim} gün şartı ` +
        `sağlanmıyor (m.67/1-a).`,
    );
  }

  if (borcSart) {
    if (g.tecil_var) {
      uyarilar.push(
        "m.67/1-b: 6183 sayılı Kanun m.48 uyarınca tecil ve taksitlendirmesi devam eden borçlar, " +
          `${azamiBorc} gün eşiğinin dışında tutulur.`,
      );
    } else if (g.prim_borcu_gun !== undefined && g.prim_borcu_gun > azamiBorc) {
      engeller.push(
        `Başvuru tarihinde ${g.prim_borcu_gun} gün prim borcu var; ${azamiBorc} günden fazla borç ` +
          `sağlık hizmetine engeldir (m.67/1-b).`,
      );
    }
  } else if (g.prim_borcu_gun !== undefined) {
    uyarilar.push(
      `m.67/1-a: ${tur} kapsamında prim borcu, sağlık hizmetinden yararlanmaya engel değildir; ` +
        `${azamiBorc} günlük borç eşiği 4/b ve 60/1-g kapsamındakilere uygulanır (m.67/1-b).`,
    );
  }

  uyarilar.push(
    "Acil hâller, iş kazası ve meslek hastalığı, bildirimi zorunlu bulaşıcı hastalıklar, 18 yaşını " +
      "doldurmamış kişiler ile tıbben başkasının bakımına muhtaç olanlar bu şartlardan muaftır (m.67/1).",
  );

  const uygun = engeller.length === 0;
  return sonucOlustur({
    sonuc: uygun ? "uygun" : "uygun_degil",
    kisa: uygun
      ? `Sağlık hizmeti şartları sağlanıyor: son bir yılda ${g.son_bir_yil_prim_gun} prim günü var ` +
        `(asgari ${asgariPrim} gün) ve borç engeli yok.`
      : `Sağlık hizmeti şartları sağlanmıyor: ${engeller[0]}`,
    dayanak: DAYANAK,
    varsayimlar: [
      "Başvuru tarihi, kuralın çalıştırıldığı `bugun` değeridir; prim günü ve borç o tarihe göre değerlendirilir.",
      "Sigortalılık türü verilmezse 4/a (hizmet akdiyle çalışan) kabul edilir.",
      "Borç eşiği, 60/1-a-2 (4/b) ve 60/1-g kapsamındakilere uygulanır (m.67/1-b).",
    ],
    uyarilar: [...uyarilar, ...hatalar],
    parametre_surumu: surumBirlestir([...surumler]),
    onay_durumu: hatalar.length > 0 ? "teyit_bekliyor" : enZayifOnay(durumlar),
  });
}

export const sgkSaglikHakkiKosullari: Kural<Girdi> = {
  id: KURAL_ID,
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: KURAL_ID }, zodEksikleri(hata), DAYANAK, KANUN_SURUMU);
}
