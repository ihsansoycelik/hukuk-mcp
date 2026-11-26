/**
 * Adapters — concrete implementations of the server's ports.
 *
 * Kept in one file so the orchestration stays free of storage/engine details.
 * The rules engine is loaded dynamically: if the package is absent or broken the
 * server still answers from the corpus (rules section simply disappears) instead
 * of failing to boot.
 */
import { DatabaseSync } from "node:sqlite";
import { Corpus } from "@hukuk/retrieval";
import type { AraInput } from "@hukuk/schema";
import { ftsKey } from "@hukuk/tr-text";
import type { ArgumanSatiri, CorpusPort, DugumAday, KararOzet, KuralPort, MaddeKaydi } from "./ports.ts";
import type { KuralSonucu } from "@hukuk/schema";

const BOS_SONUC: KuralSonucu = {
  sonuc: "belirsiz",
  kisa: "kural motoru yüklenemedi",
  dayanak: [],
  varsayimlar: [],
  eksik_girdiler: [],
  uyarilar: [],
  parametre_surumu: "yok",
  onay_durumu: "teyit_bekliyor",
};

class CorpusAdaptor implements CorpusPort {
  private readonly c: Corpus;
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.c = new Corpus(dbPath);
    // second, read-only connection for tables the retrieval API does not expose
    this.db = new DatabaseSync(dbPath, { readOnly: true });
  }

  dugumAra(metin: string, alan?: string, limit?: number): DugumAday[] {
    return this.c.dugumAra(metin, alan, limit);
  }
  dugumGetir(id: string) {
    return this.c.dugumGetir(id);
  }
  kartGetir(dugumId: string) {
    return this.c.kartGetir(dugumId);
  }
  ara(input: AraInput): KararOzet[] {
    return this.c.ara(input) as unknown as KararOzet[];
  }
  araDetay(input: AraInput): { hits: KararOzet[]; strateji: string; denenen: string[] } {
    return this.c.araDetay(input) as unknown as { hits: KararOzet[]; strateji: string; denenen: string[] };
  }
  kararGetir(id: string): KararOzet | null {
    return this.c.kararGetir(id) as unknown as KararOzet | null;
  }
  maddeGetir(id: string, _tarih?: string): MaddeKaydi | null {
    return this.c.maddeGetir(id);
  }
  maddeAra(sorgu: string, limit: number): MaddeKaydi[] {
    const tokenler = ftsKey(sorgu).split(" ").filter(Boolean).slice(0, 8);
    if (tokenler.length === 0) return [];
    // OR is deliberate: a citizen's phrasing rarely matches the statute's AND-wise
    const q = tokenler.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
    try {
      const rows = this.db
        .prepare(
          `SELECT madde_id, snippet(madde_fts, 2, '', '', '…', 20) AS snip
           FROM madde_fts WHERE kok MATCH ? ORDER BY bm25(madde_fts) LIMIT ?`,
        )
        .all(q, limit) as unknown as { madde_id: string; snip: string }[];
      const out: MaddeKaydi[] = [];
      for (const r of rows) {
        const m = this.c.maddeGetir(r.madde_id);
        if (m) out.push({ ...m, metin: r.snip || m.metin.slice(0, 240) });
      }
      return out;
    } catch {
      return [];
    }
  }

  maddeNumaralari(mevzuatId: string): string[] {
    try {
      return (this.db.prepare("SELECT madde_no FROM madde WHERE mevzuat_id = ?").all(mevzuatId) as unknown as { madde_no: string }[]).map((r) => r.madde_no);
    } catch {
      return [];
    }
  }

  argumanlar(dugumId: string): ArgumanSatiri[] {
    try {
      return this.db
        .prepare(
          "SELECT id, taraf, iddia, kabul, ret, belirleyici FROM arguman WHERE dugum_id = ? ORDER BY (kabul + ret) DESC",
        )
        .all(dugumId) as unknown as ArgumanSatiri[];
    } catch {
      return [];
    }
  }
  argumanGetir(id: string): ArgumanSatiri | null {
    try {
      const row = this.db
        .prepare("SELECT id, taraf, iddia, kabul, ret, belirleyici FROM arguman WHERE id = ?")
        .get(id);
      return (row as unknown as ArgumanSatiri) ?? null;
    } catch {
      return null;
    }
  }
  meta(k: string): string | null {
    return this.c.meta(k);
  }
  yayinSurumu(): string {
    return this.c.meta("surum") ?? "v0";
  }
  close(): void {
    this.c.close();
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }
}

