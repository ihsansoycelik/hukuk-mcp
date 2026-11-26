/**
 * Retrieval + routing evaluation harness.
 *
 *   node eval/run.ts --set all --db eval/fixtures/test.db
 *   node eval/run.ts --set routing --db data/build/hukuk.db
 *   node eval/run.ts --set search --verbose
 *
 * Gates come from the project plan and live in @hukuk/retrieval KALITE_ESIKLERI.
 * Exit code 1 when a gated metric fails or a golden id does not resolve.
 *
 * Honest-metric notes
 *  - Routing top-1/top-3 are computed over rows that HAVE a correct node. Rows
 *    with `dogru: []` are out-of-domain traps and are reported separately: a
 *    trap is "handled" when the router returns belirsiz (not when it guesses).
 *  - Search Recall@5 is standard recall over a pooled judged set. Most judged
 *    sets have 2 ids, so one missing id costs 0.5. Unjudged same-topic decisions
 *    are treated as non-relevant (conservative).
 */
import { readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { countTokens } from "gpt-tokenizer";
import { Corpus, KALITE_ESIKLERI } from "../packages/retrieval/src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const KOK = resolve(HERE, "..");

interface RoutingSatiri {
  id: string;
  sorgu: string;
  dogru: string[];
  tur?: "normal" | "iki" | "sure" | "od";
  not?: string;
}

interface SearchSatiri {
  id: string;
  sorgu: string;
  ilgili: string[];
  filtre?: Record<string, unknown>;
  yontem?: string;
  senaryo?: string;
}

interface Satir {
  metrik: string;
  deger: string;
  esik: string;
  sonuc: "PASS" | "FAIL" | "—";
  gecti: boolean | null;
}

function okuJsonl<T>(yol: string): T[] {
  const raw = readFileSync(yol, "utf8");
  const out: T[] = [];
  raw.split("\n").forEach((satir, i) => {
    const s = satir.trim();
    if (!s || s.startsWith("#")) return;
    try {
      out.push(JSON.parse(s) as T);
    } catch (e) {
      throw new Error(`${yol}:${i + 1} JSON hatası: ${(e as Error).message}`);
    }
  });
  return out;
}

function yuzde(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function p95(degerler: number[]): number {
  if (degerler.length === 0) return 0;
  const s = [...degerler].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(0.95 * s.length) - 1);
  return s[idx]!;
}

function ndcg(relSiralama: number[], k: number): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, relSiralama.length); i++) {
    if (relSiralama[i]) dcg += 1 / Math.log2(i + 2);
  }
  const ideal = [...relSiralama].sort((a, b) => b - a).slice(0, k);
  let idcg = 0;
  for (let i = 0; i < ideal.length; i++) if (ideal[i]) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

function tabloYaz(satirlar: Satir[]): void {
  const basliklar = ["Metrik", "Değer", "Eşik", "Sonuç"];
  const gen = [
    Math.max(...satirlar.map((s) => s.metrik.length), basliklar[0]!.length),
    Math.max(...satirlar.map((s) => s.deger.length), basliklar[1]!.length),
    Math.max(...satirlar.map((s) => s.esik.length), basliklar[2]!.length),
    basliklar[3]!.length,
  ];
  const cizgi = (l: string, m: string, r: string) =>
    l + gen.map((g) => "─".repeat(g + 2)).join(m) + r;
  const satir = (h: string[]) =>
    "│ " + h.map((c, i) => c.padEnd(gen[i]!)).join(" │ ") + " │";
  console.log(cizgi("┌", "┬", "┐"));
  console.log(satir(basliklar));
  console.log(cizgi("├", "┼", "┤"));
  for (const s of satirlar) console.log(satir([s.metrik, s.deger, s.esik, s.sonuc]));
  console.log(cizgi("└", "┴", "┘"));
}

interface Args {
  set: "all" | "routing" | "search";
  db: string;
  routing: string;
  search: string;
  verbose: boolean;
}

