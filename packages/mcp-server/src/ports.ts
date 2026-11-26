/**
 * Ports — the seams between the MCP server and the packages it depends on.
 *
 * The server never imports the corpus or the rules engine directly; it talks to
 * these interfaces. That keeps the orchestration unit-testable with fakes and
 * lets the storage layer move (SQLite -> D1) without touching the tool logic.
 */
import type { AraInput, DugumKaydi, Kart, KuralSonucu } from "@hukuk/schema";

export interface KararOzet {
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
  temsilci_uygun: boolean;
  kaynak_url: string;
}

export interface DugumAday {
  id: string;
  ad: string;
  skor: number;
  aciklama: string;
  ornek?: string[];
  /** matched trigger phrases (routing reason), max 3 */
  tetikler?: string[];
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

export interface DegisiklikKaydi {
  fikra: number | null;
  tur: string;
  /** ISO YYYY-MM-DD */
  tarih: string;
  kanun_no: string | null;
  kanun_madde: string | null;
  /** original note text, e.g. "Mülga ikinci fıkra: 7/5/2010-5982/5 md." */
  ham?: string;
}

export interface ArgumanSatiri {
  id: string;
  taraf: string;
  iddia: string;
  kabul: number;
  ret: number;
  belirleyici: string | null;
}

/** One reviewed (lower) decision of a Yargıtay text, from the appeal-chain table. */
export interface AltIncelemeSatiri {
  seviye: "bam" | "ilkderece";
  alt_daire: string;
  alt_esas: string;
  alt_karar: string;
  /** corpus id of the lower decision when it exists in the corpus */
  alt_karar_id: string | null;
  ust_sonuc: string | null;
}

/** Yargıtay review of a BAM decision. `ust_sonuc` is a heuristic read of the text. */
export interface UstIncelemeKaydi {
  ust_karar_id: string;
  ust_sonuc: string | null;
}

/** Everything the orchestrator needs from the compiled corpus. */
export interface CorpusPort {
  dugumAra(metin: string, alan?: string, limit?: number): DugumAday[];
  dugumGetir(id: string): DugumKaydi | null;
  kartGetir(dugumId: string): Kart | null;
  ara(input: AraInput): KararOzet[];
  /** Search plus the strategy that produced the hits. Optional for minimal corpora. */
  araDetay?(input: AraInput): { hits: KararOzet[]; strateji: string; denenen: string[] };
  kararGetir(id: string): KararOzet | null;
  maddeGetir(id: string, tarih?: string): MaddeKaydi | null;
  /** Full-text search over the compiled legislation. Optional for minimal corpora. */
  maddeAra?(sorgu: string, limit: number): MaddeKaydi[];
  /**
   * Parsed amendment notes of one article, newest first. Optional; [] when the
   * DB has no `madde_degisiklik` table.
   */
  degisiklikler?(maddeId: string): DegisiklikKaydi[];
  /** Article numbers of one statute (range hints in citation checks). Optional. */
  maddeNumaralari?(mevzuatId: string): string[];
  /** Statute articles a decision cites (`karar_atif`). Optional; [] without the table. */
  kararAtiflari?(kararId: string): string[];
  /** Decisions citing an article, newest first then by weight. Optional; [] without the table. */
  maddeyeDayananKararlar?(maddeId: string, limit: number): string[];
  /** How many decisions cite the article. Optional; 0 without the table. */
  maddeyeDayananSayisi?(maddeId: string): number;
  /** Yargıtay review of a BAM decision (newest review), or null. */
  ustInceleme?(kararId: string): UstIncelemeKaydi | null;
  /** Lower decisions a Yargıtay decision reviewed. */
  altInceleme?(kararId: string): AltIncelemeSatiri[];
  argumanlar(dugumId: string): ArgumanSatiri[];
  /** Optional so a minimal corpus can still serve every other tool. */
  argumanGetir?(id: string): ArgumanSatiri | null;
  meta(k: string): string | null;
  yayinSurumu(): string;
}

/** Everything the orchestrator needs from the rules engine. */
export interface KuralPort {
  varMi(kuralId: string): boolean;
  calistir(kuralId: string, girdiler: Record<string, unknown>, bugun: string): KuralSonucu;
}

/** Monotonic clock for latency budgets; injectable for tests. */
export type Saat = () => number;
