#!/usr/bin/env -S node --no-warnings=ExperimentalWarning
/**
 * hukuk-mcp command-line entry (the npm `bin`).
 *
 *   npx -y hukuk-mcp                 # stdio MCP server (Claude Desktop, Claude Code, Cursor, Codex…)
 *   npx -y hukuk-mcp --http 8787     # Streamable HTTP MCP server at http://127.0.0.1:8787/mcp
 *   npx -y hukuk-mcp --version
 *
 * Corpus lookup order: $HUKUK_DB, then the database shipped inside the npm
 * package (<pkg>/data/hukuk.db), then ./data/build/hukuk.db (repo checkout).
 */
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { corpusPort, kuralPort } from "./adapters.ts";
import { olusturSunucu } from "./server.ts";

declare const __HUKUK_VERSION__: string | undefined;
const VERSION = typeof __HUKUK_VERSION__ === "string" ? __HUKUK_VERSION__ : "dev";

// node:sqlite prints an ExperimentalWarning on Node 22; it is noise for MCP hosts.
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((w: string | Error, ...rest: unknown[]) => {
  const msg = typeof w === "string" ? w : w.message;
  if (/SQLite is an experimental feature/.test(msg)) return;
  (emitWarning as (...a: unknown[]) => void)(w, ...rest);
}) as typeof process.emitWarning;

function dbYolu(): string {
  if (process.env.HUKUK_DB) return process.env.HUKUK_DB;
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(here, "..", "data", "hukuk.db"), join(process.cwd(), "data", "build", "hukuk.db")]) {
    if (existsSync(p)) return p;
  }
  return join(process.cwd(), "data", "build", "hukuk.db");
}

const YARDIM = `hukuk-mcp ${VERSION} — Türk tüketici hukuku ve SGK için MCP sunucusu

Kullanım:
  hukuk-mcp                 stdio MCP sunucusu (varsayılan)
  hukuk-mcp --http [PORT]   Streamable HTTP, /mcp yolunda (varsayılan port 8787, HOST=127.0.0.1)
  hukuk-mcp --version
  hukuk-mcp --help

Ortam:
  HUKUK_DB   korpus veritabanı yolu (varsayılan: paketle gelen data/hukuk.db)
  HOST       --http için dinlenecek adres (varsayılan 127.0.0.1)

Hukuki görüş değildir. Resmî metni mevzuat.gov.tr üzerinden teyit edin.
`;

async function stdio(db: string): Promise<void> {
  const corpus = corpusPort(db);
  const kural = await kuralPort(db);
  const sunucu = olusturSunucu(corpus, kural);
  await sunucu.connect(new StdioServerTransport());
  process.stderr.write(`[hukuk-mcp] hazır | ${VERSION} | korpus=${corpus.yayinSurumu()} | kurallar=${kural.motorVar ? "açık" : "kapalı"}\n`);
  const kapat = (): void => {
    try {
      corpus.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", kapat);
  process.on("SIGTERM", kapat);
}

async function govdeOku(req: IncomingMessage, sinir = 256 * 1024): Promise<unknown> {
  const parcalar: Buffer[] = [];
  let boy = 0;
  for await (const p of req) {
    boy += (p as Buffer).length;
    if (boy > sinir) throw new Error("istek gövdesi çok büyük");
    parcalar.push(p as Buffer);
  }
  const metin = Buffer.concat(parcalar).toString("utf8");
  return metin ? JSON.parse(metin) : undefined;
}

async function http(db: string, port: number): Promise<void> {
  const corpus = corpusPort(db);
  const kural = await kuralPort(db);
  const host = process.env.HOST ?? "127.0.0.1";

  const yaz = (res: ServerResponse, kod: number, govde: unknown): void => {
    res.writeHead(kod, { "content-type": "application/json" });
    res.end(JSON.stringify(govde));
  };

  const srv = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/health") return yaz(res, 200, { ok: true, version: VERSION, korpus: corpus.yayinSurumu() });
    if (url.pathname !== "/mcp") return yaz(res, 404, { error: "bulunamadı; MCP uç noktası /mcp" });
    if (req.method !== "POST") {
      return yaz(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Yalnız POST (stateless)" }, id: null });
    }
    try {
      const govde = await govdeOku(req);
      // Stateless: a fresh MCP server per request; the corpus handle is shared.
      const sunucu = olusturSunucu(corpus, kural);
      const tasima = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        void tasima.close();
        void sunucu.close();
      });
      await sunucu.connect(tasima);
      await tasima.handleRequest(req, res, govde);
    } catch (err) {
      if (!res.headersSent) {
        yaz(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: err instanceof Error ? err.message : "hata" }, id: null });
      }
    }
  });
  srv.listen(port, host, () => {
    process.stderr.write(`[hukuk-mcp] HTTP hazır | http://${host}:${port}/mcp | korpus=${corpus.yayinSurumu()}\n`);
  });
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(YARDIM);
} else if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(VERSION + "\n");
} else {
  const db = dbYolu();
  if (!existsSync(db)) {
    process.stderr.write(`[hukuk-mcp] korpus bulunamadı: ${db}\nHUKUK_DB ile yol verin veya npm paketini kullanın (npx -y hukuk-mcp).\n`);
    process.exit(1);
  }
  const i = args.indexOf("--http");
  const sonraki = i >= 0 ? args[i + 1] : undefined;
  const port = Number(sonraki && !sonraki.startsWith("-") ? sonraki : (process.env.PORT ?? 8787));
  const calis = i >= 0 ? http(db, port) : stdio(db);
  calis.catch((err: unknown) => {
    process.stderr.write(`[hukuk-mcp] başlatılamadı: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
}
