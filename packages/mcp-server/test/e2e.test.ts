import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function baglan() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "packages/mcp-server/src/index.ts")],
    cwd: ROOT,
    env: { ...process.env, HUKUK_DB: join(ROOT, "data/build/fixture.db") } as Record<string, string>,
    stderr: "pipe",
  });
  const client = new Client({ name: "e2e", version: "0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

function textOf(r: { content: Array<{ type: string; text?: string }> }): string {
  return r.content.map((c) => c.text ?? "").join("\n");
}

test("server exposes exactly five tools over stdio", async () => {
  const c = await baglan();
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["ara", "derinles", "dogrula", "hesapla", "hukuk_sor"]);
  for (const t of tools) assert.ok((t.description ?? "").length < 160, `${t.name} description too long`);
  await c.close();
});

test("hukuk_sor answers with a card and stays under budget", async () => {
  const c = await baglan();
  const r = await c.callTool({
    name: "hukuk_sor",
    arguments: { ozet: "Bayiden aldığım aracın şanzımanı 3 ayda 4 kez arıza yaptı, paramı geri alabilir miyim?", butce: 1500 },
  });
  const t = textOf(r as never);
  assert.match(t, /DÜĞÜM t\/ayipli-mal\/arac/);
  assert.match(t, /\[m:6502\/11\]/);
  assert.match(t, /NOT Bilgi amaçlıdır/);
  assert.ok(t.length < 12000, `suspiciously long: ${t.length}`);
  await c.close();
});

test("derinles resolves a statute article", async () => {
  const c = await baglan();
  const r = await c.callTool({ name: "derinles", arguments: { id: "m:6502/11", butce: 500 } });
  assert.match(textOf(r as never), /m:6502\/11/);
  await c.close();
});

test("dogrula rejects a fabricated citation", async () => {
  const c = await baglan();
  const r = await c.callTool({ name: "dogrula", arguments: { id: "k:ygt-99hd-2021-1-2022-2" } });
  assert.match(textOf(r as never), /KIMLIK_COZULEMEDI/);
  await c.close();
});

test("derinles recognises the s/ (SGK) id space", async () => {
  const c = await baglan();
  const r = await c.callTool({ name: "derinles", arguments: { id: "s/saglik/isten-ayrilma-sonrasi-hak", butce: 500 } });
  const t = textOf(r as never);
  // with or without the SGK corpus compiled, the id must be treated as a node,
  // never as an unknown identity
  assert.doesNotMatch(t, /tanınmayan kimlik/);
  assert.match(t, /s\/saglik\/isten-ayrilma-sonrasi-hak/);
  await c.close();
});

test("prompts and ontology resources are registered", async () => {
  const c = await baglan();
  const p = await c.listPrompts();
  assert.deepEqual(p.prompts.map((x) => x.name).sort(), ["basvuru_taslagi", "tuketici_sikayeti_analizi"]);
  const res = await c.listResources();
  const uris = res.resources.map((x) => x.uri);
  assert.ok(uris.includes("ontoloji://tuketici"), `tüketici kaynağı yok: ${uris.join(", ")}`);
  assert.ok(uris.includes("ontoloji://sgk"), `SGK kaynağı yok: ${uris.join(", ")}`);
  const got = await c.readResource({ uri: "ontoloji://tuketici" });
  assert.match(String((got.contents[0] as { text: string }).text), /t\/ayipli-mal\/arac/);
  // the SGK tree may be empty in a fixture built before its YAML landed; the
  // resource contract (header + `s/` space) must hold either way.
  const sgk = await c.readResource({ uri: "ontoloji://sgk" });
  assert.match(String((sgk.contents[0] as { text: string }).text), /^SGK ONTOLOJİSİ v\d+/);
  await c.close();
});
