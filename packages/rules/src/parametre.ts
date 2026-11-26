/**
 * Parametre okuma ve sonuç üretme yardımcıları.
 *
 * Tasarım kuralı: bir yılın değeri yoksa eski yılın değeri ASLA kullanılmaz.
 * `parametreOku` bu yüzden "hangi hata kodu" bilgisini de döndürür ve kurallar
 * `belirsiz` sonucu üretmek zorunda kalır.
 */
import type { KuralSonucu } from "@hukuk/schema";
import type {
  Kural,
  OnayDurumu,
  ParametreDegeri,
  ParametreKaydi,
  ParametreOkuyucu,
} from "./types.ts";
import { isoGecerliMi, karsilastir } from "./tarih.ts";

/** Bu tablonun kapsadığı son gün. Daha sonrası için değer UYDURULMAZ. */
export const PARAMETRE_TABLO_SON_TARIHI = "2026-12-31";

export class StatikParametreOkuyucu implements ParametreOkuyucu {
  private readonly kayitlar: ParametreKaydi[];

  constructor(kayitlar: readonly ParametreKaydi[]) {
    this.kayitlar = [...kayitlar];
    for (const k of this.kayitlar) {
      if (!isoGecerliMi(k.gecerlilik_bas)) {
        throw new RangeError(`geçersiz gecerlilik_bas: ${k.gecerlilik_bas}`);
      }
      if (k.gecerlilik_bit !== null && !isoGecerliMi(k.gecerlilik_bit)) {
        throw new RangeError(`geçersiz gecerlilik_bit: ${k.gecerlilik_bit}`);
      }
    }
  }

  get(kuralId: string, anahtar: string, tarih: string): ParametreDegeri | null {
    if (!isoGecerliMi(tarih)) return null;
    let enIyi: ParametreKaydi | null = null;
    for (const k of this.kayitlar) {
      if (k.kural_id !== kuralId || k.anahtar !== anahtar) continue;
      if (karsilastir(k.gecerlilik_bas, tarih) > 0) continue;
      if (k.gecerlilik_bit !== null && karsilastir(tarih, k.gecerlilik_bit) > 0) continue;
      if (enIyi === null || karsilastir(k.gecerlilik_bas, enIyi.gecerlilik_bas) >= 0) enIyi = k;
    }
    if (enIyi === null) return null;
    return {
      deger: enIyi.deger,
      kaynak_url: enIyi.kaynak_url,
      durum: enIyi.durum,
      gecerlilik_bas: enIyi.gecerlilik_bas,
      surum: enIyi.surum,
    };
  }

  /** Kayıtlı anahtarlar (test ve teşhis için). */
  anahtarlar(): string[] {
    return [...new Set(this.kayitlar.map((k) => `${k.kural_id}/${k.anahtar}`))].sort();
  }
}

/**
 * `kural_parametre` tablosunun DB satırı biçimi: `deger` TEXT (JSON) olarak
 * saklanır ve tabloda `surum` kolonu yoktur. Bu köprü, DB satırlarını motora
 * bağlar; `surum` değeri `kural/anahtar@gecerlilik_bas` olarak türetilir.
 */
export interface VeritabaniParametreSatiri {
  kural_id: string;
  anahtar: string;
  deger: unknown;
  gecerlilik_bas: string;
  gecerlilik_bit: string | null;
  kaynak_url: string;
  durum: OnayDurumu;
}

function jsonCoz(deger: unknown): unknown {
  if (typeof deger !== "string") return deger;
  try {
    return JSON.parse(deger) as unknown;
  } catch {
    return deger; // düz metin (örn. tarih) JSON değilse olduğu gibi kullanılır
  }
}

export function dbSatirlarindanOkuyucu(
  satirlar: readonly VeritabaniParametreSatiri[],
): StatikParametreOkuyucu {
  return new StatikParametreOkuyucu(
    satirlar.map((s) => ({
      kural_id: s.kural_id,
      anahtar: s.anahtar,
      deger: jsonCoz(s.deger),
      gecerlilik_bas: s.gecerlilik_bas,
      gecerlilik_bit: s.gecerlilik_bit,
      kaynak_url: s.kaynak_url,
      durum: s.durum,
      surum: `${s.kural_id}/${s.anahtar}@${s.gecerlilik_bas}`,
    })),
  );
}

export type ParametreHatasi =
  | "PARAMETRE_GUNCEL_DEGIL"
  | "PARAMETRE_GECMIS_YOK"
  | "PARAMETRE_TIPI_HATALI";

export type ParametreSonucu =
  | { ok: true; kayit: ParametreDegeri }
  | { ok: false; kod: ParametreHatasi; mesaj: string };

