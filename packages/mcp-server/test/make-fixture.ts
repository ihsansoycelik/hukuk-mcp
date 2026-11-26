/**
 * Builds a small, valid corpus so the MCP server can be exercised end-to-end
 * before/without the full Python build. Mirrors data/build/schema.sql exactly.
 *
 * Usage: node packages/mcp-server/test/make-fixture.ts <out.db>
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { encode } from "gpt-tokenizer";
import { tumDugumler, yaziliKartlar, dugumVektorMetni } from "@hukuk/ontology";
import { analyze, vectorToJSON, ngramVector } from "@hukuk/tr-text";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const out = process.argv[2] ?? join(ROOT, "data", "build", "fixture.db");

const db = new DatabaseSync(out);
db.exec(readFileSync(join(ROOT, "data", "build", "schema.sql"), "utf8"));

const tok = (s: string) => encode(s).length;

function j(v: unknown): string {
  return JSON.stringify(v);
}

db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)").run("surum", "v-fixture.1");

// ontology
const insDugum = db.prepare(
  "INSERT OR REPLACE INTO dugum (id, ust_id, ad, aciklama, tetikleyiciler, ornek_sorgular, kurallar, maddeler, sira, vektor) VALUES (?,?,?,?,?,?,?,?,?,?)",
);
tumDugumler().forEach((d, i) => {
  insDugum.run(
    d.id,
    d.ust_id,
    d.ad,
    d.aciklama,
    j(d.tetikleyiciler),
    j(d.ornek_sorgular),
    j(d.kurallar),
    j(d.maddeler),
    i,
    vectorToJSON(ngramVector(dugumVektorMetni(d))),
  );
});

// authored cards
const insKart = db.prepare(
  "INSERT OR REPLACE INTO kart (dugum_id, surum, durum, icerik, bolum_tokenlari, girdi_hash, token, onaylayan, onay_zamani, guncelleme) VALUES (?,?,?,?,?,?,?,?,?,?)",
);
for (const k of yaziliKartlar()) {
  const bolumler = k.bolumler.map((b) => ({ ...b, token: tok(b.metin) }));
  const icerik = {
    dugum_id: k.dugum_id,
    surum: k.surum,
    durum: k.durum,
    bolumler,
    kaynaklar: [...new Set(k.bolumler.flatMap((b) => [...b.metin.matchAll(/\[([mk]:[^\]]+)\]/g)].map((m) => m[1]!)))],
    girdi_hash: "h",
    token: bolumler.reduce((a, b) => a + b.token, 0),
  };
  insKart.run(
    k.dugum_id,
    k.surum,
    k.durum,
    j(icerik),
    j(Object.fromEntries(bolumler.map((b) => [b.etiket, b.token]))),
    "h",
    icerik.token,
    null,
    null,
    new Date().toISOString(),
  );
}

// a few decisions with FTS
const ornekler = [
  {
    id: "k:ygt-13hd-2013-7601-2013-16449",
    daire: "13. Hukuk Dairesi",
    tarih: "2013-06-17",
    ozet: "Araçta gizli ayıp nedeniyle bedel iadesine karar verilmesi gerekirken reddi bozulmuştur.",
    kokMetin: "araç gizli ayıp bedel iade sözleşmeden dönme tüketici mahkemesi",
  },
  {
    id: "k:ygt-3hd-2019-1234-2020-5678",
    daire: "3. Hukuk Dairesi",
    tarih: "2020-03-11",
    ozet: "Tüketici hakem heyeti kararına itirazda görevli mahkemenin tüketici mahkemesi olduğu belirtilmiştir.",
    kokMetin: "tüketici hakem heyeti itiraz görevli mahkeme",
  },
  {
    id: "k:emsal-ist-bam-12hd-2020-952-2023-234",
    daire: "İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi",
    tarih: "2023-02-16",
    ozet: "Mesafeli sözleşmede cayma hakkının süresinde kullanıldığı, bedel iadesi gerektiği kabul edilmiştir.",
    kokMetin: "mesafeli sözleşme cayma hakkı bedel iadesi",
  },
];
const insKarar = db.prepare(
  "INSERT OR REPLACE INTO karar (id, mahkeme, daire, esas, karar_no, tarih, kesinlesme, agirlik, kaynak_url, ozet_l0, ozet_l1, token_l0, token_l1, dugum_id, sonuc, tam_metin_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
);
const insFts = db.prepare("INSERT INTO karar_fts (karar_id, kok) VALUES (?, ?)");
for (const o of ornekler) {
  const mahkeme = o.id.includes("emsal") ? "bam" : "yargitay";
  const dugum = o.kokMetin.includes("cayma") ? "t/mesafeli-sozlesme/cayma-hakki" : "t/ayipli-mal/arac";
  insKarar.run(
    o.id,
    mahkeme,
    o.daire,
    "",
    "",
    o.tarih,
    "kesin",
    mahkeme === "bam" ? 50 : 70,
    `https://example.invalid/${o.id}`,
    o.ozet,
    o.ozet,
    tok(o.ozet),
    tok(o.ozet),
    dugum,
    "kabul",
    o.id,
  );
  insFts.run(o.id, analyze(o.kokMetin).kok);
}

// one rule parameter row so harga/params paths are exercised
db.prepare(
  "INSERT OR REPLACE INTO kural_parametre (kural_id, anahtar, deger, gecerlilik_bas, gecerlilik_bit, kaynak_url, durum) VALUES (?,?,?,?,?,?,?)",
).run("ayip_zamanasimi", "genel_sure_yil", "2", "2014-05-28", null, "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6502.htm", "uzman_onayli");

// legislation: two articles of 6502 with amendment notes (time-aware tests)
db.prepare("INSERT OR REPLACE INTO mevzuat (id, tur, ad, kabul_tarihi, rg_tarih, rg_sayi, kaynak_url) VALUES (?,?,?,?,?,?,?)").run(
  "6502", "kanun", "Tüketicinin Korunması Hakkında Kanun", "2013-11-07", "2013-11-28", 28835, "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6502.htm",
);
const insMadde = db.prepare(
  "INSERT OR REPLACE INTO madde (id, mevzuat_id, madde_no, baslik, metin, degisiklik, kaynak_url, token_l1) VALUES (?,?,?,?,?,?,?,?)",
);
const m11 = "(1) Malın ayıplı olduğu hâllerde tüketici seçimlik haklarını kullanabilir. (2) (Mülga:1/1/2020-7000/1 md.) (3) (Değişik:24/3/2022-7392/6 md.) Üçüncü fıkra metni.";
insMadde.run("m:6502/11", "6502", "11", "Ayıplı mal", m11, "(Değişik:24/3/2022-7392/6 md.)", "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6502.htm", tok(m11));
const m12 = "(1) Satıcı ayıplı maldan sorumludur.";
insMadde.run("m:6502/12", "6502", "12", "Satıcının sorumluluğu", m12, null, "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6502.htm", tok(m12));
const insDeg = db.prepare(
  "INSERT INTO madde_degisiklik (madde_id, fikra, tur, tarih, kanun_no, kanun_madde, ham) VALUES (?,?,?,?,?,?,?)",
);
insDeg.run("m:6502/11", 3, "degisik", "2022-03-24", "7392", "6", "Değişik:24/3/2022-7392/6 md.");
insDeg.run("m:6502/11", 2, "mulga", "2020-01-01", "7000", "1", "Mülga:1/1/2020-7000/1 md.");
insDeg.run("m:6502/11", null, "ek", "2016-06-01", "6000", "5", "Ek: 1/6/2016-6000/5 md.");

// citation graph + appeal chain (Faz 3b): tiny tables mirroring scripts/build-graph.ts
db.exec(`
  DROP TABLE IF EXISTS karar_atif; DROP TABLE IF EXISTS ust_inceleme;
  CREATE TABLE karar_atif (karar_id TEXT NOT NULL, madde_id TEXT NOT NULL, adet INTEGER NOT NULL, mulga INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (karar_id, madde_id));
  CREATE INDEX karar_atif_madde ON karar_atif(madde_id);
  CREATE TABLE ust_inceleme (ust_karar_id TEXT NOT NULL, seviye TEXT NOT NULL, alt_daire TEXT, alt_esas TEXT, alt_karar TEXT, alt_karar_id TEXT, ust_sonuc TEXT, kaynak TEXT);
  CREATE INDEX ust_inceleme_ust ON ust_inceleme(ust_karar_id);
  CREATE INDEX ust_inceleme_alt ON ust_inceleme(alt_karar_id);
`);
const BAM = "k:bam-ist-bam-12hd-2021-77-2022-88";
insKarar.run(BAM, "bam", "İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi", "", "", "2022-04-05", "bilinmiyor", 50, `https://example.invalid/${BAM}`,
  "Ayıplı mal nedeniyle bedel iadesi kabul edilmiştir.", "Ayıplı mal nedeniyle bedel iadesi kabul edilmiştir.", 9, 9, null, "kabul", BAM);
const UST = "k:ygt-3hd-2024-100-2024-200";
insKarar.run(UST, "yargitay", "3. Hukuk Dairesi", "", "", "2024-05-02", "kesin", 70, `https://example.invalid/${UST}`,
  "Bölge adliye kararı bozulmuştur.", "Bölge adliye kararı bozulmuştur.", 8, 8, null, "bozma", UST);
const insAtif = db.prepare("INSERT INTO karar_atif (karar_id, madde_id, adet, mulga) VALUES (?,?,?,?)");
insAtif.run(BAM, "m:6502/11", 2, 0);
insAtif.run(BAM, "m:6502/12", 1, 0);
insAtif.run("k:ygt-13hd-2013-7601-2013-16449", "m:6502/11", 1, 0);
insAtif.run(UST, "m:6502/11", 3, 0);
const insUst = db.prepare(
  "INSERT INTO ust_inceleme (ust_karar_id, seviye, alt_daire, alt_esas, alt_karar, alt_karar_id, ust_sonuc, kaynak) VALUES (?,?,?,?,?,?,?,?)",
);
insUst.run(UST, "bam", "İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi", "2021/77", "2022/88", BAM, "bozma", "metin-baslik");
insUst.run(UST, "ilkderece", "İstanbul 1. Asliye Ticaret Mahkemesi", "2019/10", "2020/20", null, "bozma", "metin-baslik");

db.close();
console.log(`fixture written: ${out}`);
