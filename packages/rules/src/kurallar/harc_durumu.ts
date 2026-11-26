/**
 * Kural 6 — harç durumu (6502 m.73/2).
 *
 * Kanun metni (birebir): "Tüketici mahkemeleri nezdinde Bakanlık, tüketiciler ve
 * tüketici örgütleri tarafından açılan davalar 2/7/1964 tarihli ve 492 sayılı
 * Harçlar Kanununda düzenlenen harçlardan muaftır."
 *
 * Yani muafiyet (a) taraf, (b) aşama ve (c) davayı AÇAN sıfatına bağlıdır.
 * Satıcı/sağlayıcı davacı ise muaftan söz edilemez. Kanun yolları (istinaf,
 * temyiz) metinde açıkça düzenlenmediği için sonuç "belirsiz" döner.
 */
import { z } from "zod";
import type { KuralSonucu } from "@hukuk/schema";
import type { Kural, ParametreOkuyucu } from "../types.ts";
import { belirsizSonuc, eksikGirdiSonucu, sonucOlustur } from "../parametre.ts";
import { zodEksikleri } from "./ortak.ts";

const Semasi = z.object({
  asama: z.enum(["hakem_heyeti", "ilk_derece", "itiraz", "istinaf", "temyiz"]),
  /** Davayı açan / itiraz eden taraf. */
  davaci: z.enum(["tuketici", "satici", "bakanlik", "tuketici_orgutu", "diger"]),
  /** Davalı taraf (bilgi amaçlı; harç davacıya aittir). */
  davali: z.enum(["tuketici", "satici", "bakanlik", "tuketici_orgutu", "diger"]).optional(),
  /** İtiraz eden taraf belirtilmediyse davaci alanı itiraz eden sayılır. */
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK = [
  "m:6502/73@2014-05-28",
  "m:6502/70@2014-05-28",
];

const MUAF_TARAF = new Set(["tuketici", "bakanlik", "tuketici_orgutu"]);

export function uygula(g: Girdi, _p: ParametreOkuyucu, _bugun: string): KuralSonucu {
  const uyarilar = [
    "Harç muafiyeti yargılama giderleri muafiyeti değildir: haksız çıkan taraf yargılama " +
      "giderlerine mahkûm edilebilir.",
  ];

  if (g.asama === "hakem_heyeti") {
    return sonucOlustur({
      sonuc: "muaf",
      kisa: "Tüketici hakem heyetine başvuru harçtan muaftır (başvuru ücretsizdir).",
      dayanak: DAYANAK,
      varsayimlar: ["Heyet başvurularında harç alınmaz; yalnız posta/tebligat gibi giderler söz konusu olabilir."],
      uyarilar: [
        ...uyarilar,
        "Başvurunun ücretsizliği 6502 m.68 ve Tüketici Hakem Heyetleri Yönetmeliği'ne dayanır; " +
          "bu sürümde doğrudan madde metni doğrulanmadığı için onay durumu teyit_bekliyor'dur.",
      ],
      parametre_surumu: "harc-6502-m73.1",
      onay_durumu: "teyit_bekliyor",
    });
  }

  if (g.asama === "istinaf" || g.asama === "temyiz") {
    return belirsizSonuc({
      kisa:
        `m.73/2 muafiyeti "açılan davalar" için düzenlenmiştir; ${g.asama} aşamasındaki harç ` +
        `rejimi metinde açıkça belirtilmediğinden sonuç üretilmedi.`,
      dayanak: DAYANAK,
      uyarilar: [
        ...uyarilar,
        "Kanun yolu harçları (istinaf/temyiz başvuru harcı) için ayrı değerlendirme gerekir.",
      ],
      parametre_surumu: "harc-6502-m73.1",
      onay_durumu: "teyit_bekliyor",
    });
  }

  const muaf = MUAF_TARAF.has(g.davaci);
  const asamaEtiketi = g.asama === "itiraz" ? "itiraz eden" : "davacı";
  const tarafEtiketi: Record<string, string> = {
    tuketici: "tüketici",
    satici: "satıcı/sağlayıcı",
    bakanlik: "Bakanlık",
    tuketici_orgutu: "tüketici örgütü",
    diger: "diğer",
  };

  if (g.asama === "itiraz") {
    uyarilar.push(
      "m.70/3: hakem heyeti kararına itiraz tüketici mahkemesine yapılır; itirazın harç rejimi " +
        "m.73/2'nin lafzında ayrıca düzenlenmemiştir. Aşağıdaki sonuç, itiraz edenin m.73/2'de " +
        "sayılan taraflardan olması hâline göre verilmiştir.",
    );
  }
  if (g.davaci === "satici" && g.davali === "tuketici") {
    uyarilar.push(
      "Tüketici davalı konumundadır; dava harcını davacı öder. Tüketici haksız çıkarsa " +
        "yargılama giderine mahkûm edilebilir.",
    );
  }

  return sonucOlustur({
    sonuc: muaf ? "muaf" : "harca_tabi",
    kisa:
      `${asamaEtiketi} ${tarafEtiketi[g.davaci] ?? g.davaci} olduğu için ` +
      `${muaf ? "m.73/2 uyarınca harçtan muaf" : "harçtan muaf değil"}.`,
    dayanak: DAYANAK,
    varsayimlar: [
      "Muafiyet, davayı açan tarafın sıfatına bağlıdır; davalı sıfatı tek başına muafiyet doğurmaz.",
    ],
    uyarilar,
    parametre_surumu: "harc-6502-m73.1",
    onay_durumu: g.asama === "itiraz" ? "teyit_bekliyor" : "uzman_onayli",
  });
}

export const harcDurumu: Kural<Girdi> = {
  id: "harc_durumu",
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: "harc_durumu" }, zodEksikleri(hata), DAYANAK, "harc-6502-m73.1");
}
