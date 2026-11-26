/**
 * bench/measure.ts — measure OUR server, over the real MCP wire.
 *
 * What is measured (nothing is estimated here):
 *   - tool surface: the byte-for-byte `tools/list` payload the client receives,
 *     tokenised with the same `gpt-tokenizer` the server uses for its budget;
 *   - per scenario: number of MCP tool calls made by the client (always 1 for
 *     `hukuk_sor`), tokens of the returned text content, wall-clock latency;
 *   - cold start: spawn -> first successful `tools/list`.
 *
 * It talks to the server exactly as Claude Desktop/Codex would: child process +
 * MCP stdio. No imports from packages/ — if the harness imported server code
 * directly it would not measure the transport or the real payloads.
 *
 * Usage:
 *   node bench/measure.ts
 *   node bench/measure.ts --iterations 5 --only arac-sanziman --verbose
 *   node bench/measure.ts --server packages/mcp-server/src/index.ts
 *
 * Exit codes: 0 = measured, 0 = server not ready (writes a PENDING record), 1 = hard failure.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createHash } from "node:crypto";
import { loadavg, cpus } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  gitSha,
  mean,
  median,
  nowIso,
  percentile,
  readScenarios,
  repoRoot,
  resultsPath,
  round,
  scenarioArgs,
  tokens,
  tokensOfJson,
  writeJson,
} from "./util.ts";

/* ------------------------------- options ----------------------------- */

interface Options {
  iterations: number;
  only: string | null;
  verbose: boolean;
  serverPath: string;
  dbPath: string;
  out: string;
  timeoutMs: number;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    iterations: 20,
    only: null,
    verbose: false,
    serverPath: resolve(repoRoot(), "packages", "mcp-server", "src", "index.ts"),
    // Real corpus wins; the fixture exists so the bench can run before the crawl lands.
    out: "measurements.json",
    dbPath: resolve(
      repoRoot(),
      process.env["HUKUK_DB"] ??
        (existsSync(resolve(repoRoot(), "data/build/hukuk.db")) ? "data/build/hukuk.db" : "data/build/fixture.db"),
    ),
    timeoutMs: 60_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--iterations") {
      const v = argv[++i];
      if (v !== undefined) opts.iterations = Math.max(1, Number.parseInt(v, 10));
    } else if (a === "--only") {
      opts.only = argv[++i] ?? null;
    } else if (a === "--verbose") {
      opts.verbose = true;
    } else if (a === "--server") {
      const v = argv[++i];
      if (v !== undefined) opts.serverPath = resolve(repoRoot(), v);
    } else if (a === "--db") {
      const v = argv[++i];
      if (v !== undefined) opts.dbPath = resolve(repoRoot(), v);
    } else if (a === "--out") {
      const v = argv[++i];
      if (v !== undefined) opts.out = v;
    } else if (a === "--timeout") {
      const v = argv[++i];
      if (v !== undefined) opts.timeoutMs = Math.max(1000, Number.parseInt(v, 10));
    }
  }
  return opts;
}


/** Content hashes so the snapshot is auditable without git (this repo has no .git). */
function snapshot(serverPath: string, dbPath: string): Record<string, unknown> {
  const hash = (path: string): string => {
    try {
      return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
    } catch {
      return "okunamadı";
    }
  };
  const dir = dirname(serverPath);
  let files: Array<{ name: string; sha256: string; bytes: number }> = [];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .sort()
      .map((f) => {
        const p = resolve(dir, f);
        return { name: f, sha256: hash(p), bytes: statSync(p).size };
      });
  } catch {
    files = [];
  }
  // corpus provenance: the build stamps `meta.surum`; record it with the measurement
  let dbMeta: Record<string, string> = {};
  const counts: Record<string, number | string> = {};
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    for (const row of db.prepare("select k, v from meta").all() as Array<{ k: string; v: string }>) {
      dbMeta[row.k] = row.v;
    }
    for (const t of ["mevzuat", "madde", "karar", "dugum", "kart", "kural_parametre"]) {
      try {
        counts[t] = (db.prepare(`select count(*) c from ${t}`).get() as { c: number }).c;
      } catch {
        counts[t] = "yok";
      }
    }
    db.close();
  } catch (err) {
    dbMeta = { hata: (err as Error).message };
  }
  return {
    dbMeta,
    dbCounts: counts,
    hostLoadAvg: loadavg().map((x) => Math.round(x * 100) / 100),
    hostCpus: cpus().length,
    serverDir: dir,
    serverFiles: files,
    db: { path: dbPath, sha256: hash(dbPath), bytes: existsSync(dbPath) ? statSync(dbPath).size : null },
  };
}

/* ------------------------------- results ----------------------------- */

interface ToolSurface {
  count: number;
  /** Tokens of the exact JSON array returned by tools/list. */
  tokens: number;
  perTool: Array<{ name: string; tokens: number; chars: number }>;
  names: string[];
}

