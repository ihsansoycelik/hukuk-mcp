import { test } from "node:test";
import assert from "node:assert/strict";
import type { Kart, KuralSonucu } from "@hukuk/schema";
import { hukukSor, yeniOturum, YONLENDIRME } from "../src/hukukSor.ts";
import { tokenSay, paketle } from "../src/budget.ts";
import type { CorpusPort, KuralPort } from "../src/ports.ts";

const kart: Kart = {
  dugum_id: "t/ayipli-mal/arac",
  surum: 3,
  durum: "taslak",
  girdi_hash: "h",
  token: 100,
  kaynaklar: ["m:6502/11", "m:6502/12"],
  bolumler: [
    { etiket: "ÖZET", metin: "Araçta ayıp varsa dört seçimlik hakkınız vardır [m:6502/11].", token: 20, oncelik: 10 },
    { etiket: "HAKLAR", metin: "- dönme [m:6502/11]\n- indirim [m:6502/11]", token: 20, oncelik: 30 },
    { etiket: "YOL", metin: "1) yazılı bildirim [m:6502/11]\n2) hakem heyeti [m:6502/68]", token: 20, oncelik: 40 },
    { etiket: "DİKKAT", metin: "- ikinci elde en az bir yıl [m:6502/12]", token: 20, oncelik: 80 },
  ],
};

/** Sahte SGK kartı: gerçek YAML içeriğine bağlı kalmadan yönlendirmeyi sınar. */
const sgkKart: Kart = {
  dugum_id: "s/saglik/isten-ayrilma-sonrasi-hak",
  surum: 1,
  durum: "taslak",
  girdi_hash: "h",
  token: 40,
  kaynaklar: ["m:5510/67"],
  bolumler: [
    { etiket: "ÖZET", metin: "İşten ayrıldıktan sonra sağlık hakkı [m:5510/67].", token: 12, oncelik: 10 },
    { etiket: "YOL", metin: "1) SGK'ya başvuru [m:5510/67]", token: 10, oncelik: 40 },
  ],
};

function sahteCorpus(o: Partial<CorpusPort> & { adaylar?: { id: string; ad: string; skor: number; aciklama: string }[] }): CorpusPort {
  return {
    dugumAra: () => o.adaylar ?? [{ id: "t/ayipli-mal/arac", ad: "Araç", skor: 0.9, aciklama: "araç ayıbı" }],
    dugumGetir: () => null,
    kartGetir: () => (o.kartGetir ? o.kartGetir("t/ayipli-mal/arac") : kart),
    ara: () => [
      { karar_id: "k:ygt-13hd-2013-7601-2013-16449", skor: 0.8, l0: "bedel iadesine karar verildi", l1: "", tarih: "2013-06-17", daire: "13. HD", mahkeme: "yargitay", sonuc: "kabul", kesinlesme: "kesin", agirlik: 70, temsilci_uygun: true, kaynak_url: "https://x" },
    ],
    kararGetir: () => null,
    maddeGetir: () => null,
    argumanlar: () => [{ id: "a:t-arac-kullanici-hatasi", taraf: "satici", iddia: "kullanıcı hatası", kabul: 14, ret: 61, belirleyici: "bilirkişi raporu" }],
    meta: () => null,
    yayinSurumu: () => "v20261022.1",
    ...o,
  };
}

const sahteKural: KuralPort = {
  varMi: (id) => id === "ayip_zamanasimi",
  calistir: (): KuralSonucu => ({
    sonuc: { tarih: "2027-03-14" },
    kisa: "teslimden iki yıl sonra doluyor",
    dayanak: ["m:6502/12@2026-10-22"],
    varsayimlar: [],
    eksik_girdiler: ["teslim_tarihi"],
    uyarilar: ["hile iddiası varsa süre işlemez"],
    parametre_surumu: "v20261022.1",
    onay_durumu: "teyit_bekliyor",
  }),
};

