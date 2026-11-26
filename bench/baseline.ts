/**
 * bench/baseline.ts — an explicit, defensible lower bound for the incumbent
 * architecture ("N tools + live fetch per query").
 *
 * Honesty rules enforced in this file:
 *   - Every number is tagged:  BELGE  = taken from a public document
 *                              TAHMİN = an assumption, stated with its value
 *                              ÖLÇÜLDÜ= measured here (only on OUR own corpus)
 *   - We do NOT invent competitor latency. Latency is TAHMİN unless the
 *     optional live probe is explicitly requested with --live-rtt.
 *   - Tool schemas are reconstructed WITHOUT prose descriptions, so the tool
 *     surface number is a LOWER BOUND. dayanak documents a 20 000-character
 *     docstring budget for its core profile; that anchor is reported separately.
 *
 * Usage:
 *   node bench/baseline.ts
 *   node bench/baseline.ts --live-rtt        # one respectul probe, 1 req/s, honest UA
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Scenario,
  gitSha,
  mdTable,
  nowIso,
  readScenarios,
  repoRoot,
  resultsPath,
  round,
  tokens,
  tokensOfJson,
  writeJson,
} from "./util.ts";

/* ------------------------------ schema kit ---------------------------- */

type JType = "string" | "integer" | "number" | "boolean" | "array" | "object";

interface Param {
  name: string;
  type: JType;
  /** Exact allowed values, ONLY when the public document names them. */
  enum?: string[];
  items?: "string";
}

function toolSchema(name: string, params: Param[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const p of params) {
    const prop: Record<string, unknown> = { type: p.type };
    if (p.type === "array") prop["items"] = { type: p.items ?? "string" };
    if (p.enum !== undefined) prop["enum"] = p.enum;
    properties[p.name] = prop;
  }
  return {
    name,
    inputSchema: { type: "object", properties, additionalProperties: false },
  };
}

/* ------------------- dayanak core profile (BELGE) --------------------- */
/**
 * 11 core tools. Names and parameters come from
 * docs/MCP_CONTRACTS.md (drift:core-tools-start block + per-tool "Input"
 * lists). Descriptions are NOT public (they are Python docstrings), so they
 * are omitted -> lower bound.
 */
const DAYANAK_CORE: Array<Record<string, unknown>> = [
  toolSchema("search_decisions", [
    { name: "source", type: "string" },
    { name: "query", type: "string" },
    { name: "esas_no", type: "string" },
    { name: "karar_no", type: "string" },
    { name: "birim_adi", type: "string" },
    { name: "court_types", type: "array", items: "string" },
    { name: "date_from", type: "string" },
    { name: "date_to", type: "string" },
    { name: "sort_by", type: "string", enum: ["relevance", "date"] },
    { name: "include_snippets", type: "boolean" },
    { name: "limit", type: "integer" },
    { name: "page", type: "integer" },
  ]),
  toolSchema("get_document", [
    { name: "source", type: "string" },
    { name: "document_id", type: "string" },
    { name: "include_raw", type: "boolean" },
    { name: "page_number", type: "integer" },
  ]),
  toolSchema("search_local_corpus", [
    { name: "query", type: "string" },
    { name: "mode", type: "string", enum: ["lexical", "semantic", "hybrid", "rrf"] },
    { name: "provider", type: "string" },
    { name: "filters", type: "object" },
    { name: "limit", type: "integer" },
  ]),
  toolSchema("search_legislation", [
    { name: "query", type: "string" },
    { name: "scope", type: "string", enum: ["title", "article"] },
    { name: "mevzuat_turu", type: "string" },
    { name: "page", type: "integer" },
    { name: "page_size", type: "integer" },
  ]),
  toolSchema("get_legislation", [
    { name: "mevzuat_id", type: "string" },
    { name: "part", type: "string", enum: ["document", "article", "article_tree", "gerekce"] },
    { name: "madde_no", type: "string" },
  ]),
  toolSchema("mevzuat_korpus_ara", [
    { name: "query", type: "string" },
    { name: "mevzuat_turu", type: "string" },
    { name: "limit", type: "integer" },
  ]),
  toolSchema("mevzuat_madde_getir", [
    { name: "mevzuat_id", type: "string" },
    { name: "madde_no", type: "string" },
  ]),
  toolSchema("research_topic", [
    { name: "query", type: "string" },
    { name: "sources", type: "array", items: "string" },
    { name: "fetch_count", type: "integer" },
    { name: "filters", type: "object" },
    { name: "output_dir", type: "string" },
  ]),
  toolSchema("export_document", [
    { name: "format", type: "string", enum: ["docx", "pdf", "plain", "bundle", "udf", "capabilities"] },
    { name: "text", type: "string" },
    { name: "docx_path", type: "string" },
    { name: "udf_path", type: "string" },
    { name: "out_dir", type: "string" },
  ]),
  toolSchema("load_extended_tools", [
    {
      name: "categories",
      type: "array",
      items: "string",
      enum: [
        "legislation",
        "drafting",
        "files",
        "meta",
        "health_admin",
        "watch",
        "privacy",
        "chambers",
        "indexing",
        "drafting_advanced",
        "udf_admin",
      ],
    },
  ]),
  toolSchema("health_check", []),
];