/**
 * Belirli bir gün için geçerli parametreyi okur.
 * - tarih tablonun sonundan sonra  → PARAMETRE_GUNCEL_DEGIL
 * - tarih ilk kayıttan önce        → PARAMETRE_GECMIS_YOK
 */
export function parametreOku(
  p: ParametreOkuyucu,
  kuralId: string,
  anahtar: string,
  tarih: string,
): ParametreSonucu {
  if (!isoGecerliMi(tarih)) {
    return { ok: false, kod: "PARAMETRE_TIPI_HATALI", mesaj: `geçersiz tarih: ${tarih}` };
  }
  // Önce o gün için geçerli kayıt aranır: açık uçlu (yıllık güncellenmeyen)
  // sabitler 2026 sonrasında da geçerlidir. Kayıt yoksa yıl bazlı tabloların
  // kapsamı bittiği için eski değer ASLA geri düşülmez.
  const kayit = p.get(kuralId, anahtar, tarih);
  if (kayit === null) {
    const gelecek = karsilastir(tarih, PARAMETRE_TABLO_SON_TARIHI) > 0;
    return {
      ok: false,
      kod: gelecek ? "PARAMETRE_GUNCEL_DEGIL" : "PARAMETRE_GECMIS_YOK",
      mesaj: gelecek
        ? `${kuralId}/${anahtar} için ${tarih.slice(0, 4)} yılı değeri henüz doğrulanmadı ` +
          `(veri ufku ${PARAMETRE_TABLO_SON_TARIHI}).`
        : `${kuralId}/${anahtar} için ${tarih} tarihinde geçerli doğrulanmış değer yok ` +
          `(tablo bu dönemi kapsamıyor).`,
    };
  }
  return { ok: true, kayit };
}

export function sayiParametre(s: ParametreSonucu): number | null {
  if (!s.ok) return null;
  return typeof s.kayit.deger === "number" && Number.isFinite(s.kayit.deger)
    ? s.kayit.deger
    : null;
}

/* --------------------------- sonuç yardımcıları --------------------------- */

export interface SonucGirdisi {
  sonuc: KuralSonucu["sonuc"];
  kisa: string;
  dayanak: string[];
  varsayimlar?: string[];
  eksik_girdiler?: string[];
  uyarilar?: string[];
  parametre_surumu: string;
  onay_durumu: OnayDurumu;
}

export function sonucOlustur(g: SonucGirdisi): KuralSonucu {
  return {
    sonuc: g.sonuc,
    kisa: g.kisa,
    dayanak: [...g.dayanak],
    varsayimlar: [...(g.varsayimlar ?? [])],
    eksik_girdiler: [...(g.eksik_girdiler ?? [])],
    uyarilar: [...(g.uyarilar ?? [])],
    parametre_surumu: g.parametre_surumu,
    onay_durumu: g.onay_durumu,
  };
}

export type BelirsizGirdisi = Omit<SonucGirdisi, "sonuc"> & { sonuc?: undefined };

export function belirsizSonuc(g: BelirsizGirdisi): KuralSonucu {
  return sonucOlustur({ ...g, sonuc: "belirsiz" });
}

/** En zayıf onay durumu kazanır: bir parametre bile teyit bekliyorsa sonuç bekler. */
export function enZayifOnay(durumlar: readonly OnayDurumu[]): OnayDurumu {
  return durumlar.some((d) => d === "teyit_bekliyor") ? "teyit_bekliyor" : "uzman_onayli";
}

export function surumBirlestir(surumler: readonly string[]): string {
  const tekil = [...new Set(surumler)].sort();
  return tekil.length === 0 ? "surumsuz" : tekil.join("+");
}

/** Parametre kaydının teyit uyarısını standart metne çevirir. */
export function parametreUyarisi(
  etiket: string,
  kayit: ParametreDegeri,
): string | null {
  if (kayit.durum === "uzman_onayli") return null;
  return (
    `${etiket} değeri henüz uzman onayı taşımıyor (teyit_bekliyor); ` +
    `kaynak: ${kayit.kaynak_url}`
  );
}

/** Girdi doğrulama hatasını tek biçimde raporlar. */
export function eksikGirdiSonucu(
  kural: Pick<Kural<unknown>, "id">,
  eksikler: string[],
  dayanak: string[],
  parametreSurumu: string,
): KuralSonucu {
  return belirsizSonuc({
    kisa: `Girdi doğrulanamadı (${kural.id}); eksik veya geçersiz alanlar: ${eksikler.join(", ")}.`,
    dayanak,
    eksik_girdiler: eksikler,
    uyarilar: ["Geçersiz/eksik girdiyle hesap yapılmaz; tahmin üretilmez."],
    parametre_surumu: parametreSurumu,
    onay_durumu: "teyit_bekliyor",
  });
}
