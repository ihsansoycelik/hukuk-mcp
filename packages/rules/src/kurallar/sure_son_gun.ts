/**
 * Kural 7 — genel süre hesabı (HMK m.92, m.93; tatiller 2429; adli tatil HMK m.102).
 *
 * - Süre başlangıç günü sayılmadan işler (varsayılan); `baslangic_dahil` ile değişir.
 * - Gün/hafta: takvim günü sayılır, yalnızca son gün tatile denk gelirse ilk iş
 *   gününe taşınır (HMK m.93).
 * - İş günü: yalnızca iş günleri sayılır (m.11/4 gibi 30/60 iş günü süreleri).
 * - Adli tatil bayrağı yalnızca USULÎ süreler içindir; 20 Temmuz–31 Ağustos
 *   arasındaki günler sayılmaz (HMK m.102). Maddi hukuk sürelerinde kullanılmaz.
 * - Ay/yıl biriminde adli tatil askıya alması desteklenmez (belirsiz döner):
 *   takvim ayı ile gün sayımı arasındaki dönüşüm varsayım gerektirir.
 */
import { z } from "zod";
import type { KuralSonucu } from "@hukuk/schema";
import type { Kural, ParametreOkuyucu } from "../types.ts";
import { belirsizSonuc, eksikGirdiSonucu, enZayifOnay, sonucOlustur } from "../parametre.ts";
import { ayEkle, gunEkle, isoGecerliMi, tarihYaz, yilEkle } from "../tarih.ts";
import {
  ADLI_TATIL_DURUM,
  ADLI_TATIL_SURUMU,
  adliTatildeMi,
  isGunuMu,
  TATIL_SURUMU,
  tatilBul,
  tatilErtele,
  tatilTarihiKapsamda,
  type Tatil,
} from "../tatiller.ts";
import { IsoTarih, zodEksikleri } from "./ortak.ts";

const Semasi = z.object({
  baslangic: IsoTarih,
  sure_degeri: z.number().int().positive(),
  sure_birimi: z.enum(["gun", "is_gunu", "hafta", "ay", "yil"]),
  baslangic_dahil: z.boolean().optional().default(false),
  adli_tatil_uygula: z.boolean().optional().default(false),
  /** Son gün tatile denk gelirse ilk iş gününe taşı (varsayılan evet). */
  tatil_ertele: z.boolean().optional().default(true),
  /** Yarım günleri iş günü say (varsayılan evet). */
  yarim_gun_is_gunu: z.boolean().optional().default(true),
});

export type Girdi = z.infer<typeof Semasi>;

const BIRIM_ETIKET: Record<string, string> = {
  gun: "gün",
  is_gunu: "iş günü",
  hafta: "hafta",
  ay: "ay",
  yil: "yıl",
};

const DAYANAK = [
  "m:6100/92@2011-02-04",
  "m:6100/93@2011-02-04",
  "m:2429/2@1981-03-19",
];

interface SayimSonucu {
  tarih: string;
  kullanilan: Tatil[];
}

function sayarakEkle(
  bas: string,
  adet: number,
  secenek: {
    isGunu: boolean;
    adliTatil: boolean;
    dahil: boolean;
    yarimGunIsGunu: boolean;
    },
): SayimSonucu | null {
  const kullanilan: Tatil[] = [];
  let sayilan = 0;
  let gun = bas;
  for (let i = 0; i < 8000; i++) {
    if (!tatilTarihiKapsamda(gun)) return null;
    const adli = secenek.adliTatil && adliTatildeMi(gun);
    const isG = isGunuMu(gun, { yarimGunIsGunu: secenek.yarimGunIsGunu });
    const sayilir = !adli && (secenek.isGunu ? isG : true) && (i > 0 || secenek.dahil);
    if (sayilir) {
      sayilan += 1;
      const t = tatilBul(gun);
      if (t) kullanilan.push(t);
      if (sayilan === adet) return { tarih: gun, kullanilan };
    } else if (!adli) {
      const t = tatilBul(gun);
      if (t) kullanilan.push(t);
    }
    gun = gunEkle(gun, 1);
  }
  return null;
}

