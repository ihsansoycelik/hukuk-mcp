/**
 * Resmî tatil ve adli tatil takvimi (2025–2027).
 *
 * Kaynaklar:
 *  - 2429 sayılı Ulusal Bayram ve Genel Tatiller Hakkında Kanun
 *    https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2429.htm
 *    Sabit millî günler, 28 Ekim yarım günü ve arife günlerinin 13.00'ten
 *    itibaren tatil olduğu doğrudan kanun metnindedir → `uzman_onayli`.
 *  - Dinî bayram günleri kanunda tarih olarak yazılı değildir; Diyanet İşleri
 *    Başkanlığı takvimine dayanır → `teyit_bekliyor` (2025 ve 2026 tarihleri
 *    kamu yayınlarıyla da teyit edildi, 2027 yalnız Diyanet takvimi).
 *  - Adli tatil: HMK m.102 (20 Temmuz – 31 Ağustos)
 *    https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6100.htm
 *
 * "Yarım gün" (arife ve 28 Ekim 13.00 sonrası) varsayılan olarak iş günü
 * sayılır: o gün mesai bitimine kadar işlem yapılabilir. Bu bir varsayımdır ve
 * sonuçlarda `varsayimlar` içinde açıkça yazılır.
 */
import { gunNo, gunEkle, gunNoIso, haftaSonuMu, tariheCevir } from "./tarih.ts";
import type { OnayDurumu } from "./types.ts";

export type TatilTuru = "tam" | "yarim";

export interface Tatil {
  tarih: string;
  ad: string;
  tur: TatilTuru;
  durum: OnayDurumu;
  kaynak_url: string;
}

export const TATIL_SURUMU = "tatil-2025-2027.1";
export const TATIL_TABLOSU_YILLARI = [2025, 2026, 2027] as const;

const K_2429 = "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2429.htm";
const K_DIYANET = "https://diyanet.gov.tr/dini-gun-geceler";

function sabit(tarih: string, ad: string): Tatil {
  return { tarih, ad, tur: "tam", durum: "uzman_onayli", kaynak_url: K_2429 };
}
function yarim(tarih: string, ad: string): Tatil {
  return { tarih, ad, tur: "yarim", durum: "uzman_onayli", kaynak_url: K_2429 };
}
function dini(tarih: string, ad: string, tur: TatilTuru = "tam"): Tatil {
  return { tarih, ad, tur, durum: "teyit_bekliyor", kaynak_url: K_DIYANET };
}

function yilTatilleri(y: number): Tatil[] {
  return [
    sabit(`${y}-01-01`, "Yılbaşı"),
    sabit(`${y}-04-23`, "Ulusal Egemenlik ve Çocuk Bayramı"),
    sabit(`${y}-05-01`, "Emek ve Dayanışma Günü"),
    sabit(`${y}-05-19`, "Atatürk'ü Anma, Gençlik ve Spor Bayramı"),
    sabit(`${y}-07-15`, "Demokrasi ve Millî Birlik Günü"),
    sabit(`${y}-08-30`, "Zafer Bayramı"),
    yarim(`${y}-10-28`, "Cumhuriyet Bayramı arifesi (13.00'ten itibaren)"),
    sabit(`${y}-10-29`, "Cumhuriyet Bayramı"),
  ];
}

export const TATILLER: readonly Tatil[] = Object.freeze([
  ...yilTatilleri(2025),
  // 2025 Ramazan: arife 29 Mart, bayram 30–31 Mart ve 1 Nisan.
  dini("2025-03-29", "Ramazan Bayramı arifesi (13.00'ten itibaren)", "yarim"),
  dini("2025-03-30", "Ramazan Bayramı 1. gün"),
  dini("2025-03-31", "Ramazan Bayramı 2. gün"),
  dini("2025-04-01", "Ramazan Bayramı 3. gün"),
  // 2025 Kurban: arife 5 Haziran, bayram 6–9 Haziran.
  dini("2025-06-05", "Kurban Bayramı arifesi (13.00'ten itibaren)", "yarim"),
  dini("2025-06-06", "Kurban Bayramı 1. gün"),
  dini("2025-06-07", "Kurban Bayramı 2. gün"),
  dini("2025-06-08", "Kurban Bayramı 3. gün"),
  dini("2025-06-09", "Kurban Bayramı 4. gün"),

  ...yilTatilleri(2026),
  // 2026 Ramazan: arife 19 Mart, bayram 20–22 Mart.
  dini("2026-03-19", "Ramazan Bayramı arifesi (13.00'ten itibaren)", "yarim"),
  dini("2026-03-20", "Ramazan Bayramı 1. gün"),
  dini("2026-03-21", "Ramazan Bayramı 2. gün"),
  dini("2026-03-22", "Ramazan Bayramı 3. gün"),
  // 2026 Kurban: arife 26 Mayıs, bayram 27–30 Mayıs.
  dini("2026-05-26", "Kurban Bayramı arifesi (13.00'ten itibaren)", "yarim"),
  dini("2026-05-27", "Kurban Bayramı 1. gün"),
  dini("2026-05-28", "Kurban Bayramı 2. gün"),
  dini("2026-05-29", "Kurban Bayramı 3. gün"),
  dini("2026-05-30", "Kurban Bayramı 4. gün"),

  ...yilTatilleri(2027),
  // 2027 Ramazan: arife 8 Mart, bayram 9–11 Mart.
  dini("2027-03-08", "Ramazan Bayramı arifesi (13.00'ten itibaren)", "yarim"),
  dini("2027-03-09", "Ramazan Bayramı 1. gün"),
  dini("2027-03-10", "Ramazan Bayramı 2. gün"),
  dini("2027-03-11", "Ramazan Bayramı 3. gün"),
  // 2027 Kurban: arife 15 Mayıs, bayram 16–19 Mayıs.
  dini("2027-05-15", "Kurban Bayramı arifesi (13.00'ten itibaren)", "yarim"),
  dini("2027-05-16", "Kurban Bayramı 1. gün"),
  dini("2027-05-17", "Kurban Bayramı 2. gün"),
  dini("2027-05-18", "Kurban Bayramı 3. gün"),
  dini("2027-05-19", "Kurban Bayramı 4. gün"),
] satisfies Tatil[]);

