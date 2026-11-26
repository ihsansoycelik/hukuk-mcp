/**
 * Lay-language search evaluation (independent of query wording).
 *
 *   node eval/lay-search.ts [--db data/build/hukuk.db] [--raw data/raw/decisions.jsonl]
 *
 * Why: the mechanical golden set (search-real.jsonl) labels a decision relevant
 * when it contains the *query's own stems*, so it cannot reward a query that
 * says "paramı geri vermiyorlar" finding decisions that say "bedel iadesi".
 *
 * Here each query in eval/golden/search-lay.jsonl is written in everyday
 * Turkish and deliberately avoids the legal term (`kavram`). A decision counts
 * as relevant when the collector fetched it for that concept (the source's own
 * phrase search, recorded as `sorgu` in decisions.jsonl) AND its full text
 * contains the concept phrase. Relevance therefore comes from the court
 * database, not from our ranking or our query words.
 *
 * Reported: Hit@5 (at least one relevant in top 5), P@5, MRR@10, nDCG@10.
 *
 * The scoring lives in `layDegerlendir`, which eval/variants.ts imports.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Corpus } from "../packages/retrieval/src/corpus.ts";
import { foldNormalized } from "../packages/tr-text/src/index.ts";

export interface LayGold {
  id: string;
  kavram: string;
  sorgu: string;
}

export interface LayMetrik {
  n: number;
  hit5: number;
  p5: number;
  mrr: number;
  ndcg10: number;
  /** Per-call wall time of `Corpus.ara` in ms. */
  gecikmeMs: number[];
  satirlar: string[];
}

/** documentId -> concept, only when the full text really mentions the concept. */
export function kavramBelgeleri(rawYol: string): Map<string, Set<string>> {
  const harita = new Map<string, Set<string>>();
  for (const line of readFileSync(rawYol, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as { id: string; sorgu?: string; metin: string };
    if (!r.sorgu) continue;
    if (!foldNormalized(r.metin).includes(foldNormalized(r.sorgu))) continue;
    const s = harita.get(r.sorgu) ?? new Set<string>();
    s.add(String(r.id));
    harita.set(r.sorgu, s);
  }
  return harita;
}

/** karar.id -> source documentId. */
export function belgeNoHaritasi(dbYol: string): Map<string, string> {
  const db = new DatabaseSync(dbYol, { readOnly: true });
  const harita = new Map<string, string>();
  for (const r of db.prepare("SELECT id, kaynak_url FROM karar").all() as { id: string; kaynak_url: string | null }[]) {
    const d = /documentId=(\d+)/.exec(r.kaynak_url ?? "")?.[1];
    if (d) harita.set(r.id, d);
  }
  db.close();
  return harita;
}

export function goldOku(yol: string): LayGold[] {
  return readFileSync(yol, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LayGold);
}

export function layDegerlendir(
  corpus: Corpus,
  kavramBelge: Map<string, Set<string>>,
  belgeNo: Map<string, string>,
  gold: LayGold[],
): LayMetrik {
  let hit = 0;
  let p5 = 0;
  let mrr = 0;
  let ndcg = 0;
  let n = 0;
  const gecikmeMs: number[] = [];
  const satirlar: string[] = [];
  for (const q of gold) {
    const ilgili = kavramBelge.get(q.kavram);
    if (!ilgili || ilgili.size === 0) {
      satirlar.push(`  - ${q.id} atlandı: '${q.kavram}' için kaynakta karar yok`);
      continue;
    }
    n++;
    const t0 = performance.now();
    const sonuc = corpus.ara({ sorgu: q.sorgu, limit: 10 });
    gecikmeMs.push(performance.now() - t0);
    const isabet = sonuc.map((h) => ilgili.has(belgeNo.get(h.karar_id) ?? ""));
    const ilk = isabet.indexOf(true);
    if (ilk >= 0 && ilk < 5) hit++;
    if (ilk >= 0) mrr += 1 / (ilk + 1);
    p5 += isabet.slice(0, 5).filter(Boolean).length / 5;
    const dcg = isabet.reduce((a, r, i) => a + (r ? 1 / Math.log2(i + 2) : 0), 0);
    let idcg = 0;
    for (let i = 0; i < Math.min(ilgili.size, 10); i++) idcg += 1 / Math.log2(i + 2);
    ndcg += idcg > 0 ? dcg / idcg : 0;
    if (!(ilk >= 0 && ilk < 5)) satirlar.push(`  - ${q.id} [${q.kavram}] "${q.sorgu}" -> ilk 5'te isabet yok`);
  }
  const d = Math.max(n, 1);
  return { n, hit5: hit / d, p5: p5 / d, mrr: mrr / d, ndcg10: ndcg / d, gecikmeMs, satirlar };
}

const anaModul = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (anaModul) {
  const arg = (b: string, d: string): string => {
    const i = process.argv.indexOf(b);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
  };
  const KOK = resolve(import.meta.dirname, "..");
  const db = resolve(KOK, arg("--db", "data/build/hukuk.db"));
  const raw = resolve(KOK, arg("--raw", "data/raw/decisions.jsonl"));
  const golden = resolve(KOK, arg("--golden", "eval/golden/search-lay.jsonl"));

  const m = layDegerlendir(new Corpus(db), kavramBelgeleri(raw), belgeNoHaritasi(db), goldOku(golden));
  const yuzde = (x: number): string => `${(100 * x).toFixed(1)}%`;
  console.log(`Halk dili arama · ${m.n} sorgu · db=${db} · eşanlam=${process.env.HUKUK_ESANLAM === "0" ? "kapalı" : "açık"}`);
  console.log(`  Hit@5 ${yuzde(m.hit5)} (${Math.round(m.hit5 * m.n)}/${m.n})   P@5 ${yuzde(m.p5)}   MRR@10 ${m.mrr.toFixed(3)}   nDCG@10 ${m.ndcg10.toFixed(3)}`);
  for (const s of m.satirlar) console.log(s);

  // Gate: Hit@5 on a held-out set must stay at or above 65%.
  const ESIK = Number(process.env.HIT5_ESIK ?? (/holdout2?\.jsonl$/.test(golden) ? 0.65 : 0));
  if (ESIK > 0) {
    const gecti = m.hit5 >= ESIK;
    console.log(`KAPI Hit@5 ≥ ${(ESIK * 100).toFixed(0)}%: ${gecti ? "PASS" : "FAIL"}`);
    if (!gecti) process.exitCode = 1;
  }
}