export function uygula(g: Girdi, _p: ParametreOkuyucu, _bugun: string): KuralSonucu {
  if (!isoGecerliMi(g.baslangic)) {
    return eksikGirdiSonucu({ id: "sure_son_gun" }, ["baslangic"], DAYANAK, TATIL_SURUMU);
  }

  const uyarilar: string[] = [];
  const varsayimlar = [
    "Başlangıç günü süreye dahil edilmez (varsayılan); süre ertesi günden işler.",
    "Gün/hafta biriminde hafta sonu ve tatil günleri süreden sayılır; yalnızca son gün " +
      "tatile denk gelirse takip eden ilk iş gününe taşınır.",
    "Yarım günler (arife, 28 Ekim 13.00 sonrası) iş günü sayıldı; mesai 13.00'te biter.",
  ];

  if (g.adli_tatil_uygula) {
    uyarilar.push(
      "Adli tatil (20 Temmuz–31 Ağustos) yalnızca USULÎ sürelerde uygulanır (HMK m.102-104). " +
        "Cayma, ihbar, zamanaşımı gibi maddi hukuk sürelerinde uygulanmaz. HMK m.103'te sayılan " +
        "ivedi işlerde süreler işler.",
    );
  }

  let nominal: SayimSonucu | null = null;
  let kullanilan: Tatil[] = [];

  if (g.sure_birimi === "ay" || g.sure_birimi === "yil") {
    if (g.adli_tatil_uygula) {
      return belirsizSonuc({
        kisa:
          "Ay/yıl biriminde adli tatil askıya alması bu sürümde desteklenmiyor; " +
          "takvim ayı ile gün sayımı arasındaki dönüşüm varsayım gerektirir.",
        dayanak: [...DAYANAK, "m:6100/102@2011-02-04"],
        varsayimlar,
        uyarilar: [
          ...uyarilar,
          "DESTEKLENMIYOR: ay/yıl süre + adli tatil birleşimi için gün birimine dönüştürerek " +
            "hesap yapılabilir, ancak bu dönüşüm hukuken tartışmalıdır.",
        ],
        parametre_surumu: `${TATIL_SURUMU}+${ADLI_TATIL_SURUMU}`,
        onay_durumu: "teyit_bekliyor",
      });
    }
    const tarih =
      g.sure_birimi === "ay" ? ayEkle(g.baslangic, g.sure_degeri) : yilEkle(g.baslangic, g.sure_degeri);
    nominal = { tarih, kullanilan: [] };
    varsayimlar.push("Ay/yıl sürelerde son gün, başlangıç gününe karşılık gelen gündür (ay sonu kırpılır).");
  } else {
    const gerekenGun = g.sure_birimi === "hafta" ? g.sure_degeri * 7 : g.sure_degeri;
    nominal = sayarakEkle(g.baslangic, gerekenGun, {
      isGunu: g.sure_birimi === "is_gunu",
      adliTatil: g.adli_tatil_uygula,
      dahil: g.baslangic_dahil,
      yarimGunIsGunu: g.yarim_gun_is_gunu,
    });
    if (nominal === null) {
      return belirsizSonuc({
        kisa:
          "Hesaplama resmî tatil tablosunun (2025–2027) kapsamı dışına çıktığı için son gün " +
          "doğrulanamadı.",
        dayanak: DAYANAK,
        varsayimlar,
        uyarilar: [...uyarilar, "TATIL_TABLOSU_YOK: 2025–2027 dışındaki yıllar için tatil verisi yok."],
        parametre_surumu: g.adli_tatil_uygula ? `${TATIL_SURUMU}+${ADLI_TATIL_SURUMU}` : TATIL_SURUMU,
        onay_durumu: "teyit_bekliyor",
      });
    }
    kullanilan = nominal.kullanilan;
  }

  let son = nominal.tarih;
  if (g.tatil_ertele) {
    const ertelenmis = tatilErtele(son, { yarimGunIsGunu: g.yarim_gun_is_gunu });
    if (ertelenmis === null) {
      return belirsizSonuc({
        kisa:
          `Hesaplanan son gün ${tarihYaz(son)}; tatil tablosu kapsamı dışında kaldığı için ` +
          `erteleme doğrulanamadı.`,
        dayanak: DAYANAK,
        varsayimlar,
        uyarilar: [...uyarilar, "TATIL_TABLOSU_YOK: erteleme için 2025–2027 tatil verisi gerekir."],
        parametre_surumu: g.adli_tatil_uygula ? `${TATIL_SURUMU}+${ADLI_TATIL_SURUMU}` : TATIL_SURUMU,
        onay_durumu: "teyit_bekliyor",
      });
    }
    if (ertelenmis.tarih !== son) {
      uyarilar.push(
        `Son gün ${tarihYaz(son)} resmî tatile/hafta sonuna denk geldiği için ` +
          `${tarihYaz(ertelenmis.tarih)} tarihine ertelendi (HMK m.93).`,
      );
    }
    kullanilan = [...kullanilan, ...ertelenmis.kullanilan];
    son = ertelenmis.tarih;
  }

  if (g.adli_tatil_uygula && adliTatildeMi(g.baslangic)) {
    uyarilar.push(
      "Başlangıç adli tatil içinde; sayılan günler 1 Eylül'den itibaren işlemeye devam eder.",
    );
  }
  if (kullanilan.some((t) => t.tur === "yarim")) {
    uyarilar.push("Hesapta yarım gün tatil(ler) iş günü olarak sayıldı.");
  }

  const teyitVar = kullanilan.some((t) => t.durum === "teyit_bekliyor");

  return sonucOlustur({
    sonuc: { tarih: son },
    kisa:
      `${g.sure_degeri} ${BIRIM_ETIKET[g.sure_birimi] ?? g.sure_birimi} süre ${tarihYaz(g.baslangic)} başlangıcından itibaren ` +
      `son gün ${tarihYaz(son)}.`,
    dayanak: g.adli_tatil_uygula ? [...DAYANAK, "m:6100/102@2011-02-04"] : DAYANAK,
    varsayimlar,
    uyarilar,
    parametre_surumu: g.adli_tatil_uygula ? `${TATIL_SURUMU}+${ADLI_TATIL_SURUMU}` : TATIL_SURUMU,
    onay_durumu: enZayifOnay([
      teyitVar ? "teyit_bekliyor" : "uzman_onayli",
      g.adli_tatil_uygula ? ADLI_TATIL_DURUM : "uzman_onayli",
    ]),
  });
}

export const sureSonGun: Kural<Girdi> = {
  id: "sure_son_gun",
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: "sure_son_gun" }, zodEksikleri(hata), DAYANAK, TATIL_SURUMU);
}
