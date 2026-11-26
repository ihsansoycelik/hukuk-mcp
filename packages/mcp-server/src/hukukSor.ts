/**
 * hukuk_sor orchestration — routing, rules, budgeted packaging.
 *
 * Deterministic by construction: no generative model runs here. Same inputs and
 * same published snapshot always produce the same bytes.
 */
import { olaySonrasiUyarilari } from "./zaman.ts";
import type { HukukSorCikti, HukukSorInput, KuralSonucu } from "@hukuk/schema";
import { dugumBul, ustZinciri, yapraklar } from "@hukuk/ontology";
import { analyze } from "@hukuk/tr-text";
import { paketle, tokenSay, butceyeSikistir, type Bolum } from "./budget.ts";
import type { CorpusPort, DugumAday, KuralPort } from "./ports.ts";
import {
  argumanSatiri,
  bugunISO,
  dayanakKimlikleri,
  eksikEtiket,
  hataMetni,
  kararSatiri,
  ustEki,
  kuralSatiri,
  sonucDegeri,
  trTarih,
  type HukukHatasi,
} from "./render.ts";

/**
 * Below this score the router has found nothing meaningful. Offering three
 * near-zero options would look like a choice but carry no information, so we
 * return DUGUM_BULUNAMADI with an actionable next step instead.
 */
export const ANLAMSIZ_ESIK = 0.1;

/**
 * The ontology's own trigger vocabulary, tokenised once. If a query scores below
 * the routing threshold AND hits none of these, it is almost certainly outside
 * the covered fields (e.g. employment, rent, tax) — offering three consumer or
 * SGK topics as "choices" would be misleading, so we say so instead.
 */
const TETIKLEYICI_TOKENLARI: Set<string> = (() => {
  // Generic words that appear inside multi-word triggers ("cayma bedeli",
  // "satış sonrası") but prove nothing about the domain on their own.
  const genel = new Set([
    "bedel", "sonra", "iade", "ucret", "sure", "sozlesme", "odeme", "talep",
    "urun", "hizmet", "hesap", "tutar", "madde", "kanun", "taraf", "kisi",
  ]);
  const out = new Set<string>();
  for (const d of yapraklar()) {
    for (const t of d.tetikleyiciler) {
      for (const tok of analyze(t).tokens) {
        if (tok.length >= 5 && !genel.has(tok)) out.add(tok);
      }
    }
  }
  return out;
})();

export function tetikleyiciVar(sorgu: string): boolean {
  for (const tok of analyze(sorgu).tokens) {
    if (tok.length >= 5 && TETIKLEYICI_TOKENLARI.has(tok)) return true;
  }
  return false;
}

export const YONLENDIRME = {
  /** runner-up within this score gap is named in a DİĞER OLASILIK line */
  yakinFark: 0.06,
  /**
   * Calibrated against the retrieval team's 138-row routing golden set:
   * positive top-1 scores p10=0.334 / p50=0.582; out-of-domain traps median
   * 0.121, p90 0.220. 0.30 keeps 28/28 traps ambiguous at a 9.4% false-ambiguous
   * cost on positives.
   */
  esik: 0.3,
  /** minimum gap between #1 and #2 before we ask the user to choose */
  marj: 0.02,
  maxAday: 3,
};

/** Section priorities: lower wins when the budget is tight. */
export const ONCELIK = {
  ozet: 10,
  kurallar: 20,
  haklar: 30,
  yol: 40,
  eksik: 50,
  argumanlar: 60,
  kararlar: 70,
  dikkat: 80,
  derinles: 90,
} as const;

export interface Oturum {
  /** decisions already shown in this session (repeat suppression) */
  gonderilen: Set<string>;
  /** the disclaimer is appended once per session, not on every answer */
  notGonderildi: boolean;
}

export function yeniOturum(): Oturum {
  return { gonderilen: new Set(), notGonderildi: false };
}

export interface SoruSonucu {
  metin: string;
  token: number;
  dugum?: string;
  guven?: number;
  hata?: string;
  /** structured twin of `metin`, returned as MCP structuredContent */
  yapisal: HukukSorCikti;
}

function bosYapisal(durum: HukukSorCikti["durum"], korpus: string): HukukSorCikti {
  return { durum, kurallar: [], eksik_olgular: [], atiflar: [], korpus };
}

const NOT =
  "NOT Bilgi amaçlıdır, hukuki danışmanlık değildir; somut olayınız için bir avukata danışın.";

function guven(skor: number): string {
  return (Math.round(skor * 100) / 100).toFixed(2);
}

