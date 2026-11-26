import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DogrulaCikti, HesaplaCikti, HukukSorCikti } from "@hukuk/schema";

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

/** Close the stdio child even when an assertion throws; a leaked child hangs the runner. */
async function ile(fn: (c: Awaited<ReturnType<typeof baglan>>) => Promise<void>): Promise<void> {
  const c = await baglan();
  try {
    await fn(c);
  } finally {
    await c.close();
  }
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
  // routing reason sits right after the header line
  assert.match(t.split("\n")[1] ?? "", /^NEDEN tetik: "/);
  // structured twin: text first, structuredContent alongside
  const r2 = r as { content: Array<{ type: string }>; structuredContent?: Record<string, unknown> };
  assert.equal(r2.content[0]?.type, "text");
  const sc = r2.structuredContent as {
    durum: string; dugum: string; guven: number; kurallar: Array<Record<string, unknown>>;
    eksik_olgular: unknown[]; atiflar: string[]; korpus: string;
  };
  assert.ok(sc, "structuredContent yok");
  HukukSorCikti.parse(sc);
  for (const k of ["durum", "dugum", "guven", "kurallar", "eksik_olgular", "atiflar", "korpus"]) assert.ok(k in sc, `hukuk_sor.${k} yok`);
  assert.equal(sc.durum, "yanit");
  assert.match(sc.dugum, /^t\/ayipli-mal\/arac/);
  assert.ok(sc.atiflar.includes(sc.dugum));
  for (const k of sc.kurallar) for (const f of ["kural", "sonuc", "ozet", "dayanak", "eksik"]) assert.ok(f in k, `kural.${f} yok`);
  await c.close();
});

test("hukuk_sor kapsam dışı soruda durum alanı doldurulur", async () => ile(async (c) => {
  const r = (await c.callTool({ name: "hukuk_sor", arguments: { ozet: "Kiracı evi boşaltmıyor, tahliye davası açmak istiyorum" } })) as {
    structuredContent?: { durum: string; kurallar: unknown[] };
  };
  assert.ok(r.structuredContent, "structuredContent yok");
  assert.match(r.structuredContent.durum, /^(kapsam_disi|belirsiz|hata)$/);
  HukukSorCikti.parse(r.structuredContent);
  assert.deepEqual(r.structuredContent.kurallar, []);
}));

test("hesapla structuredContent döner", async () => ile(async (c) => {
  const r = (await c.callTool({
    name: "hesapla",
    arguments: { kural: "gorevli_merci", girdiler: { uyusmazlik_degeri_tl: 20000, bugun: "2026-11-01" } },
  })) as { content: Array<{ type: string; text?: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };
  assert.ok(!r.isError, textOf(r));
  assert.match(textOf(r), /^KURAL gorevli_merci/);
  const sc = r.structuredContent;
  assert.ok(sc, "structuredContent yok");
  for (const k of ["kural", "sonuc", "ozet", "dayanak", "varsayimlar", "eksik", "parametre_surumu"]) assert.ok(k in sc, `hesapla.${k} yok`);
  HesaplaCikti.parse(sc);
  assert.equal(sc.kural, "gorevli_merci");
}));

test("hesapla bilinmeyen kuralda hata metni döner", async () => ile(async (c) => {
  const r = (await c.callTool({ name: "hesapla", arguments: { kural: "yok_boyle_kural", girdiler: {} } })) as { content: Array<{ text?: string }>; isError?: boolean };
  assert.equal(r.isError, true);
  assert.match(textOf(r as never), /^HATA PARAMETRE_GUNCEL_DEGIL/);
}));

test("dogrula structuredContent: metin ve id kipleri", async () => ile(async (c) => {
  const m = (await c.callTool({ name: "dogrula", arguments: { metin: "TKHK m.11 ve 818 sayılı Borçlar Kanunu m.125" } })) as {
    structuredContent?: { atiflar: Array<{ durum: string; tur: string }>; ozet: Record<string, number> };
  };
  const sc = m.structuredContent;
  assert.ok(sc, "structuredContent yok");
  DogrulaCikti.parse(sc);
  for (const k of ["atiflar", "ozet"]) assert.ok(k in sc, `dogrula.${k} yok`);
  for (const k of ["dogru", "mulga", "yok", "kapsam"]) assert.ok(k in sc.ozet, `ozet.${k} yok`);
  assert.ok(sc.atiflar.some((a) => a.durum === "MULGA_KANUN" && a.tur === "kanun"));
  assert.match(textOf(m as never), /⚠ MÜLGA KANUN/);
  assert.match(textOf(m as never), /1 mülga kanun/);
  const i = (await c.callTool({ name: "dogrula", arguments: { id: "k:ygt-3hd-2019-1234-2020-5678" } })) as { structuredContent?: { atiflar: Array<{ durum: string }> } };
  DogrulaCikti.parse(i.structuredContent);
  assert.equal(i.structuredContent?.atiflar[0]?.durum, "DOGRU");
}));

test("sema://cikti kaynağı üç JSON Schema verir", async () => ile(async (c) => {
  const res = await c.listResources();
  assert.ok(res.resources.some((x) => x.uri === "sema://cikti" && x.mimeType === "application/json"));
  const got = await c.readResource({ uri: "sema://cikti" });
  const o = JSON.parse(String((got.contents[0] as { text: string }).text)) as Record<string, { type: string; properties: Record<string, unknown> }>;
  assert.deepEqual(Object.keys(o).sort(), ["dogrula", "hesapla", "hukuk_sor"]);
  assert.ok("durum" in o.hukuk_sor!.properties && "kural" in o.hesapla!.properties && "atiflar" in o.dogrula!.properties);
}));

test("ara metninde STRATEJİ satırı, sonuçsuzda DENENEN satırı", async () => ile(async (c) => {
  const r = await c.callTool({ name: "ara", arguments: { sorgu: "gizli ayıp bedel iadesi", butce: 600 } });
  assert.match(textOf(r as never), /\nSTRATEJİ (and|altkume|or|esanlam)/);
  const bos = await c.callTool({ name: "ara", arguments: { sorgu: "qqqzzzxxx wwwvvvuuu" } });
  const t = textOf(bos as never);
  assert.match(t, /\nSTRATEJİ yok\n/);
  assert.match(t, /\nDENENEN and.* \| SONRAKİ ADIM /);
}));

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
  assert.ok(!(r as { isError?: boolean }).isError, "not-found is a verdict, not a tool error");
  const sc = (r as { structuredContent?: { atiflar: Array<{ durum: string }> } }).structuredContent;
  assert.equal(sc?.atiflar[0]?.durum, "KAPSAM");
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
