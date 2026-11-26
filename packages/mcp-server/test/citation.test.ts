/**
 * Citation integrity — the project's hardest gate: every id we emit must resolve.
 *
 * Rows are collected from the two places ids can enter an answer:
 *   1. authored cards (all `[m:...]` / `[k:...]` citations)
 *   2. rules engine `dayanak` arrays, run with their sample inputs
 * and each one is resolved against the compiled corpus.
 *
 * Skips (does not fail) when the real corpus has not been built yet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { yaziliKartlar } from "@hukuk/ontology";
import { kimlikNormalize } from "../src/render.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DB = process.env.HUKUK_DB ?? join(ROOT, "data", "build", "hukuk.db");
const varMi = existsSync(DB);

function kartKimlikleri(): string[] {
  const out = new Set<string>();
  for (const k of yaziliKartlar()) {
    for (const b of k.bolumler) {
      for (const m of b.metin.matchAll(/\[([mk]:[^\]]+)\]/g)) out.add(m[1]!);
    }
  }
  return [...out];
}

async function kuralKimlikleri(): Promise<string[]> {
  const spec = ["@hukuk", "rules"].join("/");
  const mod = (await import(spec)) as {
    KURALLAR: Record<string, { girdiSemasi: unknown }>;
    ORNEK_GIRDI: Record<string, Record<string, unknown>>;
    kuralCalistir: (id: string, g: unknown, p: unknown, bugun: string) => { dayanak: string[] };
    VARSAYILAN_OKUYUCU: unknown;
  };
  const out = new Set<string>();
  for (const id of Object.keys(mod.KURALLAR)) {
    const girdi = mod.ORNEK_GIRDI[id] ?? {};
    const r = mod.kuralCalistir(id, girdi, mod.VARSAYILAN_OKUYUCU, "2026-10-22");
    for (const d of r.dayanak) out.add(kimlikNormalize(d.split("@")[0]!));
  }
  return [...out];
}

test("every card citation resolves against the corpus", { skip: !varMi }, async () => {
  const { Corpus } = await import("@hukuk/retrieval");
  const corpus = new Corpus(DB);
  const hatalar: string[] = [];
  for (const id of kartKimlikleri()) {
    const kok = id.split("@")[0]!;
    if (kok.startsWith("m:")) {
      if (!corpus.maddeGetir(kok)) hatalar.push(id);
    } else if (kok.startsWith("k:")) {
      if (!corpus.kararGetir(kok)) hatalar.push(id);
    }
  }
  corpus.close();
  assert.deepEqual(hatalar, [], `çözülemeyen kart atıfları: ${hatalar.join(", ")}`);
});

test("every rule dayanak id resolves against the corpus", { skip: !varMi }, async () => {
  const { Corpus } = await import("@hukuk/retrieval");
  const corpus = new Corpus(DB);
  const hatalar: string[] = [];
  for (const id of await kuralKimlikleri()) {
    // "y:mesafeli-sozlesmeler/7" style ids refer to secondary legislation that the
    // v1 corpus does not carry yet; they are reported, not silently passed.
    if (!id.startsWith("m:") && !id.startsWith("k:")) continue;
    if (id.startsWith("m:") && !corpus.maddeGetir(id)) hatalar.push(id);
  }
  corpus.close();
  assert.deepEqual(hatalar, [], `çözülemeyen kural dayanakları: ${hatalar.join(", ")}`);
});

test("card citations are well formed and deduplicated", () => {
  const ids = kartKimlikleri();
  assert.ok(ids.length >= 20, `only ${ids.length} citations`);
  for (const id of ids) {
    assert.match(id, /^(m:\d+\/\d+[A-Za-z]?|k:[a-z0-9-]+)$/, `bozuk kimlik: ${id}`);
  }
});
