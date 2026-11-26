/**
 * Kural 3 — ayıplı malda zamanaşımı ve m.11/4 onarım süresi.
 *
 * 6502 m.12:
 *  (1) Ayıplı maldan sorumluluk, teslim tarihinden itibaren 2 yıl; konut veya
 *      tatil amaçlı taşınmazlarda 5 yıl. Daha uzun süre sözleşmeyle/kanunla
 *      belirlenebilir.
 *  (2) İkinci el satışta satıcının sorumluluğu 1 yıldan (konutta 3 yıldan) az
 *      olamaz.
 *  (3) Ayıp ağır kusur ya da hile ile gizlenmişse zamanaşımı hükümleri uygulanmaz.
 *
 * DİKKAT: 6502'de "30 günlük ayıp ihbarı" YOKTUR. m.11/4'teki 30/60 iş günü,
 * satıcının onarım/değişim talebini yerine getirme süresidir; tüketicinin
 * başvuru süresi değildir. Bu modül onu ayrı bir uyarı olarak hesaplar.
 */
import { z } from "zod";
import type { KuralSonucu } from "@hukuk/schema";
import type { Kural, ParametreOkuyucu } from "../types.ts";
import {
  belirsizSonuc,
  eksikGirdiSonucu,
  enZayifOnay,
  parametreOku,
  parametreUyarisi,
  sonucOlustur,
  surumBirlestir,
} from "../parametre.ts";
import { gunEkle, haftaSonuMu, isoGecerliMi, tarihKisa, tarihYaz, yilEkle } from "../tarih.ts";
import { isGunuEkle, TATIL_SURUMU, tatilBul } from "../tatiller.ts";
import { IsoTarih, zodEksikleri } from "./ortak.ts";

