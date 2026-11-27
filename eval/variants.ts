/**
 * Variant runner: one command, one table.
 *
 *   node eval/variants.ts            run every variant, write eval/results/latest.{json,md}
 *   node eval/variants.ts --readme   rewrite the eval/README.md block from eval/results/latest.json (no run)
 *
 * Each variant runs in its own child process (`--child <ad>`) so its env is
 * isolated. Measures per variant:
 *   (a) statute-article retrieval on set A (eval/golden/madde-atif.jsonl):
 *       Recall@5, Recall@10, MRR@10
 *   (b) lay decision retrieval on dev, holdout, holdout2: Hit@5, P@5, MRR@10, nDCG@10
 *   (c) p50 / p95 latency of Corpus.ara (limit 10, every lay query, 3 rounds)
 * Gate: holdout + holdout2 combined Hit@5 of the default variant >= 65%.
 * Rule: tables and weights are tuned on dev only; holdout sets are read-only.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { corpusPort } from "../packages/mcp-server/src/adapters.ts";
import { Corpus } from "../packages/retrieval/src/corpus.ts";
import { belgeNoHaritasi, goldOku, kavramBelgeleri, layDegerlendir } from "./lay-search.ts";

interface Varyant {
  ad: string;
  env: Record<string, string>;
}
/** The first entry is the default variant the gate applies to. */
export const VARYANTLAR: Varyant[] = [
  { ad: "yalın FTS", env: { HUKUK_ESANLAM: "0", HUKUK_ATIF_SINYAL: "0" } },
  // HUKUK_ATIF_SINYAL is off by default: the signal variant below did not beat this one on MRR.
  { ad: "+ köprü", env: { HUKUK_ESANLAM: "1", HUKUK_ATIF_SINYAL: "0" } },
  { ad: "+ köprü + atıf sinyali", env: { HUKUK_ESANLAM: "1", HUKUK_ATIF_SINYAL: "1" } },
];
const VARSAYILAN = "+ köprü";
const ESIK = 0.65;

const KOK = resolve(import.meta.dirname, "..");
const DB = resolve(KOK, "data/build/hukuk.db");
const RAW = resolve(KOK, "data/raw/decisions.jsonl");
const MADDE = resolve(KOK, "eval/golden/madde-atif.jsonl");
const SETLER = {
  dev: resolve(KOK, "eval/golden/search-lay.jsonl"),
  holdout: resolve(KOK, "eval/golden/search-lay-holdout.jsonl"),
  holdout2: resolve(KOK, "eval/golden/search-lay-holdout2.jsonl"),
};
const SONUC_JSON = resolve(KOK, "eval/results/latest.json");
const SONUC_MD = resolve(KOK, "eval/results/latest.md");

interface LaySatir {
  n: number;
  hit5: number;
  p5: number;
  mrr: number;
  ndcg10: number;
}
interface VaryantSonuc {
  ad: string;
  env: Record<string, string>;
  madde: { n: number; recall5: number; recall10: number; mrr: number };
  lay: Record<keyof typeof SETLER, LaySatir>;
  holdoutBirlesik: { n: number; hit5: number };
  gecikme: { n: number; p50: number; p95: number };
}
interface Rapor {
  tarih: string;
  gate: { esik: number; varyant: string; hit5: number; gecti: boolean };
  varyantlar: VaryantSonuc[];
}

function eksikKontrol(): void {
  const eksik = [DB, RAW, MADDE, ...Object.values(SETLER)].filter((p) => !existsSync(p));
  if (eksik.length) {
    console.error(`Gerekli dosya yok:\n${eksik.map((p) => `  ${p}`).join("\n")}`);
    console.error("data/ git'te yok: pnpm build:data ve pnpm collect:kararlar. Madde seti: node eval/fixtures/build-madde-golden.ts");
    process.exit(2);
  }
}

function yuzdeAl(sirali: number[], p: number): number {
  if (!sirali.length) return 0;
  return sirali[Math.min(sirali.length - 1, Math.ceil(p * sirali.length) - 1)]!;
}

