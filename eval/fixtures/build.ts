/**
 * Builds eval/fixtures/test.db (small, hand-designed) and eval/fixtures/bench.db
 * (50k synthetic rows for the latency micro-benchmark).
 *
 *   node eval/fixtures/build.ts                 # rebuild test.db
 *   node eval/fixtures/build.ts --golden        # rebuild test.db + search goldens
 *   node eval/fixtures/build.ts --bench         # rebuild bench.db
 *
 * The fixture is deliberately synthetic: `meta.fixture = true`. Do not cite it
 * as law. Its job is to exercise every query path deterministically.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tumDugumler } from "../../packages/ontology/src/index.ts";
import { analyze, ftsKey, ngramVector, vectorToJSON } from "../../packages/tr-text/src/index.ts";
import { BRANS_METIN, KONULAR } from "./konular.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const KOK = resolve(HERE, "..", "..");
const SEMA = join(KOK, "data", "build", "schema.sql");

export const TEST_DB = join(HERE, "test.db");
export const BENCH_DB = join(HERE, "bench.db");

interface KararVerisi {
  id: string;
  mahkeme: string;
  daire: string;
  tarih: string;
  kesinlesme: string;
  agirlik: number;
  sonuc: string;
  dugum_id: string;
  l0: string;
  l1: string;
  kok: string;
  kaynak_url: string;
  token_l0: number;
  token_l1: number;
  senaryo: string;
  varyant: "yargitay" | "bam" | "bozma";
}

interface TestVerisi {
  kararlar: KararVerisi[];
  /** key: `${dugum}|${senaryoIndex}` -> [yargitayId, bamId] */
  senaryoIdleri: Map<string, string[]>;
}

const DAİRELER = [
  "3. Hukuk Dairesi",
  "13. Hukuk Dairesi",
  "11. Hukuk Dairesi",
  "4. Hukuk Dairesi",
  "7. Hukuk Dairesi",
  "12. Hukuk Dairesi",
];
const BAM_DAİRELERİ = [
  "İstanbul Bölge Adliye Mahkemesi 11. Hukuk Dairesi",
  "Ankara Bölge Adliye Mahkemesi 15. Hukuk Dairesi",
  "İzmir Bölge Adliye Mahkemesi 13. Hukuk Dairesi",
  "Antalya Bölge Adliye Mahkemesi 11. Hukuk Dairesi",
];
const SONUCLAR = ["kabul", "onama", "kismen", "ret"];

