import { test } from "node:test";
import assert from "node:assert/strict";
import { kartlariDogrula, yaziliKartlar, kartsizDugumler, yapraklar, KART_YOLU, KART_YOLLARI } from "@hukuk/ontology";

const SGK_LEAVES = [
  "s/saglik/isten-ayrilma-sonrasi-hak",
  "s/saglik/provizyon-alinamama",
  "s/saglik/katilim-payi-iadesi",
  "s/gss/gelir-testi",
  "s/gss/prim-borcu",
  "s/gelir/issizlik-odenegi",
  "s/is-kazasi/bildirim-ve-haklar",
  "s/usul/kurum-karari-itiraz",
];

test("authored cards pass integrity", () => {
  const hatalar = kartlariDogrula();
  assert.deepEqual(hatalar, [], JSON.stringify(hatalar, null, 2));
});

test("cards are marked taslak until an expert approves them", () => {
  for (const k of yaziliKartlar()) {
    if (k.durum === "uzman_onayli") assert.ok(k.onaylayan, `${k.dugum_id} claims approval without approver`);
    else assert.equal(k.durum, "taslak");
  }
});

test("every consumer card cites at least three distinct articles", () => {
  for (const k of yaziliKartlar().filter((k) => k.dugum_id.startsWith("t/"))) {
    const ids = new Set(k.bolumler.flatMap((b) => [...b.metin.matchAll(/\[m:(\d+\/\w+)\]/g)].map((m) => m[1]!)));
    assert.ok(ids.size >= 3, `${k.dugum_id} only cites ${ids.size}`);
  }
});

test("every SGK card cites the SGK statutes (5510/4447)", () => {
  const sgkKartlar = yaziliKartlar().filter((k) => k.dugum_id.startsWith("s/"));
  assert.equal(sgkKartlar.length, 8);
  for (const k of sgkKartlar) {
    const ids = new Set(k.bolumler.flatMap((b) => [...b.metin.matchAll(/\[m:(\d+\/\w+)\]/g)].map((m) => m[1]!)));
    assert.ok(ids.size >= 2, `${k.dugum_id} only cites ${ids.size} articles`);
    for (const id of ids) {
      assert.ok(id.startsWith("5510/") || id.startsWith("4447/"), `${k.dugum_id} cites foreign statute ${id}`);
    }
  }
  for (const id of SGK_LEAVES) {
    assert.ok(sgkKartlar.some((k) => k.dugum_id === id), `${id} has no authored card`);
  }
});

test("coverage: 24 authored cards; 25 consumer leaves are left to the build template", () => {
  const eksik = kartsizDugumler(yapraklar());
  const yazili = yaziliKartlar().length;
  assert.equal(yazili, 24);
  // every SGK leaf ships an authored card; the build fills the rest with a template
  assert.deepEqual(eksik.filter((id) => id.startsWith("s/")), []);
  assert.equal(eksik.length, 25, `expected 25 templated consumer leaves, got ${eksik.length}`);
});

test("KART_YOLLARI exposes both card files; KART_YOLU stays the consumer file", () => {
  assert.equal(KART_YOLLARI.length, 2);
  assert.equal(KART_YOLU, KART_YOLLARI[0]);
  for (const p of KART_YOLLARI) assert.ok(p.endsWith(".yaml"), p);
});