function cocuk(ad: string): VaryantSonuc {
  const v = VARYANTLAR.find((x) => x.ad === ad)!;
  // env is applied by the parent when spawning; assert it here for safety.
  for (const [k, d] of Object.entries(v.env)) process.env[k] = d;

  // (a) set A
  const port = corpusPort(DB);
  const satirlar = readFileSync(MADDE, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Record<string, unknown>);
  let r5 = 0, r10 = 0, mrr = 0, na = 0;
  for (const s of satirlar) {
    if (!Array.isArray(s.ilgili)) continue; // header row
    const ilgili = new Set(s.ilgili as string[]);
    const sonuc = port.maddeAra!(String(s.sorgu), 10).map((m) => m.id);
    const ilk = sonuc.findIndex((id) => ilgili.has(id));
    r5 += sonuc.slice(0, 5).filter((id) => ilgili.has(id)).length / ilgili.size;
    r10 += sonuc.filter((id) => ilgili.has(id)).length / ilgili.size;
    if (ilk >= 0) mrr += 1 / (ilk + 1);
    na++;
  }
  port.close();

  // (b) + (c)
  const kavram = kavramBelgeleri(RAW);
  const belgeNo = belgeNoHaritasi(DB);
  const corpus = new Corpus(DB);
  const lay = {} as VaryantSonuc["lay"];
  const gecikme: number[] = [];
  const ham: Record<string, ReturnType<typeof layDegerlendir>> = {};
  for (const [ad2, yol] of Object.entries(SETLER)) {
    const gold = goldOku(yol);
    layDegerlendir(corpus, kavram, belgeNo, gold); // warm-up
    const m = layDegerlendir(corpus, kavram, belgeNo, gold);
    ham[ad2] = m;
    for (let i = 0; i < 2; i++) gecikme.push(...layDegerlendir(corpus, kavram, belgeNo, gold).gecikmeMs);
    gecikme.push(...m.gecikmeMs);
    lay[ad2 as keyof typeof SETLER] = { n: m.n, hit5: m.hit5, p5: m.p5, mrr: m.mrr, ndcg10: m.ndcg10 };
  }
  const nb = lay.holdout.n + lay.holdout2.n;
  gecikme.sort((a, b) => a - b);
  return {
    ad,
    env: v.env,
    madde: { n: na, recall5: r5 / na, recall10: r10 / na, mrr: mrr / na },
    lay,
    holdoutBirlesik: { n: nb, hit5: (lay.holdout.hit5 * lay.holdout.n + lay.holdout2.hit5 * lay.holdout2.n) / Math.max(nb, 1) },
    gecikme: { n: gecikme.length, p50: yuzdeAl(gecikme, 0.5), p95: yuzdeAl(gecikme, 0.95) },
  };
}

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const f3 = (x: number): string => x.toFixed(3);
const ms = (x: number): string => `${x.toFixed(1)} ms`;

function markdownTablo(r: Rapor): string {
  const v = r.varyantlar;
  const satir = (ad: string, f: (x: VaryantSonuc) => string): string => `| ${ad} | ${v.map(f).join(" | ")} |`;
  const baslik = `| Ölçüm | ${v.map((x) => x.ad).join(" | ")} |\n| --- | ${v.map(() => "---").join(" | ")} |`;
  const n = v[0]!;
  return [
    baslik,
    satir(`Madde getirme, küme A (${n.madde.n} karar): Recall@5`, (x) => pct(x.madde.recall5)),
    satir("Madde getirme, küme A: Recall@10", (x) => pct(x.madde.recall10)),
    satir("Madde getirme, küme A: MRR@10", (x) => f3(x.madde.mrr)),
    ...(["dev", "holdout", "holdout2"] as const).flatMap((k) => {
      const ad = k === "dev" ? "geliştirme" : k === "holdout" ? "ayrı set 1" : "ayrı set 2";
      return [
        satir(`Halk dili karar arama, ${ad} (${n.lay[k].n} sorgu): Hit@5`, (x) => pct(x.lay[k].hit5)),
        satir(`${ad}: P@5`, (x) => pct(x.lay[k].p5)),
        satir(`${ad}: MRR@10`, (x) => f3(x.lay[k].mrr)),
        satir(`${ad}: nDCG@10`, (x) => f3(x.lay[k].ndcg10)),
      ];
    }),
    satir(`Ayrı setler birleşik (${n.holdoutBirlesik.n} sorgu): Hit@5`, (x) => pct(x.holdoutBirlesik.hit5)),
    satir("Gecikme `ara`: p50", (x) => ms(x.gecikme.p50)),
    satir("Gecikme `ara`: p95", (x) => ms(x.gecikme.p95)),
  ].join("\n");
}