test("full answer carries every section and respects the budget", () => {
  const oturum = yeniOturum();
  const r = hukukSor({ ozet: "aracımda şanzıman arızası var paramı istiyorum", butce: 1500 } as never, sahteCorpus({}), sahteKural, oturum);
  assert.match(r.metin, /^DÜĞÜM t\/ayipli-mal\/arac \(güven 0\.90\)/);
  assert.match(r.metin, /ÖZET\n/);
  assert.match(r.metin, /KURALLAR/);
  assert.match(r.metin, /HAKLAR/);
  assert.match(r.metin, /KARARLAR/);
  assert.match(r.metin, /DERINLES/);
  assert.match(r.metin, /NOT Bilgi amaçlıdır/);
  assert.ok(r.token <= 1500, `token ${r.token}`);
  assert.equal(r.dugum, "t/ayipli-mal/arac");
});

test("small budget still fits and stubs what is cut", () => {
  const oturum = yeniOturum();
  const r = hukukSor({ ozet: "aracımda şanzıman arızası var paramı istiyorum", butce: 120 } as never, sahteCorpus({}), sahteKural, oturum);
  assert.ok(r.token <= 120, `token ${r.token}`);
});

test("ambiguous routing returns at most three candidates and no card", () => {
  const oturum = yeniOturum();
  // in-domain signal ("elektrik", "fatura") but below the routing threshold:
  // the system must ask instead of guessing, and must NOT fall back to "out of scope"
  const r = hukukSor({ ozet: "elektrik faturamda bir sorun var ne yapmalıyım bilmiyorum", butce: 800 } as never,
    sahteCorpus({ adaylar: [
      { id: "t/ayipli-mal/arac", ad: "Araç", skor: 0.3, aciklama: "a" },
      { id: "t/ayipli-mal/elektronik", ad: "Elektronik", skor: 0.29, aciklama: "b" },
      { id: "t/abonelik/gsm-internet", ad: "GSM", skor: 0.1, aciklama: "c" },
    ] }),
    sahteKural,
    oturum,
  );
  assert.equal(r.hata, "BELIRSIZ_DUGUM");
  assert.match(r.metin, /HANGİ KONU\?/);
  assert.equal((r.metin.match(/^\d\)/gm) ?? []).length, 3);
});

test("missing card yields a deterministic error with a next step", () => {
  const r = hukukSor({ ozet: "aracımda arıza var" } as never, sahteCorpus({ kartGetir: () => null }), sahteKural, yeniOturum());
  assert.equal(r.hata, "DUGUM_BULUNAMADI");
  assert.match(r.metin, /SONRAKI ADIM/);
});

test("no candidate yields DUGUM_BULUNAMADI", () => {
  const r = hukukSor({ ozet: "vergiden düşer miyim" } as never, sahteCorpus({ adaylar: [] }), sahteKural, yeniOturum());
  assert.equal(r.hata, "DUGUM_BULUNAMADI");
});

test("a decision is not repeated verbatim in the same session", () => {
  const oturum = yeniOturum();
  const a = hukukSor({ ozet: "aracımda arıza var" } as never, sahteCorpus({}), sahteKural, oturum);
  const b = hukukSor({ ozet: "aracımda arıza var" } as never, sahteCorpus({}), sahteKural, oturum);
  assert.match(a.metin, /k:ygt-13hd/);
  assert.match(b.metin, /önceden gönderildi/);
});

test("disclaimer appears once per session", () => {
  const oturum = yeniOturum();
  const a = hukukSor({ ozet: "aracımda arıza var" } as never, sahteCorpus({}), sahteKural, oturum);
  const b = hukukSor({ ozet: "aracımda arıza var" } as never, sahteCorpus({}), sahteKural, oturum);
  assert.equal(a.metin.includes("NOT Bilgi amaçlıdır"), true);
  assert.equal(b.metin.includes("NOT Bilgi amaçlıdır"), false);
});

test("packer never exceeds budget even with a huge unrelated section", () => {
  const buyuk = "kelime ".repeat(3000);
  const p = paketle("BAŞLIK", [
    { etiket: "ÖZET", metin: "kısa", oncelik: 10 },
    { etiket: "DEV", metin: buyuk, oncelik: 20, kisaltma: "kısaltıldı" },
  ], 200);
  assert.ok(p.token <= 200, `token ${p.token}`);
});

