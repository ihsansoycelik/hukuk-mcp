import { test } from "node:test";
import assert from "node:assert/strict";
import { bamKararId, ustBaslikCoz } from "../src/temyiz.ts";

test("BAM ve ilk derece satırları E./K. biçiminde ayrışır", () => {
  const t =
    '11. Hukuk Dairesi 2026/408 E. , 2026/4987 K.\n\n"İçtihat Metni" MAHKEMESİ : İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi\nSAYISI : 2022/1723 Esas, 2025/1864 Karar\nHÜKÜM : Esastan ret\nİLK DERECE MAHKEMESİ : İstanbul 1. Asliye Ticaret Mahkemesi\nSAYISI : 2020/506 E., 2022/460 K.\n\nmetin';
  const r = ustBaslikCoz(t);
  assert.deepEqual(r, [
    { seviye: "bam", daire: "İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi", esas: "2022/1723", karar: "2025/1864" },
    { seviye: "ilkderece", daire: "İstanbul 1. Asliye Ticaret Mahkemesi", esas: "2020/506", karar: "2022/460" },
  ]);
  assert.equal(bamKararId(r[0]!), "k:bam-ist-bam-12hd-2022-1723-2025-1864");
});

test("E., K. biçimi ve ilk derece satırından sonra parantezli ek satır", () => {
  const t =
    '11. Hukuk Dairesi 2024/5521 E. , 2025/3816 K.\n\n"İçtihat Metni" MAHKEMESİ : Gaziantep Bölge Adliye Mahkemesi 11. Hukuk Dairesi\nSAYISI : 2023/181 E., 2024/847 K.\nİLK DERECE MAHKEMESİ : Adıyaman 2. Asliye Hukuk Mahkemesi\n(Ticaret Mahkemesi sıfatıyla)\nSAYISI : 2018/409 E., 2022/562 K.\n';
  const r = ustBaslikCoz(t);
  assert.equal(r.length, 2);
  assert.equal(r[0]!.esas, "2023/181");
  assert.equal(r[1]!.seviye, "ilkderece");
  assert.equal(r[1]!.karar, "2022/562");
  assert.equal(bamKararId(r[0]!), "k:bam-gaz-bam-11hd-2023-181-2024-847");
});

test("iki nokta öncesi boşluk yok ve SAYISI bitişik yazılabilir", () => {
  const r = ustBaslikCoz("MAHKEMESİ :Ankara Bölge Adliye Mahkemesi 3. Hukuk Dairesi\nSAYISI:2023/1339 E., 2025/806 K.");
  assert.equal(r.length, 1);
  assert.equal(r[0]!.esas, "2023/1339");
  assert.equal(r[0]!.karar, "2025/806");
});

test("maskeli numara: künye var, kimlik üretilmez", () => {
  const r = ustBaslikCoz(
    "MAHKEMESİ : İzmir Bölge Adliye Mahkemesi 20. Hukuk Dairesi\nSAYISI : 2021/... E., 2022/55 K.\nİLK DERECE MAHKEMESİ : İzmir 3. Tüketici Mahkemesi\nSAYISI : 2019/7 E., 2020/9 K.",
  );
  assert.equal(r[0]!.esas, null);
  assert.equal(r[0]!.karar, "2022/55");
  assert.equal(bamKararId(r[0]!), null);
  assert.equal(r[1]!.esas, "2019/7");
});

test("yalnızca ilk derece satırı: BAM yok", () => {
  const r = ustBaslikCoz("İLK DERECE MAHKEMESİ : Bursa 2. Tüketici Mahkemesi\nSAYISI : 2020/1 E., 2021/2 K.");
  assert.deepEqual(r.map((x) => x.seviye), ["ilkderece"]);
  assert.equal(bamKararId(r[0]!), null);
});

test("düz MAHKEMESİ satırı (BAM değil) ilk derece sayılır; SAYISI eksikse numara null", () => {
  const r = ustBaslikCoz('"İçtihat Metni" MAHKEMESİ : Ankara 4. Tüketici Mahkemesi\nHÜKÜM : Ret\nmetin');
  assert.deepEqual(r, [{ seviye: "ilkderece", daire: "Ankara 4. Tüketici Mahkemesi", esas: null, karar: null }]);
});

test("başlık yok: boş dizi", () => {
  assert.deepEqual(ustBaslikCoz("Davacı vekili dava dilekçesinde ..."), []);
});