function arglar(): Args {
  const a = process.argv.slice(2);
  const al = (bayrak: string): string | undefined => {
    const i = a.indexOf(bayrak);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const set = (al("--set") ?? "all") as Args["set"];
  if (!["all", "routing", "search"].includes(set)) throw new Error(`Geçersiz --set: ${set}`);
  const dbRaw = al("--db") ?? process.env["HUKUK_DB"] ?? join(HERE, "fixtures", "test.db");
  const mutlak = (p: string) => (isAbsolute(p) ? p : resolve(KOK, p));
  const db = mutlak(dbRaw);
  // The fixture and the real corpus need different golden files: fixture ids
  // (`k:fx-…`) do not exist in the real DB and vice versa.
  const varsayilanSearch = basename(db) === "hukuk.db" ? "search-real.jsonl" : "search.jsonl";
  return {
    set,
    db,
    routing: mutlak(al("--routing") ?? join(HERE, "golden", "routing.jsonl")),
    search: mutlak(al("--search") ?? join(HERE, "golden", varsayilanSearch)),
    verbose: a.includes("--verbose"),
  };
}

function main(): void {
  const args = arglar();
  const t0 = performance.now();
  const corpus = new Corpus(args.db);
  const satirlar: Satir[] = [];
  const gecikmeler: number[] = [];
  const hatalar: string[] = [];
  let routingBilgi = "";
  let searchBilgi = "";
  let tokenBilgi = "";

  try {
    if (args.set === "all" || args.set === "routing") {
      const golden = okuJsonl<RoutingSatiri>(args.routing);
      let toplam = 0;
      let top1 = 0;
      let top3 = 0;
      let tuzakToplam = 0;
      let tuzakDogru = 0;
      let pozitifBelirsiz = 0;
      const hatalarRouting: string[] = [];

      for (const g of golden) {
        for (const id of g.dogru) {
          if (!corpus.dugumGetir(id)) hatalar.push(`routing ${g.id}: düğüm yok -> ${id}`);
        }
        const t = performance.now();
        const det = corpus.dugumAraDetay(g.sorgu, undefined, 5);
        gecikmeler.push(performance.now() - t);
        const ids = det.adaylar.map((a) => a.id);
        const tur = g.tur ?? (g.dogru.length === 0 ? "od" : g.dogru.length > 1 ? "iki" : "normal");

        if (tur === "od" || g.dogru.length === 0) {
          tuzakToplam++;
          if (det.belirsiz) tuzakDogru++;
          else hatalarRouting.push(`[od] ${g.id} "${g.sorgu}" -> ${ids[0] ?? "-"} (belirsiz değil)`);
          continue;
        }

        toplam++;
        if (det.belirsiz) pozitifBelirsiz++;
        const ilk = ids[0];
        const ilk3 = ids.slice(0, 3);
        const b1 = ilk !== undefined && g.dogru.includes(ilk);
        const b3 =
          tur === "iki"
            ? g.dogru.every((d) => ilk3.includes(d))
            : ilk3.some((d) => g.dogru.includes(d));
        if (b1) top1++;
        if (b3) top3++;
        if (!b3) {
          hatalarRouting.push(`[${tur}] ${g.id} "${g.sorgu}" -> ${ilk3.join(", ") || "-"} | beklenen: ${g.dogru.join(", ")}`);
        }
      }

      const t1 = toplam ? top1 / toplam : 0;
      const t3 = toplam ? top3 / toplam : 0;
      const od = tuzakToplam ? tuzakDogru / tuzakToplam : 1;
      satirlar.push({
        metrik: "Yönlendirme top-1",
        deger: `${yuzde(t1)} (${top1}/${toplam})`,
        esik: `≥ ${yuzde(KALITE_ESIKLERI.yonlendirmeTop1)}`,
        sonuc: t1 >= KALITE_ESIKLERI.yonlendirmeTop1 ? "PASS" : "FAIL",
        gecti: t1 >= KALITE_ESIKLERI.yonlendirmeTop1,
      });
      satirlar.push({
        metrik: "Yönlendirme top-3",
        deger: `${yuzde(t3)} (${top3}/${toplam})`,
        esik: `≥ ${yuzde(KALITE_ESIKLERI.yonlendirmeTop3)}`,
        sonuc: t3 >= KALITE_ESIKLERI.yonlendirmeTop3 ? "PASS" : "FAIL",
        gecti: t3 >= KALITE_ESIKLERI.yonlendirmeTop3,
      });
      satirlar.push({
        metrik: "Kapsam dışı tuzak (belirsiz)",
        deger: `${yuzde(od)} (${tuzakDogru}/${tuzakToplam})`,
        esik: "bilgi",
        sonuc: "—",
        gecti: null,
      });
      satirlar.push({
        metrik: "Pozitifte gereksiz belirsiz",
        deger: `${yuzde(toplam ? pozitifBelirsiz / toplam : 0)} (${pozitifBelirsiz}/${toplam})`,
        esik: "bilgi",
        sonuc: "—",
        gecti: null,
      });
      routingBilgi = `${golden.length} routing satırı (${toplam} pozitif + ${tuzakToplam} tuzak)`;
      if (hatalarRouting.length) hatalar.push(...hatalarRouting.slice(0, 12).map((h) => `routing: ${h}`));
    }

    if (args.set === "all" || args.set === "search") {
      const golden = okuJsonl<SearchSatiri>(args.search);
      let recallToplam = 0;
      let ndcgToplam = 0;
      let precisionToplam = 0;
      let mrrToplam = 0;
      let bosSonuc = 0;
      let atifKontrol = 0;
      let atifHata = 0;
      let tokenToplam = 0;
      const tokenDegerleri: number[] = [];
      const hatalarSearch: string[] = [];

      for (const g of golden) {
        for (const id of g.ilgili) {
          atifKontrol++;
          if (!corpus.kararGetir(id)) {
            atifHata++;
            hatalar.push(`search ${g.id}: ilgili karar çözülemiyor -> ${id}`);
          }
        }
        const input = { sorgu: g.sorgu, limit: 10, ...(g.filtre ?? {}) } as Parameters<Corpus["ara"]>[0];
        const t = performance.now();
        const hitler = corpus.ara(input);
        gecikmeler.push(performance.now() - t);

        for (const h of hitler) {
          atifKontrol++;
          if (!corpus.kararGetir(h.karar_id)) {
            atifHata++;
            hatalar.push(`search ${g.id}: dönen karar çözülemiyor -> ${h.karar_id}`);
          }
          if (h.sonuc === "bozma" && h.temsilci_uygun) {
            atifHata++;
            hatalar.push(`search ${g.id}: bozma kararı temsilci olarak işaretli -> ${h.karar_id}`);
          }
          if (h.gevsekTuru === "or" && h.temsilci_uygun) {
            atifHata++;
            hatalar.push(`search ${g.id}: OR fallback sonucu temsilci -> ${h.karar_id}`);
          }
        }

        const idler = hitler.map((h) => h.karar_id);
        const ilgili = new Set(g.ilgili);
        const top5 = idler.slice(0, 5).filter((id) => ilgili.has(id)).length;
        const recall = g.ilgili.length ? top5 / g.ilgili.length : 1;
        recallToplam += recall;
        ndcgToplam += ndcg(idler.slice(0, 10).map((id) => (ilgili.has(id) ? 1 : 0)), 10);
        // Precision over what the citizen actually sees. If the system honestly
        // returns nothing, that is a miss (denominator 1), not 100% precision.
        const gosterilen = Math.min(5, idler.length);
        precisionToplam += gosterilen > 0 ? top5 / gosterilen : 0;
        if (hitler.length === 0) bosSonuc++;
        const ilkIlgili = idler.findIndex((id) => ilgili.has(id));
        if (ilkIlgili >= 0) mrrToplam += 1 / (ilkIlgili + 1);

        const token = countTokens(JSON.stringify(hitler));
        tokenDegerleri.push(token);
        tokenToplam += token;

        if (recall < 1) {
          hatalarSearch.push(
            `[recall ${recall.toFixed(2)}] ${g.id} "${g.sorgu}" -> ${idler.slice(0, 5).join(", ") || "-"} | ilgili: ${g.ilgili.join(", ")}`,
          );
        }
      }

      const recall = golden.length ? recallToplam / golden.length : 0;
      const ndcgOrt = golden.length ? ndcgToplam / golden.length : 0;
      const precisionOrt = golden.length ? precisionToplam / golden.length : 0;
      const mrrOrt = golden.length ? mrrToplam / golden.length : 0;
      const bosOran = golden.length ? bosSonuc / golden.length : 0;
      const butunluk = atifKontrol ? 1 - atifHata / atifKontrol : 1;
      const tokenP95 = p95(tokenDegerleri);
      // On the real corpus the golden set is mechanical (a decision is
      // "relevant" when it contains the query's own stems), so it penalises
      // lay->legal expansion. It is reported, not gated; the gate for the real
      // corpus is eval/lay-search.ts (source-judged relevance).
      const mekanik = basename(args.search) === "search-real.jsonl";
      satirlar.push({
        metrik: mekanik ? "Arama Recall@5 (mekanik set)" : "Arama Recall@5",
        deger: yuzde(recall),
        esik: mekanik ? "bilgi" : `≥ ${yuzde(KALITE_ESIKLERI.geriCagirma5)}`,
        sonuc: mekanik ? "—" : recall >= KALITE_ESIKLERI.geriCagirma5 ? "PASS" : "FAIL",
        gecti: mekanik ? null : recall >= KALITE_ESIKLERI.geriCagirma5,
      });
      satirlar.push({
        metrik: "Arama Precision@5",
        deger: yuzde(precisionOrt),
        esik: "bilgi",
        sonuc: "—",
        gecti: null,
      });
      satirlar.push({
        metrik: "Arama nDCG@10",
        deger: ndcgOrt.toFixed(3),
        esik: "bilgi",
        sonuc: "—",
        gecti: null,
      });
      satirlar.push({
        metrik: "Arama MRR",
        deger: mrrOrt.toFixed(3),
        esik: "bilgi",
        sonuc: "—",
        gecti: null,
      });
      satirlar.push({
        metrik: "Arama boş sonuç oranı",
        deger: yuzde(bosOran),
        esik: "bilgi",
        sonuc: "—",
        gecti: null,
      });
      satirlar.push({
        metrik: "Atıf bütünlüğü",
        deger: yuzde(butunluk),
        esik: "= 100%",
        sonuc: butunluk >= KALITE_ESIKLERI.kaynakButunlugu ? "PASS" : "FAIL",
        gecti: butunluk >= KALITE_ESIKLERI.kaynakButunlugu,
      });
      tokenBilgi = `token ort. ${golden.length ? Math.round(tokenToplam / golden.length) : 0}, p95 ${tokenP95}`;
      satirlar.push({
        metrik: "Token p95 (10 sonuç)",
        deger: String(tokenP95),
        esik: "bilgi",
        sonuc: "—",
        gecti: null,
      });
      searchBilgi = `${golden.length} arama satırı (${args.search.replace(KOK + "/", "")})`;
      if (hatalarSearch.length) hatalar.push(...hatalarSearch.slice(0, 10).map((h) => `search: ${h}`));
    }

    const gecikmeP95 = p95(gecikmeler);
    satirlar.push({
      metrik: "Gecikme p95 (tüm çağrılar)",
      deger: `${gecikmeP95.toFixed(2)} ms`,
      esik: `< ${KALITE_ESIKLERI.gecikmeP95Ms} ms`,
      sonuc: gecikmeP95 < KALITE_ESIKLERI.gecikmeP95Ms ? "PASS" : "FAIL",
      gecti: gecikmeP95 < KALITE_ESIKLERI.gecikmeP95Ms,
    });
  } finally {
    corpus.close();
  }

  console.log("");
  console.log(`Hukuk-MCP retrieval eval — set=${args.set}`);
  console.log(`DB: ${args.db}`);
  if (routingBilgi) console.log(`Routing: ${routingBilgi}`);
  if (searchBilgi) console.log(`Arama: ${searchBilgi}  (${tokenBilgi})`);
  console.log("");
  tabloYaz(satirlar);

  if (hatalar.length) {
    console.log("");
    console.log(`Sorunlar (ilk ${Math.min(hatalar.length, 22)}):`);
    for (const h of hatalar.slice(0, 22)) console.log(`  - ${h}`);
    if (hatalar.length > 22) console.log(`  … toplam ${hatalar.length} sorun`);
  } else if (args.verbose) {
    console.log("\nSorun yok.");
  }

  const basarisiz = satirlar.filter((s) => s.gecti === false);
  console.log("");
  console.log(
    basarisiz.length === 0
      ? "SONUÇ: tüm kapılar PASS"
      : `SONUÇ: ${basarisiz.length} kapı FAIL — ${basarisiz.map((s) => s.metrik).join(", ")}`,
  );
  if (basarisiz.length > 0 || hatalar.length > 0) process.exitCode = 1;
  console.log(`Toplam süre: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
}

main();
