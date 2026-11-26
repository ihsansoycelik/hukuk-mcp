import { test, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { corpusPort } from "../src/adapters.ts";
import { atiflariCikar, atifRaporu } from "../src/atif.ts";
import { kararBaglantiSatirlari, ustEki, kararSatiri } from "../src/render.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const BAM = "k:bam-ist-bam-12hd-2021-77-2022-88";
const UST = "k:ygt-3hd-2024-100-2024-200";
let db = "";
let bos = "";

before(() => {
  const dir = mkdtempSync(join(tmpdir(), "hukuk-graf-"));
  db = join(dir, "f.db");
  const r = spawnSync(process.execPath, ["--no-warnings", join(HERE, "make-fixture.ts"), db], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  // same DB without the graph tables: older databases must keep working
  bos = join(dir, "bos.db");
  copyFileSync(db, bos);
  const d = new DatabaseSync(bos);
  d.exec("DROP TABLE karar_atif; DROP TABLE ust_inceleme;");
  d.close();
});

test("kararAtiflari ve maddeyeDayananKararlar: yeniden eskiye, sayı doğru", () => {
  const p = corpusPort(db);
  try {
    assert.deepEqual(p.kararAtiflari!(BAM), ["m:6502/11", "m:6502/12"]);
    assert.equal(p.maddeyeDayananSayisi!("m:6502/11"), 3);
    const idler = p.maddeyeDayananKararlar!("m:6502/11", 2);
    assert.deepEqual(idler, [UST, BAM]); // 2024, 2022 (2013 cut by limit)
    assert.deepEqual(p.maddeyeDayananKararlar!("m:6502/99", 3), []);
  } finally {
    p.close();
  }
});

test("ustInceleme / altInceleme", () => {
  const p = corpusPort(db);
  try {
    assert.deepEqual(p.ustInceleme!(BAM), { ust_karar_id: UST, ust_sonuc: "bozma" });
    assert.equal(p.ustInceleme!("k:ygt-13hd-2013-7601-2013-16449"), null);
    const alt = p.altInceleme!(UST);
    assert.equal(alt.length, 2);
    assert.equal(alt[0]!.seviye, "bam");
    assert.equal(alt[0]!.alt_karar_id, BAM);
    assert.equal(alt[1]!.alt_karar_id, null);
  } finally {
    p.close();
  }
});

test("graf tabloları yoksa boş/null döner", () => {
  const p = corpusPort(bos);
  try {
    assert.deepEqual(p.kararAtiflari!(BAM), []);
    assert.deepEqual(p.maddeyeDayananKararlar!("m:6502/11", 3), []);
    assert.equal(p.maddeyeDayananSayisi!("m:6502/11"), 0);
    assert.equal(p.ustInceleme!(BAM), null);
    assert.deepEqual(p.altInceleme!(UST), []);
    assert.deepEqual(kararBaglantiSatirlari(p, { karar_id: BAM, mahkeme: "bam" }), []);
  } finally {
    p.close();
  }
});

test("karar bağlantı satırları", () => {
  const p = corpusPort(db);
  try {
    const bam = kararBaglantiSatirlari(p, { karar_id: BAM, mahkeme: "bam" });
    assert.equal(bam[0], "DAYANDIĞI MADDELER m:6502/11 , m:6502/12");
    assert.match(bam[1]!, /^ÜST İNCELEME Yargıtay k:ygt-3hd-2024-100-2024-200: bozma \(bağlantılı karar; sonuç metinden sezgisel\)$/);
    const ygt = kararBaglantiSatirlari(p, { karar_id: UST, mahkeme: "yargitay" });
    assert.ok(ygt.some((l) => l === `İNCELEDİĞİ İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi 2021/77 E. 2022/88 K. (${BAM})`));
    assert.ok(ygt.some((l) => l === "İNCELEDİĞİ İstanbul 1. Asliye Ticaret Mahkemesi 2019/10 E. 2020/20 K."));
    const k = p.kararGetir(BAM)!;
    assert.match(kararSatiri(k, false, ustEki(p, k)), / · üst: bozma$/);
  } finally {
    p.close();
  }
});

test("dogrula: bozulmuş görünen BAM kararı DOĞRU kalır, uyarı eklenir", () => {
  const p = corpusPort(db);
  try {
    const a = atiflariCikar("İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi 2021/77 E. 2022/88 K. sayılı karar", p);
    assert.equal(a.length, 1);
    assert.equal(a[0]!.durum, "DOGRU");
    assert.equal(a[0]!.kimlik, BAM);
    assert.match(a[0]!.uyari ?? "", /^⚠ Yargıtay'da bozulmuş görünüyor \(bağlantılı karar k:ygt-3hd-2024-100-2024-200, sezgisel\)$/);
    assert.ok(a[0]!.aciklama.includes("⚠ Yargıtay'da bozulmuş görünüyor"));
    assert.match(atifRaporu(a), /✓ DOĞRU .*⚠ Yargıtay'da bozulmuş/);
  } finally {
    p.close();
  }
});
