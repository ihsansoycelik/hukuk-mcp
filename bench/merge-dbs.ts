/**
 * bench/merge-dbs.ts — build ONE realistic database for measurement.
 *
 * Why: while the pipeline is still landing, the two available databases are
 * complementary and neither is measurable end-to-end:
 *   data/build/fixture.db — ontology nodes + authored cards, but no legislation
 *   data/build/hukuk.db   — real legislation (6502: 95 articles) + decisions, but no cards
 *
 * This script reads both (read-only) and writes a measurement-only database to
 * `bench/results/merged.db`. It NEVER writes to data/ and never changes the
 * server. The report must say which DB was measured — `measure.ts` records the
 * path, size and row counts automatically.
 *
 * Usage: node bench/merge-dbs.ts [--a data/build/fixture.db] [--b data/build/hukuk.db]
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { repoRoot, resultsPath, round } from "./util.ts";

function arg(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return resolve(repoRoot(), v ?? fallback);
}

const A = arg("--a", "data/build/fixture.db"); // ontology + cards
const B = arg("--b", "data/build/hukuk.db"); // real legislation + decisions
const OUT = resultsPath("merged.db");

if (!existsSync(A) || !existsSync(B)) {
  console.error(`kaynak db yok: ${existsSync(A) ? "" : A} ${existsSync(B) ? "" : B}`);
  process.exit(1);
}

// 1) consistent copy of A (VACUUM INTO = checkpoint + copy in one step)
if (existsSync(OUT)) rmSync(OUT, { force: true });
const a = new DatabaseSync(A);
a.exec(`VACUUM INTO '${OUT.replace(/'/g, "''")}'`);
a.close();

// 2) pull the tables that only B has (legislation, articles, decisions)
const db = new DatabaseSync(OUT);
db.exec("PRAGMA journal_mode = WAL");
db.exec(`ATTACH DATABASE '${B.replace(/'/g, "''")}' AS h`);

const copied: Record<string, number> = {};
for (const table of ["mevzuat", "madde", "madde_fts", "karar", "karar_fts", "atif"] as const) {
  try {
    const before = (db.prepare(`select count(*) c from main.${table}`).get() as { c: number }).c;
    db.exec(`INSERT OR IGNORE INTO main.${table} SELECT * FROM h.${table}`);
    const after = (db.prepare(`select count(*) c from main.${table}`).get() as { c: number }).c;
    copied[table] = after - before;
  } catch (err) {
    copied[table] = -1;
    console.error(`  ${table}: atlandı (${(err as Error).message})`);
  }
}
db.exec("DETACH DATABASE h");

const counts: Record<string, number> = {};
for (const t of ["mevzuat", "madde", "karar", "dugum", "kart", "kural_parametre"]) {
  try {
    counts[t] = (db.prepare(`select count(*) c from main.${t}`).get() as { c: number }).c;
  } catch {
    counts[t] = -1;
  }
}
db.close();

console.log(`birleşik db -> ${OUT}`);
console.log(`  eklenen satırlar: ${JSON.stringify(copied)}`);
console.log(`  tablo sayıları:    ${JSON.stringify(counts)}`);
console.log(`  boyut: ${round(
  (await import("node:fs")).statSync(OUT).size / 1024 / 1024,
  1,
)} MB`);
console.log("  not: ölçüm veritabanıdır; data/build/ dosyalarına dokunulmadı.");
