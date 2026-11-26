/**
 * Takvim aritmetiği — saf fonksiyonlar.
 *
 * Bu modül bilinçli olarak `Date` nesnesi kullanmaz: kurallar sistem saatini
 * okumaz ve saat dilimi/yerel ayar sürprizlerine açık olmaz. Gün numarası
 * Howard Hinnant'ın civil-from-days algoritmasıyla hesaplanır (1970-01-01 = 0).
 */

export interface Tarih {
  y: number;
  m: number;
  d: number;
}

export const AY_ADLARI = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

/** 0 = Pazar … 6 = Cumartesi */
export const GUN_ADLARI = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
] as const;

const ISO_KALIBI = /^\d{4}-\d{2}-\d{2}$/;

export function artikYil(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function ayGunSayisi(y: number, m: number): number {
  switch (m) {
    case 2:
      return artikYil(y) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

/** ISO (YYYY-AA-GG) metnini gerçek bir takvim gününe çevirir; geçersizse null. */
export function tariheCevir(metin: unknown): Tarih | null {
  if (typeof metin !== "string" || !ISO_KALIBI.test(metin)) return null;
  const y = Number(metin.slice(0, 4));
  const m = Number(metin.slice(5, 7));
  const d = Number(metin.slice(8, 10));
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > ayGunSayisi(y, m)) return null;
  return { y, m, d };
}

export function isoGecerliMi(metin: unknown): metin is string {
  return tariheCevir(metin) !== null;
}

/** 1970-01-01 = 0. Tüm aralıklarda (yıl 0 dahil) çalışır. */
export function gunNo(t: Tarih): number {
  const y = t.m <= 2 ? t.y - 1 : t.y;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (t.m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + t.d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function tariheDon(n: number): Tarih {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: m <= 2 ? y + 1 : y, m, d };
}

function ikiHane(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isoYaz(t: Tarih): string {
  return `${String(t.y).padStart(4, "0")}-${ikiHane(t.m)}-${ikiHane(t.d)}`;
}

/** Gün numarasından ISO metni. */
export function gunNoIso(n: number): string {
  return isoYaz(tariheDon(n));
}

/** ISO tarih + gün. */
export function gunEkle(isoMetin: string, gun: number): string {
  const t = tariheCevir(isoMetin);
  if (!t) throw new RangeError(`geçersiz ISO tarih: ${String(isoMetin)}`);
  return gunNoIso(gunNo(t) + gun);
}

/** b - a (gün). */
export function gunFarki(a: string, b: string): number {
  const ta = tariheCevir(a);
  const tb = tariheCevir(b);
  if (!ta || !tb) throw new RangeError("geçersiz ISO tarih");
  return gunNo(tb) - gunNo(ta);
}

/** 0 = Pazar … 6 = Cumartesi */
export function haftaGunu(isoMetin: string): number {
  const t = tariheCevir(isoMetin);
  if (!t) throw new RangeError(`geçersiz ISO tarih: ${String(isoMetin)}`);
  // 1970-01-01 Perşembe (4) idi.
  return (((gunNo(t) + 4) % 7) + 7) % 7;
}

export function haftaSonuMu(isoMetin: string): boolean {
  const g = haftaGunu(isoMetin);
  return g === 0 || g === 6;
}

/** Ay sonuna taşan günü kırpar: 2025-01-31 + 1 ay = 2025-02-28. */
export function ayEkle(isoMetin: string, ay: number): string {
  const t = tariheCevir(isoMetin);
  if (!t) throw new RangeError(`geçersiz ISO tarih: ${String(isoMetin)}`);
  const toplam = t.y * 12 + (t.m - 1) + ay;
  const y = Math.floor(toplam / 12);
  const m = (toplam % 12) + 1;
  const d = Math.min(t.d, ayGunSayisi(y, m));
  return isoYaz({ y, m, d });
}

/** Yıl ekler; 29 Şubat artık olmayan yılda 28 Şubat'a kırpılır (TBK/HMK süre hesabı). */
export function yilEkle(isoMetin: string, yil: number): string {
  const t = tariheCevir(isoMetin);
  if (!t) throw new RangeError(`geçersiz ISO tarih: ${String(isoMetin)}`);
  const y = t.y + yil;
  const d = Math.min(t.d, ayGunSayisi(y, t.m));
  return isoYaz({ y, m: t.m, d });
}

export function karsilastir(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "2026-03-20" -> "20 Mart 2026 Cuma" */
export function tarihYaz(isoMetin: string): string {
  const t = tariheCevir(isoMetin);
  if (!t) return String(isoMetin);
  const ay = AY_ADLARI[t.m - 1] ?? "";
  return `${t.d} ${ay} ${t.y} ${GUN_ADLARI[haftaGunu(isoMetin)] ?? ""}`.trim();
}

/** "2026-03-20" -> "20.03.2026" */
export function tarihKisa(isoMetin: string): string {
  const t = tariheCevir(isoMetin);
  if (!t) return String(isoMetin);
  return `${ikiHane(t.d)}.${ikiHane(t.m)}.${String(t.y).padStart(4, "0")}`;
}

/** Yılın ilk ve son günü. */
export function yilAraligi(y: number): { bas: string; bit: string } {
  return { bas: isoYaz({ y, m: 1, d: 1 }), bit: isoYaz({ y, m: 12, d: 31 }) };
}

/** [bas, bit] aralığındaki her gün (dahil), güvenlik sınırıyla. */
export function gunDizisi(bas: string, bit: string, sinir = 5000): string[] {
  const n = gunFarki(bas, bit);
  if (n < 0) return [];
  if (n + 1 > sinir) throw new RangeError(`aralık çok uzun: ${n + 1} gün`);
  const out: string[] = [];
  const b = gunNo(tariheCevir(bas)!);
  for (let i = 0; i <= n; i++) out.push(gunNoIso(b + i));
  return out;
}