interface ScenarioResult {
  id: string;
  ozet: string;
  butce: number | null;
  /** MCP tool calls per answer — always 1 for hukuk_sor. */
  calls: number;
  iterations: number;
  error: string | null;
  isError: boolean;
  tokensPerCall: number[];
  tokensMedian: number;
  latencyMs: number[];
  /** First call in the scenario, includes lazy init / JIT. */
  coldCallMs: number;
  latencyP50: number;
  latencyP95: number;
  textChars: number;
  contentBlocks: number;
  sections: string[];
  citationIds: string[];
  withinBudget: boolean | null;
  /** True when the server could not route the question (returns a HATA … line). */
  fallback: boolean;
  /** True when the answer asks the user to disambiguate ("BELİRSİZ DÜĞÜM"). */
  clarify: boolean;
  /** First 240 chars, for a human sanity check that the answer is lay-language. */
  preview: string;
}

const SECTIONS = [
  "DÜĞÜM",
  "ÖZET",
  "KURALLAR",
  "HAKLAR",
  "YOL",
  "EKSİK OLGULAR",
  "ARGÜMANLAR",
  "KARARLAR",
  "DERİNLEŞ",
  "DERINLES",
  "NOT",
];

function detectSections(text: string): string[] {
  const found = new Set<string>();
  for (const line of text.split("\n")) {
    const head = line.trim().slice(0, 24).toUpperCase();
    for (const s of SECTIONS) if (head.startsWith(s)) found.add(s);
  }
  return [...found];
}

/**
 * Citation ids the answer must carry so a claim is resolvable:
 *   m:6502/11 (madde), k:ygt-... (karar), t/... (tüketici düğümü),
 *   s/... (SGK düğümü), a:... (argüman).
 */
function detectCitationIds(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/(?:^|[\s(\[,;])((?:m:|k:|t\/|s\/|a:)[^\s)\],;]{2,})/gu)) {
    const id = m[1];
    if (id !== undefined) ids.add(id);
  }
  return [...ids];
}

function contentText(result: unknown): string {
  const blocks = (result as { content?: unknown }).content;
  if (!Array.isArray(blocks)) return "";
  const parts: string[] = [];
  for (const block of blocks) {
    const b = block as { type?: string; text?: string };
    if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
  }
  return parts.join("\n");
}

