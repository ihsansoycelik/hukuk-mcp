import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Kart, KuralSonucu } from "@hukuk/schema";
import { atiflariCikar } from "../src/atif.ts";
import { hukukSor, yeniOturum } from "../src/hukukSor.ts";
import { corpusPort } from "../src/adapters.ts";
import { degisiklikSatirlari, olaySonrasiUyarilari, olayTarihiBul } from "../src/zaman.ts";
import type { CorpusPort, DegisiklikKaydi, KuralPort, MaddeKaydi } from "../src/ports.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const D = (tarih: string, kanun_no: string | null, kanun_madde: string | null, tur: string, fikra: number | null = null, ham?: string): DegisiklikKaydi => ({
  fikra, tur, tarih, kanun_no, kanun_madde, ham,
});

const NOTLAR: Record<string, DegisiklikKaydi[]> = {
  "m:6502/11": [D("2022-03-24", "7392", "6", "degisik", 3), D("2016-06-01", "6000", "5", "ek"), D("2020-01-01", "7000", "1", "mulga", 2, "Mülga:1/1/2020-7000/1 md.")],
  "m:6502/12": [],
  "m:6502/48": [D("2022-03-24", "7392", "7", "degisik")],
  "m:6502/70": [D("2024-05-01", "7500", "2", "ek")],
};

function madde(id: string, metin: string): MaddeKaydi {
  return { id, mevzuat_id: "6502", madde_no: id.split("/")[1]!, baslik: "b", metin, kaynak_url: "https://x", degisiklik: null };
}

const corpus = {
  maddeGetir: (id: string) =>
    id === "m:6502/11"
      ? madde(id, "(1) Birinci. (2) (Mülga:1/1/2020-7000/1 md.) (3) (Değişik:24/3/2022-7392/6 md.) Üçüncü.")
      : id === "m:6502/12"
        ? madde(id, "(1) Bir. (2) (Mülga: 5/5/2021-7100/3 md.) Eski metin")
        : null,
  maddeNumaralari: () => [],
  kararGetir: () => null,
  degisiklikler: (id: string) => NOTLAR[id] ?? [],
} as unknown as CorpusPort;

test("olayTarihiBul picks the earliest event date and ignores non-event fields", () => {
  assert.equal(olayTarihiBul({ teslim_tarihi: "2021-05-01", sozlesme_tarihi: "2020-02-03", bugun: "2026-01-01" }), "2020-02-03");
  assert.equal(olayTarihiBul({ bugun: "2026-01-01", basvuru_tarihi: "2026-01-01" }), null);
});

test("degisiklikSatirlari: latest change, total and up to three entries", () => {
  const s = degisiklikSatirlari(NOTLAR["m:6502/11"]!);
  assert.equal(s[0], "DEĞİŞİKLİK son 24.03.2022 (7392 s. K. m.6, degisik) | toplam 3");
  assert.equal(s.length, 4);
  assert.match(s[1]!, /\(fıkra 3\)/);
  assert.deepEqual(degisiklikSatirlari([]), []);
});

test("olaySonrasiUyarilari warns for later changes only, max 2, strips @date", () => {
  const u = olaySonrasiUyarilari(corpus, ["m:6502/48@2014-05-28", "m:6502/11@2014-05-28", "m:6502/70@2014-05-28", "y:x/1"], "2021-01-10");
  assert.equal(u.length, 2);
  assert.equal(
    u[0],
    "DİKKAT dayanak m:6502/48 olaydan sonra değişti (24.03.2022, 7392 s. K.); olay tarihindeki metin korpusta yok, resmî kaynaktan teyit edin.",
  );
  assert.deepEqual(olaySonrasiUyarilari(corpus, ["m:6502/48@2014-05-28"], "2022-03-24"), []);
  assert.deepEqual(olaySonrasiUyarilari(corpus, ["m:6502/48"], null), []);
  assert.deepEqual(olaySonrasiUyarilari({ ...corpus, degisiklikler: undefined } as unknown as CorpusPort, ["m:6502/48"], "2000-01-01"), []);
});