/** Header line: node, confidence, card version and published snapshot. */
function baslik(dugumId: string, skor: number, kartSurum: number, durum: string, yayin: string): string {
  return `DÜĞÜM ${dugumId} (güven ${guven(skor)}) | kart v${kartSurum} ${durum} | sürüm ${yayin}`;
}

/**
 * Deterministic rule inputs derived from STRUCTURED fields only.
 *
 * Field names must match the Zod schemas in @hukuk/rules exactly; unknown keys
 * are stripped there. Nothing is inferred from the free-text `ozet` — that is
 * the client model's job, by design.
 */
function kuralGirdileri(input: HukukSorInput, dugumId: string): Record<string, unknown> {
  const parcalar = dugumId.split("/");
  const yaprak = parcalar[2] ?? "";
  const dal = parcalar[1] ?? "";
  const bugun = input.bugun ?? bugunISO();
  const tasinmaz = yaprak === "konut" || yaprak === "on-odemeli-konut";
  return {
    // gorevli_merci / arabuluculuk
    uyusmazlik_degeri_tl: input.tutar_tl ?? undefined,
    basvuru_tarihi: bugun,
    dava_tarihi: bugun,
    // ayip_zamanasimi / cayma_suresi
    teslim_tarihi: input.olay_tarihi ?? undefined,
    sozlesme_tarihi: input.olay_tarihi ?? undefined,
    // sgk_saglik_hakki / is_kazasi_bildirim / gss_alacak_zamanasimi
    isten_cikis_tarihi: input.olay_tarihi ?? undefined,
    kaza_tarihi: input.olay_tarihi ?? undefined,
    odeme_tarihi: input.olay_tarihi ?? undefined,
    // sgk_saglik_hakki_kosullari / issizlik_odenegi
    son_bir_yil_prim_gun: input.prim_gun_sayisi ?? undefined,
    prim_gun_sayisi: input.prim_gun_sayisi ?? undefined,
    mal_turu: tasinmaz ? "konut_tatil_amazli_tasinmaz" : "tasinan",
    ikinci_el: yaprak === "ikinci-el-galeri",
    sozlesme_turu: dal === "mesafeli-sozlesme" ? "mesafeli_mal" : undefined,
    // yetkili_yer / harc_durumu
    davaci: input.kullanici_rolu === "satici" ? "satici" : "tuketici",
    itiraz_mi: yaprak === "itiraz-ve-istinaf",
    // ortam
    bugun,
    urun_hizmet: input.urun_hizmet ?? undefined,
    talep: input.talep ?? undefined,
    dugum: dugumId,
  };
}

/** gorevli_merci sonucunu, aşamaya bağlı kuralların girdisine çevirir. */
function asamaEsle(sonuc: unknown): "hakem_heyeti" | "tuketici_mahkemesi" | null {
  if (sonuc === "tuketici_hakem_heyeti") return "hakem_heyeti";
  if (sonuc === "tuketici_mahkemesi") return "tuketici_mahkemesi";
  return null;
}

function kurallariCalistir(
  dugumId: string,
  input: HukukSorInput,
  corpus: CorpusPort,
  kural: KuralPort,
): { satirlar: string[]; eksik: string[]; uyarilar: string[]; sonuclar: KuralSonucu[]; kayitlar: Array<{ kural: string; s: KuralSonucu }> } {
  const dugum = dugumBul(dugumId);
  const girdiler = kuralGirdileri(input, dugumId);
  const satirlar: string[] = [];
  const eksik = new Set<string>();
  const uyarilar = new Set<string>();
  const sonuclar: KuralSonucu[] = [];
  const kayitlar: Array<{ kural: string; s: KuralSonucu }> = [];
  const kuralIdleri = (dugum?.kurallar ?? []).filter((k) => kural.varMi(k));

  const calistir = (kuralId: string): KuralSonucu | null => {
    try {
      const s = kural.calistir(kuralId, girdiler, String(girdiler.bugun));
      sonuclar.push(s);
      kayitlar.push({ kural: kuralId, s });
      satirlar.push(kuralSatiri(s, kuralId));
      for (const e of s.eksik_girdiler) eksik.add(e);
      for (const u of s.uyarilar) uyarilar.add(u);
      return s;
    } catch {
      return null; // a broken rule must never break the whole answer
    }
  };

  // Stage-dependent rules need the forum, which gorevli_merci computes.
  // Run it first and feed the result forward instead of asking the user.
  let asama: "hakem_heyeti" | "tuketici_mahkemesi" | null = null;
  if (kuralIdleri.includes("gorevli_merci")) {
    const s = calistir("gorevli_merci");
    asama = s ? asamaEsle(s.sonuc) : null;
  }

  for (const kuralId of kuralIdleri) {
    if (kuralId === "gorevli_merci") continue;
    // Each rule has its own stage vocabulary; map per rule, not globally.
    if (asama) {
      if (kuralId === "yetkili_yer") girdiler.asama = asama;
      else if (kuralId === "harc_durumu") {
        girdiler.asama = asama === "hakem_heyeti" ? "hakem_heyeti" : "ilk_derece";
      }
    }
    calistir(kuralId);
  }
  return { satirlar, eksik: [...eksik], uyarilar: [...uyarilar], sonuclar, kayitlar };
}

