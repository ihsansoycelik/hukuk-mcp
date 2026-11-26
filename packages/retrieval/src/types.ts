/** Public retrieval types. The MCP server imports these exact shapes. */
import type { DugumKaydi } from "@hukuk/schema";

export interface SearchHit {
  karar_id: string;
  skor: number;
  l0: string;
  l1: string;
  tarih: string;
  daire: string;
  mahkeme: string;
  sonuc: string | null;
  kesinlesme: string;
  agirlik: number;
  /** false for bozma/ret (see ARAMA_AYARLARI.temsilciOlmayanSonuclar) and OR-only hits. */
  temsilci_uygun: boolean;
  /** true when the strict AND FTS query was empty and a relaxed query ran. */
  gevsek?: boolean;
  /** which relaxed mode produced the hit: rare-token AND subset, or full OR */
  gevsekTuru?: "altkume" | "or";
}

export interface DugumAday {
  id: string;
  ad: string;
  /** calibrated score in [0,1] */
  skor: number;
  aciklama: string;
  /** up to two example phrasings, for the server's disambiguation prompt (~150 tokens) */
  ornek: string[];
}

export interface MaddeKaydi {
  id: string;
  mevzuat_id: string;
  madde_no: string;
  baslik: string | null;
  metin: string;
  kaynak_url: string;
  degisiklik: string | null;
}

export interface YonlendirmeSonucu {
  adaylar: DugumAday[];
  /** normalised confidence in [0,1] */
  guven: number;
  belirsiz: boolean;
  neden: "bos" | "esik_alti" | "dar_fark" | null;
}

/** Row shape used internally when loading the ontology from SQLite. */
export interface DugumSatiri extends DugumKaydi {
  id: string;
  vektor: string | null;
}