/* -------------------------------- main ------------------------------- */

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const outPath = resultsPath(opts.out);
  const scenarios = readScenarios().filter((s) => opts.only === null || s.id === opts.only);

  if (!existsSync(opts.serverPath)) {
    console.error(
      [
        "PENDING — sunucu henüz yok, ölçüm yapılamadı.",
        `  beklenen dosya: ${opts.serverPath}`,
        "  Bu kayıt bench/results/measurements.json içine 'pending' olarak yazıldı.",
        "  Sunucu hazır olunca: node bench/measure.ts && node bench/report.ts",
      ].join("\n"),
    );
    writeJson(outPath, {
      status: "pending",
      reason: "server-missing",
      expectedServerPath: opts.serverPath,
      checkedAt: nowIso(),
      gitSha: gitSha(),
      node: process.version,
    });
    return 0;
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [opts.serverPath],
    cwd: repoRoot(),
    stderr: "pipe",
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
      ),
      HUKUK_DB: opts.dbPath,
    },
  });

  let stderrTail = "";
  transport.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(-4000);
  });

  const client = new Client({ name: "hukuk-bench", version: "0.1.0" }, { capabilities: {} });

  const spawnStart = performance.now();
  try {
    await client.connect(transport, { timeout: 30_000 });
  } catch (err) {
    console.error(`Sunucuya bağlanılamadı: ${(err as Error).message}`);
    if (stderrTail.length > 0) console.error(`--- sunucu stderr (son 4000 karakter) ---\n${stderrTail}`);
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    return 1;
  }

  const listStart = performance.now();
  const listed = (await client.listTools()) as { tools?: unknown[] };
  const tools = listed.tools ?? [];
  const coldStartMs = performance.now() - spawnStart;
  const listMs = performance.now() - listStart;

  const toolSurface: ToolSurface = {
    count: tools.length,
    tokens: tokensOfJson(tools),
    perTool: tools.map((t) => {
      const tool = t as { name?: string };
      const json = JSON.stringify(t);
      return { name: tool.name ?? "?", tokens: tokens(json), chars: json.length };
    }),
    names: tools.map((t) => (t as { name?: string }).name ?? "?"),
  };

  if (toolSurface.count === 0) {
    console.error("tools/list boş döndü; ölçülecek araç yüzeyi yok.");
    await client.close();
    return 1;
  }

  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    const perCallTokens: number[] = [];
    const latencies: number[] = [];
    let error: string | null = null;
    let isError = false;
    let text = "";
    let blocks = 0;

    for (let i = 0; i < opts.iterations; i++) {
      const t0 = performance.now();
      try {
        const res = (await client.callTool(
          { name: "hukuk_sor", arguments: scenarioArgs(scenario) },
          undefined,
          { timeout: opts.timeoutMs },
        )) as { content?: unknown[]; isError?: boolean };
        latencies.push(performance.now() - t0);
        isError = res.isError === true;
        if (i === 0) {
          text = contentText(res);
          blocks = Array.isArray(res.content) ? res.content.length : 0;
        }
        perCallTokens.push(tokens(contentText(res)));
      } catch (err) {
        error = (err as Error).message;
        break;
      }
    }

    const r: ScenarioResult = {
      id: scenario.id,
      ozet: scenario.ozet,
      butce: scenario.butce ?? null,
      // one callTool per answer; `iterations` is measurement repetition, not agent work
      calls: perCallTokens.length > 0 ? 1 : 0,
      iterations: opts.iterations,
      error,
      isError,
      tokensPerCall: perCallTokens,
      tokensMedian: median(perCallTokens),
      latencyMs: latencies.map((x) => round(x, 2)),
      coldCallMs: round(latencies[0] ?? 0, 2),
      // steady state: drop the first call of the scenario (init + JIT)
      latencyP50: round(percentile(latencies.slice(1), 0.5), 2),
      latencyP95: round(percentile(latencies.slice(1), 0.95), 2),
      textChars: text.length,
      contentBlocks: blocks,
      sections: detectSections(text),
      citationIds: detectCitationIds(text),
      withinBudget: scenario.butce === undefined ? null : median(perCallTokens) <= scenario.butce,
      fallback: text.trimStart().startsWith("HATA"),
      clarify: text.trimStart().startsWith("BELİRSİZ DÜĞÜM"),
      preview: text.replace(/\s+/g, " ").slice(0, 240),
    };
    results.push(r);

    if (opts.verbose) {
      const status = r.error !== null ? `HATA: ${r.error}` : `${r.tokensMedian} tok, ${r.latencyP50} ms`;
      console.log(`  ${r.id.padEnd(24)} ${status}`);
    }
  }

  const ok = results.filter((r) => r.error === null);
  const allTokens = ok.flatMap((r) => r.tokensPerCall);
  const allLatencies = ok.flatMap((r) => r.latencyMs);
  const steady = ok.flatMap((r) => r.latencyMs.slice(1));

  const summary = {
    scenarios: results.length,
    scenariosOk: ok.length,
    tools: toolSurface.count,
    toolDefinitionTokens: toolSurface.tokens,
    resultTokensMedian: median(allTokens),
    resultTokensMax: allTokens.length === 0 ? 0 : Math.max(...allTokens),
    latencyP50: round(percentile(steady.length > 0 ? steady : allLatencies, 0.5), 2),
    latencyP95: round(percentile(steady.length > 0 ? steady : allLatencies, 0.95), 2),
    latencyMean: round(mean(steady.length > 0 ? steady : allLatencies), 2),
    coldCallP50: round(median(ok.map((r) => r.coldCallMs)), 2),
    coldCallP95: round(percentile(ok.map((r) => r.coldCallMs), 0.95), 2),
    coldStartMs: round(coldStartMs, 2),
    toolsListMs: round(listMs, 2),
    budgetCompliance: `${ok.filter((r) => r.withinBudget === true).length}/${ok.length}`,
    answered: ok.filter((r) => !r.fallback && !r.clarify).length,
    clarify: ok.filter((r) => r.clarify).length,
    fallback: ok.filter((r) => r.fallback).length,
  };

  writeJson(outPath, {
    status: "ok",
    measuredAt: nowIso(),
    gitSha: gitSha(),
    node: process.version,
    tokenizer: "gpt-tokenizer/encode (cl100k_base)",
    server: {
      path: opts.serverPath,
      db: opts.dbPath,
      dbBytes: existsSync(opts.dbPath) ? statSync(opts.dbPath).size : null,
      transport: "stdio (StdioClientTransport)",
      tool: "hukuk_sor",
      iterations: opts.iterations,
    },
    snapshot: snapshot(opts.serverPath, opts.dbPath),
    toolSurface,
    summary,
    scenarios: results,
  });

  console.log(`ölçüm tamam -> ${outPath}`);
  console.log(
    `  araç yüzeyi: ${summary.tools} araç, ${summary.toolDefinitionTokens} token (tools/list)`,
  );
  console.log(
    `  sonuç: p50 ${summary.resultTokensMedian} token, p50 ${summary.latencyP50} ms, ` +
      `p95 ${summary.latencyP95} ms, soğuk başlangıç ${summary.coldStartMs} ms`,
  );
  console.log(`  token bütçesine uyum: ${summary.budgetCompliance}`);
  console.log(
    `  yanıt/netleştirme/fallback: ${summary.answered} / ${summary.clarify} / ${summary.fallback}`,
  );
  console.log(`  veritabanı: ${opts.dbPath}`);
  if (summary.scenariosOk < summary.scenarios) {
    console.error(`  DİKKAT: ${summary.scenarios - summary.scenariosOk} senaryo hata verdi.`);
  }

  await client.close();
  return summary.scenariosOk === summary.scenarios ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
