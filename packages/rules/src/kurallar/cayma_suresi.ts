/**
 * Kural 4 — mesafeli sözleşmede cayma süresi (6502 m.48; Mesafeli Sözleşmeler
 * Yönetmeliği m.7).
 *
 * Süre 14 gündür. Başlangıç:
 *   - mal satışı: teslim; satıcı montaj/kurulum yaptıysa kurulum tarihi,
 *   - hizmet: sözleşmenin kurulduğu tarih.
 * Son gün resmî tatile/hafta sonuna denk gelirse takip eden ilk iş gününe taşınır.
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
import { gunEkle, isoGecerliMi, tarihYaz } from "../tarih.ts";
import { TATIL_SURUMU, tatilErtele } from "../tatiller.ts";
import { IsoTarih, zodEksikleri } from "./ortak.ts";

const Semasi = z.object({
  sozlesme_turu: z.enum(["mesafeli_mal", "mesafeli_hizmet"]).optional().default("mesafeli_mal"),
  /** Malın tüketiciye teslim tarihi. */
  teslim_tarihi: IsoTarih.optional(),
  /** Satıcı tarafından yapılan kurulum/montaj tarihi (varsa süre buradan başlar). */
  kurulum_tarihi: IsoTarih.optional(),
  /** Hizmet sözleşmesinin kurulduğu tarih. */
  sozlesme_tarihi: IsoTarih.optional(),
  /** Cayma hakkı konusunda bilgilendirme yapıldı mı? (varsayılan evet) */
  bilgilendirme_yapildi: z.boolean().optional().default(true),
  /** Cayma bildiriminin satıcıya ulaştığı tarih (opsiyonel kontrol). */
  cayma_bildirim_tarihi: IsoTarih.optional(),
});

export type Girdi = z.infer<typeof Semasi>;

// Mesafeli Sözleşmeler Yönetmeliği m.7, 6502 m.48 ve m.84 (yönetmelik yetkisi)
// üzerinden dayanaklanır; yönetmelik metni `kaynak_url` alanındadır.
const DAYANAK = ["m:6502/48@2014-05-28", "m:6502/84@2014-05-28"];

