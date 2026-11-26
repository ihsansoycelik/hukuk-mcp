/**
 * Export the rules engine's dated parameter records into the published corpus.
 *
 * The engine ships a compiled-in, dated table so it can run standalone, but the
 * published database must still carry the same rows: the query-time reader
 * prefers DB values, experts approve them there, and the "legal values live in
 * dated tables, not code" invariant stays true.
 *
 * Usage:
 *   node scripts/export-parametreler.ts                       # write JSON only
 *   node scripts/export-parametreler.ts --db data/build/hukuk.db
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { KAYITLAR, PARAMETRE_SURUMU } from "@hukuk/rules";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dbIndex = args.indexOf("--db");
const dbPath = dbIndex >= 0 ? args[dbIndex + 1] : null;

const rows = KAYITLAR.map((k) => ({
  kural_id: k.kural_id,
  anahtar: k.anahtar,
  deger: k.deger,
  gecerlilik_bas: k.gecerlilik_bas,
  gecerlilik_bit: k.gecerlilik_bit,
  kaynak_url: k.kaynak_url,
  durum: k.durum,
}));

const json = join(ROOT, "data", "build", "kural_parametre.json");
writeFileSync(
  json,
  JSON.stringify({ surum: PARAMETRE_SURUMU, kayitlar: rows }, null, 1) + "\n",
  "utf8",
);
console.log(`[params] ${rows.length} kayıt -> ${json} (sürüm ${PARAMETRE_SURUMU})`);

if (dbPath) {
  const db = new DatabaseSync(dbPath);
  const ins = db.prepare(
    `INSERT OR REPLACE INTO kural_parametre
       (kural_id, anahtar, deger, gecerlilik_bas, gecerlilik_bit, kaynak_url, durum)
     VALUES (?,?,?,?,?,?,?)`,
  );
  db.exec("BEGIN");
  try {
    for (const r of rows) {
      ins.run(
        r.kural_id,
        r.anahtar,
        JSON.stringify(r.deger),
        r.gecerlilik_bas,
        r.gecerlilik_bit,
        r.kaynak_url,
        r.durum,
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  const n = (db.prepare("SELECT count(*) AS n FROM kural_parametre").get() as { n: number }).n;
  const tarihsiz = (
    db.prepare("SELECT count(*) AS n FROM kural_parametre WHERE gecerlilik_bas IS NULL").get() as { n: number }
  ).n;
  db.close();
  console.log(`[params] db=${dbPath} satır=${n} tarihsiz=${tarihsiz}`);
  if (tarihsiz > 0) {
    console.error("[params] HATA: tarihsiz parametre satırı var");
    process.exit(1);
  }
}
