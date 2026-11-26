/**
 * Gold set A: statute-article retrieval, judged by the decisions themselves.
 *
 *   node eval/fixtures/build-madde-golden.ts [--n 250] [--db ...] [--raw ...] [--out eval/golden/madde-atif.jsonl]
 *
 * Method: for each raw decision, `atiflariCikar` pulls the statute articles the
 * court cites in the FULL text. Only durum DOGRU citations of laws 6502, 6098,
 * 6100, 6325, 5510, 4447, 2004 are kept. The query is the decision's own
 * summary (ozet_l1, else ozet_l0) with every citation, law abbreviation and
 * digit removed, so the query cannot match by article number. Gold = cited
 * article ids. Sampling is deterministic: rows sorted by documentId, every k-th.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { corpusPort } from "../../packages/mcp-server/src/adapters.ts";
import { atiflariCikar } from "../../packages/mcp-server/src/atif.ts";

const arg = (b: string, d: string): string => {
  const i = process.argv.indexOf(b);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};
const KOK = resolve(import.meta.dirname, "../..");
const dbYol = resolve(KOK, arg("--db", "data/build/hukuk.db"));
const rawYol = resolve(KOK, arg("--raw", "data/raw/decisions.jsonl"));
const cikti = resolve(KOK, arg("--out", "eval/golden/madde-atif.jsonl"));
const HEDEF = Number(arg("--n", "250"));
for (const [ad, yol] of [["derlenmiş veritabanı", dbYol], ["ham kararlar", rawYol]] as const) {
  if (!existsSync(yol)) {
    console.error(`${ad} bulunamadı: ${yol}\n(bu dosyalar git'te yok; önce pnpm build:data ve pnpm collect:kararlar)`);
    process.exit(2);
  }
}

const KANUNLAR = new Set(["6502", "6098", "6100", "6325", "5510", "4447", "2004"]);
const MIN_KELIME = 6;

/** Remove every citation-like fragment so the query cannot match by number. */
export function atifTemizle(s: string): string {
  return s
    .replace(/\b\d+\s*sayılı\b/gi, " ")
    .replace(/\b(TKHK|TBK|HMK|HAUK|HAÜK|İİK|IIK|SGK|SSGSSK)\b/g, " ")
    .replace(/\b(m|md|mad)\./gi, " ")
    .replace(/\b(madde(?:si|sinin|sine|de|den|nin|ler|lerin)?|maddeleri\w*|fıkra\w*|bent\w*|sayılı|kanun\w*)\b/gi, " ")
    .replace(/[0-9]+/g, " ")
    .replace(/[()\[\]\/]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s([,.;:])/g, "$1")
    .trim();
}

const db = new DatabaseSync(dbYol, { readOnly: true });
const ozetler = new Map<string, string>();
for (const r of db.prepare("SELECT kaynak_url, ozet_l0, ozet_l1 FROM karar").all() as { kaynak_url: string; ozet_l0: string | null; ozet_l1: string | null }[]) {
  const id = /documentId=(\d+)/.exec(r.kaynak_url ?? "")?.[1];
  const ozet = (r.ozet_l1 && r.ozet_l1.trim()) || (r.ozet_l0 && r.ozet_l0.trim()) || "";
  if (id && ozet) ozetler.set(id, ozet);
}
const kararKimlik = new Map<string, string>();
for (const r of db.prepare("SELECT id, kaynak_url FROM karar").all() as { id: string; kaynak_url: string }[]) {
  const id = /documentId=(\d+)/.exec(r.kaynak_url ?? "")?.[1];
  if (id) kararKimlik.set(id, r.id);
}
db.close();

const corpus = corpusPort(dbYol);
const raw: { id: string; metin: string }[] = [];
const goruldu = new Set<string>();
for (const line of readFileSync(rawYol, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line) as { id: string; metin: string };
  const id = String(r.id);
  if (goruldu.has(id)) continue;
  goruldu.add(id);
  raw.push({ id, metin: r.metin });
}
raw.sort((a, b) => Number(a.id) - Number(b.id));

let karar = 0;
let atifli = 0;
let ozetli = 0;
const adaylar: { karar_id: string; belge: string; sorgu: string; ilgili: string[] }[] = [];
for (const r of raw) {
  karar++;
  const ozet = ozetler.get(r.id);
  if (!ozet) continue;
  ozetli++;
  const kimlikler = new Set<string>();
  for (const a of atiflariCikar(r.metin, corpus)) {
    if (a.tur !== "madde" || a.durum !== "DOGRU" || !a.kimlik) continue;
    const kanun = /^m:(\d+)\//.exec(a.kimlik)?.[1];
    if (kanun && KANUNLAR.has(kanun)) kimlikler.add(a.kimlik);
  }
  if (kimlikler.size === 0) continue;
  atifli++;
  const sorgu = atifTemizle(ozet);
  if (sorgu.split(/\s+/).filter(Boolean).length < MIN_KELIME) continue;
  adaylar.push({ karar_id: kararKimlik.get(r.id) ?? r.id, belge: r.id, sorgu, ilgili: [...kimlikler].sort() });
}
corpus.close();

const k = Math.max(1, Math.floor(adaylar.length / HEDEF));
const secilen = adaylar.filter((_, i) => i % k === 0).slice(0, HEDEF);
const baslik = {
  _yontem:
    "Kaynağa dayalı madde-getirme seti. Sorgu: kararın özeti (ozet_l1, yoksa ozet_l0), tüm atıf, kanun kısaltması ve rakam silinmiş. İlgili: kararın tam metninde atiflariCikar ile bulunan, durumu DOGRU olan ve kanunu 6502/6098/6100/6325/5510/4447/2004 olan madde kimlikleri. Örnekleme: documentId sırasına göre her k-inci karar. Üreten: eval/fixtures/build-madde-golden.ts. Veri değişince yeniden üretin.",
  kanunlar: [...KANUNLAR],
  ham_karar: karar,
  ozetli_karar: ozetli,
  atifli_karar: atifli,
  kullanilabilir: adaylar.length,
  secilen: secilen.length,
};
const cikis = [JSON.stringify(baslik), ...secilen.map((s, i) => JSON.stringify({ id: `a${String(i + 1).padStart(3, "0")}`, karar_id: s.karar_id, sorgu: s.sorgu, ilgili: s.ilgili }))];
writeFileSync(cikti, cikis.join("\n") + "\n");
console.log(JSON.stringify(baslik));
console.log(`yazıldı: ${cikti}`);