function readmeYaz(): void {
  if (!existsSync(SONUC_JSON)) {
    console.error(`${SONUC_JSON} yok; önce node eval/variants.ts çalıştırın.`);
    process.exit(2);
  }
  const r = JSON.parse(readFileSync(SONUC_JSON, "utf8")) as Rapor;
  const yol = resolve(KOK, "eval", "README.md");
  const metin = readFileSync(yol, "utf8");
  const bas = "<!-- eval:start -->";
  const son = "<!-- eval:end -->";
  const i = metin.indexOf(bas);
  const j = metin.indexOf(son);
  if (i < 0 || j < i) {
    console.error("eval/README.md içinde eval:start / eval:end işaretleri yok.");
    process.exit(2);
  }
  const blok = `${bas}\n${markdownTablo(r)}\n\nKapı: ayrı setler birleşik Hit@5 en az %${r.gate.esik} (varsayılan varyant "${r.gate.varyant}": ${pct(r.gate.hit5)}, ${r.gate.gecti ? "geçti" : "kaldı"}). Üretildi: ${r.tarih.slice(0, 10)}, \`node eval/variants.ts\`.\n${son}`;
  writeFileSync(yol, metin.slice(0, i) + blok + metin.slice(j + son.length));
  console.log("eval/README.md eval bloğu yenilendi.");
}

function ana(): void {
  const ci = process.argv.indexOf("--child");
  if (ci >= 0) {
    eksikKontrol();
    process.stdout.write("\n@@SONUC@@" + JSON.stringify(cocuk(process.argv[ci + 1]!)) + "\n");
    return;
  }
  if (process.argv.includes("--readme")) return readmeYaz();
  eksikKontrol();
  const sonuclar: VaryantSonuc[] = [];
  for (const v of VARYANTLAR) {
    console.error(`varyant: ${v.ad} ...`);
    const p = spawnSync(process.execPath, ["--no-warnings", import.meta.filename, "--child", v.ad], {
      env: { ...process.env, ...v.env },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const cikti = p.stdout ?? "";
    const k = cikti.lastIndexOf("@@SONUC@@");
    if (p.status !== 0 || k < 0) {
      console.error(`varyant "${v.ad}" çöktü (kod ${p.status}):\n${p.stderr}`);
      process.exit(1);
    }
    sonuclar.push(JSON.parse(cikti.slice(k + 9)) as VaryantSonuc);
  }
  const varsayilan = sonuclar.find((s) => s.ad === VARSAYILAN)!;
  const rapor: Rapor = {
    tarih: new Date().toISOString(),
    gate: { esik: ESIK * 100, varyant: VARSAYILAN, hit5: varsayilan.holdoutBirlesik.hit5, gecti: varsayilan.holdoutBirlesik.hit5 >= ESIK },
    varyantlar: sonuclar,
  };
  mkdirSync(resolve(KOK, "eval/results"), { recursive: true });
  writeFileSync(SONUC_JSON, JSON.stringify(rapor, null, 2) + "\n");
  const tablo = markdownTablo(rapor);
  writeFileSync(SONUC_MD, `# Ölçüm sonuçları\n\nÜretildi: ${rapor.tarih}\n\n${tablo}\n\nKapı: ayrı setler birleşik Hit@5 >= ${ESIK * 100}% (${VARSAYILAN}): ${pct(rapor.gate.hit5)} ${rapor.gate.gecti ? "PASS" : "FAIL"}\n`);
  console.log(tablo);
  console.log(`\nKAPI ayrı setler birleşik Hit@5 ≥ ${ESIK * 100}% (${VARSAYILAN}): ${pct(rapor.gate.hit5)} ${rapor.gate.gecti ? "PASS" : "FAIL"}`);
  if (!rapor.gate.gecti) process.exitCode = 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) ana();
