#!/usr/bin/env node
/**
 * test-mcp — MCP istemcisi kurmadan sunucuyu denemek için küçük bir CLI.
 *
 * Sunucuyu gerçek MCP stdio taşımasıyla başlatır (yani istemcinin yaptığının
 * aynısını yapar), aracı çağırır, yanıtı token sayısı ve süreyle basar.
 *
 *   node scripts/test-mcp.ts tools
 *   node scripts/test-mcp.ts sor "aracımın şanzımanı bozuk, paramı istiyorum"
 *   node scripts/test-mcp.ts sor "..." --tutar 250000 --tarih 2026-06-01 --talep iade
 *   node scripts/test-mcp.ts sor "işten çıkış sonrası sağlık hakkı" --tarih 2026-07-25 --prim 109
 *   node scripts/test-mcp.ts ara "ayıplı mal bedel iadesi"
 *   node scripts/test-mcp.ts ara "katılım payı iadesi" --alan sgk
 *   node scripts/test-mcp.ts hesapla ayip_zamanasimi '{"teslim_tarihi":"2025-03-10"}'
 *   node scripts/test-mcp.ts derinles m:6502/11 --seviye L1
 *   node scripts/test-mcp.ts dogrula "15. HD 2006/4980 E. 2007/5033 K."
 *
 * Seçenekler: --db <yol>  --butce <n>  --json (ham yanıt)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { encode } from "gpt-tokenizer";

const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
    const v = argv[i + 1]!;
    argv.splice(i, 2);
    return v;
  }
  return undefined;
}
const jsonOut = argv.includes("--json");
if (jsonOut) argv.splice(argv.indexOf("--json"), 1);

const db = flag("db") ?? process.env.HUKUK_DB ?? "data/build/hukuk.db";
const butce = Number(flag("butce") ?? 1500);
const [komut, ...rest] = argv;

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../packages/mcp-server/src/index.ts", import.meta.url).pathname],
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, HUKUK_DB: db } as Record<string, string>,
    stderr: "ignore",
  });
  const client = new Client({ name: "test-mcp", version: "0" }, { capabilities: {} });

  const t0 = performance.now();
  await client.connect(transport);
  const baglanti = performance.now() - t0;

  const bitir = async (text: string): Promise<void> => {
    if (jsonOut) {
      console.log(text);
    } else {
      console.log(text);
      console.log(`\n[${encode(text).length} token · ${(performance.now() - t0).toFixed(0)} ms · bağlantı ${baglanti.toFixed(0)} ms · db ${db}]`);
    }
    await client.close();
  };

  if (!komut || komut === "help") {
    console.log(
      [
        "kullanım: node scripts/test-mcp.ts <komut> [argümanlar]",
        "",
        "  tools                                  araç listesi + tanım token maliyeti",
        "  sor \"olay anlatımı\" [--tutar N] [--tarih YYYY-AA-GG] [--talep iade|onarim|indirim|degisim|tazminat|iptal|bilgi] [--urun araç]",
        "  ara \"sorgu\" [--limit N] [--yil 2015 2026]",
        "  hesapla <kural> '<girdi-json>'",
        "  derinles <kimlik> [--seviye L0|L1|L2|L3]",
        "  dogrula <kimlik|<künye>>",
        "",
        "genel: --db <yol>  --butce <n>  --json",
      ].join("\n"),
    );
    await client.close();
    return;
  }

  if (komut === "tools") {
    const { tools } = await client.listTools();
    for (const t of tools) {
      console.log(`${String(encode(JSON.stringify(t)).length).padStart(4)} token  ${t.name}  —  ${t.description ?? ""}`);
    }
    console.log(`${String(encode(JSON.stringify(tools)).length).padStart(4)} token  TOPLAM (her turda ödenir)`);
    await client.close();
    return;
  }

  if (komut === "sor") {
    const ozet = rest.join(" ").trim();
    if (!ozet) throw new Error("olay anlatımı gerekli");
    const args: Record<string, unknown> = { ozet, butce };
    const tutar = flag("tutar");
    if (tutar) args.tutar_tl = Number(tutar);
    const tarih = flag("tarih");
    if (tarih) args.olay_tarihi = tarih;
    const talep = flag("talep");
    if (talep) args.talep = talep;
    const urun = flag("urun");
    if (urun) args.urun_hizmet = urun;
    const prim = flag("prim");
    if (prim) args.prim_gun_sayisi = Number(prim);
    const r = await client.callTool({ name: "hukuk_sor", arguments: args });
    return bitir((r as { content: { text?: string }[] }).content.map((c) => c.text ?? "").join(""));
  }

  if (komut === "ara") {
    const sorgu = rest.join(" ").trim();
    const args: Record<string, unknown> = { sorgu, butce };
    const limit = flag("limit");
    if (limit) args.limit = Number(limit);
    const alan = flag("alan");
    if (alan) args.alan = alan;
    const r = await client.callTool({ name: "ara", arguments: args });
    return bitir((r as { content: { text?: string }[] }).content.map((c) => c.text ?? "").join(""));
  }

  if (komut === "hesapla") {
    const [kural, girdiJson] = rest;
    if (!kural) throw new Error("kural kimliği gerekli");
    const girdiler = girdiJson ? (JSON.parse(girdiJson) as Record<string, unknown>) : {};
    const r = await client.callTool({ name: "hesapla", arguments: { kural, girdiler } });
    return bitir((r as { content: { text?: string }[] }).content.map((c) => c.text ?? "").join(""));
  }

  if (komut === "derinles") {
    const id = rest[0];
    if (!id) throw new Error("kimlik gerekli");
    const args: Record<string, unknown> = { id, butce };
    const seviye = flag("seviye");
    if (seviye) args.seviye = seviye;
    const r = await client.callTool({ name: "derinles", arguments: args });
    return bitir((r as { content: { text?: string }[] }).content.map((c) => c.text ?? "").join(""));
  }

  if (komut === "dogrula") {
    const girdi = rest.join(" ").trim();
    if (!girdi) throw new Error("kimlik veya künye gerekli");
    const args = girdi.startsWith("m:") || girdi.startsWith("k:") || girdi.startsWith("t/") || girdi.startsWith("s/") ? { id: girdi } : { kunye: girdi };
    const r = await client.callTool({ name: "dogrula", arguments: args });
    return bitir((r as { content: { text?: string }[] }).content.map((c) => c.text ?? "").join(""));
  }

  console.error(`bilinmeyen komut: ${komut}`);
  await client.close();
  process.exit(2);
}

main().catch((err: unknown) => {
  console.error(`hata: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