function slug(id: string): string {
  return id.replace(/^t\//, "").replaceAll("/", "-");
}

function tokenSayisi(text: string): number {
  return analyze(text).tokens.length;
}

function tarih(yil: number, ay: number, gun: number): string {
  return `${yil}-${String(ay).padStart(2, "0")}-${String(gun).padStart(2, "0")}`;
}

/** Deterministic in-memory decisions for test.db. */
export function testVerisi(): TestVerisi {
  const kararlar: KararVerisi[] = [];
  const senaryoIdleri = new Map<string, string[]>();
  const branslar = Object.keys(BRANS_METIN);

  KONULAR.forEach((konu, ki) => {
    const dal = branslar.find((b) => konu.dugum.startsWith(b + "/")) ?? "t/ayipli-mal";
    const bransMetni = BRANS_METIN[dal]!;
    const s = slug(konu.dugum);

    konu.senaryolar.forEach((sen, si) => {
      const temel = `${s}-s${si + 1}`;
      const idler: string[] = [];

      // 0: Yargıtay (binding)
      {
        const sonuc = SONUCLAR[(ki + si) % SONUCLAR.length]!;
        const id = `k:fx-${temel}-y`;
        const l1 = `${sen.detay} ${bransMetni} Yargıtay incelemesinde tüketici lehine sonuç doğmuştur.`;
        kararlar.push({
          id,
          mahkeme: "yargitay",
          daire: DAİRELER[(ki + si) % DAİRELER.length]!,
          tarih: tarih(2023, (si % 12) + 1, ((ki * 3 + si * 5) % 27) + 1),
          kesinlesme: "kesinlesti",
          agirlik: 82,
          sonuc,
          dugum_id: konu.dugum,
          l0: sen.detay,
          l1,
          kok: ftsKey(`${sen.detay} ${l1}`),
          kaynak_url: `https://karararama.yargitay.gov.tr/fixture/${id}`,
          token_l0: tokenSayisi(sen.detay),
          token_l1: tokenSayisi(l1),
          senaryo: sen.etiket,
          varyant: "yargitay",
        });
        idler.push(id);
      }

      // 1: BAM (persuasive, not final)
      {
        const sonuc = ["kismen", "ret", "onama"][(ki + si) % 3]!;
        const id = `k:fx-${temel}-b`;
        const l1 = `${sen.detay} ${bransMetni} Bölge adliye mahkemesi istinaf incelemesinde dosyayı değerlendirmiştir.`;
        kararlar.push({
          id,
          mahkeme: "bam",
          daire: BAM_DAİRELERİ[(ki + si) % BAM_DAİRELERİ.length]!,
          tarih: tarih(2021, ((ki + si) % 12) + 1, ((ki * 7 + si * 2) % 27) + 1),
          kesinlesme: "kesinlesmedi",
          agirlik: 58,
          sonuc,
          dugum_id: konu.dugum,
          l0: sen.detay,
          l1,
          kok: ftsKey(`${sen.detay} ${l1}`),
          kaynak_url: `https://emsal.uyap.gov.tr/fixture/${id}`,
          token_l0: tokenSayisi(sen.detay),
          token_l1: tokenSayisi(l1),
          senaryo: sen.etiket,
          varyant: "bam",
        });
        idler.push(id);
      }

      senaryoIdleri.set(`${konu.dugum}|${si}`, idler);

      // 2: a bozma decision every third scenario; MUST never surface as representative
      if (si === 0 && ki % 3 === 0) {
        const id = `k:fx-${temel}-bozma`;
        const l1 = `${sen.detay} ${bransMetni} Yerel mahkeme kararı delil yetersizliği nedeniyle bozulmuştur.`;
        kararlar.push({
          id,
          mahkeme: "yargitay",
          daire: DAİRELER[ki % DAİRELER.length]!,
          tarih: tarih(2024, 6, 11),
          kesinlesme: "kesinlesti",
          agirlik: 90,
          sonuc: "bozma",
          dugum_id: konu.dugum,
          l0: sen.detay,
          l1,
          kok: ftsKey(`${sen.detay} ${l1}`),
          kaynak_url: `https://karararama.yargitay.gov.tr/fixture/${id}`,
          token_l0: tokenSayisi(sen.detay),
          token_l1: tokenSayisi(l1),
          senaryo: sen.etiket,
          varyant: "bozma",
        });
      }
    });
  });

  return { kararlar, senaryoIdleri };
}

function temizDosya(dbPath: string): void {
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(p)) rmSync(p);
  }
}

function semaCalistir(db: DatabaseSync): void {
  const sema = readFileSync(SEMA, "utf8");
  db.exec(sema);
}

