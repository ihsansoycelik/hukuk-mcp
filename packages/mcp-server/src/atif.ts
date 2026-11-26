/**
 * Free-text citation extraction and verification for `dogrula(metin=…)`.
 *
 * A model (or a user) pastes a paragraph; we pull every statute and decision
 * citation out of it, resolve back-references ("aynı Kanun", a bare "m. 12"
 * after a statute), and check each one against the compiled corpus:
 *
 *   ✓ DOĞRU     the article / decision exists
 *   ⚠ MÜLGA     the article exists but is repealed
 *   ✗ YOK       the statute is known but the article/paragraph is not; we give
 *               a range hint ("6502'de son madde 88")
 *   ? KAPSAM    the statute or court is not in the corpus, so we cannot judge
 *
 * Deterministic, no network. It checks existence, not whether the paraphrase
 * of the holding is right: a real case number with an invented holding still
 * passes. The output says so.
 */
import type { CorpusPort, MaddeKaydi } from "./ports.ts";

/** Statute number -> lower-case aliases people actually write. */
export const KANUN_TAKMA_ADLARI: Record<string, { ad: string; takma: string[] }> = {
  "6502": { ad: "Tüketicinin Korunması Hakkında Kanun", takma: ["tkhk", "tüketicinin korunması hakkında kanun", "tüketici kanunu", "tüketicinin korunması kanunu"] },
  "6098": { ad: "Türk Borçlar Kanunu", takma: ["tbk", "türk borçlar kanunu", "borçlar kanunu"] },
  "4721": { ad: "Türk Medeni Kanunu", takma: ["tmk", "türk medeni kanunu", "medeni kanun"] },
  "6100": { ad: "Hukuk Muhakemeleri Kanunu", takma: ["hmk", "hukuk muhakemeleri kanunu"] },
  "6102": { ad: "Türk Ticaret Kanunu", takma: ["ttk", "türk ticaret kanunu", "ticaret kanunu"] },
  "5237": { ad: "Türk Ceza Kanunu", takma: ["tck", "türk ceza kanunu", "ceza kanunu"] },
  "2709": { ad: "Türkiye Cumhuriyeti Anayasası", takma: ["anayasa", "ay"] },
  "6325": { ad: "Hukuk Uyuşmazlıklarında Arabuluculuk Kanunu", takma: ["haük", "hauk", "arabuluculuk kanunu"] },
  "7201": { ad: "Tebligat Kanunu", takma: ["tebligat kanunu", "tk"] },
  "2004": { ad: "İcra ve İflas Kanunu", takma: ["iik", "icra ve iflas kanunu", "icra iflas kanunu"] },
  "3095": { ad: "Kanuni Faiz ve Temerrüt Faizine İlişkin Kanun", takma: ["faiz kanunu", "kanuni faiz ve temerrüt faizine ilişkin kanun"] },
  "2429": { ad: "Ulusal Bayram ve Genel Tatiller Hakkında Kanun", takma: ["ulusal bayram ve genel tatiller hakkında kanun"] },
  "5510": { ad: "Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu", takma: ["ssgssk", "sgk kanunu", "sosyal sigortalar ve genel sağlık sigortası kanunu", "sosyal sigortalar kanunu"] },
  "4447": { ad: "İşsizlik Sigortası Kanunu", takma: ["işsizlik sigortası kanunu"] },
};

export type AtifDurum = "DOGRU" | "MULGA" | "YOK" | "KAPSAM";

export interface Atif {
  ham: string;
  tur: "madde" | "karar";
  kimlik: string | null;
  durum: AtifDurum;
  aciklama: string;
}

function tl(s: string): string {
  return s.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
}

/** Regex-escaped alias alternation, longest first so "tüketici kanunu" beats "tk". */
const TAKMA_LISTESI: Array<{ no: string; takma: string }> = Object.entries(KANUN_TAKMA_ADLARI)
  .flatMap(([no, v]) => v.takma.map((t) => ({ no, takma: t })))
  .sort((a, b) => b.takma.length - a.takma.length);

const kacir = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TAKMA_RE = TAKMA_LISTESI.map((t) => kacir(t.takma)).join("|");

