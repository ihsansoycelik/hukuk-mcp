#!/usr/bin/env node
/**
 * hukuk-mcp demo server — the public, install-free face of the same core.
 *
 * Start:  HUKUK_DB=… DEMO_TOKEN=<32+ char secret> PORT=8099 node packages/demo/src/index.ts
 *
 * Binds to loopback by default: the intended deployment is a reverse proxy or
 * tunnel in front of it, not a directly exposed port.
 */
import { corpusPort, kuralPort } from "@hukuk/mcp-server/adapters";
import { olusturDemoSunucu } from "./server.ts";

const DB = process.env.HUKUK_DB ?? "data/build/hukuk.db";
const TOKEN = process.env.DEMO_TOKEN ?? "";
const PORT = Number(process.env.PORT ?? 8099);
const HOST = process.env.HOST ?? "127.0.0.1";

async function main(): Promise<void> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(TOKEN)) {
    process.stderr.write(
      "[hukuk-demo] DEMO_TOKEN yok veya kısa (en az 16 karakter: harf, rakam, - ve _)\n",
    );
    process.exit(1);
  }

  const corpus = corpusPort(DB);
  const kural = await kuralPort(DB);
  const sunucu = olusturDemoSunucu(corpus, kural, {
    token: TOKEN,
    logla: (satir) => process.stdout.write(`${new Date().toISOString()} ${satir}\n`),
  });

  sunucu.listen(PORT, HOST, () => {
    process.stderr.write(
      `[hukuk-demo] hazır | http://${HOST}:${PORT}/${TOKEN}/ | db=${DB} | sürüm=${corpus.yayinSurumu()}\n`,
    );
  });

  const kapat = (): void => {
    sunucu.close(() => {
      try {
        corpus.close();
      } finally {
        process.exit(0);
      }
    });
  };
  process.on("SIGINT", kapat);
  process.on("SIGTERM", kapat);
}

main().catch((err: unknown) => {
  process.stderr.write(`[hukuk-demo] başlatılamadı: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