/* -------------- mevzuat-mcp 18-tool profile (BELGE, şablon) ----------- */
/**
 * 9 legislation types x 2 tools (search + search-within). Parameter names from
 * the public README. The nine type names substitute into the tool names, so the
 * payload is nearly identical 18 times: that is exactly what 18 tools cost.
 */
const MEVZUAT_TURLERI = [
  "kanun",
  "khk",
  "tuzuk",
  "kurum_yonetmelik",
  "cbk",
  "cbbaskankarar",
  "cbyonetmelik",
  "cbgenelge",
  "teblig",
];

const MEVZUAT_MCP_18: Array<Record<string, unknown>> = MEVZUAT_TURLERI.flatMap((tur) => [
  toolSchema(`search_${tur}`, [
    { name: "aranacak_ifade", type: "string" },
    { name: "tam_cumle", type: "string" },
    { name: "baslangic_tarihi", type: "string" },
    { name: "bitis_tarihi", type: "string" },
    { name: "page_number", type: "integer" },
    { name: "page_size", type: "integer" },
  ]),
  toolSchema(`search_within_${tur}`, [
    { name: "mevzuat_no", type: "string" },
    { name: "keyword", type: "string" },
    { name: "case_sensitive", type: "boolean" },
    { name: "max_results", type: "integer" },
  ]),
]);

/* ------------------- small-surface incumbents (BELGE) ----------------- */

const ICTIHAT_MCP_2 = [
  toolSchema("ictihat_ara", [
    { name: "ifade", type: "string" },
    {
      name: "mahkeme",
      type: "string",
      enum: ["adli", "yargitay", "emsal", "idari", "anayasa", "norm"],
    },
    { name: "adet", type: "integer" },
    { name: "sayfa", type: "integer" },
  ]),
  toolSchema("karar_getir", [
    { name: "karar_id", type: "string" },
    { name: "mahkeme", type: "string" },
  ]),
];

const MEVZUAT_MCP_4 = [
  toolSchema("mevzuat_ara", [
    { name: "ifade", type: "string" },
    { name: "nerede", type: "string", enum: ["Baslik", "Icerik", "Tumu"] },
    { name: "adet", type: "integer" },
  ]),
  toolSchema("madde_getir", [
    { name: "kanun", type: "string" },
    { name: "madde_no", type: "string" },
  ]),
  toolSchema("kanun_metni_getir", [{ name: "kanun", type: "string" }]),
  toolSchema("bilinen_kanunlar", []),
];

/* ---------------------------- assumptions ----------------------------- */

const ASSUMPTIONS = {
  /** dayanak paginates documents at >= 40 000 chars (public contract). */
  documentTruncateChars: 40_000,
  /** dayanak README: search results carry a ~360-char snippet. */
  snippetChars: 360,
  /** Result metadata per hit (esas/karar no, court, date, url). TAHMİN. */
  metadataTokensPerHit: 80,
  /** Hits per search call in the modelled chain. TAHMİN. */
  hitsPerSearch: 5,
  /** Calls per citizen question in the modelled incumbent chain. TAHMİN. */
  callsStandard: 4,
  /** Optimistic incumbent chain: one search + one full-text fetch. */
  callsOptimistic: 2,
  /** Per live HTTP round trip to a government source. TAHMİN. */
  roundTripMs: 900,
  /** HTML->text / JSON cleanup inside the tool. TAHMİN. */
  parseMsPerCall: 40,
  /** dayanak's documented core-profile docstring budget. */
  docstringBudgetChars: 20_000,
} as const;

/* --------------------- measured anchors on OUR corpus ----------------- */

