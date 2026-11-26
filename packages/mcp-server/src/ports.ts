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

export interface ArgumanSatiri {
  id: string;
  taraf: string;
  iddia: string;
  kabul: number;
  ret: number;
  belirleyici: string | null;
}

/** Everything the orchestrator needs from the compiled corpus. */
export interface CorpusPort {
  dugumAra(metin: string, alan?: string, limit?: number): DugumAday[];
  dugumGetir(id: string): DugumKaydi | null;
  kartGetir(dugumId: string): Kart | null;
  ara(input: AraInput): KararOzet[];
  kararGetir(id: string): KararOzet | null;
  maddeGetir(id: string, tarih?: string): MaddeKaydi | null;
  /** Full-text search over the compiled legislation. Optional for minimal corpora. */
  maddeAra?(sorgu: string, limit: number): MaddeKaydi[];
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
