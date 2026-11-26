/**
 * Kural — iş kazası bildirimi ve bildirim süresi (5510 m.13, m.21).
 *
 * 5510 m.13/2 (5754 sayılı Kanun'la değişik, yürürlük 1/10/2008): 4/1-a ve 5.
 * madde kapsamındaki sigortalılar bakımından işveren, iş kazasını o yer yetkili
 * KOLLUK KUVVETLERİNE DERHAL ve Kuruma en geç KAZADAN SONRAKİ ÜÇ İŞGÜNÜ içinde
 * bildirmek zorundadır. 4/1-b (kendi adına çalışan) için bildirim, rahatsızlığın
 * bildirim yapmaya engel olmadığı günden sonra üç işgünü içinde ve her hâlde BİR
 * AYI geçmemek üzere yapılır.
 *
 * 5510 m.21/2: işveren bu süre içinde Kuruma bildirmezse, bildirim tarihine kadar
 * geçen süre için sigortalıya ödenecek geçici iş göremezlik ödeneği işverenden
 * tahsil edilir.
 *
 * İş günü sayısı ve ay sınırı parametre tablosundan; iş günü hesabı tatil
 * tablosundan gelir. Tatil tablosu kapsamı dışına çıkılırsa sonuç UYDURULMAZ.
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
import { isoGecerliMi, karsilastir, tarihYaz } from "../tarih.ts";
import { isGunuEkle, TATIL_SURUMU } from "../tatiller.ts";
import { IsoTarih, zodEksikleri } from "./ortak.ts";

const KURAL_ID = "is_kazasi_bildirim";

const Semasi = z.object({
  /** İş kazasının meydana geldiği tarih. */
  kaza_tarihi: IsoTarih,
  /** Kuruma yapılan bildirimin tarihi (opsiyonel). */
  bildirim_tarihi: IsoTarih.optional(),
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK = ["m:5510/13@2008-10-01"];
const GEC_DAYANAK = "m:5510/21@2008-10-01";
const KANUN_SURUMU = "kanun-5510-m13.1";

export function uygula(g: Girdi, p: ParametreOkuyucu, bugun: string): KuralSonucu {
  if (!isoGecerliMi(g.kaza_tarihi)) {
    return eksikGirdiSonucu({ id: KURAL_ID }, ["kaza_tarihi"], DAYANAK, KANUN_SURUMU);
  }
  if (g.bildirim_tarihi !== undefined && !isoGecerliMi(g.bildirim_tarihi)) {
    return eksikGirdiSonucu({ id: KURAL_ID }, ["bildirim_tarihi"], DAYANAK, KANUN_SURUMU);
  }

  const kaza = g.kaza_tarihi;
  const uyarilar: string[] = [];
  const hatalar: string[] = [];
  const surumler = new Set<string>();
  const durumlar: OnayDurumu[] = [];

  const oku = (anahtar: string, etiket: string): number | null => {
    const s = parametreOku(p, KURAL_ID, anahtar, kaza);
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

  const isGunu = oku("bildirim_is_gunu", "Bildirim iş günü");
  const gecAy = oku("kendi_adina_gec_bildirim_ay", "Kendi adına çalışan için dış sınır (ay)");
  if (isGunu === null || gecAy === null) {
    return belirsizSonuc({
      kisa: "İş kazası bildirim süresi parametre tablosundan okunamadı; sonuç üretilmedi.",
      dayanak: DAYANAK,
      uyarilar: [...uyarilar, ...hatalar],
      parametre_surumu: surumBirlestir([...surumler]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  const hesap = isGunuEkle(kaza, isGunu);
  if (hesap === null) {
    return belirsizSonuc({
      kisa:
        "İş günü hesabı tatil tablosunun kapsamı dışına çıktığından bildirim son günü hesaplanmadı.",
      dayanak: DAYANAK,
      varsayimlar: [
        "İş günü hesabı resmî tatil takvimine dayanır; tablo 2025–2027 yıllarını kapsar.",
      ],
      uyarilar: [
        ...uyarilar,
        "TATIL_TABLOSU_KAPSAM_DISI: bildirim son günü uydurulmadı; tatil takvimi genişletilmelidir.",
      ],
      parametre_surumu: surumBirlestir([...surumler]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  const sonGun = hesap.tarih;
  const tatilTeyit = hesap.kullanilan.some((t) => t.durum === "teyit_bekliyor");
  const ekDayanak: string[] = [];

  let gec = false;
  if (g.bildirim_tarihi !== undefined && karsilastir(g.bildirim_tarihi, sonGun) > 0) {
    gec = true;
    ekDayanak.push(GEC_DAYANAK);
    uyarilar.push(
      `GEC_BILDIRIM: bildirim ${tarihYaz(g.bildirim_tarihi)} tarihinde yapılmış; son gün ` +
        `${tarihYaz(sonGun)} geçmiş. m.21/2 uyarınca bildirim tarihine kadar geçen süre için ` +
        `ödenen geçici iş göremezlik ödeneği işverenden tahsil edilir.`,
    );
  } else if (g.bildirim_tarihi !== undefined) {
    uyarilar.push(
      `Bildirim ${tarihYaz(g.bildirim_tarihi)} tarihinde süresi içinde yapılmış görünüyor.`,
    );
  }

  uyarilar.push(
    `m.13/2-a: işveren iş kazasını derhal yetkili kolluk kuvvetlerine, ayrıca en geç ${isGunu} iş ` +
      `günü içinde Kuruma bildirmek zorundadır.`,
  );
  uyarilar.push(
    `m.13/2-b: kendi adına çalışan (4/b) sigortalı için bildirim, rahatsızlığın engel olmadığı ` +
      `günden sonra ${isGunu} iş günü içinde ve her hâlde kazadan sonraki ${gecAy} ayı geçmemek ` +
      `üzere yapılır.`,
  );

  return sonucOlustur({
    sonuc: { tarih: sonGun },
    kisa: gec
      ? `Kaza ${tarihYaz(kaza)}; Kuruma bildirim son günü ${tarihYaz(sonGun)} kaçırılmış (${isGunu} iş günü).`
      : `Kaza ${tarihYaz(kaza)}; Kuruma bildirim için son gün ${tarihYaz(sonGun)} (${isGunu} iş günü).`,
    dayanak: [...DAYANAK, ...ekDayanak],
    varsayimlar: [
      "İş günü hesabında cumartesi/pazar ve resmî tatiller çalışılmaz; yarım günler iş günü sayılır.",
      "Kaza günü sayılmaz; süre kazadan sonraki iş günlerinden işlemeye başlar (m.13/2-a).",
    ],
    uyarilar,
    parametre_surumu: tatilTeyit
      ? surumBirlestir([...surumler, TATIL_SURUMU])
      : surumBirlestir([...surumler]),
    onay_durumu: tatilTeyit ? "teyit_bekliyor" : enZayifOnay(durumlar),
  });
}

export const isKazasiBildirim: Kural<Girdi> = {
  id: KURAL_ID,
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: KURAL_ID }, zodEksikleri(hata), DAYANAK, KANUN_SURUMU);
}