test("thresholds are exported and sane", () => {
  assert.ok(YONLENDIRME.esik > 0 && YONLENDIRME.esik < 1);
  assert.ok(YONLENDIRME.marj > 0);
  assert.ok(tokenSay("merhaba") > 0);
});

test("an SGK candidate is routed, not refused as out of scope", () => {
  const oturum = yeniOturum();
  const r = hukukSor(
    { ozet: "İşten ayrıldıktan sonra 90 günlük sağlık hakkım SGK sistemine işlenmedi", olay_tarihi: "2026-05-01", butce: 800 } as never,
    sahteCorpus({
      adaylar: [{ id: "s/saglik/isten-ayrilma-sonrasi-hak", ad: "İşten ayrılma sonrası sağlık hakkı", skor: 0.9, aciklama: "10+90 gün" }],
      kartGetir: () => sgkKart,
    }),
    sahteKural,
    oturum,
  );
  assert.notEqual(r.hata, "KAPSAM_DISI");
  assert.notEqual(r.hata, "DUGUM_BULUNAMADI");
  assert.match(r.metin, /^DÜĞÜM s\/saglik\/isten-ayrilma-sonrasi-hak \(güven 0\.90\)/);
  assert.match(r.metin, /m:5510\/67/);
  assert.equal(r.dugum, "s/saglik/isten-ayrilma-sonrasi-hak");
});

test("SGK facts are mapped into deterministic rule inputs", () => {
  const yakalanan: Record<string, unknown>[] = [];
  const kural: KuralPort = {
    varMi: (id) => id === "ayip_zamanasimi",
    calistir: (_id, girdiler): KuralSonucu => {
      yakalanan.push({ ...girdiler });
      return {
        sonuc: { tarih: "2027-03-14" },
        kisa: "teslimden iki yıl sonra doluyor",
        dayanak: ["m:6502/12"],
        varsayimlar: [],
        eksik_girdiler: [],
        uyarilar: [],
        parametre_surumu: "v",
        onay_durumu: "teyit_bekliyor",
      };
    },
  };
  hukukSor(
    { ozet: "aracımda şanzıman arızası var paramı istiyorum", olay_tarihi: "2026-05-01", prim_gun_sayisi: 120 } as never,
    sahteCorpus({}),
    kural,
    yeniOturum(),
  );
  assert.equal(yakalanan.length, 1);
  const g = yakalanan[0]!;
  // olay_tarihi SGK kurallarının kendi tarih anahtarlarına taşınır
  assert.equal(g.isten_cikis_tarihi, "2026-05-01");
  assert.equal(g.kaza_tarihi, "2026-05-01");
  assert.equal(g.odeme_tarihi, "2026-05-01");
  // tek yeni olgu iki prim-günü anahtarını besler
  assert.equal(g.son_bir_yil_prim_gun, 120);
  assert.equal(g.prim_gun_sayisi, 120);
  // odeme_suresi_son bilinçli olarak eşlenmez: hukuk_sor'da eksik olgu kalır,
  // tam girdiyle hesapla aracından çalışır
  assert.equal(g.odeme_suresi_son, undefined);
});

test("out-of-domain question is refused as a scope limit, not as fake options", () => {
  const oturum = yeniOturum();
  // neighbour noise (golden r139 family): neither consumer nor SGK law
  const r = hukukSor(
    { ozet: "üst kat komşum gece gürültü yapıyor uyuyamıyorum", butce: 800 } as never,
    sahteCorpus({ adaylar: [
      { id: "t/abonelik/enerji-fatura", ad: "Enerji", skor: 0.18, aciklama: "a" },
      { id: "t/abonelik/gsm-internet", ad: "GSM", skor: 0.16, aciklama: "b" },
    ] }),
    sahteKural,
    oturum,
  );
  assert.equal(r.hata, "KAPSAM_DISI");
  assert.match(r.metin, /KAPSAM: /);
  assert.match(r.metin, /iş hukuku/);
  // SGK is in scope now, so it must not be advertised as out of scope
  assert.doesNotMatch(r.metin, /KAPSAM DIŞI:.*(?:SGK|sosyal güvenlik)/);
  assert.doesNotMatch(r.metin, /HANGİ KONU/);
});
