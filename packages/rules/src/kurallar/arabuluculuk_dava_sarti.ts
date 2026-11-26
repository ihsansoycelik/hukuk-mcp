/**
 * Kural 2 — dava şartı arabuluculuk (6502 m.73/A, 6325 m.18/B).
 *
 * 7446 sayılı Kanun'la 1/9/2023'ten itibaren tüketici mahkemelerinde dava
 * şartıdır. m.73/A/1 istisnaları: (a) hakem heyeti görev alanına giren
 * uyuşmazlıklar, (b) hakem heyeti kararlarına itirazlar, (c) m.73/6 davaları
 * (kamu yararına tespit/önleme/durdurma), (ç) m.74 davaları (seri mal ayıbı),
 * (d) tüketici işleminden kaynaklanan taşınmazın aynına ilişkin uyuşmazlıklar.
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
import { isoGecerliMi, tarihKisa, tarihYaz } from "../tarih.ts";
import { hakemSinirOku, IsoTarih, ParaTutari, tlYaz, zodEksikleri } from "./ortak.ts";

const Semasi = z.object({
  uyusmazlik_degeri_tl: ParaTutari,
  /** Dava açılma tarihi; yoksa `bugun`. */
  dava_tarihi: IsoTarih.optional(),
  /** m.73/A/1-b: hakem heyeti kararına itiraz davası. */
  hakem_heyeti_kararina_itiraz: z.boolean().optional().default(false),
  /** m.73/A/1-d: tüketici işleminden kaynaklanan taşınmazın aynına ilişkin uyuşmazlık. */
  ayni_hakka_iliskin_tasinmaz: z.boolean().optional().default(false),
  /** m.73/A/1-c: m.73/6 kapsamındaki kamu yararına davalar. */
  m73_6_kapsaminda: z.boolean().optional().default(false),
  /** m.73/A/1-ç: m.74 kapsamındaki seri mal / toplatma davaları. */
  m74_kapsaminda: z.boolean().optional().default(false),
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK = [
  "m:6502/73-A@2023-09-01",
  "m:6325/18-B@2023-09-01",
  "m:6502/70@2014-05-28",
];

export const VARSAYILAN_YURURLUK = "2023-09-01";