interface CorpusStats {
  source: string;
  decisions: number;
  charsPerToken: number;
  medianDocChars: number;
  medianDocTokens: number;
  truncatedAtChars: number;
  label: "ÖLÇÜLDÜ" | "TAHMİN";
}

function corpusStats(): CorpusStats {
  const path = join(repoRoot(), "data", "raw", "decisions.jsonl");
  const fallback: CorpusStats = {
    source: "data/raw/decisions.jsonl yok — varsayım",
    decisions: 0,
    charsPerToken: 3.4,
    medianDocChars: ASSUMPTIONS.documentTruncateChars,
    medianDocTokens: Math.round(ASSUMPTIONS.documentTruncateChars / 3.4),
    truncatedAtChars: ASSUMPTIONS.documentTruncateChars,
    label: "TAHMİN",
  };
  if (!existsSync(path)) return fallback;

  const rows: Array<{ chars: number; toks: number }> = [];
  let allChars = 0;
  let allToks = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    let text = "";
    try {
      text = (JSON.parse(line) as { metin?: string }).metin ?? "";
    } catch {
      continue;
    }
    if (text.length < 500) continue;
    const clipped = text.slice(0, ASSUMPTIONS.documentTruncateChars);
    const toks = tokens(clipped);
    rows.push({ chars: clipped.length, toks });
    allChars += clipped.length;
    allToks += toks;
  }
  if (rows.length === 0) return fallback;
  const toksSorted = rows.map((r) => r.toks).sort((a, b) => a - b);
  const charsSorted = rows.map((r) => r.chars).sort((a, b) => a - b);
  const mid = Math.floor(toksSorted.length / 2);
  return {
    source: "data/raw/decisions.jsonl (bizim topladığımız Yargıtay kararları)",
    decisions: rows.length,
    charsPerToken: round(allChars / allToks, 2),
    medianDocChars: charsSorted[mid] ?? 0,
    medianDocTokens: toksSorted[mid] ?? 0,
    truncatedAtChars: ASSUMPTIONS.documentTruncateChars,
    label: "ÖLÇÜLDÜ",
  };
}

/* ------------------------------ profiles ------------------------------ */

interface Profile {
  id: string;
  label: string;
  toolCount: number;
  schemasOnly: number;
  withDescriptions: number | null;
  evidence: "BELGE" | "TAHMİN" | "KARIŞIK";
  sourceUrl: string;
  note: string;
}

