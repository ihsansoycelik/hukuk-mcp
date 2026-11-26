/**
 * Surface gates: cheap, structural checks on what tools/list advertises.
 * These run against the fixture DB over stdio, like the e2e tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { encode } from "gpt-tokenizer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
/** tools/list is paid for on every model turn; ceiling in o200k_base tokens. */
const TOOLS_TOKEN_TAVANI = 1200;

async function baglan() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "packages/mcp-server/src/index.ts")],
    cwd: ROOT,
    env: { ...process.env, HUKUK_DB: join(ROOT, "data/build/fixture.db") } as Record<string, string>,
    stderr: "pipe",
  });
  const client = new Client({ name: "gate", version: "0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

/** Always close the stdio child, even when an assertion throws; otherwise the runner hangs. */
async function ile(fn: (c: Client) => Promise<void>): Promise<void> {
  const c = await baglan();
  try {
    await fn(c);
  } finally {
    await c.close();
  }
}

test("her aracın başlığı ve salt-okunur ek açıklamaları var", async () => ile(async (c) => {
  const { tools } = await c.listTools();
  assert.equal(tools.length, 5);
  for (const t of tools) {
    assert.ok(t.title && t.title.length > 0, `${t.name}: title yok`);
    assert.equal(t.annotations?.readOnlyHint, true, `${t.name}: readOnlyHint`);
    assert.equal(t.annotations?.idempotentHint, true, `${t.name}: idempotentHint`);
    assert.equal(t.annotations?.destructiveHint, false, `${t.name}: destructiveHint`);
    assert.equal(t.annotations?.openWorldHint, false, `${t.name}: openWorldHint`);
  }
}));

test("tools/list sırası sabit (kayıt sırası)", async () => ile(async (c) => {
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map((t) => t.name), ["hukuk_sor", "derinles", "ara", "hesapla", "dogrula"]);
}));

test("açıklamalarda ve talimatta geçen her araç adı gerçekten var", async () => ile(async (c) => {
  const { tools } = await c.listTools();
  const adlar = new Set(tools.map((t) => t.name));
  const metinler = [...tools.map((t) => t.description ?? ""), c.getInstructions() ?? ""];
  // tool-shaped words: snake_case identifiers, plus the bare names of our tools
  const bilinenAdaylar = /\b[a-z]+_[a-z_]+\b/g;
  for (const m of metinler) {
    for (const ad of m.match(bilinenAdaylar) ?? []) assert.ok(adlar.has(ad), `bilinmeyen araç adı: ${ad}`);
  }
  // every name we know of that appears in prose must be registered; names we do
  // not register (the old surface) must not leak back in
  for (const eski of ["hukuk_ara", "madde_getir", "karar_getir", "kural_hesapla"]) {
    for (const m of metinler) assert.ok(!m.includes(eski), `eski araç adı sızmış: ${eski}`);
  }
  const talimat = c.getInstructions() ?? "";
  for (const ad of ["hukuk_sor", "derinles", "ara"]) assert.ok(talimat.includes(ad), `talimatta ${ad} geçmeli`);
}));

test(`tools/list toplamı ${TOOLS_TOKEN_TAVANI} tokenı geçmez ve outputSchema yok`, async () => ile(async (c) => {
  const { tools } = await c.listTools();
  const n = encode(JSON.stringify(tools)).length;
  console.log(`# tools/list token toplamı: ${n}`);
  for (const t of tools) assert.equal(t.outputSchema, undefined, `${t.name}: outputSchema tools/list'i şişirir`);
  assert.ok(n <= TOOLS_TOKEN_TAVANI, `tools/list ${n} token, tavan ${TOOLS_TOKEN_TAVANI}`);
}));