/** Out-of-scope answer: says what we cover instead of inventing options. */
function kapsamDisiYanit(yayin: string): SoruSonucu {
  const metin = [
    `KAPSAM DIŞI OLABİLİR | sürüm ${yayin}`,
    "Bu anlatım tüketici veya sosyal güvenlik hukuku konularına güvenilir biçimde eşlenemedi.",
    "KAPSAM: ayıplı mal/hizmet, mesafeli satış, abonelik, kredi/kredi kartı, garanti, haksız şart, tüketici usulü; SGK sağlık hakkı, GSS, işsizlik ödeneği, iş kazası, SGK kararına itiraz.",
    "KAPSAM DIŞI: iş hukuku (kıdem/ihbar), kira, vergi, ceza, aile.",
    "SONRAKI ADIM: tüketici işlemi veya SGK işlemi olduğunu düşünüyorsanız ürün/hizmeti ya da SGK işlemini ve talebi bir cümleyle yazın.",
  ].join("\n");
  return { metin: butceyeSikistir(metin, 260), token: tokenSay(metin), hata: "KAPSAM_DISI", yapisal: bosYapisal("kapsam_disi", yayin) };
}

/** Ambiguity protocol: at most three candidates, each one line, ~150 tokens. */
function belirsizYanit(adaylar: DugumAday[], yayin: string): SoruSonucu {
  const satirlar = adaylar.slice(0, YONLENDIRME.maxAday).map((a, i) => {
    const aciklama = a.aciklama ? ` — ${a.aciklama.slice(0, 110)}` : "";
    return `${i + 1}) ${a.id} (${guven(a.skor)})${aciklama}`;
  });
  const govde = [
    `BELİRSİZ DÜĞÜM | sürüm ${yayin}`,
    "HANGİ KONU?",
    ...satirlar,
    "DAHA İYİ YANIT İÇİN: ürün/hizmeti ya da SGK işlemini ve talebi bir cümleyle belirtip tekrar sorun (ör. 'araçta gizli ayıp, bedel iadesi' veya 'işten çıkış sonrası sağlık hakkı').",
  ].join("\n");
  const metin = butceyeSikistir(govde, 260);
  return { metin, token: tokenSay(metin), hata: "BELIRSIZ_DUGUM", yapisal: bosYapisal("belirsiz", yayin) };
}