test("dogrula: fıkra-level repeal and last-change note", () => {
  const sonuc = (m: string) => atiflariCikar(m, corpus).map((a) => `${a.durum} ${a.kimlik}`);
  assert.deepEqual(sonuc("6502 sayılı Kanunun 11. maddesinin 2. fıkrası"), ["MULGA m:6502/11/2"]);
  assert.deepEqual(sonuc("6502 sayılı Kanunun 12. maddesinin 2. fıkrası"), ["MULGA m:6502/12/2"]);
  const dogru = atiflariCikar("6502 sayılı Kanunun 11. maddesinin 1. fıkrası", corpus)[0]!;
  assert.equal(dogru.durum, "DOGRU");
  assert.match(dogru.aciklama, /son değişiklik 24\.03\.2022/);
});

const kart: Kart = {
  dugum_id: "t/ayipli-mal/arac",
  surum: 1,
  durum: "taslak",
  girdi_hash: "h",
  token: 10,
  kaynaklar: [],
  bolumler: [{ etiket: "ÖZET", metin: "Özet.", token: 10, oncelik: 10 }],
};
const kural: KuralPort = {
  varMi: () => true,
  calistir: (): KuralSonucu => ({
    sonuc: { tarih: "2021-02-01" }, kisa: "k", dayanak: ["m:6502/48@2014-05-28"], varsayimlar: [], eksik_girdiler: [], uyarilar: [],
    parametre_surumu: "p", onay_durumu: "teyit_bekliyor",
  }),
};
const hsCorpus = {
  dugumAra: () => [{ id: "t/ayipli-mal/arac", ad: "Araç", skor: 0.9, aciklama: "a" }],
  dugumGetir: () => null,
  kartGetir: () => kart,
  ara: () => [],
  kararGetir: () => null,
  maddeGetir: () => null,
  argumanlar: () => [],
  meta: () => null,
  yayinSurumu: () => "v1",
  degisiklikler: (id: string) => NOTLAR[id] ?? [],
} as unknown as CorpusPort;

test("hukuk_sor adds DİKKAT and uyarilar when a dayanak changed after the event", () => {
  const r = hukukSor({ ozet: "aracımda arıza var", olay_tarihi: "2021-01-10" } as never, hsCorpus, kural, yeniOturum());
  assert.match(r.metin, /DİKKAT dayanak m:6502\/48 olaydan sonra değişti \(24\.03\.2022, 7392 s\. K\.\)/);
  assert.equal(r.yapisal.uyarilar?.length, 1);
  const sonra = hukukSor({ ozet: "aracımda arıza var", olay_tarihi: "2023-01-10" } as never, hsCorpus, kural, yeniOturum());
  assert.doesNotMatch(sonra.metin, /olaydan sonra değişti/);
  assert.deepEqual(sonra.yapisal.uyarilar, []);
});
test("hukuk_sor also checks articles cited by the card when rules give no dayanak", () => {
  const bos: KuralPort = { varMi: () => false, calistir: kural.calistir };
  const kartli = { ...hsCorpus, kartGetir: () => ({ ...kart, kaynaklar: ["m:6502/48"] }) } as unknown as CorpusPort;
  const r = hukukSor({ ozet: "aracımda arıza var", olay_tarihi: "2021-01-10" } as never, kartli, bos, yeniOturum());
  assert.match(r.metin, /DİKKAT dayanak m:6502\/48 olaydan sonra değişti/);
  assert.equal(r.yapisal.uyarilar?.length, 1);
});

test("corpusPort reads madde_degisiklik from the fixture DB; missing table tolerated", () => {
  const p = corpusPort(join(ROOT, "data/build/fixture.db"));
  try {
    const d = p.degisiklikler!("m:6502/11");
    assert.equal(d.length, 3);
    assert.equal(d[0]!.tarih, "2022-03-24");
    assert.deepEqual(p.degisiklikler!("m:9999/1"), []);
    assert.equal(atiflariCikar("6502 sayılı Kanunun 11. maddesinin 2. fıkrası", p)[0]?.durum, "MULGA");
  } finally {
    p.close();
  }
});
