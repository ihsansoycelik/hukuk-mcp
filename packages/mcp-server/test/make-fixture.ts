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

db.close();
console.log(`fixture written: ${out}`);
