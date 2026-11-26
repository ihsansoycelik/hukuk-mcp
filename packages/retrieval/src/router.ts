/**
 * @hukuk/retrieval — ontology triage (routing).
 *
 * Deterministic, dependency-free, no network: a Turkish lay description is
 * matched against node text with character 3-gram cosine plus trigger-phrase
 * evidence. Triggers are weighted by IDF over the ontology itself, so a generic
 * word ("iade", "ürün") cannot outvote a distinctive one ("otel", "şanzıman").
 * Per-trigger evidence is combined with noisy-OR so several medium signals beat
 * one generic signal.
 *
 * Raw score in [0,1]:
 *   0.55 * cosine(queryVec, nodeVec)
 * + 0.30 * triggerMatch (IDF-weighted noisy-OR)
 * + 0.15 * exampleMatch (best cosine against a single example query)
 *
 * The reported `skor` is the raw score through a logistic calibration so that
 * thresholds have a stable meaning across ontology edits. `belirsizMi` is the
 * ambiguity protocol used by the server: empty, low-confidence, or narrow
 * margin => ask the user to disambiguate instead of guessing.
 */
import { analyze, cosine, ngramVector, vectorFromJSON, type Vec } from "@hukuk/tr-text";
import type { DugumKaydi } from "@hukuk/schema";
import type { DugumAday, YonlendirmeSonucu } from "./types.ts";
import { YONLENDIRME_AGIRLIKLARI, YONLENDIRME_ESIKLERI } from "./config.ts";

interface HazirTetik {
  tokens: string[];
  /** IDF weight per token, same order as tokens. */
  agirliklar: number[];
  toplamAgirlik: number;
}

interface HazirDugum {
  kayit: DugumKaydi;
  vektor: Vec;
  /** parent branch vector; a leaf inherits generic branch vocabulary */
  dalVektor: Vec | null;
  tetikler: HazirTetik[];
  ornekVektorler: Vec[];
}

/**
 * Calibration: raw blend in [0,1] scaled by ontology-vocabulary coverage.
 *
 * Deliberately linear (not logistic) so the score does not saturate at 1.00:
 * a clear match lands around 0.55-0.85, and two genuinely close nodes keep a
 * readable absolute margin for the server's ambiguity test.
 */
export function kalibreEt(ham: number, kapsam = 1): number {
  const kap = clamp01(kapsam);
  return round(clamp01(ham) * Math.pow(kap, YONLENDIRME_AGIRLIKLARI.kapsamUs));
}