export function uygula(g: Girdi, p: ParametreOkuyucu, bugun: string): KuralSonucu {
  const baslangic =
    g.sozlesme_turu === "mesafeli_hizmet"
      ? g.sozlesme_tarihi
      : (g.kurulum_tarihi ?? g.teslim_tarihi);

  const eksikler: string[] = [];
  if (!baslangic) {
    eksikler.push(g.sozlesme_turu === "mesafeli_hizmet" ? "sozlesme_tarihi" : "teslim_tarihi");
  }
  if (baslangic && !isoGecerliMi(baslangic)) eksikler.push("başlangıç tarihi geçersiz");
  if (g.cayma_bildirim_tarihi && !isoGecerliMi(g.cayma_bildirim_tarihi)) {
    eksikler.push("cayma_bildirim_tarihi");
  }
  if (g.teslim_tarihi && !isoGecerliMi(g.teslim_tarihi)) eksikler.push("teslim_tarihi");
  if (g.kurulum_tarihi && !isoGecerliMi(g.kurulum_tarihi)) eksikler.push("kurulum_tarihi");
  if (g.sozlesme_tarihi && !isoGecerliMi(g.sozlesme_tarihi)) eksikler.push("sozlesme_tarihi");
  if (eksikler.length > 0 || !baslangic) {
    return eksikGirdiSonucu({ id: "cayma_suresi" }, eksikler, DAYANAK, "cayma-6502-m48.1");
  }
  if (!isoGecerliMi(bugun) && !g.cayma_bildirim_tarihi) {
    return eksikGirdiSonucu({ id: "cayma_suresi" }, ["bugun"], DAYANAK, "cayma-6502-m48.1");
  }

  const sure = parametreOku(p, "cayma_suresi", "sure_gun", baslangic);
  if (!sure.ok || typeof sure.kayit.deger !== "number") {
    return belirsizSonuc({
      kisa: "Cayma süresi (gün) parametresi doğrulanamadı; sonuç üretilmedi.",
      dayanak: DAYANAK,
      uyarilar: [sure.ok ? "cayma_suresi/sure_gun sayı değil." : `${sure.kod}: ${sure.mesaj}`],
      parametre_surumu: "cayma-6502-m48.1",
      onay_durumu: "teyit_bekliyor",
    });
  }

  const gun = sure.kayit.deger;
  const hamSon = gunEkle(baslangic, gun);
  const ertelenmis = tatilErtele(hamSon);
  if (ertelenmis === null) {
    return belirsizSonuc({
      kisa:
        `Hesaplanan son gün ${tarihYaz(hamSon)}; bu tarih resmî tatil tablosunun (2025–2027) ` +
        `kapsamı dışında olduğu için tatile denk gelip gelmediği doğrulanamadı.`,
      dayanak: DAYANAK,
      uyarilar: ["TATIL_TABLOSU_YOK: son gün için resmî tatil tablosu bulunmuyor; erteleme hesaplanamaz."],
      parametre_surumu: surumBirlestir([sure.kayit.surum]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  const uyarilar: string[] = [];
  const pu = parametreUyarisi("Cayma süresi", sure.kayit);
  if (pu) uyarilar.push(pu);
  if (ertelenmis.tarih !== hamSon) {
    uyarilar.push(
      `Süre sonu ${tarihYaz(hamSon)} resmî tatile/hafta sonuna denk geldiği için ` +
        `${tarihYaz(ertelenmis.tarih)} tarihine ertelendi.`,
    );
  }
  if (ertelenmis.kullanilan.some((t) => t.tur === "yarim")) {
    uyarilar.push(
      "Erteleme yarım gün (arife/28 Ekim) dikkate alınarak yapıldı; yarım gün iş günü sayıldı.",
    );
  }
  if (g.cayma_bildirim_tarihi) {
    const bildirim = g.cayma_bildirim_tarihi;
    uyarilar.push(
      bildirim <= ertelenmis.tarih
        ? `Cayma bildirimi (${tarihYaz(bildirim)}) süre içinde.`
        : `Cayma bildirimi (${tarihYaz(bildirim)}) son günden sonra; süre geçmiş olabilir.`,
    );
  }
  if (!g.bilgilendirme_yapildi) {
    return belirsizSonuc({
      kisa:
        `Süre ${gun} gün olarak hesaplandı (son gün ${tarihYaz(ertelenmis.tarih)}), ancak cayma hakkı ` +
        `bilgilendirmesinin yapılmadığı beyan edildi; bu hâlde sürenin uzayıp uzamadığı ` +
        `doğrulanmış mevzuat metniyle desteklenmiyor.`,
      dayanak: DAYANAK,
      varsayimlar: ["Bilgilendirme yapılmış kabul edilerek 14 günlük süre hesaplandı."],
      uyarilar: [
        ...uyarilar,
        "BILGILENDIRME_EKSIK: cayma hakkı bilgilendirmesi yapılmadıysa ek süre iddiası ayrıca " +
          "değerlendirilmelidir; bu sürümde doğrulanmadığı için sonuç 'belirsiz' döndürüldü.",
      ],
      parametre_surumu: surumBirlestir([sure.kayit.surum, TATIL_SURUMU]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  return sonucOlustur({
    sonuc: { tarih: ertelenmis.tarih },
    kisa:
      `Cayma süresi ${gun} gün; başlangıç ${tarihYaz(baslangic)}; son gün ${tarihYaz(ertelenmis.tarih)}.`,
    dayanak: DAYANAK,
    varsayimlar: [
      g.sozlesme_turu === "mesafeli_hizmet"
        ? "Hizmet sözleşmelerinde süre sözleşmenin kurulduğu tarihten işlemeye başlar."
        : "Mal satışlarında süre teslimden, satıcı kurulum yaptıysa kurulumdan işlemeye başlar.",
      "Başlangıç günü süreye dahil edilmez; süre ertesi günden işler.",
      "Son günün resmî tatile denk gelmesi hâlinde takip eden ilk iş günü esas alınır.",
    ],
    uyarilar,
    parametre_surumu: surumBirlestir([sure.kayit.surum, TATIL_SURUMU]),
    onay_durumu: enZayifOnay([sure.kayit.durum, ertelenmis.kullanilan.some((t) => t.durum === "teyit_bekliyor") ? "teyit_bekliyor" : "uzman_onayli"]),
  });
}

export const caymaSuresi: Kural<Girdi> = {
  id: "cayma_suresi",
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: "cayma_suresi" }, zodEksikleri(hata), DAYANAK, "cayma-6502-m48.1");
}
