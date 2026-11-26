/** Kurallar arasında paylaşılan küçük yardımcılar. */
import { z } from "zod";
import type { ParametreDegeri, ParametreOkuyucu } from "../types.ts";
import { parametreOku, type ParametreHatasi } from "../parametre.ts";

/** ISO (YYYY-AA-GG) biçimi; gerçek takvim doğrulaması ilgili kuralda yapılır. */
export const IsoTarih = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "ISO tarih bekleniyor (YYYY-AA-GG)");

export const ParaTutari = z
  .number()
  .finite()
  .nonnegative()
  .describe("Türk lirası cinsinden tutar");

export function zodEksikleri(hata: z.ZodError): string[] {
  return hata.issues.map((i) => (i.path.length > 0 ? i.path.join(".") : "(kök)"));
}

/** 6502 m.68/1 eşiği: yıllık Tebliğ ile güncellenen tek parasal sınır. */
export type SinirSonucu =
  | { ok: true; sinir: number; kayit: ParametreDegeri }
  | { ok: false; kod: ParametreHatasi; mesaj: string };

export function hakemSinirOku(
  p: ParametreOkuyucu,
  tarih: string,
  kuralId = "gorevli_merci",
): SinirSonucu {
  const s = parametreOku(p, "gorevli_merci", "hakem_heyeti_ust_sinir", tarih);
  if (!s.ok) return { ok: false, kod: s.kod, mesaj: s.mesaj };
  if (typeof s.kayit.deger !== "number" || !Number.isFinite(s.kayit.deger)) {
    return {
      ok: false,
      kod: "PARAMETRE_TIPI_HATALI",
      mesaj: `${kuralId}: hakem_heyeti_ust_sinir sayı değil.`,
    };
  }
  return { ok: true, sinir: s.kayit.deger, kayit: s.kayit };
}

/** Girdide tarih yoksa `bugun` kullanılır; ikisi de geçersizse null. */
export function tarihCoz(verilen: string | undefined, bugun: string): string | null {
  return verilen ?? (bugun.length > 0 ? bugun : null);
}

export function tlYaz(tutar: number): string {
  const isaret = tutar < 0 ? "-" : "";
  const mutlak = Math.abs(tutar);
  const tam = Math.floor(mutlak);
  const kurus = Math.round((mutlak - tam) * 100);
  const binlik = String(tam).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${isaret}${binlik},${kurus < 10 ? `0${kurus}` : kurus} TL`;
}
