/**
 * Retrieval contracts. Runs against eval/fixtures/test.db, never against the
 * large corpus. The fixture is rebuilt automatically when the ontology changes.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  Corpus,
  belirsizMi,
  ftsSorgulari,
  guvenliFtsToken,
  type DugumAday,
} from "../src/index.ts";
import { buildTestDb } from "../../../eval/fixtures/build.ts";

const FIXTURE = fileURLToPath(new URL("../../../eval/fixtures/test.db", import.meta.url));
const ONTOLOGY = fileURLToPath(new URL("../../../packages/ontology/tuketici.yaml", import.meta.url));

let c: Corpus;

before(() => {
  let yenile = !existsSync(FIXTURE);
  if (!yenile) yenile = statSync(FIXTURE).mtimeMs < statSync(ONTOLOGY).mtimeMs;
  if (yenile) buildTestDb(FIXTURE);
  c = new Corpus(FIXTURE);
});

after(() => c.close());

test("FTS sorgusu tırnak, yıldız, eksi, OR ve NEAR karakterlerini kaçırır", () => {
  assert.equal(guvenliFtsToken('a"b'), '"a""b"');
  const s = ftsSorgulari("kredi OR kart");
  assert.ok(s.and, "AND sorgusu üretilmeli");
  // OR kullanıcı terimidir; FTS operatörü olarak dışarı sızmamalı.
  assert.ok(s.tokens.includes("or"));
  assert.ok(s.and.includes('"or"'));
  assert.ok(!/^"[^"]+" OR /.test(s.and));

  const zor = [
    'kredi*',
    "kredi -kart",
    '"ayıplı mal"',
    "kredi OR kart",
    "NEAR(kredi kart)",
    "a:b^c",
    "şanzıman*",
  ];
  for (const q of zor) {
    assert.doesNotThrow(() => c.ara({ sorgu: q, limit: 5 }), `sorgu patlamamalı: ${q}`);
  }
});

test("strict AND boşsa alt-küme/OR yedeği çalışır ve gevsek işaretlenir", () => {
  const hitler = c.ara({ sorgu: "şanzıman zzzzolmayankelime", limit: 5 });
  assert.ok(hitler.length > 0, "bilinen tek terim üzerinden yedek sonuç gelmeli");
  assert.ok(hitler.every((h) => h.gevsek === true));
  assert.ok(hitler.some((h) => h.gevsekTuru === "altkume" || h.gevsekTuru === "or"));

  const bos = c.ara({ sorgu: "zzzz qqqq", limit: 5 });
  assert.deepEqual(bos, []);
});

test("sert filtreler skorlamadan önce uygulanır", () => {
  const yargitay = c.ara({ sorgu: "şanzıman arıza", mahkeme: ["yargitay"], limit: 10 });
  assert.ok(yargitay.length > 0);
  assert.ok(yargitay.every((h) => h.mahkeme === "yargitay"));

  const y2021 = c.ara({ sorgu: "şanzıman arıza", yil: [2021, 2021], limit: 10 });
  assert.ok(y2021.length > 0);
  assert.ok(y2021.every((h) => h.tarih.startsWith("2021-")));

  const kabul = c.ara({ sorgu: "şanzıman arıza", sonuc: ["kabul"], limit: 10 });
  assert.ok(kabul.length > 0);
  assert.ok(kabul.every((h) => h.sonuc === "kabul"));

  const alan = c.ara({ sorgu: "şanzıman arıza", alan: "t/ayipli-mal", limit: 10 });
  assert.ok(alan.length > 0);
  const db = new DatabaseSync(FIXTURE, { readOnly: true });
  try {
    const stmt = db.prepare("SELECT dugum_id FROM karar WHERE id = ?");
    for (const h of alan) {
      const row = stmt.get(h.karar_id) as Record<string, unknown> | undefined;
      assert.ok(row, "dönen karar DB'de olmalı");
      assert.ok(String(row["dugum_id"]).startsWith("t/ayipli-mal/"));
    }
  } finally {
    db.close();
  }
});

test("bozma kararı temsilci olarak işaretlenmez", () => {
  const hitler = c.ara({ sorgu: "şanzıman üç ayda dört kez arıza", limit: 10 });
  for (const h of hitler) {
    if (h.sonuc === "bozma") assert.equal(h.temsilci_uygun, false);
    if (h.gevsekTuru === "or") assert.equal(h.temsilci_uygun, false);
  }
  const sadeceBozma = c.ara({ sorgu: "şanzıman arıza", sonuc: ["bozma"], limit: 10 });
  assert.ok(sadeceBozma.length > 0, "sonuc=bozma açıkça istenince dönmeli");
  assert.ok(sadeceBozma.every((h) => h.sonuc === "bozma"));
  assert.ok(sadeceBozma.every((h) => h.temsilci_uygun === false));
});

test("düğüm yönlendirme: doğru yaprak, kalibre skor, örnek alanı", () => {
  const adaylar = c.dugumAra("sıfır aldığım arabanın şanzımanı üç ayda dört kez arıza yaptı");
  assert.ok(adaylar.length > 0);
  assert.equal(adaylar[0]!.id, "t/ayipli-mal/arac");
  assert.ok(adaylar[0]!.skor > 0 && adaylar[0]!.skor < 1, "skor doygun olmamalı");
  assert.ok(adaylar[0]!.aciklama.length > 0);
  assert.ok(adaylar[0]!.ornek.length > 0 && adaylar[0]!.ornek.length <= 2);

  const detay = c.dugumAraDetay("sıfır aldığım arabanın şanzımanı üç ayda dört kez arıza yaptı");
  assert.equal(detay.belirsiz, false);
  assert.ok(detay.guven > 0 && detay.guven <= 1);

  const alan = c.dugumAra("internet hızım düşük fatura yüksek", "t/abonelik", 5);
  assert.ok(alan.length > 0);
  assert.ok(alan.every((a) => a.id.startsWith("t/abonelik/")));
});

test("kapsam dışı soru belirsiz döner", () => {
  const detay = c.dugumAraDetay("komşum gece gürültü yapıyor nereye şikayet ederim");
  assert.equal(detay.belirsiz, true);
  assert.ok(detay.neden === "esik_alti" || detay.neden === "dar_fark");
});

test("belirsizMi eşikleri: boş, düşük skor, dar fark", () => {
  const aday = (skor: number): DugumAday => ({
    id: `t/x/${skor}`,
    ad: "x",
    skor,
    aciklama: "",
    ornek: [],
  });
  assert.deepEqual(belirsizMi([]), { belirsiz: true, neden: "bos" });
  assert.deepEqual(belirsizMi([aday(0.1)]), { belirsiz: true, neden: "esik_alti" });
  assert.deepEqual(belirsizMi([aday(0.6), aday(0.595)]), { belirsiz: true, neden: "dar_fark" });
  assert.deepEqual(belirsizMi([aday(0.6), aday(0.2)]), { belirsiz: false, neden: null });
});

test("kimlik çözümleme: karar, madde, düğüm, kart, meta", () => {
  const karar = c.kararGetir("k:fx-ayipli-mal-arac-s1-y");
  assert.ok(karar);
  assert.equal(karar.karar_id, "k:fx-ayipli-mal-arac-s1-y");
  assert.match(karar.tarih, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(c.kararGetir("k:yok"), null);

  const madde = c.maddeGetir("m:6502/11");
  assert.ok(madde);
  assert.equal(madde.id, "m:6502/11");
  assert.equal(c.maddeGetir("6502/11")?.id, "m:6502/11");
  assert.equal(c.maddeGetir("m:6502/999"), null);

  const dugum = c.dugumGetir("t/ayipli-mal/arac");
  assert.ok(dugum);
  assert.equal(dugum.ust_id, "t/ayipli-mal");
  assert.ok(dugum.tetikleyiciler.length > 0);
  assert.equal(c.dugumGetir("t/yok"), null);

  assert.equal(c.cocukDugumler("t/ayipli-mal").length, 8);
  assert.equal(c.cocukDugumler("t/yok").length, 0);

  const kart = c.kartGetir("t/ayipli-mal/arac");
  assert.ok(kart);
  assert.ok(kart.bolumler.length >= 1);
  assert.equal(c.kartGetir("t/yok"), null);

  assert.match(c.meta("surum") ?? "", /^v\d{8}/);
  assert.equal(c.meta("olmayan_anahtar"), null);
});

test("aynı sorgu deterministik", () => {
  const a = c.ara({ sorgu: "kredi kartı aidatı iadesi", limit: 5 });
  const b = c.ara({ sorgu: "kredi kartı aidatı iadesi", limit: 5 });
  assert.deepEqual(
    a.map((h) => [h.karar_id, h.skor]),
    b.map((h) => [h.karar_id, h.skor]),
  );
});

test("araDetay: strateji ve denenen adımlar bildirilir, ara() ile aynı sonuç", () => {
  const sorgu = { sorgu: "şanzıman zzzzolmayankelime", limit: 5 };
  const d = c.araDetay(sorgu);
  assert.deepEqual(
    d.hits.map((h) => h.karar_id),
    c.ara(sorgu).map((h) => h.karar_id),
  );
  assert.ok(d.hits.length > 0);
  assert.match(d.strateji, /^(altkume|or)(\+esanlam)?$|^esanlam$/);
  assert.equal(d.denenen[0], "and");
  assert.ok(d.denenen.includes("altkume"), `altkume denenmeli: ${d.denenen.join(",")}`);
});

test("araDetay: sonuç yoksa strateji 'yok' ve denenen adımlar dolu", () => {
  const d = c.araDetay({ sorgu: "qqqzzzxxx wwwvvvuuu", limit: 5 });
  assert.equal(d.hits.length, 0);
  assert.equal(d.strateji, "yok");
  assert.ok(d.denenen.length >= 1);
  assert.equal(d.denenen[0], "and");
});

test("araDetay: katı AND sonucu 'and' stratejisi sayılır", () => {
  const d = c.araDetay({ sorgu: "şanzıman", limit: 5 });
  assert.ok(d.hits.length > 0);
  assert.match(d.strateji, /^and(\+esanlam)?$/);
});

test("düğüm yönlendirme: eşleşen tetikleyiciler en fazla üç, ontolojiden", () => {
  const [en] = c.dugumAra("Bayiden aldığım aracın şanzımanı arıza yaptı", undefined, 3);
  assert.ok(en);
  assert.ok(en.tetikler && en.tetikler.length >= 1 && en.tetikler.length <= 3, JSON.stringify(en.tetikler));
  const kayit = c.dugumGetir(en.id)!;
  for (const t of en.tetikler!) assert.ok(kayit.tetikleyiciler.includes(t), `${t} ontolojide yok`);
});