function round(x: number): number {
  return Math.round(x * 1_000_000) / 1_000_000;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Node text used for the fallback vector (matches the pipeline definition). */
export function dugumVektorMetni(k: DugumKaydi): string {
  return [k.ad, k.aciklama, ...k.tetikleyiciler, ...k.ornek_sorgular].join(" ");
}

/**
 * `alan` is either a branch id (`t/ayipli-mal`, `s/saglik`) or a short alias
 * (`ayipli-mal`, `sgk`). The `s/` space is SGK (social security): the `sgk`,
 * `s`, `sosyal` and `sosyal-guvenlik` aliases resolve to it, everything else
 * defaults to the consumer (`t/`) space.
 */
export function alanOneki(alan: string | undefined): string | null {
  if (!alan) return null;
  const s = alan.trim();
  if (!s) return null;
  if (s === "sgk" || s === "s" || s === "sosyal" || s === "sosyal-guvenlik" || s === "s/") return "s/";
  if (s.startsWith("s/")) return s.replace(/\/+$/, "") + "/";
  if (s === "t" || s === "tuketici" || s === "tüketici") return "t/";
  if (s.startsWith("t/")) return s.replace(/\/+$/, "") + "/";
  return "t/" + s.replace(/\/+$/, "") + "/";
}

export class DugumYonlendirici {
  private dugumler: HazirDugum[] = [];
  private idf = new Map<string, number>();
  private sozluk = new Set<string>();
  private maxIdf = 1;

  constructor(dugumler: Array<DugumKaydi & { vektor?: string | null }>) {
    this.idfHesapla(dugumler);
    this.dugumler = dugumler.map((k) => {
      const kayit: DugumKaydi = {
        id: k.id,
        ust_id: k.ust_id,
        ad: k.ad,
        aciklama: k.aciklama ?? "",
        tetikleyiciler: k.tetikleyiciler ?? [],
        ornek_sorgular: k.ornek_sorgular ?? [],
        kurallar: k.kurallar ?? [],
        maddeler: k.maddeler ?? [],
      };
      let vektor: Vec;
      if (k.vektor) {
        try {
          vektor = vectorFromJSON(k.vektor);
        } catch {
          vektor = ngramVector(dugumVektorMetni(kayit));
        }
      } else {
        vektor = ngramVector(dugumVektorMetni(kayit));
      }
      return {
        kayit,
        vektor,
        dalVektor: null,
        tetikler: kayit.tetikleyiciler.map((t) => this.tetikHazirla(t)),
        ornekVektorler: kayit.ornek_sorgular.map((o) => ngramVector(o)),
      };
    });

    // Attach parent-branch vectors after the full list exists.
    const byId = new Map(this.dugumler.map((d) => [d.kayit.id, d]));
    for (const d of this.dugumler) {
      const ust = d.kayit.ust_id ? byId.get(d.kayit.ust_id) : undefined;
      d.dalVektor = ust ? ust.vektor : null;
      // Branch vocabulary is evidence for every leaf under it: a generic
      // "ayıplı mal" query must not fall through to a sibling branch that
      // happens to contain the word "iade".
      if (ust) d.tetikler.push(this.tetikHazirla(ust.kayit.ad));
    }
  }

  /**
   * IDF over every analysed token in the ontology (name, description, triggers,
   * examples). Tokens that appear in many nodes carry little routing signal.
   */
  private idfHesapla(dugumler: DugumKaydi[]): void {
    const df = new Map<string, number>();
    for (const d of dugumler) {
      const gorulen = new Set<string>();
      for (const metin of [d.ad, d.aciklama ?? "", ...(d.tetikleyiciler ?? []), ...(d.ornek_sorgular ?? [])]) {
        for (const t of analyze(metin).tokens) gorulen.add(t);
      }
      for (const t of gorulen) df.set(t, (df.get(t) ?? 0) + 1);
    }
    const n = Math.max(dugumler.length, 1);
    this.maxIdf = Math.log((n + 1) / 0.5);
    for (const [t, c] of df) {
      this.idf.set(t, Math.log((n + 1) / (c + 0.5)));
      this.sozluk.add(t);
    }
  }

  /**
   * Fraction of the query's IDF mass that the ontology vocabulary recognises.
   * An out-of-domain question is full of words no consumer-law node has ever
   * used ("vergi", "boşanma", "gümrük"), so coverage collapses even when one
   * generic word ("itiraz", "dava") produces a spuriously high trigram cosine.
   */
  private kapsamHesapla(metin: string): { kapsam: number; tokenSayisi: number } {
    const tokens = [...new Set(analyze(metin).tokens)];
    if (tokens.length === 0) return { kapsam: 0, tokenSayisi: 0 };
    let toplam = 0;
    let bilinmeyen = 0;
    for (const t of tokens) {
      const w = this.tokenIdf(t);
      toplam += w;
      if (!this.sozluk.has(t)) bilinmeyen += w;
    }
    return { kapsam: toplam > 0 ? 1 - bilinmeyen / toplam : 0, tokenSayisi: tokens.length };
  }

  private tokenIdf(t: string): number {
    return this.idf.get(t) ?? this.maxIdf;
  }

  private tetikHazirla(tetik: string): HazirTetik {
    const tokens = analyze(tetik).tokens;
    const agirliklar = tokens.map((t) => this.tokenIdf(t));
    const toplamAgirlik = agirliklar.reduce((a, b) => a + b, 0);
    return { tokens, agirliklar, toplamAgirlik };
  }

  private tetikSkoru(queryTokens: Set<string>, dugum: HazirDugum): number {
    let kalan = 1; // product of (1 - s_i)
    for (const t of dugum.tetikler) {
      if (t.tokens.length === 0) continue;
      let eslesen = 0;
      for (let i = 0; i < t.tokens.length; i++) {
        if (queryTokens.has(t.tokens[i]!)) eslesen += t.agirliklar[i]!;
      }
      if (eslesen === 0 || t.toplamAgirlik === 0) continue;
      const kapsam = eslesen / t.toplamAgirlik;
      const ozgulluk = clamp01(t.toplamAgirlik / t.tokens.length / this.maxIdf);
      let s = kapsam * ozgulluk;
      if (t.tokens.length === 1) s *= YONLENDIRME_AGIRLIKLARI.tekTokenTetikCarpani;
      kalan *= 1 - s;
    }
    return clamp01(1 - kalan);
  }

  private hamSkor(metin: string): Map<string, number> {
    const queryVec = ngramVector(metin);
    const queryTokens = new Set(analyze(metin).tokens);
    const out = new Map<string, number>();
    const { kosinusAgirlik, tetikAgirlik, ornekAgirlik } = YONLENDIRME_AGIRLIKLARI;
    for (const d of this.dugumler) {
      let cos = cosine(queryVec, d.vektor);
      if (d.dalVektor) {
        const dal = cosine(queryVec, d.dalVektor) * YONLENDIRME_AGIRLIKLARI.dalKosinusCarpani;
        if (dal > cos) cos = dal;
      }
      let ornek = 0;
      for (const v of d.ornekVektorler) {
        const c = cosine(queryVec, v);
        if (c > ornek) ornek = c;
      }
      const tetik = this.tetikSkoru(queryTokens, d);
      out.set(d.kayit.id, kosinusAgirlik * cos + tetikAgirlik * tetik + ornekAgirlik * ornek);
    }
    return out;
  }

  private adaylar(metin: string, alan: string | undefined, limit: number): DugumAday[] {
    const { kapsam, tokenSayisi } = this.kapsamHesapla(metin);
    if (tokenSayisi === 0) return [];
    const prefix = alanOneki(alan);
    const ham = this.hamSkor(metin);
    const byId = new Map(this.dugumler.map((d) => [d.kayit.id, d]));
    const secili: DugumAday[] = [];
    for (const [id, skor] of ham) {
      if (prefix && !id.startsWith(prefix)) continue;
      const d = byId.get(id)!;
      secili.push({
        id,
        ad: d.kayit.ad,
        skor: kalibreEt(skor, kapsam),
        aciklama: d.kayit.aciklama,
        ornek: d.kayit.ornek_sorgular.slice(0, 2),
      });
    }
    secili.sort((a, b) => (b.skor - a.skor) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return secili.slice(0, Math.max(1, limit));
  }

  ara(metin: string, alan?: string, limit?: number): DugumAday[] {
    return this.adaylar(metin, alan, limit ?? YONLENDIRME_AGIRLIKLARI.varsayilanLimit);
  }

  detay(metin: string, alan?: string, limit?: number): YonlendirmeSonucu {
    const adaylar = this.adaylar(metin, alan, limit ?? YONLENDIRME_AGIRLIKLARI.varsayilanLimit);
    const karar = belirsizMi(adaylar);
    return { adaylar, guven: dugumGuven(adaylar), belirsiz: karar.belirsiz, neden: karar.neden };
  }

  get boyut(): number {
    return this.dugumler.length;
  }
}

/**
 * Normalised confidence in [0,1]: top score scaled down when the runner-up is
 * close. This is what the server surfaces as "ne kadar eminim".
 */
export function dugumGuven(adaylar: DugumAday[]): number {
  if (adaylar.length === 0) return 0;
  const top = adaylar[0]!.skor;
  const ikinci = adaylar[1]?.skor ?? 0;
  const fark = Math.max(0, top - ikinci);
  const esik = Math.max(YONLENDIRME_ESIKLERI.minFark, 1e-9);
  const ayrim = Math.min(1, fark / esik);
  return round(top * (0.5 + 0.5 * ayrim));
}

/** Ambiguity protocol: no candidates, low top score, or too-close top two. */
export function belirsizMi(adaylar: DugumAday[]): {
  belirsiz: boolean;
  neden: "bos" | "esik_alti" | "dar_fark" | null;
} {
  if (adaylar.length === 0) return { belirsiz: true, neden: "bos" };
  const top = adaylar[0]!.skor;
  if (top < YONLENDIRME_ESIKLERI.minSkor) return { belirsiz: true, neden: "esik_alti" };
  const ikinci = adaylar[1]?.skor ?? 0;
  if (top - ikinci < YONLENDIRME_ESIKLERI.minFark) return { belirsiz: true, neden: "dar_fark" };
  return { belirsiz: false, neden: null };
}
