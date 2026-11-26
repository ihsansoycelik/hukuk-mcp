import { test } from "node:test";
import assert from "node:assert/strict";
import { atiflariCikar, atifRaporu, kararAdaylari } from "../src/atif.ts";
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