// One statute mention: an alias, "6502 sayılı (…) Kanun", or "aynı Kanun".
const KANUN_KALIP = `(?<kanun>(?<sayi>\\d{3,4})\\s*sayılı(?:\\s+[^\\d,;.()]{0,80}?)?\\s*(?:kanun|anayasa)\\w*|(?<takma>${TAKMA_RE})(?=[\\s'’.,;:)]|$)\\S*|(?<ayni>aynı\\s+kanun)\\w*)`;
// Article after the statute: "m. 11", "md. 11/2", "11. madde", "11 inci maddesi", "madde 11".
const MADDE_ONCE = `(?:m\\.?|md\\.?|mad\\.?|madde(?:si)?)\\s*(?<no1>\\d+(?:/[a-zçğıöşü])?[a-z]?)(?:\\s*/\\s*(?<f1>\\d+))?`;
const MADDE_SONRA = `(?<no2>\\d+[a-z]?)\\s*(?:\\.|['’]?\\s*(?:inci|ıncı|nci|ncı|üncü|uncu|ncü|ncu))?\\s*madde\\w*(?:\\s*(?<f2>\\d+)\\s*(?:\\.|['’]?\\s*\\w*)\\s*fıkra\\w*)?`;

const MADDE_RE = new RegExp(`${KANUN_KALIP}[\\s,'’]*(?:${MADDE_ONCE}|${MADDE_SONRA})`, "giu");
// A bare article that follows a statute mention in the same text: "…; m. 12 ise…"
const YALIN_MADDE_RE = /(?<![\p{L}\d])(?:m\.|md\.)\s*(\d+[a-z]?)(?:\s*\/\s*(\d+))?/giu;
// Court decision: "<court> E. 2021/123, K. 2022/456" in either order of E/K.
const KARAR_RE = /((?:yargıtay\s+)?(?:\d+\.\s*(?:hukuk|ceza)\s*dairesi|\d+\.\s*hd|hukuk\s+genel\s+kurulu|hgk|[a-zçğıöşü]+\s+bölge\s+adliye\s+mahkemesi\s+\d+\.\s*hukuk\s+dairesi)[^\n;]{0,40}?(?:e\.?\s*)?(\d{4})\s*\/\s*(\d+)\s*(?:e\.?|esas)[\s,]*(?:k\.?\s*)?(\d{4})\s*\/\s*(\d+)\s*(?:k\.?|karar)?)/giu;

function fikraSayisi(m: MaddeKaydi): number {
  let enBuyuk = 0;
  for (const x of m.metin.matchAll(/(?:^|\s)\((\d{1,2})\)\s/g)) enBuyuk = Math.max(enBuyuk, Number(x[1]));
  return enBuyuk;
}

function maddeKontrol(corpus: CorpusPort, kanun: string, no: string, fikra: string | undefined, ham: string): Atif {
  if (!KANUN_TAKMA_ADLARI[kanun]) {
    return { ham, tur: "madde", kimlik: `m:${kanun}/${no}`, durum: "KAPSAM", aciklama: `${kanun} sayılı kanun korpusta yok; doğrulanamadı` };
  }
  const id = `m:${kanun}/${no.toUpperCase().replace(/^(\d+)([A-Z])$/, "$1$2")}`;
  const m = corpus.maddeGetir(id) ?? corpus.maddeGetir(`m:${kanun}/${no}`);
  if (!m) {
    const nos = corpus.maddeNumaralari?.(kanun) ?? [];
    const sayisal = nos.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
    const son = sayisal.length ? Math.max(...sayisal) : null;
    return { ham, tur: "madde", kimlik: id, durum: "YOK", aciklama: son ? `${kanun}'de böyle madde yok (son madde ${son})` : `${kanun}'de böyle madde yok` };
  }
  if (/^\s*\(\s*mülga/i.test(tl(m.metin))) {
    return { ham, tur: "madde", kimlik: m.id, durum: "MULGA", aciklama: `madde yürürlükten kalkmış: ${m.metin.slice(0, 60)}` };
  }
  if (fikra) {
    const n = fikraSayisi(m);
    if (n > 0 && Number(fikra) > n) {
      return { ham, tur: "madde", kimlik: `${m.id}/${fikra}`, durum: "YOK", aciklama: `${m.id} ${n} fıkralı; ${fikra}. fıkra yok` };
    }
  }
  return { ham, tur: "madde", kimlik: m.id, durum: "DOGRU", aciklama: `${m.baslik ?? ""} | ${m.kaynak_url}`.trim() };
}

function bamSlug(sehir: string): string {
  const s = tl(sehir).replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/[^a-z]/g, "");
  return s.slice(0, 3);
}

