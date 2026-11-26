#!/usr/bin/env node
/**
 * Citation graph + appeal chain, built after the Python corpus build.
 *
 *   node scripts/build-graph.ts            # data/build/hukuk.db (or HUKUK_DB)
 *
 * Writes into the compiled DB:
 *   karar_atif(karar_id, madde_id, adet, mulga)   statute articles each decision cites
 *   ust_inceleme(...)                             the reviewed (lower) decision of each Yargıtay text
 * and the summary keys graf_* into `meta`. Idempotent: both tables are rebuilt.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { corpusPort } from "../packages/mcp-server/src/adapters.ts";
import { atiflariCikar } from "../packages/mcp-server/src/atif.ts";
import { bamKararId, ustBaslikCoz } from "../packages/mcp-server/src/temyiz.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB = process.env["HUKUK_DB"] ?? join(ROOT, "data", "build", "hukuk.db");
const RAW = process.env["HUKUK_RAW_KARARLAR"] ?? join(ROOT, "data", "raw", "decisions.jsonl");

for (const p of [DB, RAW]) {
  if (!existsSync(p)) {
    process.stderr.write(`bulunamadı: ${p}\nÖnce: python3 pipeline/build.py (ve pipeline/collect/bedesten.py)\n`);
    process.exit(1);
  }
}

interface Ham {
  src: string;
  id: string;
  metin?: string;
}
const ham: Ham[] = readFileSync(RAW, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Ham);

// ---- read phase (read-only port) -------------------------------------------
const port = corpusPort(DB);
const ro = new DatabaseSync(DB, { readOnly: true });
const belgeKarar = new Map<string, { id: string; mahkeme: string; sonuc: string | null }>();
for (const r of ro.prepare("SELECT id, mahkeme, sonuc, kaynak_url FROM karar").all() as unknown as {
  id: string; mahkeme: string; sonuc: string | null; kaynak_url: string;
}[]) {
  const m = /documentId=(\d+)\s*$/.exec(r.kaynak_url);
  if (m) belgeKarar.set(m[1]!, { id: r.id, mahkeme: r.mahkeme, sonuc: r.sonuc });
}
ro.close();

const atifSatirlari: Array<[string, string, number, number]> = [];
interface UstSatir { ust: string; daire: string; esas: string; karar: string; altId: string | null; sonuc: string | null; kaynak: string; seviye: string }
const ustSatirlari: UstSatir[] = [];
let eslesenMetin = 0;
let atifli = 0;
let bamSatir = 0;
for (const r of ham) {
  const k = belgeKarar.get(String(r.id));
  const metin = r.metin ?? "";
  if (!k || !metin) continue;
  eslesenMetin++;

  const sayac = new Map<string, { adet: number; mulga: number }>();
  for (const a of atiflariCikar(metin, port)) {
    if (a.tur !== "madde" || !a.kimlik || (a.durum !== "DOGRU" && a.durum !== "MULGA")) continue;
    const madde = /^(m:[^/]+\/[^/]+)/.exec(a.kimlik)?.[1];
    if (!madde) continue;
    // a repealed paragraph still cites a live article; only a whole-article repeal is flagged
    const mulga = a.durum === "MULGA" && a.kimlik === madde ? 1 : 0;
    const x = sayac.get(madde) ?? { adet: 0, mulga: 0 };
    x.adet++;
    x.mulga = Math.max(x.mulga, mulga);
    sayac.set(madde, x);
  }
  if (sayac.size) atifli++;
  for (const [m, x] of sayac) atifSatirlari.push([k.id, m, x.adet, x.mulga]);

  if (k.mahkeme === "yargitay") {
    for (const s of ustBaslikCoz(metin)) {
      let altId: string | null = null;
      if (s.seviye === "bam") {
        const aday = bamKararId(s);
        if (aday && port.kararGetir(aday)) altId = aday;
      }
      ustSatirlari.push({
        ust: k.id, daire: s.daire, esas: s.esas ?? "", karar: s.karar ?? "", altId, sonuc: k.sonuc,
        kaynak: "metin-baslik", seviye: s.seviye,
      });
      if (s.seviye === "bam") bamSatir++;
    }
  }
}
port.close();

// ---- write phase -----------------------------------------------------------
const db = new DatabaseSync(DB);
db.exec(`
  DROP TABLE IF EXISTS karar_atif;
  DROP TABLE IF EXISTS ust_inceleme;
  CREATE TABLE karar_atif (
    karar_id TEXT NOT NULL,
    madde_id TEXT NOT NULL,
    adet     INTEGER NOT NULL,
    mulga    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (karar_id, madde_id)
  );
  CREATE INDEX karar_atif_madde ON karar_atif(madde_id);
  CREATE TABLE ust_inceleme (
    ust_karar_id TEXT NOT NULL,
    seviye       TEXT NOT NULL,          -- bam | ilkderece
    alt_daire    TEXT,
    alt_esas     TEXT,
    alt_karar    TEXT,
    alt_karar_id TEXT,                   -- set only when that decision exists in karar
    ust_sonuc    TEXT,                   -- heuristic outcome of the Yargıtay decision
    kaynak       TEXT
  );
  CREATE INDEX ust_inceleme_ust ON ust_inceleme(ust_karar_id);
  CREATE INDEX ust_inceleme_alt ON ust_inceleme(alt_karar_id);
`);
db.exec("BEGIN");
const insA = db.prepare("INSERT INTO karar_atif (karar_id, madde_id, adet, mulga) VALUES (?,?,?,?)");
for (const [a, b, c, d] of atifSatirlari) insA.run(a, b, c, d);
const insU = db.prepare(
  "INSERT INTO ust_inceleme (ust_karar_id, seviye, alt_daire, alt_esas, alt_karar, alt_karar_id, ust_sonuc, kaynak) VALUES (?,?,?,?,?,?,?,?)",
);
for (const u of ustSatirlari) insU.run(u.ust, u.seviye, u.daire, u.esas, u.karar, u.altId, u.sonuc, u.kaynak);
const eslesen = ustSatirlari.filter((u) => u.altId).length;
const meta = db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)");
const oran = eslesenMetin ? ((100 * atifli) / eslesenMetin).toFixed(1) : "0.0";
meta.run("graf_karar_atif_satir", String(atifSatirlari.length));
meta.run("graf_atif_karar_orani", oran);
meta.run("graf_ust_inceleme_satir", String(ustSatirlari.length));
meta.run("graf_bam_eslesen", String(eslesen));
meta.run("graf_ozet_tarih", new Date().toISOString().slice(0, 10));
db.exec("COMMIT");
db.close();

process.stderr.write(
  `graf hazır · metin ${eslesenMetin} · karar_atif ${atifSatirlari.length} satır (%${oran} karar atıflı) · ` +
    `ust_inceleme ${ustSatirlari.length} satır (bam ${bamSatir}, eşleşen ${eslesen})\n`,
);