function buildProfiles(medianSchemaTokens: number): Profile[] {
  const core = {
    tools: DAYANAK_CORE.length,
    tokens: tokensOfJson(DAYANAK_CORE),
  };
  const coreMedian = round(core.tokens / core.tools, 0);
  const extendedCount = 47 - DAYANAK_CORE.length;

  return [
    {
      id: "dayanak-core",
      label: "afsozer/dayanak — core profil",
      toolCount: core.tools,
      schemasOnly: core.tokens,
      withDescriptions: null,
      evidence: "BELGE",
      sourceUrl: "https://github.com/afsozer/dayanak/blob/master/docs/MCP_CONTRACTS.md",
      note:
        "Şemalar belgelenen parametre listelerinden yeniden kuruldu; açıklamalar (docstring) yok → alt sınır. " +
        `dayanak core docstring bütçesi 20.000 karakter (bkz. anchors.dayanakDocstring).`,
    },
    {
      id: "dayanak-full",
      label: "afsozer/dayanak — full profil (47 araç)",
      toolCount: 47,
      schemasOnly: core.tokens + extendedCount * Math.round(coreMedian),
      withDescriptions: null,
      evidence: "KARIŞIK",
      sourceUrl: "https://github.com/afsozer/dayanak#readme",
      note: `11 core BELGE + 36 extended TAHMİN (core medyanı ${Math.round(coreMedian)} token/araç).`,
    },
    {
      id: "yargi-mcp",
      label: "saidsurucu/yargi-mcp (ayna: MCYBA/yargi-mcp) — 28 araç",
      toolCount: 28,
      schemasOnly: 28 * Math.round(coreMedian),
      withDescriptions: null,
      evidence: "KARIŞIK",
      sourceUrl: "https://github.com/MCYBA/yargi-mcp",
      note:
        `Araç sayısı BELGE (26 aktif + 1 opsiyonel semantik); şemalar TAHMİN ` +
        `(${Math.round(coreMedian)} token/araç).`,
    },
    {
      id: "mevzuat-mcp-18",
      label: "utkumtin/mevzuat-mcp (fork: mertcanureten) — 18 araç",
      toolCount: MEVZUAT_MCP_18.length,
      schemasOnly: tokensOfJson(MEVZUAT_MCP_18),
      withDescriptions: null,
      evidence: "BELGE",
      sourceUrl: "https://github.com/utkumtin/mevzuat-mcp",
      note: "9 mevzuat türü × 2 araç; parametre adları README'de belgeli, açıklamalar yok → alt sınır.",
    },
    {
      id: "turkiye-mcp",
      label: "ayzekhdawy/turkiye-mcp — 31 araç",
      toolCount: 31,
      schemasOnly: 31 * Math.round(coreMedian),
      withDescriptions: null,
      evidence: "KARIŞIK",
      sourceUrl: "https://github.com/ayzekhdawy/turkiye-mcp",
      note: `Araç sayısı BELGE (31 MCP aracı); şemalar TAHMİN (${Math.round(coreMedian)} token/araç).`,
    },
    {
      id: "ictihat-mcp",
      label: "aydincan/turk-hukuku-ictihat-mcp — 2 araç",
      toolCount: ICTIHAT_MCP_2.length,
      schemasOnly: tokensOfJson(ICTIHAT_MCP_2),
      withDescriptions: null,
      evidence: "BELGE",
      sourceUrl: "https://github.com/aydincan/turk-hukuku-ictihat-mcp",
      note: "Küçük yüzeyli rakip: 2 araç (arama + karar getirme). Kurallar/parametreler yok.",
    },
    {
      id: "mevzuat-mcp-4",
      label: "aydincan/turk-hukuku-mevzuat-mcp — 4 araç",
      toolCount: MEVZUAT_MCP_4.length,
      schemasOnly: tokensOfJson(MEVZUAT_MCP_4),
      withDescriptions: null,
      evidence: "BELGE",
      sourceUrl: "https://github.com/aydincan/turk-hukuku-mevzuat-mcp",
      note: "Küçük yüzeyli rakip: 4 araç. Yalnız mevzuat; kural/parametre/süre hesabı yok.",
    },
  ];
}

/* --------------------------- scenario model --------------------------- */

interface BaselineScenario {
  id: string;
  ozet: string;
  calls: number;
  resultTokens: number;
  latencyMs: number;
  latencySource: "TAHMİN" | "ÖLÇÜLDÜ";
  tokensSource: "TAHMİN" | "ÖLÇÜLDÜ/KARIŞIK";
  detail: string;
}

function modelScenarios(
  scenarios: Scenario[],
  corpus: CorpusStats,
  rttMs: number,
  rttSource: "TAHMİN" | "ÖLÇÜLDÜ",
): BaselineScenario[] {
  const snippetTokens = Math.round(ASSUMPTIONS.snippetChars / corpus.charsPerToken);
  const hitTokens = ASSUMPTIONS.metadataTokensPerHit + snippetTokens;
  const searchCallTokens = ASSUMPTIONS.hitsPerSearch * hitTokens;
  const perCallMs = rttMs + ASSUMPTIONS.parseMsPerCall;

  return scenarios.map((s) => {
    // Standard chain: 1 search + 2 full-text fetches + 1 refinement search.
    const calls = ASSUMPTIONS.callsStandard;
    const resultTokens = 2 * searchCallTokens + 2 * corpus.medianDocTokens;
    return {
      id: s.id,
      ozet: s.ozet,
      calls,
      resultTokens,
      latencyMs: Math.round(calls * perCallMs),
      latencySource: rttSource === "ÖLÇÜLDÜ" ? "ÖLÇÜLDÜ" : "TAHMİN",
      tokensSource: "ÖLÇÜLDÜ/KARIŞIK",
      detail:
        `2 arama (${searchCallTokens} tok) + 2 tam metin (` +
        `${corpus.medianDocTokens} tok/karar, ${corpus.label.toLowerCase()} medyan)`,
    };
  });
}

/* --------------------------- optional probe --------------------------- */

/**
 * ONE request to one host, 1 req/s ceiling, self-identifying UA, no retries.
 * This measures *this network's* round trip to mevzuat.gov.tr — it is NOT a
 * competitor's end-to-end latency and must never be reported as such.
 */