function dugumleriEkle(db: DatabaseSync): { dugumSayisi: number; yaprakSayisi: number } {
  const dugumler = tumDugumler();
  const ekle = db.prepare(
    "INSERT INTO dugum (id, ust_id, ad, aciklama, tetikleyiciler, ornek_sorgular, kurallar, maddeler, sira, vektor) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  let sira = 0;
  for (const d of dugumler) {
    ekle.run(
      d.id,
      d.ust_id,
      d.ad,
      d.aciklama,
      JSON.stringify(d.tetikleyiciler),
      JSON.stringify(d.ornek_sorgular),
      JSON.stringify(d.kurallar),
      JSON.stringify(d.maddeler),
      sira++,
      null, // NULL on purpose: the router must compute the vector when absent
    );
  }
  return { dugumSayisi: dugumler.length, yaprakSayisi: dugumler.filter((d) => d.yaprak).length };
}

function maddeleriEkle(db: DatabaseSync): void {
  const dugumler = tumDugumler();
  const maddeIdleri = new Set<string>();
  for (const d of dugumler) for (const m of d.maddeler) maddeIdleri.add(m);

  db.prepare(
    "INSERT INTO mevzuat (id, tur, ad, kabul_tarihi, rg_tarih, rg_sayi, kaynak_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    "6502",
    "kanun",
    "Tüketicinin Korunması Hakkında Kanun",
    "2013-11-07",
    "2013-11-28",
    28835,
    "https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6502&MevzuatTertip=5",
  );
  db.prepare(
    "INSERT INTO mevzuat (id, tur, ad, kabul_tarihi, rg_tarih, rg_sayi, kaynak_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    "6098",
    "kanun",
    "Türk Borçlar Kanunu",
    "2011-01-11",
    "2011-02-04",
    27836,
    "https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6098&MevzuatTertip=5",
  );

  const ekle = db.prepare(
    "INSERT OR REPLACE INTO madde (id, mevzuat_id, madde_no, baslik, metin, degisiklik, kaynak_url, token_l1) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const id of [...maddeIdleri].sort()) {
    const no = id.replace(/^m:6502\//, "");
    const metin =
      `FIXTURE — 6502 sayılı Kanun m.${no} için sentetik özet. ` +
      `Bu metin gerçek kanun metni değildir; yalnızca eval/fixtures/test.db içinde ` +
      `kimlik çözümleme ve atıf bütünlüğü testleri için üretilmiştir.`;
    ekle.run(
      id,
      "6502",
      no,
      `Madde ${no} (fixture)`,
      metin,
      null,
      `https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6502&MevzuatTertip=5#m${no}`,
      tokenSayisi(metin),
    );
  }
}

function kararlariEkle(db: DatabaseSync, veri: TestVerisi): void {
  const ekleKarar = db.prepare(
    "INSERT INTO karar (id, mahkeme, daire, esas, karar_no, tarih, kesinlesme, agirlik, kaynak_url, " +
      "ozet_l0, ozet_l1, token_l0, token_l1, dugum_id, sonuc, tam_metin_key) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const ekleFts = db.prepare("INSERT INTO karar_fts (karar_id, kok) VALUES (?, ?)");
  const ekleAtif = db.prepare("INSERT OR IGNORE INTO atif (kaynak_id, hedef_id, tur) VALUES (?, ?, ?)");

  for (const k of veri.kararlar) {
    const esas = `${k.tarih.slice(0, 4)}/${(k.token_l0 * 37) % 9000 + 100}`;
    const kararNo = `${k.tarih.slice(0, 4)}/${(k.token_l1 * 53) % 9000 + 100}`;
    ekleKarar.run(
      k.id,
      k.mahkeme,
      k.daire,
      esas,
      kararNo,
      k.tarih,
      k.kesinlesme,
      k.agirlik,
      k.kaynak_url,
      k.l0,
      k.l1,
      k.token_l0,
      k.token_l1,
      k.dugum_id,
      k.sonuc,
      null,
    );
    ekleFts.run(k.id, k.kok);
    // cite the branch's first statute article, for citation-integrity coverage
    ekleAtif.run(k.id, "m:6502/11", "karar->madde");
  }
}

function kartlariEkle(db: DatabaseSync): void {
  const dugumler = tumDugumler().filter((d) => d.yaprak);
  const ekle = db.prepare(
    "INSERT INTO kart (dugum_id, surum, durum, icerik, bolum_tokenlari, girdi_hash, token, onaylayan, onay_zamani, guncelleme) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const d of dugumler.slice(0, 8)) {
    const bolumler = [
      {
        etiket: "Özet",
        metin: `${d.ad} hakkında fixture kartı. ${d.aciklama}`.slice(0, 600),
        token: 80,
        oncelik: 1,
      },
      {
        etiket: "Seçimlik haklar",
        metin: "Tüketici 6502 sayılı Kanun kapsamındaki seçimlik haklarını kullanabilir.",
        token: 40,
        oncelik: 2,
      },
    ];
    const kart = {
      dugum_id: d.id,
      surum: 1,
      durum: "taslak",
      bolumler,
      kaynaklar: d.maddeler,
      girdi_hash: `fixture-${d.id}`,
      token: 120,
    };
    ekle.run(
      d.id,
      1,
      "taslak",
      JSON.stringify(kart),
      JSON.stringify({ Özet: 80, "Seçimlik haklar": 40 }),
      kart.girdi_hash,
      120,
      null,
      null,
      "2026-01-01T00:00:00.000Z",
    );
  }

  const ekleArg = db.prepare(
    "INSERT INTO arguman (id, dugum_id, taraf, iddia, kabul, ret, belirleyici) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const [i, d] of dugumler.slice(0, 4).entries()) {
    ekleArg.run(
      `a:fixture-${i}`,
      d.id,
      "tuketici",
      `${d.ad} bakımından ayıbın teslimden sonra ortaya çıktığı iddiası.`,
      3,
      1,
      "ayıbın varlığı",
    );
  }

  const ekleParam = db.prepare(
    "INSERT INTO kural_parametre (kural_id, anahtar, deger, gecerlilik_bas, gecerlilik_bit, kaynak_url, durum) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  ekleParam.run(
    "ayip_zamanasimi",
    "yil",
    "2",
    "2014-05-28",
    null,
    "https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6502&MevzuatTertip=5",
    "teyit_bekliyor",
  );
  ekleParam.run(
    "gorevli_merci",
    "parasal_sinir_tl",
    "104000",
    "2026-01-01",
    "2026-12-31",
    "https://www.mevzuat.gov.tr/",
    "teyit_bekliyor",
  );
}

export function buildTestDb(dbPath = TEST_DB): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  temizDosya(dbPath);
  const db = new DatabaseSync(dbPath);
  try {
    semaCalistir(db);
    db.exec("BEGIN");
    const { dugumSayisi, yaprakSayisi } = dugumleriEkle(db);
    maddeleriEkle(db);
    const veri = testVerisi();
    kararlariEkle(db, veri);
    kartlariEkle(db);
    const meta = db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)");
    meta.run("surum", "v20261022.fixture");
    meta.run("fixture", "true");
    meta.run("kaynak", "eval/fixtures/build.ts (sentetik; gerçek hukuki metin değildir)");
    meta.run("uretim_tarihi", "2026-01-01T00:00:00.000Z");
    meta.run("dugum_sayisi", String(dugumSayisi));
    meta.run("yaprak_sayisi", String(yaprakSayisi));
    meta.run("karar_sayisi", String(veri.kararlar.length));
    db.exec("COMMIT");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
}

/** 50k synthetic decisions for the latency micro-benchmark. */
export function buildBenchDb(dbPath = BENCH_DB, adet = 50_000): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  temizDosya(dbPath);
  const db = new DatabaseSync(dbPath);
  try {
    semaCalistir(db);
    const veri = testVerisi();
    const tabanlar = veri.kararlar.filter((k) => k.sonuc !== "bozma");
    const dugumler = tumDugumler();
    db.exec("BEGIN");
    // Minimal ontology so dugum lookup paths stay available in this DB too.
    const ekleDugum = db.prepare(
      "INSERT INTO dugum (id, ust_id, ad, aciklama, tetikleyiciler, ornek_sorgular, kurallar, maddeler, sira, vektor) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const [i, d] of dugumler.entries()) {
      ekleDugum.run(
        d.id,
        d.ust_id,
        d.ad,
        d.aciklama,
        JSON.stringify(d.tetikleyiciler),
        JSON.stringify(d.ornek_sorgular),
        JSON.stringify(d.kurallar),
        JSON.stringify(d.maddeler),
        i,
        null,
      );
    }
    const ekleKarar = db.prepare(
      "INSERT INTO karar (id, mahkeme, daire, esas, karar_no, tarih, kesinlesme, agirlik, kaynak_url, " +
        "ozet_l0, ozet_l1, token_l0, token_l1, dugum_id, sonuc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const ekleFts = db.prepare("INSERT INTO karar_fts (karar_id, kok) VALUES (?, ?)");
    for (let n = 0; n < adet; n++) {
      const b = tabanlar[n % tabanlar.length]!;
      const id = `k:bench-${String(n).padStart(6, "0")}`;
      const yil = 2005 + (n % 21);
      const t = `${yil}-${String((n % 12) + 1).padStart(2, "0")}-${String((n % 27) + 1).padStart(2, "0")}`;
      const mahkeme = (["yargitay", "bam", "ilkderece"] as const)[n % 3]!;
      const agirlik = mahkeme === "yargitay" ? 80 : mahkeme === "bam" ? 58 : 42;
      const sonuc = (["kabul", "onama", "kismen", "ret"] as const)[n % 4]!;
      const l1 = `${b.l1} Varyant ${n}.`;
      ekleKarar.run(
        id,
        mahkeme,
        b.daire,
        `${yil}/${n + 1}`,
        `${yil}/${n + 2}`,
        t,
        n % 5 === 0 ? "kesinlesmedi" : "kesinlesti",
        agirlik,
        `https://ornek.test/bench/${id}`,
        b.l0,
        l1,
        b.token_l0,
        b.token_l1,
        b.dugum_id,
        sonuc,
      );
      // The base kok already contains every scenario term; the numeric variant
      // keeps document lengths realistic without 50k extra analyse() calls.
      ekleFts.run(id, `${b.kok} varyant ${n}`);
    }
    const meta = db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)");
    meta.run("surum", "bench-1");
    meta.run("fixture", "true");
    meta.run("bench_size", String(adet));
    meta.run("kaynak", "eval/fixtures/build.ts --bench (sentetik)");
    db.exec("COMMIT");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
}

/** Regenerates eval/golden/search.jsonl from the fixture scenarios. */
export function yazSearchGolden(hedef = join(KOK, "eval", "golden", "search.jsonl")): number {
  const { kararlar } = testVerisi();
  const byId = new Map(kararlar.map((k) => [k.id, k]));
  const satirlar: string[] = [];
  let n = 0;
  const ekle = (sorgu: string, ilgili: string[], senaryo: string, filtre?: Record<string, unknown>) => {
    n++;
    const line: Record<string, unknown> = {
      id: `s${String(n).padStart(3, "0")}`,
      sorgu,
      ilgili,
      filtre,
      yontem:
        `mekanik (pooled): fixture senaryosu '${senaryo}'. İlgili = senaryonun iki kararı; ` +
        `sorgu terimleri yalnızca bu kararların özetinde geçer. Aynı konudaki diğer kararlar yargılanmadı (non-relevant sayılır).`,
      senaryo,
    };
    if (!filtre) delete line["filtre"];
    satirlar.push(JSON.stringify(line));
  };

  KONULAR.forEach((konu, ki) => {
    konu.senaryolar.forEach((sen, si) => {
      const idler = kararlar
        .filter((k) => k.dugum_id === konu.dugum && k.senaryo === sen.etiket && k.sonuc !== "bozma")
        .map((k) => k.id);
      const yargitay = idler.find((id) => byId.get(id)!.mahkeme === "yargitay");
      const bam = idler.find((id) => byId.get(id)!.mahkeme === "bam");
      if (!yargitay || !bam) throw new Error(`Fixture senaryosu eksik karar: ${konu.dugum} / ${sen.etiket}`);
      ekle(sen.sorgu, [yargitay, bam], `${konu.dugum} :: ${sen.etiket}`);

      // A slice of scenarios also exercises every hard filter end-to-end.
      if ((ki + si) % 9 === 0) {
        ekle(sen.sorgu, [yargitay], `${konu.dugum} :: ${sen.etiket}`, { mahkeme: ["yargitay"] });
        ekle(sen.sorgu, [bam], `${konu.dugum} :: ${sen.etiket}`, { yil: [2021, 2021] });
        ekle(sen.sorgu, [yargitay], `${konu.dugum} :: ${sen.etiket}`, { yil: [2023, 2023] });
        const dal = konu.dugum.split("/").slice(0, 2).join("/");
        ekle(sen.sorgu, [yargitay, bam], `${konu.dugum} :: ${sen.etiket}`, { alan: dal });
      }
    });
  });

  mkdirSync(dirname(hedef), { recursive: true });
  writeFileSync(hedef, satirlar.join("\n") + "\n", "utf8");
  return n;
}

export function ensureTestDb(dbPath = TEST_DB): string {
  if (!existsSync(dbPath)) buildTestDb(dbPath);
  return dbPath;
}

/* --------------------------------- CLI ---------------------------------- */

if (import.meta.url === `file://${process.argv[1]}`) {
  const arglar = process.argv.slice(2);
  const dbArg = arglar.indexOf("--db");
  const dbYolu = dbArg >= 0 ? resolve(arglar[dbArg + 1] ?? TEST_DB) : TEST_DB;
  if (arglar.includes("--bench")) {
    buildBenchDb(dbYolu === TEST_DB ? BENCH_DB : dbYolu);
    console.log(`bench.db yazıldı: ${dbYolu === TEST_DB ? BENCH_DB : dbYolu} (50.000 karar)`);
  } else {
    buildTestDb(dbYolu);
    if (arglar.includes("--golden")) {
      const adet = yazSearchGolden();
      console.log(`search.jsonl yazıldı: ${adet} sorgu`);
    }
    console.log(`test.db yazıldı: ${dbYolu}`);
  }
}
