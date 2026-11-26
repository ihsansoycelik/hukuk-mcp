#!/usr/bin/env node
/**
 * hukuk-mcp — Turkish consumer-law MCP server (stdio).
 *
 * Start:  node packages/mcp-server/src/index.ts
 * Env:    HUKUK_DB=/path/to/hukuk.db
 *
 * The query path is synchronous reads + arithmetic. No generative model is
 * called, no network is touched, and the same inputs always yield the same text.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { corpusPort, kuralPort } from "./adapters.ts";
import { olusturSunucu } from "./server.ts";

const DB = process.env.HUKUK_DB ?? "data/build/hukuk.db";

async function main(): Promise<void> {
  const corpus = corpusPort(DB);
  const kural = await kuralPort(DB);
  const sunucu = olusturSunucu(corpus, kural);
  const tasima = new StdioServerTransport();
  await sunucu.connect(tasima);
  process.stderr.write(`[hukuk-mcp] hazır | db=${DB} | sürüm=${corpus.yayinSurumu()} | kurallar=${kural.motorVar ? "açık" : "kapalı"}\n`);

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

main().catch((err: unknown) => {
  process.stderr.write(`[hukuk-mcp] başlatılamadı: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
