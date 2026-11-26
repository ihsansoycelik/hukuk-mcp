/**
 * Kural 1 — görevli merci (6502 m.68/1, m.73/1).
 *
 * Eşik her yıl Ticaret Bakanlığı Tebliği ile yeniden değerlenir; kanun
 * metnindeki rakam operasyonel değildir. 7392 sayılı Kanun (1/10/2022) ile
 * il/ilçe/büyükşehir kademeleri kaldırıldı: tek eşik, coğrafî yetki.
 */
import { z } from "zod";
import type { KuralSonucu } from "@hukuk/schema";
import type { Kural, ParametreOkuyucu } from "../types.ts";
import {
  belirsizSonuc,
  eksikGirdiSonucu,
  enZayifOnay,
  parametreUyarisi,
  sonucOlustur,
} from "../parametre.ts";
import { isoGecerliMi, tarihKisa, tarihYaz } from "../tarih.ts";
import { hakemSinirOku, IsoTarih, ParaTutari, tlYaz, zodEksikleri } from "./ortak.ts";

const Semasi = z.object({
  uyusmazlik_degeri_tl: ParaTutari,
  /** Başvuru (heyete) veya dava (mahkemeye) tarihi; yoksa `bugun`. */
  basvuru_tarihi: IsoTarih.optional(),
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK = [
  "m:6502/68@2022-10-01",
  "m:6502/73@2014-05-28",
  "m:6502/84@2014-05-28",
];

/** 7392 sayılı Kanun'un yürürlüğü: üç kademeli sistem bu tarihte bitti. */
export const UC_KADEMELI_SISTEM_BITIS = "2022-10-01";

export function uygula(g: Girdi, p: ParametreOkuyucu, bugun: string): KuralSonucu {
  const tarih = g.basvuru_tarihi ?? bugun;
  if (!isoGecerliMi(tarih)) {
    return eksikGirdiSonucu({ id: "gorevli_merci" }, ["basvuru_tarihi"], DAYANAK, "hakem-sinir");
  }
  if (tarih < UC_KADEMELI_SISTEM_BITIS) {
    return belirsizSonuc({
      kisa:
        `${tarihKisa(tarih)} tarihli başvuru 7392 sayılı Kanun öncesi üç kademeli sisteme ` +
        `(ilçe/il/büyükşehir) tabidir; bu dönemin parasal sınırları bu sürümde ` +
        `doğrulanmadığı için sonuç üretilmedi.`,
      dayanak: DAYANAK,
      uyarilar: [
        "UC_KADEMELI_SISTEM_YURURLUKTEN_KALKTI: 1/10/2022 öncesi için il/ilçe/büyükşehir " +
          "sınırları ayrıca doğrulanmalıdır; eski yıl değeriyle hesap yapılmaz.",
      ],
      parametre_surumu: "hakem-sinir-oncesi",
      onay_durumu: "teyit_bekliyor",
    });
  }

  const sinir = hakemSinirOku(p, tarih);
  if (!sinir.ok) {
    return belirsizSonuc({
      kisa: `${tarihYaz(tarih)} için hakem heyeti parasal sınırı doğrulanamadı; görevli merci belirsiz.`,
      dayanak: DAYANAK,
      uyarilar: [`${sinir.kod}: ${sinir.mesaj}`],
      parametre_surumu: "hakem-sinir-yok",
      onay_durumu: "teyit_bekliyor",
    });
  }

  const deger = g.uyusmazlik_degeri_tl;
  const esit = deger === sinir.sinir;
  const heyet = deger < sinir.sinir;
  const sonuc = heyet ? "tuketici_hakem_heyeti" : "tuketici_mahkemesi";

  const varsayimlar = [
    "Eşitlik hâlinde tüketici mahkemesi görevli kabul edildi: Tebliğ 'değeri … altında' " +
      "dediği için tam eşit değer heyet kapsamına girmez.",
    "Parasal sınır, başvuru/dava tarihinde yürürlükte olan yıllık Tebliğ değeridir.",
  ];
  const uyarilar: string[] = [];
  const pu = parametreUyarisi("Hakem heyeti parasal sınırı", sinir.kayit);
  if (pu) uyarilar.push(pu);
  if (esit) {
    uyarilar.push(
      "Tam eşik değeri tartışmalıdır (kanun 'altında'/'üzerinde' diyor, eşitliği " +
        "düzenlemiyor); karşı taraf aksi yönde itiraz edebilir.",
    );
  }
  if (tarih > "2026-12-31") {
    uyarilar.push("PARAMETRE_GUNCEL_DEGIL: yeni yıl Tebliği yayımlanınca parametre güncellenmelidir.");
  }

  return sonucOlustur({
    sonuc,
    kisa:
      `${tlYaz(deger)} değerindeki uyuşmazlık için ${tarihYaz(tarih)} tarihinde geçerli sınır ` +
      `${tlYaz(sinir.sinir)}: görevli merci ${heyet ? "tüketici hakem heyeti" : "tüketici mahkemesi"}.`,
    dayanak: DAYANAK,
    varsayimlar,
    uyarilar,
    parametre_surumu: sinir.kayit.surum,
    onay_durumu: enZayifOnay([sinir.kayit.durum, esit ? "teyit_bekliyor" : "uzman_onayli"]),
  });
}

export const gorevliMerci: Kural<Girdi> = {
  id: "gorevli_merci",
  girdiSemasi: Semasi,
  uygula,
};

/** `kuralCalistir` için girdi doğrulama hatası üreticisi (index.ts kullanır). */
export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu(
    { id: "gorevli_merci" },
    zodEksikleri(hata),
    DAYANAK,
    "hakem-sinir",
  );
}
