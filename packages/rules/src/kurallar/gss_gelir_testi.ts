/**
 * Kural — GSS gelir testi (5510 m.60/1-c-1).
 *
 * 5510 m.60/1-c-1 (5754 sayılı Kanun'la değişik, yürürlük 1/10/2008): harcamaları,
 * taşınır ve taşınmazları ile bunlardan doğan hakları da dikkate alınarak tespit
 * edilecek aile içindeki gelirin kişi başına düşen aylık tutarı ASGARİ ÜCRETİN
 * ÜÇTE BİRİNDEN AZ olan vatandaşlar genel sağlık sigortalısıdır. Bu eşiğin
 * altında kalanlar gelir testi kapsamındadır; eşiği aşanlar GSS prim borçlusu olur.
 *
 * Asgari ücret tutarı koda GÖMÜLMEZ: doğrulanmış güncel değer çağırandan gelir.
 * Verilmezse sonuç `belirsiz` + `eksik_girdiler` olur.
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

const KURAL_ID = "gss_gelir_testi";

const Semasi = z.object({
  /** Hane içindeki aylık gelir (TL). */
  hane_aylik_gelir_tl: z.number().finite().nonnegative(),
  /** Hane içinde yaşayan kişi sayısı. */
  hane_kisi_sayisi: z.number().int().positive(),
  /** Doğrulanmış brüt aylık asgari ücret (TL); koda gömülmez. */
  asgari_ucret_brut_tl: z.number().finite().positive().optional(),
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK = ["m:5510/60@2008-10-01"];
const KANUN_SURUMU = "kanun-5510-m60.1";

interface EsikPayi {
  pay: number;
  payda: number;
}

export function uygula(g: Girdi, p: ParametreOkuyucu, bugun: string): KuralSonucu {
  const uyarilar: string[] = [];
  const hatalar: string[] = [];
  const surumler = new Set<string>();
  const durumlar: OnayDurumu[] = [];

  const tarih = isoGecerliMi(bugun) ? bugun : "2008-10-01";
  const s = parametreOku(p, KURAL_ID, "gelir_esik_pay", tarih);
  let esikPayi: EsikPayi | null = null;
  if (!s.ok) {
    hatalar.push(`${s.kod}: ${s.mesaj}`);
  } else {
    const d = s.kayit.deger as Partial<EsikPayi> | null;
    if (
      typeof d === "object" &&
      d !== null &&
      typeof d.pay === "number" &&
      Number.isFinite(d.pay) &&
      typeof d.payda === "number" &&
      Number.isFinite(d.payda) &&
      d.pay > 0 &&
      d.payda > 0
    ) {
      esikPayi = { pay: d.pay, payda: d.payda };
      surumler.add(s.kayit.surum);
      durumlar.push(s.kayit.durum);
      const u = parametreUyarisi("Gelir eşiği oranı", s.kayit);
      if (u) uyarilar.push(u);
    } else {
      hatalar.push(
        `PARAMETRE_TIPI_HATALI: ${KURAL_ID}/gelir_esik_pay {pay, payda} nesnesi değil.`,
      );
    }
  }

  if (esikPayi === null) {
    return belirsizSonuc({
      kisa: "Gelir testi eşiği parametre tablosundan okunamadı; sonuç üretilmedi.",
      dayanak: DAYANAK,
      uyarilar: [...uyarilar, ...hatalar],
      parametre_surumu: surumBirlestir([...surumler]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  if (g.asgari_ucret_brut_tl === undefined) {
    return belirsizSonuc({
      kisa:
        "Gelir testi için brüt asgari ücret gerekli; doğrulanmış tutar verilmediğinden sonuç üretilmedi.",
      dayanak: DAYANAK,
      eksik_girdiler: ["asgari_ucret_brut_tl"],
      uyarilar: [
        ...uyarilar,
        "Asgari ücret güncel tutarı koda gömülmez; doğrulanmış değer çağıran tarafından verilmelidir.",
      ],
      parametre_surumu: surumBirlestir([...surumler]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  const asgari = g.asgari_ucret_brut_tl;
  const esik = (asgari * esikPayi.pay) / esikPayi.payda;
  const kisiBasi = g.hane_aylik_gelir_tl / g.hane_kisi_sayisi;
  const kapsamda = kisiBasi < esik;

  uyarilar.push(
    `Kişi başına aylık gelir ${tlYaz(kisiBasi)}; ${tlYaz(asgari)} brüt asgari ücretin ` +
      `${esikPayi.pay}/${esikPayi.payda} kadarı ${tlYaz(esik)}.`,
  );

  return sonucOlustur({
    sonuc: kapsamda ? "gelir_testi_kapsaminda" : "prim_borcu_dogar",
    kisa: kapsamda
      ? `Kişi başı gelir ${tlYaz(kisiBasi)}, eşik ${tlYaz(esik)} olduğundan gelir testi kapsamındasınız.`
      : `Kişi başı gelir ${tlYaz(kisiBasi)}, eşik ${tlYaz(esik)} olduğundan GSS prim borcu doğar.`,
    dayanak: DAYANAK,
    varsayimlar: [
      "Eşik, brüt asgari ücretin üçte biri alınarak hesaplanır; hane geliri kişi sayısına bölünür (m.60/1-c-1).",
      "Yalnızca beyan edilen hane geliri dikkate alınmıştır; taşınır/taşınmaz ve bunlardan doğan haklar değerlendirilmemiştir.",
      "Asgari ücretin güncel tutarı koda gömülmez; doğrulanmış değer girdi olarak verilir.",
    ],
    uyarilar,
    parametre_surumu: surumBirlestir([...surumler]),
    onay_durumu: enZayifOnay(durumlar),
  });
}

export const gssGelirTesti: Kural<Girdi> = {
  id: KURAL_ID,
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: KURAL_ID }, zodEksikleri(hata), DAYANAK, KANUN_SURUMU);
}