export function corpusPort(dbPath: string): CorpusPort & { close(): void } {
  return new CorpusAdaptor(dbPath);
}

/**
 * Parameter reader overlay: expert-approved values in the published DB take
 * precedence over the engine's compiled-in table. Reads are year/date gated, so
 * a query about 2023 never sees a 2026 threshold.
 */
function dbOkuyucu(dbPath: string, temel: ParamLike): ParamLike {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    db = null;
  }
  return {
    get(kuralId: string, anahtar: string, tarih: string) {
      if (db) {
        try {
          const row = db
            .prepare(
              `SELECT deger, kaynak_url, durum, gecerlilik_bas FROM kural_parametre
               WHERE kural_id = ? AND anahtar = ? AND gecerlilik_bas <= ?
                 AND (gecerlilik_bit IS NULL OR gecerlilik_bit >= ?)
               ORDER BY gecerlilik_bas DESC LIMIT 1`,
            )
            .get(kuralId, anahtar, tarih, tarih) as
            | { deger: string; kaynak_url: string; durum: string; gecerlilik_bas: string }
            | undefined;
          if (row) {
            let deger: unknown = row.deger;
            try {
              deger = JSON.parse(row.deger);
            } catch {
              /* plain string scalar */
            }
            return {
              deger,
              kaynak_url: row.kaynak_url,
              durum: row.durum as never,
              gecerlilik_bas: row.gecerlilik_bas,
              surum: `db@${row.gecerlilik_bas}`,
            };
          }
        } catch {
          /* fall through to the compiled table */
        }
      }
      return temel.get(kuralId, anahtar, tarih);
    },
  };
}

interface ParamLike {
  get(kuralId: string, anahtar: string, tarih: string): unknown;
}

/**
 * Rules engine adapter. Dynamic so a missing/broken package degrades to
 * corpus-only answers rather than a boot failure.
 */
export async function kuralPort(dbPath?: string): Promise<KuralPort & { motorVar: boolean }> {
  try {
    // resolved at runtime; the specifier is indirect so the server can boot
    // and typecheck even before the rules package is present
    const spec = ["@hukuk", "rules"].join("/");
    const mod = (await import(spec)) as {
      KURALLAR?: Record<string, unknown>;
      VARSAYILAN_OKUYUCU?: ParamLike;
      kuralCalistir?: (
        id: string,
        girdiler: Record<string, unknown>,
        p: ParamLike,
        bugun: string,
      ) => KuralSonucu;
    };
    const kurallar = mod.KURALLAR ?? {};
    const calistir = mod.kuralCalistir;
    const temel = mod.VARSAYILAN_OKUYUCU;
    if (!calistir || !temel) throw new Error("kuralCalistir / VARSAYILAN_OKUYUCU export missing");
    const okuyucu = dbPath ? dbOkuyucu(dbPath, temel) : temel;
    return {
      motorVar: true,
      varMi: (id) => Object.hasOwn(kurallar, id),
      calistir: (id, girdiler, bugun) => calistir(id, girdiler, okuyucu, bugun),
    };
  } catch (err) {
    const neden = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[hukuk-mcp] kural motoru yok, korpus modu: ${neden}\n`);
    return {
      motorVar: false,
      varMi: () => false,
      calistir: () => BOS_SONUC,
    };
  }
}
