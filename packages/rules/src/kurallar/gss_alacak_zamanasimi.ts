/**
 * Kural — GSS alacağının (katılım payı iadesi vb.) zamanaşımı (5510 m.97).
 *
 * 5510 m.97 (5754 sayılı Kanun'la değişik, yürürlük 1/10/2008):
 *  "Genel sağlık sigortalısı ve bakmakla yükümlü olduğu kişilerin alacakları,
 *   hakkı doğuran olayın öğrenildiği tarihten itibaren İKİ YIL içinde istenmezse
 *   zamanaşımına uğrar, hakkı doğuran olay tarihinden itibaren ise BEŞ YIL
 *   sonunda düşer."
 *
 * Yani iki ayrı sınır vardır: (1) öğrenme tarihinden itibaren talep süresi,
 * (2) olay (ödeme) tarihinden itibaren mutlak dış sınır. Sonuç, ikisinden
 * hangisi önce doluyorsa o tarihtir. Süreler parametre tablosundan okunur.
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
import { isoGecerliMi, karsilastir, tarihYaz, yilEkle } from "../tarih.ts";
import { IsoTarih, zodEksikleri } from "./ortak.ts";

const KURAL_ID = "gss_alacak_zamanasimi";

const Semasi = z.object({
  /** Hakkı doğuran olay: katılım payının/sağlık harcamasının ödendiği tarih. */
  odeme_tarihi: IsoTarih,
  /** Hakkı doğuran olayın öğrenildiği tarih; verilmezse ödeme tarihi esas alınır. */
  ogrenme_tarihi: IsoTarih.optional(),
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK = ["m:5510/97@2008-10-01"];
const KANUN_SURUMU = "kanun-5510-m97.1";

export function uygula(g: Girdi, p: ParametreOkuyucu, bugun: string): KuralSonucu {
  if (!isoGecerliMi(g.odeme_tarihi)) {
    return eksikGirdiSonucu({ id: KURAL_ID }, ["odeme_tarihi"], DAYANAK, KANUN_SURUMU);
  }
  if (g.ogrenme_tarihi !== undefined && !isoGecerliMi(g.ogrenme_tarihi)) {
    return eksikGirdiSonucu({ id: KURAL_ID }, ["ogrenme_tarihi"], DAYANAK, KANUN_SURUMU);
  }

  const odeme = g.odeme_tarihi;
  const uyarilar: string[] = [];
  const hatalar: string[] = [];
  const surumler = new Set<string>();
  const durumlar: OnayDurumu[] = [];

  const oku = (anahtar: string, etiket: string): number | null => {
    const s = parametreOku(p, KURAL_ID, anahtar, odeme);
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

  const talepYil = oku("talep_sure_yil", "Talep süresi");
  const dusmeYil = oku("dusme_sure_yil", "Mutlak dış sınır");
  if (talepYil === null || dusmeYil === null) {
    return belirsizSonuc({
      kisa: "GSS alacağı zamanaşımı süreleri parametre tablosundan okunamadı; sonuç üretilmedi.",
      dayanak: DAYANAK,
      uyarilar: [...uyarilar, ...hatalar],
      parametre_surumu: surumBirlestir([...surumler]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  let ogrenme = g.ogrenme_tarihi ?? odeme;
  if (karsilastir(ogrenme, odeme) < 0) {
    uyarilar.push(
      `Öğrenme tarihi (${tarihYaz(ogrenme)}) ödeme tarihinden (${tarihYaz(odeme)}) önce olamaz; ` +
        `iki yıllık süre ödeme tarihinden hesaplandı.`,
    );
    ogrenme = odeme;
  } else if (g.ogrenme_tarihi === undefined) {
    uyarilar.push(
      "Öğrenme tarihi verilmedi; iki yıllık talep süresi ödeme tarihinden işletilmiştir (varsayım).",
    );
  }

  const talepSon = yilEkle(ogrenme, talepYil);
  const disSinir = yilEkle(odeme, dusmeYil);
  const sonGun = karsilastir(talepSon, disSinir) <= 0 ? talepSon : disSinir;

  if (karsilastir(talepSon, disSinir) > 0) {
    uyarilar.push(
      `m.97: ${dusmeYil} yıllık dış sınır (${tarihYaz(disSinir)}) talep süresinden önce doluyor; ` +
        `son gün dış sınırdır.`,
    );
  }
  uyarilar.push(
    `m.97: ${talepYil} yıllık talep süresi ${tarihYaz(talepSon)} tarihinde, ${dusmeYil} yıllık ` +
      `mutlak dış sınır ${tarihYaz(disSinir)} tarihinde dolar.`,
  );
  if (isoGecerliMi(bugun) && karsilastir(bugun, sonGun) > 0) {
    uyarilar.push(
      `ZAMANAŞIMI_DOLDU: ${tarihYaz(bugun)} itibarıyla son gün (${tarihYaz(sonGun)}) geçmiş görünüyor.`,
    );
  }

  return sonucOlustur({
    sonuc: { tarih: sonGun },
    kisa:
      `Ödeme ${tarihYaz(odeme)}; GSS alacağı en geç ${tarihYaz(sonGun)} tarihine kadar istenebilir ` +
      `(${talepYil} yıl talep, ${dusmeYil} yıl dış sınır).`,
    dayanak: DAYANAK,
    varsayimlar: [
      "İki yıllık süre, hakkı doğuran olayın öğrenildiği tarihten işler; öğrenme tarihi verilmezse ödeme tarihi esas alınır (m.97).",
      "Beş yıllık süre hakkı doğuran olay (ödeme) tarihinden işler ve talep süresinden önce dolabilir (m.97).",
    ],
    uyarilar,
    parametre_surumu: surumBirlestir([...surumler]),
    onay_durumu: enZayifOnay(durumlar),
  });
}

export const gssAlacakZamanasimi: Kural<Girdi> = {
  id: KURAL_ID,
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: KURAL_ID }, zodEksikleri(hata), DAYANAK, KANUN_SURUMU);
}
