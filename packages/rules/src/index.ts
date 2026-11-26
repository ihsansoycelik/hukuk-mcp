/**
 * @hukuk/rules — Türk tüketici hukuku için deterministik kural motoru.
 *
 * Sözleşme:
 *  - Kurallar SAF fonksiyonlardır: sistem saatini okumaz, ağa/DB'ye gitmez.
 *    "Bugün" `bugun` parametresiyle gelir.
 *  - Eksik/geçersiz girdi → `sonuc: "belirsiz"` + `eksik_girdiler`; tahmin yok.
 *  - Her sonuç tarihli madde kimlikleri (`m:6502/12@2026-01-01`) ve
 *    `parametre_surumu` taşır.
 *  - Parametre onaylı değilse (`teyit_bekliyor`) sonuç bunu `onay_durumu` ve
 *    `uyarilar` içinde söyler.
 *  - İstenen yılın değeri yoksa eski yılın değeri KULLANILMAZ; `belirsiz` +
 *    `PARAMETRE_GUNCEL_DEGIL` benzeri uyarı döner.
 */
import type { KuralSonucu } from "@hukuk/schema";
import type { Kural, ParametreOkuyucu } from "./types.ts";
import { belirsizSonuc } from "./parametre.ts";
import { zodEksikleri } from "./kurallar/ortak.ts";
import { isoGecerliMi } from "./tarih.ts";
import { gorevliMerci, type Girdi as GorevliMerciGirdi } from "./kurallar/gorevli_merci.ts";
import {
  arabuluculukDavaSarti,
  type Girdi as ArabuluculukGirdi,
} from "./kurallar/arabuluculuk_dava_sarti.ts";
import { ayipZamanasimi, type Girdi as AyipGirdi } from "./kurallar/ayip_zamanasimi.ts";
import { caymaSuresi, type Girdi as CaymaGirdi } from "./kurallar/cayma_suresi.ts";
import { yetkiliYer, type Girdi as YetkiGirdi } from "./kurallar/yetkili_yer.ts";
import { harcDurumu, type Girdi as HarcGirdi } from "./kurallar/harc_durumu.ts";
import { sureSonGun, type Girdi as SureGirdi } from "./kurallar/sure_son_gun.ts";
import { yasalFaiz, type Girdi as FaizGirdi } from "./kurallar/yasal_faiz.ts";
import {
  sgkSaglikHakki,
  type Girdi as SgkSaglikHakkiGirdi,
} from "./kurallar/sgk_saglik_hakki.ts";
import {
  sgkSaglikHakkiKosullari,
  type Girdi as SgkSaglikKosullariGirdi,
} from "./kurallar/sgk_saglik_hakki_kosullari.ts";
import {
  gssAlacakZamanasimi,
  type Girdi as GssAlacakGirdi,
} from "./kurallar/gss_alacak_zamanasimi.ts";
import { gssGelirTesti, type Girdi as GssGelirGirdi } from "./kurallar/gss_gelir_testi.ts";
import {
  gssPrimZamanasimi,
  type Girdi as GssPrimGirdi,
} from "./kurallar/gss_prim_zamanasimi.ts";
import {
  issizlikOdenegi,
  type Girdi as IssizlikGirdi,
} from "./kurallar/issizlik_odenegi.ts";
import {
  isKazasiBildirim,
  type Girdi as IsKazasiGirdi,
} from "./kurallar/is_kazasi_bildirim.ts";
import { sgkDavaYolu, type Girdi as SgkDavaGirdi } from "./kurallar/sgk_dava_yolu.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const KURALLAR: Record<string, Kural<any>> = {
  gorevli_merci: gorevliMerci,
  arabuluculuk_dava_sarti: arabuluculukDavaSarti,
  ayip_zamanasimi: ayipZamanasimi,
  cayma_suresi: caymaSuresi,
  yetkili_yer: yetkiliYer,
  harc_durumu: harcDurumu,
  sure_son_gun: sureSonGun,
  yasal_faiz: yasalFaiz,
  sgk_saglik_hakki: sgkSaglikHakki,
  sgk_saglik_hakki_kosullari: sgkSaglikHakkiKosullari,
  gss_alacak_zamanasimi: gssAlacakZamanasimi,
  gss_gelir_testi: gssGelirTesti,
  gss_prim_zamanasimi: gssPrimZamanasimi,
  issizlik_odenegi: issizlikOdenegi,
  is_kazasi_bildirim: isKazasiBildirim,
  sgk_dava_yolu: sgkDavaYolu,
};

/**
 * Kanonik çağrı yolu. Girdi doğrulaması Zod şemasıyla yapılır; hata hâlinde
 * `belirsiz` döner ve hangi alanların eksik/geçersiz olduğu raporlanır.
 */
