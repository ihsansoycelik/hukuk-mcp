/**
 * Kural — işten ayrılma sonrası sağlık hakkı (5510 m.67).
 *
 * 5510 m.67 (5754 sayılı Kanun'la değişik, yürürlük 1/10/2008):
 *  - 60/1-a kapsamındaki genel sağlık sigortalıları, zorunlu sigortalılıklarının
 *    sona erdiği tarihten itibaren ON GÜN süreyle GSS'den yararlanır.
 *  - Sigortalılık niteliğini yitirdikleri tarihten geriye doğru bir yıl içinde
 *    DOKSAN GÜN zorunlu sigortalılıkları varsa, ayrıca DOKSAN GÜN süreyle
 *    (bakmakla yükümlü olunan kişiler dahil) sağlık hizmetlerinden yararlanır.
 *
 * Süreler koda gömülmez; `kural_parametre` satırlarından (`temel_gun`,
 * `ek_gun`, `ek_gun_kosul_prim_gun`) okunur. Prim günü verilmezse yalnızca
 * temel süre hesaplanır ve ek sürenin şarta bağlı olduğu söylenir.
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
import { gunEkle, isoGecerliMi, tarihYaz } from "../tarih.ts";
import { IsoTarih, zodEksikleri } from "./ortak.ts";

const KURAL_ID = "sgk_saglik_hakki";

const Semasi = z.object({
  /** Zorunlu sigortalılığın sona erdiği (işten çıkış) tarih. */
  isten_cikis_tarihi: IsoTarih,
  /** Çıkıştan geriye doğru bir yıl içindeki zorunlu prim gün sayısı. */
  son_bir_yil_prim_gun: z.number().int().nonnegative().optional(),
});

export type Girdi = z.infer<typeof Semasi>;

const DAYANAK = ["m:5510/67@2008-10-01"];
const KANUN_SURUMU = "kanun-5510-m67.1";

export function uygula(g: Girdi, p: ParametreOkuyucu, _bugun: string): KuralSonucu {
  if (!isoGecerliMi(g.isten_cikis_tarihi)) {
    return eksikGirdiSonucu(
      { id: KURAL_ID },
      ["isten_cikis_tarihi"],
      DAYANAK,
      KANUN_SURUMU,
    );
  }

  const cikis = g.isten_cikis_tarihi;
  const uyarilar: string[] = [];
  const hatalar: string[] = [];
  const surumler = new Set<string>();
  const durumlar: OnayDurumu[] = [];

  const oku = (anahtar: string, etiket: string): number | null => {
    const s = parametreOku(p, KURAL_ID, anahtar, cikis);
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

  const temelGun = oku("temel_gun", "Temel süre");
  const ekGun = oku("ek_gun", "Ek süre");
  const ekKosul = oku("ek_gun_kosul_prim_gun", "Ek süre prim koşulu");

  if (temelGun === null || ekGun === null || ekKosul === null) {
    return belirsizSonuc({
      kisa: "İşten ayrılma sonrası sağlık hakkı süreleri parametre tablosundan okunamadı; sonuç üretilmedi.",
      dayanak: DAYANAK,
      uyarilar: [...uyarilar, ...hatalar],
      parametre_surumu: surumBirlestir([...surumler]),
      onay_durumu: "teyit_bekliyor",
    });
  }

  const temelSon = gunEkle(cikis, temelGun);
  let sonGun = temelSon;
  let kullanilanGun = temelGun;
  const prim = g.son_bir_yil_prim_gun;

  if (prim === undefined) {
    uyarilar.push(
      `Son bir yıldaki prim gün sayısı verilmedi; yalnızca ${temelGun} günlük temel süre ` +
        `hesaplandı. Son bir yılda ${ekKosul} gün zorunlu sigortalılık varsa ${ekGun} günlük ek ` +
        `süre gündeme gelebilir; uygulamada ${temelGun}+${ekGun}=${temelGun + ekGun} gün esas ` +
        `alınabilir (m.67).`,
    );
  } else if (prim >= ekKosul) {
    sonGun = gunEkle(cikis, temelGun + ekGun);
    kullanilanGun = temelGun + ekGun;
    uyarilar.push(
      `Son bir yılda ${prim} prim günü ${ekKosul} gün eşiğini karşılıyor; ${temelGun} günlük ` +
        `temel süreye ${ekGun} gün ek süre eklendi (m.67).`,
    );
    uyarilar.push(
      "Kanun metni 90 günlük süreyi sigortalılığın sona erdiği tarihten başlatır; uygulamada 10 gün " +
        "ayrıca eklenerek 100 gün kabul edildiği de görülür. Kesin son günü e-Devlet SPAS/provizyon " +
        "kaydından teyit edin.",
    );
  } else {
    uyarilar.push(
      `Son bir yılda ${prim} prim günü ${ekKosul} gün eşiğinin altında; ${ekGun} günlük ek süre ` +
        `doğmaz, yalnızca ${temelGun} günlük temel süre uygulanır (m.67).`,
    );
  }

  return sonucOlustur({
    sonuc: { tarih: sonGun },
    kisa:
      `İşten çıkış ${tarihYaz(cikis)}; sağlık hakkı ${tarihYaz(sonGun)} tarihine kadar ` +
      `(${kullanilanGun} gün).`,
    dayanak: DAYANAK,
    varsayimlar: [
      "Süre, zorunlu sigortalılığın sona erdiği tarihten itibaren işler; bakmakla yükümlü olunan kişiler de kapsamdadır (m.67).",
      "Son bir yıl prim günü, çıkıştan geriye doğru bir yıl içindeki zorunlu sigortalılık günleridir (m.67).",
    ],
    uyarilar,
    parametre_surumu: surumBirlestir([...surumler]),
    onay_durumu: enZayifOnay(durumlar),
  });
}

export const sgkSaglikHakki: Kural<Girdi> = {
  id: KURAL_ID,
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu({ id: KURAL_ID }, zodEksikleri(hata), DAYANAK, KANUN_SURUMU);
}
