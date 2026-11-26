/**
 * Kural — SGK prim alacağında zamanaşımı (5510 m.93/2).
 *
 * 5510 m.93/2 (5754 sayılı Kanun'la değişik, yürürlük 1/10/2008):
 *  "Kurumun prim ve diğer alacakları ödeme süresinin dolduğu tarihi takip eden
 *   takvim yılı başından başlayarak ON YILLIK zamanaşımına tâbidir."
 *
 * Örnek: ödeme süresi 30/4/2026'da doldu → süre 1/1/2027'de başlar →
 * son gün 31/12/2036'dır (10 yıl - 1 gün). Yıl sayısı parametre tablosundan
 * okunur; kodda çıplak süre yoktur.
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
import {
  gunEkle,
  isoGecerliMi,
  isoYaz,
  karsilastir,
  tarihYaz,
  tariheCevir,
  yilEkle,
} from "../tarih.ts";
import { IsoTarih, zodEksikleri } from "./ortak.ts";

const KURAL_ID = "gss_prim_zamanasimi";

const Semasi = z.object({
  /** Prim borcunun ödeme süresinin dolduğu son gün. */
  odeme_suresi_son: IsoTarih,
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK = ["m:5510/93@2008-10-01"];
const KANUN_SURUMU = "kanun-5510-m93.1";

export function uygula(g: Girdi, p: ParametreOkuyucu, bugun: string): KuralSonucu {
  if (!isoGecerliMi(g.odeme_suresi_son)) {
    return eksikGirdiSonucu({ id: KURAL_ID }, ["odeme_suresi_son"], DAYANAK, KANUN_SURUMU);
  }

  const odemeSon = g.odeme_suresi_son;
  const uyarilar: string[] = [];
  const hatalar: string[] = [];
  const surumler = new Set<string>();
  const durumlar: OnayDurumu[] = [];

  const s = parametreOku(p, KURAL_ID, "zamanaşımı_yil", odemeSon);
  let yil: number | null = null;
  if (!s.ok) {
    hatalar.push(`${s.kod}: ${s.mesaj}`);
  } else if (typeof s.kayit.deger !== "number" || !Number.isFinite(s.kayit.deger)) {
    hatalar.push(`PARAMETRE_TIPI_HATALI: ${KURAL_ID}/zamanaşımı_yil sayı değil.`);
  } else {
    yil = s.kayit.deger;
    surumler.add(s.kayit.surum);
    durumlar.push(s.kayit.durum);
    const u = parametreUyarisi("Zamanaşımı süresi", s.kayit);
    if (u) uyarilar.push(u);
  }

  if (yil === null) {
    return belirsizSonuc({
      kisa: "Prim alacağı zamanaşımı süresi parametre tablosundan okunamadı; sonuç üretilmedi.",
      dayanak: DAYANAK,
      uyarilar: [...uyarilar, ...hatalar],
      parametre_surumu: surumBirlestir([...surumler]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  const t = tariheCevir(odemeSon);
  if (t === null) {
    return eksikGirdiSonucu({ id: KURAL_ID }, ["odeme_suresi_son"], DAYANAK, KANUN_SURUMU);
  }
  const baslangic = isoYaz({ y: t.y + 1, m: 1, d: 1 });
  const sonGun = gunEkle(yilEkle(baslangic, yil), -1);

  if (isoGecerliMi(bugun) && karsilastir(bugun, sonGun) > 0) {
    uyarilar.push(
      `ZAMANAŞIMI_DOLDU: ${tarihYaz(bugun)} itibarıyla son gün (${tarihYaz(sonGun)}) geçmiş görünüyor.`,
    );
  }

  return sonucOlustur({
    sonuc: { tarih: sonGun },
    kisa:
      `Ödeme süresi ${tarihYaz(odemeSon)} tarihinde doldu; prim alacağında zamanaşımı ` +
      `${tarihYaz(baslangic)} tarihinde başlar ve ${tarihYaz(sonGun)} tarihinde sona erer.`,
    dayanak: DAYANAK,
    varsayimlar: [
      "Süre, ödeme süresinin dolduğu tarihi takip eden takvim yılı başından işler (m.93/2).",
      "On yıllık süre Kurumun prim ve diğer alacakları içindir; borcun varlığını ortadan kaldırmaz.",
    ],
    uyarilar,
    parametre_surumu: surumBirlestir([...surumler]),
    onay_durumu: enZayifOnay(durumlar),
  });
}

export const gssPrimZamanasimi: Kural<Girdi> = {
  id: KURAL_ID,
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: KURAL_ID }, zodEksikleri(hata), DAYANAK, KANUN_SURUMU);
}