const Semasi = z.object({
  /** Malın tüketiciye teslim tarihi (sözleşme tarihi değil). */
  teslim_tarihi: IsoTarih,
  mal_turu: z.enum(["tasinan", "konut_tatil_amazli_tasinmaz"]).optional().default("tasinan"),
  ikinci_el: z.boolean().optional().default(false),
  /** Ayıbın hile veya ağır kusurla gizlendiği iddiası (m.12/3). */
  hile_veya_agir_kusur: z.boolean().optional().default(false),
  /** m.12/1: sözleşmede daha uzun süre kararlaştırıldıysa gün cinsinden. */
  sozlesme_suresi_gun: z.number().int().positive().optional(),
  /** m.11/4: onarım/değişim talebinin satıcıya yöneltildiği tarih. */
  onarim_talep_tarihi: IsoTarih.optional(),
  /** Zamanaşımının dolup dolmadığını değerlendirmek için; yoksa `bugun`. */
  dava_tarihi: IsoTarih.optional(),
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK = [
  "m:6502/10@2014-05-28",
  "m:6502/11@2014-05-28",
  "m:6502/12@2014-05-28",
];

export const KANUN_SURUMU = "kanun-6502-m12.1";

export function uygula(g: Girdi, p: ParametreOkuyucu, bugun: string): KuralSonucu {
  const teslim = g.teslim_tarihi;
  const davaTarihi = g.dava_tarihi ?? bugun;
  if (!isoGecerliMi(teslim)) {
    return eksikGirdiSonucu({ id: "ayip_zamanasimi" }, ["teslim_tarihi"], DAYANAK, KANUN_SURUMU);
  }
  if (!isoGecerliMi(davaTarihi)) {
    return eksikGirdiSonucu({ id: "ayip_zamanasimi" }, ["dava_tarihi"], DAYANAK, KANUN_SURUMU);
  }

  const uyarilar: string[] = [];
  const varsayimlar = [
    "Süre malın tüketiciye teslim tarihinden işlemeye başlar (m.12/1); sözleşme tarihi esas alınmaz.",
    "m.10/1: teslimden itibaren 6 ay içinde ortaya çıkan ayıbın teslimde var olduğu karinesi ayrıca değerlendirilmelidir.",
    "6502'de 30 günlük ayıp ihbarı süresi yoktur; böyle bir süre uygulanmaz.",
  ];

  if (g.hile_veya_agir_kusur) {
    uyarilar.push(
      "m.12/3: hile veya ağır kusur iddiası ispat gerektirir; ispatlanamazsa normal zamanaşımı süresi uygulanır.",
    );
    return sonucOlustur({
      sonuc: "zamanaşımı_işlemez",
      kisa:
        "Ayıbın hile veya ağır kusurla gizlendiği kabul edilirse zamanaşımı hükümleri " +
        "uygulanmaz (m.12/3); sabit bir son gün hesaplanmaz.",
      dayanak: [...DAYANAK, "m:6502/12@2014-05-28"],
      varsayimlar,
      uyarilar,
      parametre_surumu: KANUN_SURUMU,
      onay_durumu: "uzman_onayli",
    });
  }

  // Süreler koda gömülmez: tarihli parametre tablosundan okunur (AGENTS.md #2).
  const hatalar: string[] = [];
  const surumler = new Set<string>();
  const oku = (anahtar: string): number | null => {
    const s = parametreOku(p, "ayip_zamanasimi", anahtar, teslim);
    if (!s.ok) {
      hatalar.push(`${s.kod}: ${s.mesaj}`);
      return null;
    }
    if (typeof s.kayit.deger !== "number" || !Number.isFinite(s.kayit.deger)) {
      hatalar.push(`PARAMETRE_TIPI_HATALI: ayip_zamanasimi/${anahtar} sayı değil.`);
      return null;
    }
    surumler.add(s.kayit.surum);
    const u = parametreUyarisi(`Süre parametresi (${anahtar})`, s.kayit);
    if (u) uyarilar.push(u);
    return s.kayit.deger;
  };

  const konut = g.mal_turu === "konut_tatil_amazli_tasinmaz";
  const temelYil = konut ? oku("konut_sure_yil") : oku("temel_sure_yil");
  const tabanYil = konut ? oku("konut_ikinci_el_taban_yil") : oku("ikinci_el_taban_yil");
  const onarimIsGunu = g.onarim_talep_tarihi
    ? konut
      ? oku("onarim_is_gunu_konut")
      : oku("onarim_is_gunu")
    : null;
  if (hatalar.length > 0 || temelYil === null || tabanYil === null) {
    return belirsizSonuc({
      kisa: "Ayıplı mal süreleri parametre tablosundan okunamadı; sonuç üretilmedi.",
      dayanak: DAYANAK,
      varsayimlar,
      uyarilar: [...uyarilar, ...hatalar],
      parametre_surumu: surumBirlestir([...surumler]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  const temelSon = yilEkle(teslim, temelYil);
  const tabanSon = yilEkle(teslim, tabanYil);
  let sonGun: string;
  let kullanilan: string;

  if (typeof g.sozlesme_suresi_gun === "number") {
    const sozlesmeSon = gunEkle(teslim, g.sozlesme_suresi_gun);
    if (g.ikinci_el) {
      // m.12/2: ikinci elde süre sözleşmeyle kısaltılabilir, ama tabanın altına inemez.
      if (sozlesmeSon < tabanSon) {
        uyarilar.push(
          `m.12/2: ikinci el satışta sorumluluk ${tabanYil} yıldan az olamaz; sözleşmedeki ` +
            `${g.sozlesme_suresi_gun} gün yerine ${tarihKisa(tabanSon)} (${tabanYil} yıl) esas alındı.`,
        );
        sonGun = tabanSon;
        kullanilan = `m.12/2 taban süresi (${tabanYil} yıl)`;
      } else {
        sonGun = sozlesmeSon;
        kullanilan = `sözleşmede kararlaştırılan ${g.sozlesme_suresi_gun} günlük süre`;
      }
    } else if (sozlesmeSon > temelSon) {
      sonGun = sozlesmeSon;
      kullanilan = `sözleşmede kararlaştırılan ${g.sozlesme_suresi_gun} günlük daha uzun süre`;
    } else {
      sonGun = temelSon;
      kullanilan = "m.12/1 süresi (sözleşmedeki daha kısa süre ilk el satışta dikkate alınmaz)";
      uyarilar.push(
        "m.12/1: ilk el satışta kanunda öngörülen süreden daha kısa bir sözleşme süresi " +
          "tüketici aleyhine sonuç doğurmaz; kanuni süre uygulanır.",
      );
    }
  } else {
    sonGun = temelSon;
    kullanilan = "m.12/1 süresi";
    if (g.ikinci_el) {
      uyarilar.push(
        `m.12/2: ikinci el satışta süre sözleşmeyle ${tabanYil} yıla (konutta 3 yıla) kadar ` +
          `kısaltılabilir; sözleşmede süre yoksa m.12/1 süresi (${temelYil} yıl) uygulanır.`,
      );
    }
  }

  if (haftaSonuMu(sonGun) || tatilBul(sonGun)) {
    uyarilar.push(
      `ZAMANASIMI_SON_GUN_TATIL: hesaplanan son gün ${tarihYaz(sonGun)} hafta sonu/resmî tatile denk ` +
        `geliyor. HMK m.93'teki erteleme kuralı maddi hukuk zamanaşımında doğrudan uygulanmaz; ` +
        `uygulamada ilk iş günü esas alınabilir, bu ayrıca değerlendirilmelidir.`,
    );
  }

  if (davaTarihi > sonGun) {
    uyarilar.push(
      `ZAMANAŞIMI_DOLDU: ${tarihYaz(davaTarihi)} tarihi itibarıyla son gün (${tarihYaz(sonGun)}) geçmiş görünüyor.`,
    );
  }

  let onarimTeyit = false;
  if (typeof g.onarim_talep_tarihi === "string") {
    if (!isoGecerliMi(g.onarim_talep_tarihi)) {
      uyarilar.push("onarim_talep_tarihi geçersiz; m.11/4 onarım süresi hesaplanmadı.");
    } else if (onarimIsGunu === null) {
      uyarilar.push("m.11/4 onarım iş günü sayısı parametreden okunamadı; hesap yapılmadı.");
    } else {
      const onarimSon = isGunuEkle(g.onarim_talep_tarihi, onarimIsGunu);
      if (onarimSon === null) {
        uyarilar.push(
          `m.11/4: talep tarihinden itibaren ${onarimIsGunu} iş günü hesabı tatil tablosu kapsamı ` +
            `dışına çıktığı için yapılamadı (tablo 2025–2027).`,
        );
      } else {
        onarimTeyit = onarimSon.kullanilan.some((t) => t.durum === "teyit_bekliyor");
        uyarilar.push(
          `m.11/4 (ihbar süresi DEĞİL): onarım/değişim talebi en geç ${onarimIsGunu} iş günü içinde ` +
            `yerine getirilmelidir; hesaplanan son gün ${tarihYaz(onarimSon.tarih)}. ` +
            `Yerine getirilmezse tüketici diğer seçimlik haklarını kullanabilir.`,
        );
      }
    }
  } else {
    uyarilar.push(
      "m.11/4: onarım veya değişim talebi, talebin yöneltilmesinden itibaren 30 iş günü " +
        "(konut/tatil amaçlı taşınmazda 60 iş günü) içinde yerine getirilmelidir; " +
        "bu bir ihbar/başvuru süresi değildir.",
    );
  }

  return sonucOlustur({
    sonuc: { tarih: sonGun },
    kisa:
      `Teslim ${tarihYaz(teslim)}; ayıplı maldan sorumlulukta son gün ${tarihYaz(sonGun)} ` +
      `(${kullanilan}).`,
    dayanak: DAYANAK,
    varsayimlar,
    uyarilar,
    parametre_surumu: onarimTeyit
      ? surumBirlestir([...surumler, TATIL_SURUMU])
      : surumBirlestir([...surumler]),
    onay_durumu: enZayifOnay([onarimTeyit ? "teyit_bekliyor" : "uzman_onayli"]),
  });
}

export const ayipZamanasimi: Kural<Girdi> = {
  id: "ayip_zamanasimi",
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: "ayip_zamanasimi" }, zodEksikleri(hata), DAYANAK, KANUN_SURUMU);
}