export function hukukSor(input: HukukSorInput, corpus: CorpusPort, kural: KuralPort, oturum: Oturum): SoruSonucu {
  const yayin = corpus.yayinSurumu();
  const butce = input.butce ?? 1500;

  // 1. route
  const sorgu = [input.ozet, input.urun_hizmet ?? "", input.talep ?? ""].join(" ").trim();
  // Only leaves are answerable: a branch node has a kural set but no card, and
  // offering "t/abonelik" as a choice to a citizen is not a real option. Until a
  // space is compiled into the ontology package (e.g. `s/` before the SGK tree
  // lands), fall back to the id contract: `t/<dal>/<yaprak>` and
  // `s/<dal>/<yaprak>` are leaves. The card lookup below still guards an answer.
  const yaprakMi = (id: string): boolean => {
    const d = dugumBul(id);
    if (d) return d.yaprak;
    return /^s\/[a-z0-9-]+\/[a-z0-9-]+$/.test(id);
  };
  const adaylar = corpus
    .dugumAra(sorgu, undefined, 12)
    .filter((a) => yaprakMi(a.id))
    .slice(0, 5);
  const enIyi = adaylar[0]?.skor ?? 0;
  if (adaylar.length === 0 || enIyi < ANLAMSIZ_ESIK) {
    const h: HukukHatasi = {
      kod: "DUGUM_BULUNAMADI",
      mesaj: "bu anlatım bilinen bir tüketici veya SGK uyuşmazlığına eşlenemedi",
      sonraki_adim: "ürün/hizmeti ya da SGK işlemini ve talebi belirtin; ya da 'ara' aracıyla içtihatta arayın",
    };
    return { metin: hataMetni(h), token: tokenSay(hataMetni(h)), hata: h.kod, yapisal: bosYapisal("hata", yayin) };
  }

  const en = adaylar[0]!;
  const ikinci = adaylar[1];
  const net = en.skor >= YONLENDIRME.esik && (!ikinci || en.skor - ikinci.skor >= YONLENDIRME.marj);
  if (!net) {
    // Düşük skor + hiç tetikleyici yok => alan dışı. Sahte seçenek sunma.
    // judge the narrative only: `talep`/`urun_hizmet` carry generic words like
    // "iade" that are not evidence of a consumer transaction
    if (!tetikleyiciVar(input.ozet)) return kapsamDisiYanit(yayin);
    return belirsizYanit(adaylar, yayin);
  }

  const dugumId = en.id;
  const kart = corpus.kartGetir(dugumId);
  if (!kart) {
    const h: HukukHatasi = {
      kod: "DUGUM_BULUNAMADI",
      mesaj: `düğüm var ama kart yayınlanmamış: ${dugumId}`,
      sonraki_adim: "genel 'ara' aracını kullanın veya başka bir konu belirtin",
    };
    return { metin: hataMetni(h), token: tokenSay(hataMetni(h)), hata: h.kod, yapisal: bosYapisal("hata", yayin) };
  }

  // 2. rules
  const kuralSonuc = kurallariCalistir(dugumId, input, corpus, kural);

  // 3. card sections
  const bolum = (etiket: string): string =>
    kart.bolumler.find((b) => b.etiket === etiket)?.metin ?? "";

  const bolumler: Bolum[] = [];
  const ozet = bolum("ÖZET");
  if (ozet) {
    bolumler.push({
      etiket: "ÖZET",
      metin: ozet,
      oncelik: ONCELIK.ozet,
      kisaltma: "ayrıntı için derinleş: " + dugumId,
    });
  }

  if (kuralSonuc.satirlar.length) {
    bolumler.push({
      etiket: "KURALLAR",
      metin: kuralSonuc.satirlar.join("\n"),
      oncelik: ONCELIK.kurallar,
      kisaltma: "hesaplar kısaltıldı; ayrıntı için hesapla aracını kullanın",
    });
  }

  const haklar = bolum("HAKLAR");
  if (haklar) {
    bolumler.push({ etiket: "HAKLAR", metin: haklar, oncelik: ONCELIK.haklar, kisaltma: "seçimlik haklar: " + (kart.kaynaklar[0] ?? "") });
  }

  const yol = bolum("YOL");
  if (yol) {
    bolumler.push({ etiket: "YOL", metin: yol, oncelik: ONCELIK.yol, kisaltma: "yol haritası kısaltıldı" });
  }

  const eksikler = [...new Set([...(kuralSonuc.eksik ?? []), ...extraEksik(kart)])].map(eksikEtiket);
  if (eksikler.length) {
    bolumler.push({
      etiket: "EKSİK OLGULAR",
      metin: eksikler.join(", "),
      oncelik: ONCELIK.eksik,
      kisaltma: eksikler.slice(0, 3).join(", "),
    });
  }

  const argumanlar = corpus.argumanlar(dugumId).slice(0, 3);
  if (argumanlar.length) {
    bolumler.push({
      etiket: "ARGÜMANLAR",
      metin: argumanlar.map(argumanSatiri).join("\n"),
      oncelik: ONCELIK.argumanlar,
      kisaltma: `${argumanlar.length} argüman kısaltıldı`,
    });
  }

  // 4. representative decisions (bindingness-aware, from the same branch)
  const dal = dugumId.split("/").slice(0, 2).join("/");
  const kararlar = corpus
    .ara({ sorgu: `${input.ozet} ${input.urun_hizmet ?? ""}`.trim(), alan: dal, limit: 4, butce: 400 })
    .filter((k) => k.temsilci_uygun);
  if (kararlar.length) {
    const satirlar = kararlar.map((k) => {
      const once = oturum.gonderilen.has(k.karar_id);
      oturum.gonderilen.add(k.karar_id);
      return kararSatiri(k, once, ustEki(corpus, k));
    });
    bolumler.push({
      etiket: "KARARLAR",
      metin: satirlar.join("\n"),
      oncelik: ONCELIK.kararlar,
      kisaltma: `örnek kararlar: ${kararlar.map((k) => k.karar_id).slice(0, 2).join(", ")}`,
    });
  }

  const dikkat = bolum("DİKKAT");
  // Generic input-validation chatter belongs in EKSİK OLGULAR, not DİKKAT.
  const uyarilar = [...new Set(kuralSonuc.uyarilar)]
    .filter((u) => !/^Geçersiz\/eksik girdiyle|Invalid enum|Required$/i.test(u))
    .slice(0, 3);
  // Dayanak articles amended after the event: the corpus has only today's text.
  const tarihUyarilari = olaySonrasiUyarilari(
    corpus,
    [
      ...kuralSonuc.kayitlar.flatMap((k) => k.s.dayanak),
      ...(kart.kaynaklar ?? []),
      ...kart.bolumler.flatMap((b) => [...b.metin.matchAll(/\[(m:[^\]\s,]+)\]/g)].map((m) => m[1]!)),
    ],
    input.olay_tarihi ?? null,
  );
  uyarilar.push(...tarihUyarilari);
  if (dikkat || uyarilar.length) {
    bolumler.push({
      etiket: "DİKKAT",
      metin: [dikkat, ...uyarilar.map((u) => `- ${u}`)].filter(Boolean).join("\n"),
      oncelik: ONCELIK.dikkat,
      kisaltma: uyarilar[0] ?? "dikkat notu kısaltıldı",
    });
  }

  // Close runner-up (but still above the ambiguity margin): name it, so the
  // model can switch with one derinles call instead of re-asking the user.
  if (ikinci && en.skor - ikinci.skor < YONLENDIRME.yakinFark) {
    const ad = dugumBul(ikinci.id)?.ad ?? ikinci.id;
    bolumler.push({
      etiket: "DİĞER OLASILIK",
      metin: `${ikinci.id} — ${ad} (güven ${guven(ikinci.skor)}). Olay buna uyuyorsa derinles(id="${ikinci.id}").`,
      oncelik: ONCELIK.eksik + 5,
      kisaltma: ikinci.id,
    });
  }

  const derinlesIdleri = [
    dugumId,
    ...(kart.kaynaklar ?? []).slice(0, 2),
    ...kararlar.slice(0, 1).map((k) => k.karar_id),
  ];
  bolumler.push({
    etiket: "DERINLES",
    metin: derinlesIdleri.join(" | "),
    oncelik: ONCELIK.derinles,
    kisaltma: dugumId,
  });

  // 5. package
  // Routing reason: which of the node's own trigger phrases the question hit.
  // It sits in the header, so it is never dropped by the budget packer.
  const tetikler = (en.tetikler ?? []).slice(0, 3);
  const neden = tetikler.length ? `\nNEDEN tetik: ${tetikler.map((t) => `"${t}"`).join(", ")}` : "";
  const bas = baslik(dugumId, en.skor, kart.surum, kart.durum, yayin) + neden;
  const rezerve = oturum.notGonderildi ? 0 : tokenSay(NOT) + 1;
  const paket = paketle(bas, bolumler, butce, rezerve);

  let metin = paket.metin;
  if (!oturum.notGonderildi) {
    metin += "\n" + NOT;
    oturum.notGonderildi = true;
  }
  if (tokenSay(metin) > butce) metin = butceyeSikistir(metin, butce);

  const digerOlasilik = ikinci && en.skor - ikinci.skor < YONLENDIRME.yakinFark ? ikinci.id : undefined;
  const atiflar = [
    ...new Set([
      ...derinlesIdleri,
      ...kuralSonuc.kayitlar.flatMap((k) => dayanakKimlikleri(k.s.dayanak)),
    ]),
  ];
  const yapisal: HukukSorCikti = {
    durum: "yanit",
    dugum: dugumId,
    guven: Math.round(en.skor * 100) / 100,
    ...(digerOlasilik ? { diger_olasilik: digerOlasilik } : {}),
    kurallar: kuralSonuc.kayitlar.map(({ kural: kuralId, s }) => ({
      kural: kuralId,
      sonuc: sonucDegeri(s) === null ? null : String(sonucDegeri(s)),
      ozet: s.kisa,
      dayanak: dayanakKimlikleri(s.dayanak),
      eksik: s.eksik_girdiler,
    })),
    eksik_olgular: eksikler,
    atiflar,
    korpus: yayin,
    uyarilar: tarihUyarilari,
  };
  return { metin, token: tokenSay(metin), dugum: dugumId, guven: en.skor, yapisal };
}

function extraEksik(kart: { bolumler: { etiket: string; metin: string }[] }): string[] {
  const b = kart.bolumler.find((x) => x.etiket === "EKSİK OLGULAR");
  if (!b) return [];
  return b.metin
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Branch breadcrumb for the ambiguous/answer header, used by derinles. */
export function zincirMetni(dugumId: string): string {
  return ustZinciri(dugumId)
    .map((d) => d.ad)
    .join(" › ");
}

export { trTarih };