export function uygula(g: Girdi, p: ParametreOkuyucu, bugun: string): KuralSonucu {
  const tarih = g.dava_tarihi ?? bugun;
  if (!isoGecerliMi(tarih)) {
    return eksikGirdiSonucu({ id: "arabuluculuk_dava_sarti" }, ["dava_tarihi"], DAYANAK, "arabuluculuk-7446");
  }

  // Yürürlük tarihi tablodan okunur; kayıt yoksa kanun metnindeki tarih kullanılır.
  const yururlukKaydi = parametreOku(p, "arabuluculuk_dava_sarti", "yururluk_bas", VARSAYILAN_YURURLUK);
  const yururluk =
    yururlukKaydi.ok && typeof yururlukKaydi.kayit.deger === "string"
      ? yururlukKaydi.kayit.deger
      : VARSAYILAN_YURURLUK;
  const uyarilar: string[] = [];
  if (!yururlukKaydi.ok) {
    uyarilar.push(
      `Yürürlük tarihi parametre tablosundan okunamadı (${yururlukKaydi.kod}); ` +
        `kanun metnindeki ${VARSAYILAN_YURURLUK} tarihi kullanıldı.`,
    );
  }
  const surumler = [yururlukKaydi.ok ? yururlukKaydi.kayit.surum : "arabuluculuk-7446.1"];

  if (tarih < yururluk) {
    return sonucOlustur({
      sonuc: "gerekli_degil",
      kisa:
        `${tarihYaz(tarih)} tarihinde tüketici uyuşmazlıklarında dava şartı arabuluculuk ` +
        `henüz yürürlükte değildi (yürürlük ${tarihKisa(yururluk)}).`,
      dayanak: DAYANAK,
      varsayimlar: ["Dava şartı, dava açıldığı tarihte yürürlükte olan usul hukukuna göre değerlendirilir."],
      uyarilar,
      parametre_surumu: surumBirlestir(surumler),
      onay_durumu: enZayifOnay([yururlukKaydi.ok ? yururlukKaydi.kayit.durum : "teyit_bekliyor"]),
    });
  }

  const istisnalar: Array<{ secili: boolean; sonuc: string; gerekce: string; ek: string[] }> = [
    {
      secili: g.hakem_heyeti_kararina_itiraz,
      sonuc: "gerekli_degil",
      gerekce:
        "m.73/A/1-b: hakem heyeti kararlarına itirazlar arabuluculuk dava şartına tabi değildir; " +
        "itiraz m.70/3 uyarınca iki hafta içinde yapılır ve m.70/5 uyarınca verilen karar kesindir.",
      ek: ["m:6502/70@2014-05-28"],
    },
    {
      secili: g.m73_6_kapsaminda,
      sonuc: "gerekli_degil",
      gerekce:
        "m.73/A/1-c: m.73/6 kapsamındaki (tüketici örgütleri/kamu kurumları/Bakanlık tarafından " +
        "açılan tespit, önleme, durdurma ve ihtiyati tedbir) davalar dava şartına tabi değildir.",
      ek: ["m:6502/73@2014-05-28"],
    },
    {
      secili: g.m74_kapsaminda,
      sonuc: "gerekli_degil",
      gerekce:
        "m.73/A/1-ç: m.74 kapsamındaki seri mal ayıbı (tespit, üretim/satışın durdurulması, " +
        "toplatma) davaları dava şartına tabi değildir.",
      ek: ["m:6502/74@2014-05-28"],
    },
    {
      secili: g.ayni_hakka_iliskin_tasinmaz,
      sonuc: "gerekli_degil",
      gerekce:
        "m.73/A/1-d: tüketici işleminden kaynaklanan taşınmazın aynına ilişkin uyuşmazlıklar " +
        "dava şartına tabi değildir.",
      ek: [],
    },
  ];

  const istisna = istisnalar.find((i) => i.secili);
  if (istisna) {
    return sonucOlustur({
      sonuc: istisna.sonuc,
      kisa:
        `${tarihYaz(tarih)} itibarıyla arabuluculuk dava şartı uygulanmaz: ${istisna.gerekce}`,
      dayanak: [...DAYANAK, ...istisna.ek],
      varsayimlar: ["İstisna kapsamı, kullanıcının beyan ettiği dava türüne göre uygulandı."],
      uyarilar: [
        ...uyarilar,
        "İstisna kapsamı hukuki nitelendirme gerektirir; dava dilekçesinde gerekçelendirilmelidir.",
      ],
      parametre_surumu: surumBirlestir(surumler),
      onay_durumu: enZayifOnay([yururlukKaydi.ok ? yururlukKaydi.kayit.durum : "teyit_bekliyor"]),
    });
  }

  const sinir = hakemSinirOku(p, tarih, "arabuluculuk_dava_sarti");
  if (!sinir.ok) {
    return belirsizSonuc({
      kisa: `${tarihYaz(tarih)} için hakem heyeti sınırı doğrulanamadı; arabuluculuğun dava şartı olup olmadığı belirsiz.`,
      dayanak: DAYANAK,
      uyarilar: [...uyarilar, `${sinir.kod}: ${sinir.mesaj}`],
      parametre_surumu: surumBirlestir(surumler),
      onay_durumu: "teyit_bekliyor",
    });
  }
  surumler.push(sinir.kayit.surum);
  const pu = parametreUyarisi("Hakem heyeti parasal sınırı", sinir.kayit);
  if (pu) uyarilar.push(pu);

  const heyetYetkili = g.uyusmazlik_degeri_tl < sinir.sinir;
  if (heyetYetkili) {
    return sonucOlustur({
      sonuc: "gerekli_degil",
      kisa:
        `${tlYaz(g.uyusmazlik_degeri_tl)} değeri ${tlYaz(sinir.sinir)} sınırının altında: ` +
        `uyuşmazlık hakem heyetinin görev alanında olduğundan arabuluculuk dava şartı yok ` +
        `(m.73/A/1-a).`,
      dayanak: DAYANAK,
      varsayimlar: [
        "Hakem heyeti görev alanındaki uyuşmazlıklar m.73/A/1-a gereği dava şartından muaftır.",
      ],
      uyarilar,
      parametre_surumu: surumBirlestir(surumler),
      onay_durumu: sinir.kayit.durum,
    });
  }

  return sonucOlustur({
    sonuc: "gerekli",
    kisa:
      `${tarihYaz(tarih)} itibarıyla ${tlYaz(g.uyusmazlik_degeri_tl)} değerindeki uyuşmazlık ` +
      `${tlYaz(sinir.sinir)} sınırını aştığı için tüketici mahkemesinde dava açmadan önce ` +
      `arabuluculuk dava şartıdır (m.73/A).`,
    dayanak: DAYANAK,
    varsayimlar: [
      "Dava şartı, dava açıldığı tarihte yürürlükte olan usul hukukuna göre değerlendirilir.",
      "Arabuluculuk, dava açılmadan önce tamamlanmış olmalıdır; aksi hâlde dava usulden reddedilir.",
    ],
    uyarilar,
    parametre_surumu: surumBirlestir(surumler),
    onay_durumu: sinir.kayit.durum,
  });
}

export const arabuluculukDavaSarti: Kural<Girdi> = {
  id: "arabuluculuk_dava_sarti",
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu(
    { id: "arabuluculuk_dava_sarti" },
    zodEksikleri(hata),
    DAYANAK,
    "arabuluculuk-7446",
  );
}
