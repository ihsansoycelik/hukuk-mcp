/**
 * Mechanical search golden set for the REAL compiled corpus.
 *
 *   node eval/fixtures/build-real-golden.ts --db data/build/hukuk.db
 *
 * Honest labelling note (also written into every JSONL row):
 *  - Queries are the ontology's authored example phrasings (lay Turkish).
 *  - A decision is "relevant" when its full-text FTS key contains at least 60%
 *    of the query's known stems AND every query stem that occurs in at most 20%
 *    of decisions ("rare" stems). This is keyword/subject matching, not human
 *    judgement.
 *  - The judged set per query is capped at the 4 decisions with the highest stem
 *    coverage. Other decisions are unjudged and are treated as non-relevant by
 *    the metric (pooled-judgement convention), which makes Precision@5
 *    conservative and Recall@5 optimistic. Both are labelled that way in NOTES.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tumDugumler } from "../../packages/ontology/src/index.ts";
import { ftsKey } from "../../packages/tr-text/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const KOK = resolve(HERE, "..", "..");

interface Doc {
  id: string;
  tok: Set<string>;
}

function mutlak(p: string): string {
  return isAbsolute(p) ? p : resolve(KOK, p);
}

function argDegeri(bayrak: string): string | undefined {
  const a = process.argv.slice(2);
  const i = a.indexOf(bayrak);
  return i >= 0 ? a[i + 1] : undefined;
}

function kokEslesir(tok: Set<string>, t: string): boolean {
  if (tok.has(t)) return true;
  const on = t.slice(0, 2);
  if (t.length < 3) return false;
  for (const x of tok) {
    if (x.length < 3 || Math.abs(x.length - t.length) > 2 || x.slice(0, 2) !== on) continue;
    if (x.startsWith(t) || t.startsWith(x)) return true;
  }
  return false;
}

function main(): void {
  const dbYolu = mutlak(argDegeri("--db") ?? process.env["HUKUK_DB"] ?? "data/build/hukuk.db");
  const hedef = mutlak(argDegeri("--out") ?? join(HERE, "..", "golden", "search-real.jsonl"));
  if (!existsSync(dbYolu)) throw new Error(`DB yok: ${dbYolu}`);

  const db = new DatabaseSync(dbYolu, { readOnly: true });
  let docs: Doc[];
  try {
    docs = db
      .prepare("SELECT karar_id, kok FROM karar_fts")
      .all()
      .map((r) => ({
        id: String(r["karar_id"]),
        tok: new Set(String(r["kok"] ?? "").split(" ").filter(Boolean)),
      }));
  } finally {
    db.close();
  }
  if (docs.length === 0) throw new Error("karar_fts boş; gerçek korpus derlenmemiş.");

  const n = docs.length;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tok) df.set(t, (df.get(t) ?? 0) + 1);
  const nadirEsik = Math.max(3, Math.floor(n * 0.2));

  const satirlar: string[] = [];
  let sira = 0;
  for (const dugum of tumDugumler().filter((d) => d.yaprak)) {
    for (const sorgu of dugum.ornek_sorgular) {
      const tokens = [...new Set(ftsKey(sorgu).split(" ").filter(Boolean))];
      const bilinen = tokens.filter((t) => df.has(t));
      if (bilinen.length < 3) continue;
      const nadir = bilinen.filter((t) => (df.get(t) ?? 0) <= nadirEsik);

      const skorlu: Array<{ id: string; kapsam: number; nadirKapsam: number }> = [];
      for (const d of docs) {
        const eslesen = bilinen.filter((t) => kokEslesir(d.tok, t)).length;
        const kapsam = eslesen / bilinen.length;
        const nadirEslesen = nadir.length ? nadir.filter((t) => kokEslesir(d.tok, t)).length : 0;
        const nadirKapsam = nadir.length ? nadirEslesen / nadir.length : 1;
        if (kapsam >= 0.6 && nadirKapsam >= 1 && eslesen >= 3) {
          skorlu.push({ id: d.id, kapsam, nadirKapsam });
        }
      }
      if (skorlu.length === 0) continue;
      skorlu.sort(
        (a, b) =>
          b.kapsam - a.kapsam ||
          b.nadirKapsam - a.nadirKapsam ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      const ilgili = skorlu.slice(0, 4).map((x) => x.id);
      sira++;
      satirlar.push(
        JSON.stringify({
          id: `sr${String(sira).padStart(3, "0")}`,
          sorgu,
          ilgili,
          dugum: dugum.id,
          yontem:
            `mekanik (pooled, gerçek korpus): ontoloji örnek sorgusu; ilgili = tam metin FTS anahtarında ` +
            `bilinen köklerin en az %60'ını ve tüm nadir kökleri (df<=${nadirEsik}/${n}) içeren kararlardan ` +
            `kapsama göre ilk 4'ü. Diğer kararlar yargılanmadı (non-relevant sayılır).`,
          havuz: skorlu.length,
        }),
      );
    }
  }

  mkdirSync(dirname(hedef), { recursive: true });
  writeFileSync(hedef, satirlar.join("\n") + "\n", "utf8");
  console.log(`search-real.jsonl yazıldı: ${satirlar.length} sorgu / ${n} karar / ${hedef}`);
}

main();
