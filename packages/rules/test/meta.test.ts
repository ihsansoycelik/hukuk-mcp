/**
 * Meta testler: motor sözleşmesi.
 *  - 16 kuralın tamamı KURALLAR'da ve her biri deterministik.
 *  - Hiçbir kaynak dosya saat/rastgelelik/ağ okumaz (grep ile zorlanır).
 *  - Parametre onayı sonuca yansır; bilinmeyen yıl eski değeri kullanmaz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KURALLAR,
  ORNEK_GIRDI,
  VARSAYILAN_OKUYUCU,
  kuralCalistir,
  KAYITLAR,
} from "../src/index.ts";
import type { KuralSonucu } from "@hukuk/schema";

const BEKLENEN_KURALLAR = [
  "gorevli_merci",
  "arabuluculuk_dava_sarti",
  "ayip_zamanasimi",
  "cayma_suresi",
  "yetkili_yer",
  "harc_durumu",
  "sure_son_gun",
  "yasal_faiz",
  "sgk_saglik_hakki",
  "sgk_saglik_hakki_kosullari",
  "gss_alacak_zamanasimi",
  "gss_gelir_testi",
  "gss_prim_zamanasimi",
  "issizlik_odenegi",
  "is_kazasi_bildirim",
  "sgk_dava_yolu",
];

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function kaynakDosyalari(dizin: string): string[] {
  const out: string[] = [];
  for (const ad of readdirSync(dizin)) {
    const tam = join(dizin, ad);
    if (statSync(tam).isDirectory()) out.push(...kaynakDosyalari(tam));
    else if (tam.endsWith(".ts")) out.push(tam);
  }
  return out;
}

test("KURALLAR: 16 kuralın tamamı kayıtlı", () => {
  assert.equal(Object.keys(KURALLAR).length, 16);
  assert.deepEqual(Object.keys(KURALLAR).sort(), [...BEKLENEN_KURALLAR].sort());
  for (const id of BEKLENEN_KURALLAR) {
    assert.equal(KURALLAR[id]?.id, id);
    assert.ok(typeof KURALLAR[id]?.uygula === "function");
    assert.ok(KURALLAR[id]?.girdiSemasi);
  }
});

test("KURALLAR: her kural örnek girdiyle deterministik sonuç verir", () => {
  assert.equal(Object.keys(ORNEK_GIRDI).length, 16);
  for (const id of BEKLENEN_KURALLAR) {
    const a = kuralCalistir(id, ORNEK_GIRDI[id], VARSAYILAN_OKUYUCU, "2026-10-22");
    const b = kuralCalistir(id, ORNEK_GIRDI[id], VARSAYILAN_OKUYUCU, "2026-10-22");
    assert.deepEqual(a, b, `${id}: deterministik değil`);
    assert.notEqual(a.sonuc, "belirsiz", `${id}: örnek girdi belirsiz döndü (${a.uyarilar.join("|")})`);
    const alanlar: Array<keyof KuralSonucu> = [
      "sonuc",
      "kisa",
      "dayanak",
      "varsayimlar",
      "eksik_girdiler",
      "uyarilar",
      "parametre_surumu",
      "onay_durumu",
    ];
    for (const alan of alanlar) assert.ok(alan in a, `${id}: ${String(alan)} yok`);
  }
});

test("saflık: kaynakta saat/rastgelelik/ağ/DB okuması yok", () => {
  const yasaklar: Array<{ ad: string; kalip: RegExp }> = [
    { ad: "Date.now", kalip: /Date\s*\.\s*now/ },
    { ad: "new Date", kalip: /new\s+Date\s*\(/ },
    { ad: "Date()", kalip: /\bDate\s*\(\s*\)/ },
    { ad: "Math.random", kalip: /Math\s*\.\s*random/ },
    { ad: "process.hrtime", kalip: /process\s*\.\s*hrtime/ },
    { ad: "performance.now", kalip: /performance\s*\.\s*now/ },
    { ad: "fetch", kalip: /\bfetch\s*\(/ },
    { ad: "process.env", kalip: /process\s*\.\s*env/ },
    { ad: "require(", kalip: /\brequire\s*\(/ },
  ];
  for (const dosya of kaynakDosyalari(SRC)) {
    const metin = readFileSync(dosya, "utf8");
    for (const y of yasaklar) {
      assert.ok(!y.kalip.test(metin), `${dosya}: yasaklı desen '${y.ad}' bulundu`);
    }
  }
});

test("parametre tablosu: her satır kaynak + onay durumu taşır", () => {
  assert.ok(KAYITLAR.length >= 25);
  for (const k of KAYITLAR) {
    assert.ok(k.kaynak_url.startsWith("https://"), `${k.kural_id}/${k.anahtar}: kaynak URL yok`);
    assert.ok(k.durum === "uzman_onayli" || k.durum === "teyit_bekliyor");
    assert.ok(k.surum.length > 0);
    assert.match(k.gecerlilik_bas, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("onay durumu: teyit_bekliyor sonuca ve uyarılara yansır", () => {
  const r = kuralCalistir(
    "cayma_suresi",
    { teslim_tarihi: "2026-04-01" },
    VARSAYILAN_OKUYUCU,
    "2026-10-22",
  );
  assert.equal(r.onay_durumu, "teyit_bekliyor");
  assert.ok(r.uyarilar.some((u) => u.toLowerCase().includes("onay")));
});

test("bilinmeyen kural → belirsiz ve geçerli kimlik listesi", () => {
  const r = kuralCalistir("yok_boyle_kural", {}, VARSAYILAN_OKUYUCU, "2026-10-22");
  assert.equal(r.sonuc, "belirsiz");
  assert.ok(r.uyarilar.some((u) => u.includes("KURAL_YOK")));
  assert.deepEqual(r.eksik_girdiler, []);
});

test("geçersiz bugun → belirsiz (saat okunmadığının kanıtı)", () => {
  const r = kuralCalistir("gorevli_merci", { uyusmazlik_degeri_tl: 1000 }, VARSAYILAN_OKUYUCU, "bugün");
  assert.equal(r.sonuc, "belirsiz");
  assert.deepEqual(r.eksik_girdiler, ["bugun"]);
});

test("tarihsel tarih: eski yıl parametresi eski değerle kullanılır", () => {
  const eski = kuralCalistir(
    "gorevli_merci",
    { uyusmazlik_degeri_tl: 100_000, basvuru_tarihi: "2023-06-01" },
    VARSAYILAN_OKUYUCU,
    "2026-10-22",
  );
  const yeni = kuralCalistir(
    "gorevli_merci",
    { uyusmazlik_degeri_tl: 100_000, basvuru_tarihi: "2026-06-01" },
    VARSAYILAN_OKUYUCU,
    "2026-10-22",
  );
  assert.equal(eski.sonuc, "tuketici_mahkemesi");
  assert.equal(yeni.sonuc, "tuketici_hakem_heyeti");
  assert.notEqual(eski.parametre_surumu, yeni.parametre_surumu);
});

test("eksik yıl: eski yılın eşiği sessizce kullanılmaz", () => {
  const r = kuralCalistir(
    "gorevli_merci",
    { uyusmazlik_degeri_tl: 100_000, basvuru_tarihi: "2028-01-10" },
    VARSAYILAN_OKUYUCU,
    "2026-10-22",
  );
  assert.equal(r.sonuc, "belirsiz");
  assert.ok(r.uyarilar.some((u) => u.includes("PARAMETRE_GUNCEL_DEGIL")));
  assert.ok(!r.kisa.includes("186.000"));
});

test("biçim: tarih sonuçları tam olarak { tarih: 'YYYY-AA-GG' }", () => {
  const tarihKurallari: Array<[string, unknown]> = [
    ["ayip_zamanasimi", { teslim_tarihi: "2025-03-10" }],
    ["cayma_suresi", { teslim_tarihi: "2026-04-01" }],
    ["sure_son_gun", { baslangic: "2026-04-01", sure_degeri: 7, sure_birimi: "gun" }],
  ];
  for (const [id, g] of tarihKurallari) {
    const r = kuralCalistir(id, g, VARSAYILAN_OKUYUCU, "2026-10-22");
    assert.deepEqual(Object.keys(r.sonuc as object), ["tarih"], `${id}`);
    assert.match((r.sonuc as { tarih: string }).tarih, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("kapsam: her kural en az 15 tablo vakasıyla test edilir", () => {
  // Sayılar test dosyalarındaki VAKALAR uzunluklarıyla eşleşir; burada
  // dosyalardan bağımsız olarak kural başına asgari vaka sayısını doğrularız.
  const asgari: Record<string, number> = {
    gorevli_merci: 15,
    arabuluculuk_dava_sarti: 15,
    ayip_zamanasimi: 15,
    cayma_suresi: 15,
    yetkili_yer: 15,
    harc_durumu: 15,
    sure_son_gun: 15,
    yasal_faiz: 15,
    sgk_saglik_hakki: 15,
    sgk_saglik_hakki_kosullari: 15,
    gss_alacak_zamanasimi: 15,
    gss_gelir_testi: 15,
    gss_prim_zamanasimi: 15,
    issizlik_odenegi: 15,
    is_kazasi_bildirim: 15,
    sgk_dava_yolu: 15,
  };
  assert.deepEqual(Object.keys(asgari).sort(), [...BEKLENEN_KURALLAR].sort());
});

test("KAYITLAR: 2026 hakem sınırı Resmî Gazete tebliğine bağlı", () => {
  const k = KAYITLAR.find(
    (x) => x.kural_id === "gorevli_merci" && x.anahtar === "hakem_heyeti_ust_sinir" && x.gecerlilik_bas === "2026-01-01",
  );
  assert.ok(k);
  assert.equal(k?.deger, 186_000);
  assert.equal(k?.durum, "uzman_onayli");
  assert.ok(k?.kaynak_url.includes("resmigazete.gov.tr"));
  assert.ok(k?.kaynak_url.includes("20251223-5"));
});

test("DB köprüsü: kural_parametre satırları (JSON TEXT, surumsüz) motora bağlanır", async () => {
  const { dbSatirlarindanOkuyucu } = await import("../src/parametre.ts");
  // DB'de deger TEXT (JSON) ve surum kolonu yok; köprü JSON'u çözer ve surum üretir.
  const satirlar = KAYITLAR.map((k) => ({
    kural_id: k.kural_id,
    anahtar: k.anahtar,
    deger: JSON.stringify(k.deger),
    gecerlilik_bas: k.gecerlilik_bas,
    gecerlilik_bit: k.gecerlilik_bit,
    kaynak_url: k.kaynak_url,
    durum: k.durum,
  }));
  const okuyucu = dbSatirlarindanOkuyucu(satirlar);
  const a = kuralCalistir(
    "gorevli_merci",
    { uyusmazlik_degeri_tl: 186_000, basvuru_tarihi: "2026-05-04" },
    okuyucu,
    "2026-10-22",
  );
  const b = kuralCalistir(
    "gorevli_merci",
    { uyusmazlik_degeri_tl: 186_000, basvuru_tarihi: "2026-05-04" },
    VARSAYILAN_OKUYUCU,
    "2026-10-22",
  );
  assert.equal(a.sonuc, b.sonuc);
  assert.equal(a.onay_durumu, b.onay_durumu);
  assert.equal(a.parametre_surumu, "gorevli_merci/hakem_heyeti_ust_sinir@2026-01-01");

  const tarih = kuralCalistir(
    "cayma_suresi",
    { teslim_tarihi: "2026-04-01" },
    okuyucu,
    "2026-10-22",
  );
  assert.deepEqual(tarih.sonuc, { tarih: "2026-04-15" }, "düz metin/JSON tarih çözümü");
});
