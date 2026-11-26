import { test } from "node:test";
import assert from "node:assert/strict";
import { atiflariCikar, atifOzeti, atifRaporu, kararAdaylari, MULGA_KANUNLAR } from "../src/atif.ts";
import type { CorpusPort, MaddeKaydi } from "../src/ports.ts";

const madde = (id: string, metin: string, baslik = "b"): MaddeKaydi => ({
  id,
  mevzuat_id: id.slice(2).split("/")[0]!,
  madde_no: id.split("/")[1]!,
  baslik,
  metin,
  kaynak_url: "https://www.mevzuat.gov.tr/x",
  degisiklik: null,
});

const MADDELER = new Map<string, MaddeKaydi>([
  ["m:6502/11", madde("m:6502/11", "(1) Malın ayıplı olduğu… (2) Seçimlik haklardan… (3) …")],
  ["m:6502/12", madde("m:6502/12", "(1) Ayıplı maldan sorumluluk…")],
  ["m:6502/73", madde("m:6502/73", "(1) Tüketici mahkemeleri…")],
  ["m:6100/107", madde("m:6100/107", "(Mülga:16/7/2026-7589/19 md.)")],
]);

const corpus = {
  maddeGetir: (id: string) => MADDELER.get(id) ?? null,
  maddeNumaralari: (k: string) => [...MADDELER.keys()].filter((x) => x.startsWith(`m:${k}/`)).map((x) => x.split("/")[1]!).concat(k === "6502" ? ["88"] : []),
  kararGetir: (id: string) =>
    id === "k:ygt-3hd-2021-1234-2022-567"
      ? { karar_id: id, daire: "3. Hukuk Dairesi", tarih: "2022-03-01", sonuc: "bozma", kaynak_url: "u" }
      : null,
} as unknown as CorpusPort;

const bul = (metin: string) => atiflariCikar(metin, corpus).map((a) => `${a.durum} ${a.kimlik}`);

test("takma ad, sayılı kanun ve 'aynı Kanun' çözülür", () => {
  assert.deepEqual(bul("TKHK m.11 ile 6502 sayılı Kanunun 12. maddesi; aynı Kanunun 99. maddesi"), [
    "DOGRU m:6502/11",
    "DOGRU m:6502/12",
    "YOK m:6502/99",
  ]);
});

test("yalın 'm. 73' son anılan kanuna bağlanır", () => {
  assert.deepEqual(bul("TKHK m.11 uygulanır; m. 73 ise mahkemeyi düzenler."), ["DOGRU m:6502/11", "DOGRU m:6502/73"]);
});

test("mülga madde ve olmayan fıkra işaretlenir", () => {
  assert.deepEqual(bul("HMK m.107 ve TKHK m.11/7"), ["MULGA m:6100/107", "YOK m:6502/11/7"]);
});

test("korpusta olmayan kanun kapsam dışıdır, uydurulmaz", () => {
  assert.deepEqual(bul("4857 sayılı İş Kanunu m.17"), ["KAPSAM m:4857/17"]);
});

test("karar künyeleri: Yargıtay, HGK, BAM", () => {
  assert.deepEqual(kararAdaylari("Yargıtay 3. Hukuk Dairesi 2021/1234 E., 2022/567 K."), ["k:ygt-3hd-2021-1234-2022-567"]);
  assert.deepEqual(kararAdaylari("Hukuk Genel Kurulu 2019/10 E. 2020/20 K."), ["k:ygt-hgk-2019-10-2020-20"]);
  assert.deepEqual(kararAdaylari("İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi 2023/5 E. 2024/6 K."), ["k:bam-ist-bam-12hd-2023-5-2024-6"]);
  assert.deepEqual(bul("Yargıtay 3. Hukuk Dairesi 2021/1234 E., 2022/567 K. ve 3. Hukuk Dairesi 2019/1 E. 2020/2 K."), [
    "DOGRU k:ygt-3hd-2021-1234-2022-567",
    "KAPSAM k:ygt-3hd-2019-1-2020-2",
  ]);
});

test("rapor özet satırı ve uyarı taşır", () => {
  const r = atifRaporu(atiflariCikar("TKHK m.11 ve m. 99", corpus));
  assert.match(r, /^ATIF DENETİMİ 2 atıf: 1 doğru, 0 mülga, 1 yok/);
  assert.match(r, /son madde 88/);
  assert.match(r, /Varlık denetimidir/);
  assert.match(atifRaporu([]), /^ATIF YOK/);
});