async function probeRttMs(): Promise<number | null> {
  const url = "https://www.mevzuat.gov.tr/";
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "hukuk-mcp-bench/0.1 (+https://github.com/hukuk-mcp; benchmark; 1 req/s)",
        accept: "text/html",
      },
      signal: AbortSignal.timeout(15_000),
    });
    await res.text();
    if (!res.ok) return null;
    return Math.round(performance.now() - t0);
  } catch {
    return null;
  }
}

/* -------------------------------- main -------------------------------- */

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const liveRtt = argv.includes("--live-rtt");
  const scenarios = readScenarios();
  const corpus = corpusStats();

  const coreTokens = tokensOfJson(DAYANAK_CORE);
  const medianSchemaTokens = Math.round(coreTokens / DAYANAK_CORE.length);
  const profiles = buildProfiles(medianSchemaTokens);

  const probedMs = liveRtt ? await probeRttMs() : null;
  const rttMs = probedMs ?? ASSUMPTIONS.roundTripMs;
  const rttSource: "TAHMİN" | "ÖLÇÜLDÜ" = probedMs === null ? "TAHMİN" : "ÖLÇÜLDÜ";

  const modelled = modelScenarios(scenarios, corpus, rttMs, rttSource);

  const snippetTokens = Math.round(ASSUMPTIONS.snippetChars / corpus.charsPerToken);
  const searchCallTokens = ASSUMPTIONS.hitsPerSearch * (ASSUMPTIONS.metadataTokensPerHit + snippetTokens);

  const out = {
    status: "ok",
    measuredAt: nowIso(),
    gitSha: gitSha(),
    tokenizer: "gpt-tokenizer/encode (cl100k_base)",
    anchors: {
      corpus,
      dayanakDocstring: {
        chars: ASSUMPTIONS.docstringBudgetChars,
        estimatedTokens: Math.round(ASSUMPTIONS.docstringBudgetChars / corpus.charsPerToken),
        evidence: "BELGE (20 000 karakter bütçesi) + TAHMİN (karakter/token oranı)",
        sourceUrl: "https://github.com/afsozer/dayanak/blob/master/docs/MCP_CONTRACTS.md",
      },
      snippet: {
        chars: ASSUMPTIONS.snippetChars,
        tokens: snippetTokens,
        evidence: "BELGE (360 karakter) + ÖLÇÜLDÜ (token dönüşümü)",
      },
      hitsPerSearch: ASSUMPTIONS.hitsPerSearch,
      metadataTokensPerHit: ASSUMPTIONS.metadataTokensPerHit,
      callsStandard: ASSUMPTIONS.callsStandard,
      callsOptimistic: ASSUMPTIONS.callsOptimistic,
      roundTripMs: rttMs,
      parseMsPerCall: ASSUMPTIONS.parseMsPerCall,
      rttSource,
    },
    profiles,
    scenarioModel: {
      tokensSource: "KARIŞIK: belge + ölçüm + varsayım (aşağıdaki kalemler)",
      latencySource: rttSource,
      searchCallTokens,
      documentTokens: corpus.medianDocTokens,
      perCallMs: rttMs + ASSUMPTIONS.parseMsPerCall,
      note:
        "Standart zincir: 1 arama + 2 tam metin + 1 ikinci arama. İyimser zincir " +
        `(1 arama + 1 tam metin) = ${ASSUMPTIONS.callsOptimistic} çağrı; süre/Token raporun “iyimser” sütununda.`,
    },
    scenarios: modelled,
    optimistic: {
      calls: ASSUMPTIONS.callsOptimistic,
      resultTokens: searchCallTokens + corpus.medianDocTokens,
      latencyMs: Math.round(ASSUMPTIONS.callsOptimistic * (rttMs + ASSUMPTIONS.parseMsPerCall)),
      latencySource: rttSource,
    },
  };

  const outPath = resultsPath("baseline.json");
  writeJson(outPath, out);

  const rows = profiles.map((p) => [
    p.label,
    String(p.toolCount),
    `${p.schemasOnly}`,
    p.evidence,
    p.note,
  ]);
  console.log(mdTable(["profil", "araç", "tanım token (alt sınır)", "kanıt", "not"], rows));
  console.log("");
  console.log(
    `köprümetin: ${round(corpus.charsPerToken, 2)} karakter/token; karar medyanı ` +
      `${corpus.medianDocTokens} token (${corpus.label.toLowerCase()}); ` +
      `tur başına canlı RTT: ${rttMs} ms (${rttSource})`,
  );
  console.log(`yazıldı -> ${outPath}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