export function kuralCalistir(
  kuralId: string,
  girdiler: unknown,
  p: ParametreOkuyucu,
  bugun: string,
): KuralSonucu {
  const kural = KURALLAR[kuralId];
  if (!kural) {
    return belirsizSonuc({
      kisa: `Bilinmeyen kural kimliği: ${kuralId}.`,
      dayanak: [],
      uyarilar: [
        `KURAL_YOK: geçerli kimlikler: ${Object.keys(KURALLAR).sort().join(", ")}.`,
      ],
      parametre_surumu: "kural-yok",
      onay_durumu: "teyit_bekliyor",
    });
  }
  if (!isoGecerliMi(bugun)) {
    return belirsizSonuc({
      kisa: "Hesap günü (bugun) geçerli bir ISO tarih değil; sonuç üretilmedi.",
      dayanak: [],
      eksik_girdiler: ["bugun"],
      uyarilar: ["Sistem saati okunmaz; 'bugun' çağıran tarafından verilmelidir."],
      parametre_surumu: "bugun-yok",
      onay_durumu: "teyit_bekliyor",
    });
  }
  const ayristirilmis = kural.girdiSemasi.safeParse(girdiler);
  if (!ayristirilmis.success) {
    return belirsizSonuc({
      kisa: `${kuralId} girdisi doğrulanamadı; tahmin üretilmedi.`,
      dayanak: [],
      eksik_girdiler: zodEksikleri(ayristirilmis.error),
      uyarilar: ayristirilmis.error.issues.map((i) => `${i.path.join(".") || "(kök)"}: ${i.message}`),
      parametre_surumu: "girdi-hatasi",
      onay_durumu: "teyit_bekliyor",
    });
  }
  return kural.uygula(ayristirilmis.data, p, bugun);
}

/** README ve kapsam testleri için her kuralın deterministik örnek girdisi. */
export const ORNEK_GIRDI: Record<string, unknown> = {
  gorevli_merci: { uyusmazlik_degeri_tl: 120_000, basvuru_tarihi: "2026-05-04" },
  arabuluculuk_dava_sarti: { uyusmazlik_degeri_tl: 250_000, dava_tarihi: "2026-05-04" },
  ayip_zamanasimi: { teslim_tarihi: "2025-03-10", dava_tarihi: "2026-05-04" },
  cayma_suresi: { teslim_tarihi: "2026-03-02" },
  yetkili_yer: {
    asama: "tuketici_mahkemesi",
    tuketici_yerlesim_yeri: "Kadıköy",
    davali_yerlesim_yeri: "Şişli",
  },
  harc_durumu: { asama: "ilk_derece", davaci: "tuketici" },
  sure_son_gun: { baslangic: "2026-03-16", sure_degeri: 7, sure_birimi: "gun" },
  yasal_faiz: { anapara_tl: 10_000, baslangic: "2026-01-01", bitis: "2026-12-31" },
  sgk_saglik_hakki: { isten_cikis_tarihi: "2026-06-15", son_bir_yil_prim_gun: 120 },
  sgk_saglik_hakki_kosullari: {
    son_bir_yil_prim_gun: 40,
    prim_borcu_gun: 30,
    sigortalilik_turu: "60g",
  },
  gss_alacak_zamanasimi: { odeme_tarihi: "2026-03-10", ogrenme_tarihi: "2026-05-01" },
  gss_gelir_testi: {
    hane_aylik_gelir_tl: 15_000,
    hane_kisi_sayisi: 3,
    asgari_ucret_brut_tl: 30_000,
  },
  gss_prim_zamanasimi: { odeme_suresi_son: "2026-04-30" },
  issizlik_odenegi: {
    prim_gun_sayisi: 700,
    son_120_gun_hizmet_akdi: true,
    son_4_ay_ortalama_gunluk_brut_kazanc_tl: 1_000,
    aylik_asgari_ucret_brut_tl: 20_000,
  },
  is_kazasi_bildirim: { kaza_tarihi: "2026-06-01" },
  sgk_dava_yolu: { konu: "saglik_hakki" },
};

export type {
  Kural,
  ParametreDegeri,
  ParametreKaydi,
  ParametreOkuyucu,
  OnayDurumu,
} from "./types.ts";
export type { Tarih } from "./tarih.ts";
export type { Tatil } from "./tatiller.ts";
export { KAYITLAR, VARSAYILAN_OKUYUCU, PARAMETRE_SURUMU } from "./parametreler.ts";
export {
  StatikParametreOkuyucu,
  dbSatirlarindanOkuyucu,
  parametreOku,
  PARAMETRE_TABLO_SON_TARIHI,
} from "./parametre.ts";
export type { VeritabaniParametreSatiri } from "./parametre.ts";
export {
  TATILLER,
  TATIL_SURUMU,
  adliTatildeMi,
  tatilBul,
  isGunuMu,
} from "./tatiller.ts";
export {
  gunEkle,
  gunFarki,
  haftaGunu,
  isoGecerliMi,
  tarihYaz,
  yilEkle,
} from "./tarih.ts";

export type {
  GorevliMerciGirdi,
  ArabuluculukGirdi,
  AyipGirdi,
  CaymaGirdi,
  YetkiGirdi,
  HarcGirdi,
  SureGirdi,
  FaizGirdi,
  SgkSaglikHakkiGirdi,
  SgkSaglikKosullariGirdi,
  GssAlacakGirdi,
  GssGelirGirdi,
  GssPrimGirdi,
  IssizlikGirdi,
  IsKazasiGirdi,
  SgkDavaGirdi,
};
