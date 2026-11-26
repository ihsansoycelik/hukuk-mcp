import { test } from "node:test";
import assert from "node:assert/strict";
import { dogrula, yapraklar, dallar, kokler, tumDugumler, dugumBul, ustZinciri, dugumVektorMetni, surum } from "@hukuk/ontology";

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

test("ontology is structurally valid", () => {
  const hatalar = dogrula();
  assert.deepEqual(hatalar, [], JSON.stringify(hatalar, null, 2));
});

test("has 14 branches across 2 fields and >= 48 leaves", () => {
  assert.equal(dallar().length, 14);
  assert.equal(kokler().length, 2);
  assert.deepEqual(kokler().map((d) => d.id), ["t/tuketici", "s/sgk"]);
  assert.ok(yapraklar().length >= 48, `only ${yapraklar().length} leaves`);
  assert.equal(tumDugumler().length, dallar().length + yapraklar().length + 2);
});

test("both fields' trees and all SGK leaves exist", () => {
  assert.ok(dugumBul("t/tuketici"));
  assert.ok(dugumBul("s/sgk"));
  assert.equal(yapraklar().filter((d) => d.id.startsWith("t/")).length, 41);
  assert.equal(yapraklar().filter((d) => d.id.startsWith("s/")).length, 8);
  for (const id of SGK_LEAVES) {
    const d = dugumBul(id);
    assert.ok(d, `${id} missing`);
    assert.ok(d.yaprak, `${id} is not a leaf`);
    assert.ok(d.id.startsWith("s/"));
  }
});

test("every leaf carries rules and at least 5 examples", () => {
  for (const y of yapraklar()) {
    assert.ok(y.kurallar.length > 0, `${y.id} has no rules`);
    assert.ok(y.ornek_sorgular.length >= 5, `${y.id} has ${y.ornek_sorgular.length} examples`);
  }
});

test("a leaf's own rule/article list overrides the branch default", () => {
  const leaf = dugumBul("s/gss/prim-borcu")!;
  assert.deepEqual(leaf.maddeler, ["m:5510/67", "m:5510/89", "m:5510/93"]);
  assert.deepEqual(leaf.kurallar, ["gss_prim_zamanasimi"]);
  const branch = dugumBul("s/gss")!;
  assert.ok(branch.maddeler.includes("m:5510/60"));
  assert.ok(!leaf.maddeler.includes("m:5510/60"));

  // consumer leaves still inherit the branch's defaults
  const inherited = dugumBul("t/ayipli-mal/arac")!;
  assert.deepEqual(inherited.maddeler, dugumBul("t/ayipli-mal")!.maddeler);
});

test("ids are unique and resolvable", () => {
  const ids = tumDugumler().map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(dugumBul("t/ayipli-mal/arac"));
  assert.ok(dugumBul("s/saglik/isten-ayrilma-sonrasi-hak"));
  assert.equal(dugumBul("t/yok/boyle"), null);
  assert.equal(dugumBul("s/yok/boyle"), null);
});

test("breadcrumb chain reaches the root", () => {
  const t = ustZinciri("t/ayipli-mal/arac");
  assert.deepEqual(t.map((d) => d.id), ["t/tuketici", "t/ayipli-mal", "t/ayipli-mal/arac"]);
  const s = ustZinciri("s/saglik/isten-ayrilma-sonrasi-hak");
  assert.deepEqual(s.map((d) => d.id), ["s/sgk", "s/saglik", "s/saglik/isten-ayrilma-sonrasi-hak"]);
});

test("vector text never leaks the id slug", () => {
  const d = dugumBul("t/ayipli-mal/arac")!;
  assert.ok(!dugumVektorMetni(d).includes("t/ayipli-mal/arac"));
  const s = dugumBul("s/gss/prim-borcu")!;
  assert.ok(!dugumVektorMetni(s).includes("s/gss/prim-borcu"));
  assert.equal(surum(), 1);
});
