/**
 * bench/util.ts — shared helpers for the benchmark harness.
 *
 * Token counting MUST use `gpt-tokenizer` (`encode`) because that is the same
 * tokenizer the server uses to enforce its response budget. Using a different
 * tokenizer here would make our own numbers incomparable to each other.
 */
import { encode } from "gpt-tokenizer";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* ------------------------------ tokens ------------------------------ */

/** Token count of a string, with the same tokenizer the server uses. */
export function tokens(text: string): number {
  if (text.length === 0) return 0;
  return encode(text).length;
}

/** Token count of the canonical compact JSON encoding of a value. */
export function tokensOfJson(value: unknown): number {
  return tokens(JSON.stringify(value));
}

/** Approximate characters-per-token, useful for converting documented char budgets. */
export function charsPerToken(text: string): number {
  const t = tokens(text);
  return t === 0 ? 0 : text.length / t;
}

/* ----------------------------- statistics ---------------------------- */

export function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : sum(xs) / xs.length;
}

/** Nearest-rank percentile; `p` in [0,1]. */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

export function median(xs: number[]): number {
  return percentile(xs, 0.5);
}

export function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/* ------------------------------- paths ------------------------------- */

/** Repository root (bench/ is one level below it). */
export function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

export function benchPath(...parts: string[]): string {
  return join(repoRoot(), "bench", ...parts);
}

export function resultsPath(name: string): string {
  const dir = benchPath("results");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

export function writeJson(path: string, value: unknown): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/* ------------------------------ scenarios ---------------------------- */

/**
 * One realistic citizen question.
 *
 * `bugun` is pinned in every scenario so the measurement is reproducible: the
 * deterministic rule engine reads the date from the caller, never from the
 * clock. Changing `bugun` changes deadlines, not the tool surface.
 */
export interface Scenario {
  id: string;
  /** Verbatim, lay-language description of the events. */
  ozet: string;
  talep?: string;
  olay_tarihi?: string;
  bugun?: string;
  tutar_tl?: number;
  /** SGK prim gün sayısı (10+90 gün ve işsizlik ödeneği senaryoları). */
  prim_gun_sayisi?: number;
  kullanici_rolu?: string;
  karsi_taraf?: string;
  urun_hizmet?: string;
  butce?: number;
  /** Free-form note for the human reading the report. */
  not?: string;
}

export function readScenarios(): Scenario[] {
  const path = benchPath("scenarios.jsonl");
  const raw = readFileSync(path, "utf8");
  const out: Scenario[] = [];
  for (const [i, line] of raw.split("\n").entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("//")) continue;
    try {
      out.push(JSON.parse(trimmed) as Scenario);
    } catch (err) {
      throw new Error(`scenarios.jsonl satır ${i + 1} geçersiz JSON: ${(err as Error).message}`);
    }
  }
  return out;
}

/** Arguments actually sent to the MCP tool: drop bench-only fields. */
export function scenarioArgs(s: Scenario): Record<string, unknown> {
  const args: Record<string, unknown> = { ozet: s.ozet };
  if (s.talep !== undefined) args["talep"] = s.talep;
  if (s.olay_tarihi !== undefined) args["olay_tarihi"] = s.olay_tarihi;
  if (s.bugun !== undefined) args["bugun"] = s.bugun;
  if (s.tutar_tl !== undefined) args["tutar_tl"] = s.tutar_tl;
  if (s.prim_gun_sayisi !== undefined) args["prim_gun_sayisi"] = s.prim_gun_sayisi;
  if (s.kullanici_rolu !== undefined) args["kullanici_rolu"] = s.kullanici_rolu;
  if (s.karsi_taraf !== undefined) args["karsi_taraf"] = s.karsi_taraf;
  if (s.urun_hizmet !== undefined) args["urun_hizmet"] = s.urun_hizmet;
  if (s.butce !== undefined) args["butce"] = s.butce;
  return args;
}

/* -------------------------------- misc ------------------------------- */

export function nowIso(): string {
  return new Date().toISOString();
}

export function gitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "bilinmiyor";
  }
}

export function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/** Markdown table helper: renders a header + rows with aligned pipes. */
export function mdTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.map((h) => h.trim()).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}
