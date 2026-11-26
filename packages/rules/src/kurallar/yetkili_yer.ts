/**
 * Kural 5 — yetkili yer.
 *
 * Hakem heyeti: başvuru, tüketicinin yerleşim yerinin bulunduğu VEYA tüketici
 * işleminin yapıldığı yerdeki heyete yapılabilir (Tebliğ m.4/2; 6502 m.70).
 * Mahkeme: genel yetkili mahkeme davalının yerleşim yeridir (HMK m.6); ayrıca
 * tüketici davaları tüketicinin yerleşim yerindeki tüketici mahkemesinde DE
 * açılabilir (6502 m.73/5 — ek/alternatif yetki, münhasır değil).
 * İşlem yeri mahkeme için doğrudan bir yetki başlığı değildir.
 */
import { z } from "zod";
import type { KuralSonucu } from "@hukuk/schema";
import type { Kural, ParametreOkuyucu } from "../types.ts";
import { eksikGirdiSonucu, sonucOlustur } from "../parametre.ts";
import { zodEksikleri } from "./ortak.ts";

const Yer = z.string().min(2);

const Semasi = z.object({
  asama: z.enum(["hakem_heyeti", "tuketici_mahkemesi"]),
  tuketici_yerlesim_yeri: Yer.optional(),
  /** Tüketici işleminin yapıldığı yer (heyet başvurusu için). */
  islem_yeri: Yer.optional(),
  /** Davalı satıcı/sağlayıcının yerleşim yeri (HMK m.6 genel yetki). */
  davali_yerlesim_yeri: Yer.optional(),
  /** Hakem heyeti kararına itiraz (m.70/3): heyetin veya tüketicinin yerleşim yeri. */
  itiraz_mi: z.boolean().optional().default(false),
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK_HEYET = [
  "m:6502/68@2022-10-01",
  "m:6502/70@2014-05-28",
];
const DAYANAK_MAHKEME = ["m:6502/73@2014-05-28", "m:6100/6@2011-02-04"];

function birlestir(yerler: Array<string | undefined>): string {
  return yerler.filter((y): y is string => typeof y === "string" && y.length > 0).join(" veya ");
}

export function uygula(g: Girdi, _p: ParametreOkuyucu, _bugun: string): KuralSonucu {
  const uyarilar: string[] = [];

  if (g.asama === "hakem_heyeti") {
    if (g.itiraz_mi) {
      const yer = birlestir([g.tuketici_yerlesim_yeri, g.islem_yeri]);
      if (!g.tuketici_yerlesim_yeri) {
        return eksikGirdiSonucu(
          { id: "yetkili_yer" },
          ["tuketici_yerlesim_yeri"],
          [...DAYANAK_HEYET, "m:6502/70@2014-05-28"],
          "yetki-6502.1",
        );
      }
      uyarilar.push(
        "m.70/3: itiraz, hakem heyetinin veya tüketicinin yerleşim yerinin bulunduğu yerdeki " +
          "tüketici mahkemesine yapılır; itiraz kararın icrasını durdurmaz. m.70/5: bu yolda " +
          "verilen karar kesindir (istinaf yolu yok).",
      );
      return sonucOlustur({
        sonuc: "tuketici_mahkemesi_itiraz",
        kisa:
          `İtiraz yeri: hakem heyetinin bulunduğu yer veya tüketicinin yerleşim yeri mahkemesi` +
          (yer ? ` (${yer}).` : "."),
        dayanak: [...DAYANAK_HEYET, "m:6502/70@2014-05-28"],
        varsayimlar: ["İtiraz, tebliğden itibaren iki hafta içinde yapılır (m.70/3)."],
        uyarilar,
        parametre_surumu: "yetki-6502.1",
        onay_durumu: "uzman_onayli",
      });
    }

    const yer = birlestir([g.tuketici_yerlesim_yeri, g.islem_yeri]);
    if (!yer) {
      return eksikGirdiSonucu(
        { id: "yetkili_yer" },
        ["tuketici_yerlesim_yeri", "islem_yeri"],
        DAYANAK_HEYET,
        "yetki-6502.1",
      );
    }
    uyarilar.push(
      "Heyet başvurusu, tüketicinin yerleşim yeri veya işlem yerindeki heyete yapılabilir; " +
        "heyet kurulmamış ilçede başvuru kaymakamlığa yapılır (Tebliğ m.4/3).",
    );
    return sonucOlustur({
      sonuc: yer,
      kisa: `Yetkili tüketici hakem heyeti: ${yer}.`,
      dayanak: DAYANAK_HEYET,
      varsayimlar: ["Tüketici bu iki yerden birini seçebilir."],
      uyarilar,
      parametre_surumu: "yetki-6502.1",
      onay_durumu: "uzman_onayli",
    });
  }

  // Tüketici mahkemesi
  if (g.itiraz_mi) {
    if (!g.tuketici_yerlesim_yeri) {
      return eksikGirdiSonucu(
        { id: "yetkili_yer" },
        ["tuketici_yerlesim_yeri"],
        DAYANAK_MAHKEME,
        "yetki-6502.1",
      );
    }
    uyarilar.push(
      "m.70/3: itiraz, hakem heyetinin veya tüketicinin yerleşim yerinin bulunduğu yerdeki " +
        "tüketici mahkemesine yapılır.",
    );
    return sonucOlustur({
      sonuc: g.tuketici_yerlesim_yeri,
      kisa: `İtiraz için yetkili tüketici mahkemesi: ${g.tuketici_yerlesim_yeri} (veya heyetin bulunduğu yer).`,
      dayanak: DAYANAK_MAHKEME,
      varsayimlar: [],
      uyarilar,
      parametre_surumu: "yetki-6502.1",
      onay_durumu: "uzman_onayli",
    });
  }

  const yer = birlestir([g.davali_yerlesim_yeri, g.tuketici_yerlesim_yeri]);
  if (!yer) {
    return eksikGirdiSonucu(
      { id: "yetkili_yer" },
      ["davali_yerlesim_yeri", "tuketici_yerlesim_yeri"],
      DAYANAK_MAHKEME,
      "yetki-6502.1",
    );
  }
  if (g.islem_yeri) {
    uyarilar.push(
      "İşlem yeri, 6502 m.73/5 ve HMK m.6 uyarınca mahkeme yetkisi için doğrudan başlık değildir; " +
        "HMK m.10 (sözleşmenin ifa yeri) ile örtüşüyorsa ayrıca değerlendirilebilir.",
    );
  }
  uyarilar.push(
    "m.73/5'teki tüketicinin yerleşim yeri yetkisi ek/alternatif yetkidir ('de açılabilir'); " +
      "genel yetkili mahkeme davalının yerleşim yeridir. Tüketici aleyhine yetki sözleşmesi " +
      "yapılamaz (HMK m.17 yalnız tacirler/kamu tüzel kişileri).",
  );
  return sonucOlustur({
    sonuc: yer,
    kisa: `Dava şu yerlerde açılabilir: ${yer}.`,
    dayanak: [...DAYANAK_MAHKEME, "m:6100/17@2011-02-04"],
    varsayimlar: [
      "Tüketici, genel yetkili mahkeme ile m.73/5'teki ek yetkili mahkeme arasında seçim yapabilir.",
    ],
    uyarilar,
    parametre_surumu: "yetki-6502.1",
    onay_durumu: "uzman_onayli",
  });
}

export const yetkiliYer: Kural<Girdi> = {
  id: "yetkili_yer",
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: "yetkili_yer" }, zodEksikleri(hata), DAYANAK_HEYET, "yetki-6502.1");
}