const TATIL_HARITA = new Map<string, Tatil>(TATILLER.map((t) => [t.tarih, t]));

export function tatilBul(iso: string): Tatil | undefined {
  return TATIL_HARITA.get(iso);
}

/** Tatil tablosunun kapsadığı bir yıl mı? (2025–2027) */
export function tatilYiliKapsamda(y: number): boolean {
  return (TATIL_TABLOSU_YILLARI as readonly number[]).includes(y);
}

export function tatilTarihiKapsamda(iso: string): boolean {
  const t = tariheCevir(iso);
  return t !== null && tatilYiliKapsamda(t.y);
}

export interface IsGunuSecenekleri {
  /** Yarım günleri iş günü say (varsayılan: true). */
  yarimGunIsGunu?: boolean;
}

export function isGunuMu(iso: string, secenek: IsGunuSecenekleri = {}): boolean {
  const yarimGunIsGunu = secenek.yarimGunIsGunu ?? true;
  if (haftaSonuMu(iso)) return false;
  const t = tatilBul(iso);
  if (!t) return true;
  return t.tur === "yarim" && yarimGunIsGunu;
}

export interface IsGunuSonucu {
  tarih: string;
  /** Erteleme sırasında atlanan tatil günleri (kanıt ve onay durumu için). */
  kullanilan: Tatil[];
}

/**
 * Tatil gününe denk gelen tarihi takip eden ilk iş gününe taşır.
 * Tablo kapsamı dışına çıkarsa null (sessiz varsayım yok).
 */
export function tatilErtele(
  iso: string,
  secenek: IsGunuSecenekleri = {},
): IsGunuSonucu | null {
  const kullanilan: Tatil[] = [];
  let gun = iso;
  for (let i = 0; i < 40; i++) {
    if (!tatilTarihiKapsamda(gun)) return null;
    if (isGunuMu(gun, secenek)) return { tarih: gun, kullanilan };
    const t = tatilBul(gun);
    if (t) kullanilan.push(t);
    gun = gunEkle(gun, 1);
  }
  return null;
}

/**
 * Başlangıçtan itibaren `adet` iş günü sonrası.
 * `baslangicDahil` false ise başlangıç günü sayılmaz (HMK m.92 pratiği).
 */
export function isGunuEkle(
  baslangic: string,
  adet: number,
  secenek: IsGunuSecenekleri & { baslangicDahil?: boolean } = {},
): IsGunuSonucu | null {
  if (!Number.isInteger(adet) || adet < 0) return null;
  if (adet === 0) {
    const t = tatilErtele(baslangic, secenek);
    return t;
  }
  const kullanilan: Tatil[] = [];
  let gun = baslangic;
  let sayilan = 0;
  const ilkGunDahil = secenek.baslangicDahil ?? false;
  for (let i = 0; i < 4000; i++) {
    if (!tatilTarihiKapsamda(gun)) return null;
    const isGunu = isGunuMu(gun, secenek);
    if (isGunu && (i > 0 || ilkGunDahil)) {
      sayilan += 1;
      if (sayilan === adet) return { tarih: gun, kullanilan };
    } else if (!isGunu) {
      const t = tatilBul(gun);
      if (t) kullanilan.push(t);
    }
    gun = gunEkle(gun, 1);
  }
  return null;
}

/* ------------------------------ adli tatil ------------------------------ */

export const ADLI_TATIL_KAYNAK = "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6100.htm";
export const ADLI_TATIL_SURUMU = "adli-tatil-hmk102.1";
/** m.102 metni araç kesmesi nedeniyle doğrudan okunamadı; yerleşik kural, teyit bekliyor. */
export const ADLI_TATIL_DURUM: OnayDurumu = "teyit_bekliyor";
export const ADLI_TATIL_BAS_AY_GUN = { ay: 7, gun: 20 } as const;
export const ADLI_TATIL_BIT_AY_GUN = { ay: 8, gun: 31 } as const;

/** HMK m.102: adli tatil her yıl 20 Temmuz'da başlar, 31 Ağustos'ta sona erer. */
export function adliTatildeMi(iso: string): boolean {
  const t = tariheCevir(iso);
  if (!t) return false;
  return (t.m === 7 && t.d >= 20) || (t.m === 8 && t.d <= 31);
}

export function adliTatilGunleri(y: number): { bas: string; bit: string } {
  return { bas: `${y}-07-20`, bit: `${y}-08-31` };
}

/** Adli tatil nedeniyle işlemeyen gün sayısı (iki tarih arasında). */
export function adliTatilKesisimi(bas: string, bit: string): number {
  const basNo = gunNo(tariheCevir(bas)!);
  const bitNo = gunNo(tariheCevir(bit)!);
  if (bitNo < basNo) return 0;
  let sayi = 0;
  for (let n = basNo; n <= bitNo; n++) {
    if (adliTatildeMi(gunNoIso(n))) sayi += 1;
  }
  return sayi;
}
