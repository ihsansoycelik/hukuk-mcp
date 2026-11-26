/**
 * Kural — SGK kararına itiraz ve dava yolu (5510 m.101).
 *
 * 5510 m.101 (kanun metni): "Bu Kanunda aksine hüküm bulunmayan hâllerde, bu
 * Kanun hükümlerinin uygulanmasıyla ilgili ortaya çıkan uyuşmazlıklar iş
 * mahkemelerinde görülür."
 *
 * Kanun m.101'de sabit bir DAVA AÇMA SÜRESİ öngörülmemiştir. Bu kural süre
 * uydurmaz; görevli mahkemeyi söyler ve süre/zamanaşımı iddialarının somut
 * olaya göre ayrıca değerlendirilmesi gerektiğini belirtir. Bu nedenle kuralın
 * hukuki parametresi yoktur; `parametre_surumu` kanun maddesi sürümüdür.
 */
import { z } from "zod";
import type { KuralSonucu } from "@hukuk/schema";
import type { Kural, ParametreOkuyucu } from "../types.ts";
import { eksikGirdiSonucu, sonucOlustur } from "../parametre.ts";
import { isoGecerliMi, tarihYaz } from "../tarih.ts";
import { IsoTarih, zodEksikleri } from "./ortak.ts";

const KURAL_ID = "sgk_dava_yolu";

const Semasi = z.object({
  konu: z
    .enum(["prim_borcu", "saglik_hakki", "gelir_aylik", "is_kazasi", "hizmet_tespiti", "diger"])
    .optional()
    .default("diger"),
  /** Kuruma yapılan başvurunun tarihi (varsa); süre hesabı için kullanılmaz. */
  kuruma_basvuru_tarihi: IsoTarih.optional(),
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK = ["m:5510/101@2008-10-01"];
export const KANUN_SURUMU = "kanun-5510-m101.1";

const KONU_ETIKETI: Record<Girdi["konu"], string> = {
  prim_borcu: "prim borcu",
  saglik_hakki: "sağlık hakkı",
  gelir_aylik: "gelir/aylık",
  is_kazasi: "iş kazası",
  hizmet_tespiti: "hizmet tespiti",
  diger: "SGK işlemi",
};

export function uygula(g: Girdi, _p: ParametreOkuyucu, _bugun: string): KuralSonucu {
  if (g.kuruma_basvuru_tarihi !== undefined && !isoGecerliMi(g.kuruma_basvuru_tarihi)) {
    return eksikGirdiSonucu({ id: KURAL_ID }, ["kuruma_basvuru_tarihi"], DAYANAK, KANUN_SURUMU);
  }

  const uyarilar: string[] = [
    "ONAY_BEKLIYOR: Bu kuralın uzman onayı yoktur; görevli mahkeme bilgisi teyit bekliyor.",
    "m.101 sabit bir dava açma süresi öngörmez; süre veya zamanaşımı iddiası somut olaya göre ayrıca değerlendirilmelidir.",
  ];
  if (g.kuruma_basvuru_tarihi !== undefined) {
    uyarilar.push(
      `Kuruma başvuru tarihi ${tarihYaz(g.kuruma_basvuru_tarihi)}; bu tarihe göre bir dava açma ` +
        `süresi hesaplanmadı (kanunda sabit süre yok).`,
    );
  }

  return sonucOlustur({
    sonuc: "is_mahkemesi",
    kisa:
      `5510 kapsamındaki ${KONU_ETIKETI[g.konu]} uyuşmazlığında görevli mahkeme iş mahkemesidir ` +
      `(m.101); kanunda sabit dava açma süresi yoktur.`,
    dayanak: DAYANAK,
    varsayimlar: [
      "m.101, kanunda aksine hüküm bulunmayan hâllerde uygulanır; özel hükümler saklıdır.",
      "Kuruma başvuru, dava yolundan önceki idari aşamadır; başvurunun şekli ve süresi bu kuralın kapsamı dışındadır.",
    ],
    uyarilar,
    parametre_surumu: KANUN_SURUMU,
    onay_durumu: "teyit_bekliyor",
  });
}

export const sgkDavaYolu: Kural<Girdi> = {
  id: KURAL_ID,
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: KURAL_ID }, zodEksikleri(hata), DAYANAK, KANUN_SURUMU);
}