test("mülga kanun: 818 sayılı Borçlar Kanunu, eski BK ve sayı+kısaltma", () => {
  assert.deepEqual(bul("818 sayılı Borçlar Kanunu m.125"), ["MULGA_KANUN null"]);
  assert.deepEqual(bul("eski Borçlar Kanunu 125. maddesi"), ["MULGA_KANUN null"]);
  assert.deepEqual(bul("818 sayılı BK m.125"), ["MULGA_KANUN null"]);
  const [a] = atiflariCikar("818 sayılı Borçlar Kanunu m.125", corpus);
  assert.equal(a!.tur, "kanun");
  assert.equal(
    a!.aciklama,
    "818 sayılı Borçlar Kanunu mülga; yerini 6098 sayılı Türk Borçlar Kanunu aldı. Madde karşılığını kendiniz eşleştirin.",
  );
});

test("mülga kanun: tüm tablo satırları yeni kanuna işaret eder", () => {
  const beklenen: Record<string, string> = {
    "818": "6098", "4077": "6502", "1086": "6100", "743": "4721", "506": "5510",
    "1479": "5510", "5434": "5510", "6762": "6102", "765": "5237",
  };
  assert.deepEqual(Object.fromEntries(Object.entries(MULGA_KANUNLAR).map(([k, v]) => [k, v.yeni])), beklenen);
  for (const no of Object.keys(beklenen)) {
    const [a] = atiflariCikar(`${no} sayılı Kanunun 5. maddesi`, corpus);
    assert.equal(a?.durum, "MULGA_KANUN", no);
    assert.match(a!.aciklama, new RegExp(`yerini ${beklenen[no]} sayılı`));
  }
});

test("mülga kanun: HUKMK/HUMK 1086'dır; TTK ve TKHK yalın hâlde güncel kalır", () => {
  assert.deepEqual(bul("HUMK m.107"), ["MULGA_KANUN null"]);
  assert.deepEqual(bul("HUKMK m. 107"), ["MULGA_KANUN null"]);
  assert.deepEqual(bul("6762 sayılı TTK m.5"), ["MULGA_KANUN null"]);
  assert.deepEqual(bul("TKHK m.11"), ["DOGRU m:6502/11"]);
  assert.deepEqual(bul("4077 sayılı TKHK m.4"), ["MULGA_KANUN null"]);
  const ttk = atiflariCikar("TTK m.5", corpus);
  assert.equal(ttk[0]?.kimlik, "m:6102/5");
  assert.notEqual(ttk[0]?.durum, "MULGA_KANUN");
  // yalın "BK" eski kanun sayılmaz: önüne 818 veya "eski" gelmeden mülga işaretlenmez
  assert.ok(atiflariCikar("TBK m.125 ve BK m.125", corpus).every((a) => a.durum !== "MULGA_KANUN"));
});

test("mülga kanun: 'aynı Kanun' ve yalın madde mülga kanuna bağlanır, sıra korunur", () => {
  assert.deepEqual(bul("818 sayılı Borçlar Kanunu m.125; aynı Kanunun 126. maddesi; TKHK m.11"), [
    "MULGA_KANUN null",
    "MULGA_KANUN null",
    "DOGRU m:6502/11",
  ]);
});

test("rapor: ⚠ MÜLGA KANUN satırı ve özette 'N mülga kanun'", () => {
  const r = atifRaporu(atiflariCikar("818 sayılı Borçlar Kanunu m.125 ve TKHK m.11", corpus));
  assert.match(r, /^ATIF DENETİMİ 2 atıf: 1 doğru, 0 mülga, 0 yok, 0 kapsam dışı, 1 mülga kanun/);
  assert.match(r, /⚠ MÜLGA KANUN - \| "818 sayılı Borçlar Kanunu m\.125" \| 818 sayılı Borçlar Kanunu mülga/);
  assert.deepEqual(atifOzeti(atiflariCikar("TKHK m.11", corpus)), { dogru: 1, mulga: 0, yok: 0, kapsam: 0, mulga_kanun: 0 });
});