/** Candidate corpus ids for one decision citation (Yargıtay, HGK, BAM). */
export function kararAdaylari(ham: string): string[] {
  const s = tl(ham.replace(/\s+/g, " "));
  const esas = /(\d{4})\s*\/\s*(\d+)\s*(?:e\b|e\.|esas)/.exec(s) ?? /e\.?\s*(\d{4})\s*\/\s*(\d+)/.exec(s);
  const karar = /(\d{4})\s*\/\s*(\d+)\s*(?:k\b|k\.|karar)/.exec(s) ?? /k\.?\s*(\d{4})\s*\/\s*(\d+)/.exec(s);
  if (!esas || !karar) return [];
  const son = `${esas[1]}-${esas[2]}-${karar[1]}-${karar[2]}`;
  const bam = /([a-zçğıöşü]+)\s+bölge\s+adliye\s+mahkemesi\s+(\d+)\.\s*hukuk/.exec(s);
  if (bam) return [`k:bam-${bamSlug(bam[1]!)}-bam-${bam[2]}hd-${son}`];
  if (/hukuk\s+genel\s+kurulu|\bhgk\b/.test(s)) return [`k:ygt-hgk-${son}`];
  const d = /(\d+)\.\s*(hukuk|ceza|hd)/.exec(s);
  if (!d) return [];
  const tur = d[2] === "ceza" ? "cd" : "hd";
  return [`k:ygt-${d[1]}${tur}-${son}`];
}

export function atiflariCikar(metin: string, corpus: CorpusPort): Atif[] {
  const out: Atif[] = [];
  const kapsananAraliklar: Array<[number, number]> = [];
  const kanunAnlari: Array<{ i: number; no: string }> = [];
  let sonKanun: string | null = null;

  const kanunNo = (g: Record<string, string | undefined>): string | null => {
    if (g.sayi) return g.sayi;
    if (g.takma) {
      const t = tl(g.takma);
      return TAKMA_LISTESI.find((x) => x.takma === t)?.no ?? null;
    }
    if (g.ayni) return sonKanun;
    return null;
  };

  for (const m of metin.matchAll(MADDE_RE)) {
    const g = (m.groups ?? {}) as Record<string, string | undefined>;
    const kanun = kanunNo(g);
    const no = g.no1 ?? g.no2;
    if (!kanun || !no) continue;
    sonKanun = kanun;
    kanunAnlari.push({ i: m.index!, no: kanun });
    kapsananAraliklar.push([m.index!, m.index! + m[0].length]);
    out.push(maddeKontrol(corpus, kanun, tl(no), g.f1 ?? g.f2, m[0].trim()));
  }

  // Bare "m. 12" after a statute was mentioned: resolve to the last statute.
  if (kanunAnlari.length) {
    for (const m of metin.matchAll(YALIN_MADDE_RE)) {
      const i = m.index!;
      if (kapsananAraliklar.some(([a, b]) => i >= a && i < b)) continue;
      let aktif: string | null = null;
      for (const k of kanunAnlari) if (k.i < i) aktif = k.no;
      if (!aktif) continue;
      out.push(maddeKontrol(corpus, aktif, tl(m[1]!), m[2], `${m[0].trim()} (→ ${aktif})`));
    }
  }

  for (const m of metin.matchAll(KARAR_RE)) {
    const ham = m[0].trim();
    const adaylar = kararAdaylari(ham);
    if (adaylar.length === 0) continue;
    let bulunan = null;
    for (const a of adaylar) {
      bulunan = corpus.kararGetir(a);
      if (bulunan) break;
    }
    out.push(
      bulunan
        ? { ham, tur: "karar", kimlik: bulunan.karar_id, durum: "DOGRU", aciklama: `${bulunan.daire} | ${bulunan.tarih} | ${bulunan.sonuc ?? ""} | ${bulunan.kaynak_url}` }
        : { ham, tur: "karar", kimlik: adaylar[0] ?? null, durum: "KAPSAM", aciklama: "korpusta yok; gerçek olabilir ama doğrulanamadı, resmî arama ile teyit edin" },
    );
  }
  return out;
}

const ISARET: Record<AtifDurum, string> = { DOGRU: "✓ DOĞRU", MULGA: "⚠ MÜLGA", YOK: "✗ YOK", KAPSAM: "? KAPSAM DIŞI" };

export function atifRaporu(atiflar: Atif[]): string {
  if (atiflar.length === 0) {
    return "ATIF YOK metinde tanınan kanun maddesi veya karar künyesi bulunamadı. Örnek biçimler: 'TKHK m.11', '6502 sayılı Kanunun 12. maddesi', '3. Hukuk Dairesi 2021/1234 E. 2022/567 K.'";
  }
  const say = (d: AtifDurum) => atiflar.filter((a) => a.durum === d).length;
  const satirlar = atiflar.map((a) => `${ISARET[a.durum]} ${a.kimlik ?? "-"} | "${a.ham}" | ${a.aciklama}`);
  return [
    `ATIF DENETİMİ ${atiflar.length} atıf: ${say("DOGRU")} doğru, ${say("MULGA")} mülga, ${say("YOK")} yok, ${say("KAPSAM")} kapsam dışı`,
    ...satirlar,
    "NOT Varlık denetimidir: maddenin/kararın içeriğinin doğru aktarıldığını kontrol etmez. İçerik için derinles ile metni açın.",
  ].join("\n");
}
