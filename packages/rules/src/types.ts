/**
 * Sözleşmeler: dış dünyaya açılan tipler.
 *
 * `ParametreOkuyucu` bilinçli olarak dar tutuldu: kurallar yalnızca "belirli bir
 * gün için geçerli olan parametre"yi isteyebilir. Yıl/vergi tablosunda o gün
 * yoksa `null` döner; kural eski yılın değerini sessizce kullanamaz.
 */
import type { ZodType, ZodTypeDef } from "zod";
import type { KuralSonucu } from "@hukuk/schema";

export type OnayDurumu = "uzman_onayli" | "teyit_bekliyor";

export interface ParametreDegeri {
  deger: unknown;
  kaynak_url: string;
  durum: OnayDurumu;
  gecerlilik_bas: string;
  /** Parametre kaydının sürümü; sonuçta `parametre_surumu` olarak birleştirilir. */
  surum: string;
}

export interface ParametreOkuyucu {
  get(
    kuralId: string,
    anahtar: string,
    tarih: string,
  ): ParametreDegeri | null;
}

export interface Kural<G> {
  id: string;
  girdiSemasi: ZodType<G, ZodTypeDef, any>;
  uygula(g: G, p: ParametreOkuyucu, bugun: string): KuralSonucu;
}

/** `kural_parametre` tablosunun tek satırı (data/build/schema.sql). */
export interface ParametreKaydi {
  kural_id: string;
  anahtar: string;
  /** JSON'a çevrilebilir skaler ya da nesne. */
  deger: unknown;
  gecerlilik_bas: string;
  /** null = açık uçlu (sonraki değişikliğe kadar). */
  gecerlilik_bit: string | null;
  kaynak_url: string;
  durum: OnayDurumu;
  surum: string;
}

export { type KuralSonucu };
