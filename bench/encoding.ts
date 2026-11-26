/**
 * bench/encoding.ts — why the answer is tagged plain text, measured.
 *
 * Same semantic content, two encodings (JSON vs tagged text). Only the encoding
 * differs, so the delta is pure serialisation overhead: keys, quotes, braces,
 * escaping and indentation. Real Turkish legal text is used inside both, because
 * escaping and diacritics change the token count.
 *
 * Usage: node bench/encoding.ts
 * Writes: bench/results/encoding.json
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nowIso, repoRoot, resultsPath, round, tokens, tokensOfJson, writeJson } from "./util.ts";

/* ------------------------- real corpus material ----------------------- */

interface RawDecision {
  daire?: string;
  esas?: string;
  karar?: string;
  tarih?: string;
  metin?: string;
}

function loadDecisions(): RawDecision[] {
  const path = join(repoRoot(), "data", "raw", "decisions.jsonl");
  if (!existsSync(path)) return [];
  const out: RawDecision[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      out.push(JSON.parse(line) as RawDecision);
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Take a contiguous excerpt from a real decision, on paragraph boundaries. */
function excerpt(text: string, chars: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= chars) return clean;
  const cut = clean.slice(0, chars);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return (lastStop > chars * 0.5 ? cut.slice(0, lastStop + 1) : cut).trim();
}

/* ------------------------------ payload ------------------------------- */

interface Payload {
  dugum: { id: string; ad: string };
  ozet: string;
  kurallar: Array<{ id: string; sonuc: string; dayanak: string }>;
  haklar: string[];
  yol: string[];
  eksikOlgular: string[];
  argumanlar: Array<{ id: string; iddia: string; guc: number }>;
  kararlar: Array<{ id: string; kunye: string; tarih: string }>;
  not: string;
}

function buildPayload(decisions: RawDecision[], bodyChars: number): Payload {
  const d = decisions[0];
  const d2 = decisions[1] ?? d;
  const body = excerpt(d?.metin ?? "", bodyChars);
  const kunye = (x: RawDecision | undefined): string =>
    `${x?.daire ?? "Yargıtay"} ${x?.esas ?? "2006/4980"} E. ${x?.karar ?? "2007/5033"} K.`;

  return {
    dugum: { id: "t/ayipli-mal", ad: "Ayıplı mal" },
    ozet: body,
    kurallar: [
      {
        id: "ayip_zamanasimi",
        sonuc: "2 yıl",
        dayanak: "m:6502/12",
      },
      {
        id: "gorevli_merci",
        sonuc: "tüketici hakem heyeti",
        dayanak: "m:6502/66",
      },
    ],
    haklar: [
      "Bedel iadesi isteyebilirsiniz (m:6502/11).",
      "Değişim veya onarım seçebilirsiniz (m:6502/11).",
      "Ayıp bildirimini derhâl yazılı yapın (m:6502/13).",
    ],
    yol: [
      "1) Satıcıya yazılı ayıp bildirimi gönderin, tarih ve içerik kalsın.",
      "2) Tüketici hakem heyetine başvurun; dosyaya fatura ve servis raporunu ekleyin.",
      "3) Heyet kararına 15 gün içinde itiraz edilebilir (m:6502/70).",
    ],
    eksikOlgular: ["Teslim tarihi", "Servis raporu var mı", "Ödeme belgesi"],
    argumanlar: [
      { id: "a:ayip-ilk-teslimde", iddia: "Ayıp teslimde vardı, ispat yükü satıcıda.", guc: 70 },
      { id: "a:kullanim-hatasi", iddia: "Satıcı kullanım hatası savunması yapabilir.", guc: 40 },
    ],
    kararlar: [
      { id: "k:ygt-15hd-2006-4980-2007-5033", kunye: kunye(d), tarih: d?.tarih ?? "2007-07-19" },
      { id: "k:emsal-2021-3210-2025-225", kunye: kunye(d2), tarih: d2?.tarih ?? "2025-03-06" },
    ],
    not: "Bu bir hukuki görüş değildir; resmî metni kaynak bağlantısından teyit edin.",
  };
}

/* ------------------------------ encodings ----------------------------- */

function encodingJson(p: Payload): string {
  return JSON.stringify(p);
}

function encodingJsonPretty(p: Payload): string {
  return JSON.stringify(p, null, 2);
}

/**
 * The actual wire format of `hukuk_sor`: tagged plain text, one section per
 * block, ids inline. No braces, no repeated keys, no escaping.
 */
function encodingTagged(p: Payload): string {
  const lines: string[] = [];
  lines.push(`DÜĞÜM ${p.dugum.id} — ${p.dugum.ad}`);
  lines.push(`ÖZET ${p.ozet}`);
  lines.push("KURALLAR");
  for (const k of p.kurallar) lines.push(`- ${k.id}: ${k.sonuc} (${k.dayanak})`);
  lines.push("HAKLAR");
  for (const h of p.haklar) lines.push(`- ${h}`);
  lines.push("YOL");
  for (const y of p.yol) lines.push(`- ${y}`);
  lines.push(`EKSİK OLGULAR ${p.eksikOlgular.join(" · ")}`);
  lines.push("ARGÜMANLAR");
  for (const a of p.argumanlar) lines.push(`- ${a.id} (${a.guc}) ${a.iddia}`);
  lines.push("KARARLAR");
  for (const k of p.kararlar) lines.push(`- ${k.id} ${k.kunye} (${k.tarih})`);
  lines.push(`NOT ${p.not}`);
  return lines.join("\n");
}

/* -------------------------------- main -------------------------------- */

function main(): void {
  const decisions = loadDecisions();
  const sizes = [600, 1800, 4000];

  const rows = sizes.map((chars) => {
    const p = buildPayload(decisions, chars);
    const compact = encodingJson(p);
    const pretty = encodingJsonPretty(p);
    const tagged = encodingTagged(p);
    const tJson = tokens(compact);
    const tPretty = tokens(pretty);
    const tTagged = tokens(tagged);
    return {
      bodyChars: chars,
      jsonCompactTokens: tJson,
      jsonPrettyTokens: tPretty,
      taggedTokens: tTagged,
      savingsVsCompact: round(100 * (1 - tTagged / tJson), 1),
      savingsVsPretty: round(100 * (1 - tTagged / tPretty), 1),
      bytes: { jsonCompact: compact.length, jsonPretty: pretty.length, tagged: tagged.length },
    };
  });

  const avgCompact = round(rows.reduce((a, r) => a + r.savingsVsCompact, 0) / rows.length, 1);
  const avgPretty = round(rows.reduce((a, r) => a + r.savingsVsPretty, 0) / rows.length, 1);

  // Tokenizer cost per response, to check the "pre-tokenised at build time" claim.
  const p = buildPayload(decisions, 1800);
  const tagged = encodingTagged(p);
  const runs = 200;
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) tokens(tagged);
  const perCallMs = (performance.now() - t0) / runs;

  const out = {
    measuredAt: nowIso(),
    tokenizer: "gpt-tokenizer/encode (cl100k_base)",
    corpus: decisions.length === 0 ? "korpus yok — gömülü örnek metin" : "data/raw/decisions.jsonl (gerçek karar metinleri)",
    samples: rows,
    summary: {
      averageSavingsVsCompactJson: avgCompact,
      averageSavingsVsPrettyJson: avgPretty,
      tokenizerCostPerResponseMs: round(perCallMs, 3),
      tokenizerRuns: runs,
    },
    methodNote:
      "Aynı anlamsal içerik iki kodlamada; içerik gerçek karar metninden alınan özetle sabit. " +
      "Fark yalnızca kodlama yükü: anahtar tekrarı, tırnak/kaçış, süslü parantez, girinti.",
  };

  const path = resultsPath("encoding.json");
  writeJson(path, out);

  console.log("beden (karakter) | JSON kompakt | JSON pretty | etiketli metin | kompakt'a göre tasarruf");
  for (const r of rows) {
    console.log(
      `${String(r.bodyChars).padStart(16)} | ${String(r.jsonCompactTokens).padStart(11)} | ` +
        `${String(r.jsonPrettyTokens).padStart(11)} | ${String(r.taggedTokens).padStart(14)} | ` +
        `%${r.savingsVsCompact}`,
    );
  }
  console.log(
    `\nortalama tasarruf: kompakt JSON'a göre %${avgCompact}, pretty JSON'a göre %${avgPretty}`,
  );
  console.log(`tokenizer maliyeti: ${round(perCallMs, 3)} ms / yanıt (${runs} koşu ortalaması)`);
  console.log(`yazıldı -> ${path}`);
}

main();
