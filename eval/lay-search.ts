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
 * Reported: Hit@5 (at least one relevant in top 5), P@5, MRR.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Corpus } from "../packages/retrieval/src/corpus.ts";
import { foldNormalized } from "../packages/tr-text/src/index.ts";

const arg = (b: string, d: string): string => {
  const i = process.argv.indexOf(b);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};
const KOK = resolve(import.meta.dirname, "..");
const db = resolve(KOK, arg("--db", "data/build/hukuk.db"));
const raw = resolve(KOK, arg("--raw", "data/raw/decisions.jsonl"));
const golden = resolve(KOK, arg("--golden", "eval/golden/search-lay.jsonl"));

// documentId -> concept, only when the full text really mentions the concept
const kavramBelge = new Map<string, Set<string>>();
for (const line of readFileSync(raw, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line) as { id: string; sorgu?: string; metin: string };
  if (!r.sorgu) continue;
  if (!foldNormalized(r.metin).includes(foldNormalized(r.sorgu))) continue;
  const s = kavramBelge.get(r.sorgu) ?? new Set<string>();
  s.add(String(r.id));
  kavramBelge.set(r.sorgu, s);
}

const corpus = new Corpus(db);
const docId = (url: string): string => /documentId=(\d+)/.exec(url)?.[1] ?? "";
const urlStmt = (corpus as unknown as { db: { prepare(s: string): { get(...a: unknown[]): unknown } } }).db.prepare(
  "SELECT kaynak_url FROM karar WHERE id = ?",
);

let hit = 0;
let p5 = 0;
let mrr = 0;
let n = 0;
const satirlar: string[] = [];
for (const line of readFileSync(golden, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const q = JSON.parse(line) as { id: string; kavram: string; sorgu: string };
  const ilgili = kavramBelge.get(q.kavram);
  if (!ilgili || ilgili.size === 0) {
    satirlar.push(`  - ${q.id} atlandı: '${q.kavram}' için kaynakta karar yok`);
    continue;
  }
  n++;
  const sonuc = corpus.ara({ sorgu: q.sorgu, limit: 5 });
  const isabet = sonuc.map((h) => ilgili.has(docId(String((urlStmt.get(h.karar_id) as { kaynak_url: string } | undefined)?.kaynak_url ?? ""))));
  const ilk = isabet.indexOf(true);
  if (ilk >= 0) {
    hit++;
    mrr += 1 / (ilk + 1);
  }
  p5 += isabet.filter(Boolean).length / 5;
  if (ilk < 0) satirlar.push(`  - ${q.id} [${q.kavram}] "${q.sorgu}" -> isabet yok`);
}

const yuzde = (x: number): string => `${((100 * x) / Math.max(n, 1)).toFixed(1)}%`;
console.log(`Halk dili arama · ${n} sorgu · db=${db} · eşanlam=${process.env.HUKUK_ESANLAM === "0" ? "kapalı" : "açık"}`);
console.log(`  Hit@5 ${yuzde(hit)} (${hit}/${n})   P@5 ${yuzde(p5)}   MRR ${(mrr / Math.max(n, 1)).toFixed(3)}`);
for (const s of satirlar) console.log(s);

// Gate: Hit@5 on the held-out set must stay at or above 65%.
const ESIK = Number(process.env.HIT5_ESIK ?? (golden.endsWith("holdout.jsonl") ? 0.65 : 0));
if (ESIK > 0) {
  const gecti = hit / Math.max(n, 1) >= ESIK;
  console.log(`KAPI Hit@5 ≥ ${(ESIK * 100).toFixed(0)}%: ${gecti ? "PASS" : "FAIL"}`);
  if (!gecti) process.exitCode = 1;
}
