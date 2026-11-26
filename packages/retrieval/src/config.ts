/**
 * @hukuk/retrieval — tuning knobs.
 *
 * Everything that changes ranking lives here so a reviewer can tune the system
 * without touching scoring code. There are two independent groups:
 *
 *  - ARAMA_AYARLARI: decision search (BM25 / lexical / bindingness / recency)
 *  - YONLENDIRME_*:  ontology routing (trigram / trigger / example + thresholds)
 *
 * Weights are deliberately NOT frozen: eval sweeps mutate them in-process.
 */

/* ----------------------------- decision search ----------------------------- */

export interface AramaAyarlari {
  /** Weight of the min-max normalised BM25 component (0..1). */
  bm25Agirlik: number;
  /** Weight of the lexical-overlap component (0..1). */
  lexAgirlik: number;
  /** Floor of the min-max BM25 map: the weakest candidate must not lose all BM25 credit. */
  bm25Taban: number;
  /** How strongly the bindingness hierarchy (karar.agirlik, 0-100) multiplies the score. */
  baglilikEtkisi: number;
  /** How strongly recency multiplies the score. */
  tazelikEtkisi: number;
  /** Age (years) at which the recency multiplier reaches zero. */
  tazelikPencereYil: number;
  /** Multiplier applied to scores from an AND-subset probe. */
  gevsekCarpan: number;
  /** Multiplier applied to scores from the final OR-everything fallback. */
  orCarpan: number;
  /** Boost when a decision's ontology node is the router's top candidate. */
  dugumUyumCarpani: number;
  /** Softer boost for the same branch but a sibling leaf. */
  dalUyumCarpani: number;
  /** Per-outcome score multipliers; ret and bozma are weaker representatives. */
  sonucCarpanlari: Record<string, number>;
  /** Outcomes that can never be a representative result (still returned, flagged). */
  temsilciOlmayanSonuclar: string[];
  /** Safety cap on how many FTS candidates enter scoring (per query). */
  adayLimiti: number;
  /** How many of the rarest query tokens are used for subset probes. */
  nadirTokenLimiti: number;
  /** Subset sizes tried (largest first) before the full OR fallback. */
  altKumeBoyutlari: number[];
  /** Hard cap on relaxed probe queries per search. */
  enFazlaYedekSorgu: number;
  /** Continue union-ing probes until this many candidates are collected. */
  altKumeHedefi: number;
  /** Minimum probes before the candidate target can stop the loop. */
  enAzYedekSorgu: number;
  /** A probe returning this many rows is broad enough to stand alone. */
  genisSonda: number;
  /** Allow the AND -> OR fallback when the strict query finds nothing. */
  yedekOr: boolean;
  /** Include bozma (overturned) decisions when the caller did not ask for them. */
  bozmaVarsayilanDahil: boolean;
  /** Default result count when AraInput.limit is absent. */
  varsayilanLimit: number;
}

export const ARAMA_AYARLARI: AramaAyarlari = {
  bm25Agirlik: 0.5,
  lexAgirlik: 0.5,
  bm25Taban: 0.25,
  baglilikEtkisi: 0.35,
  tazelikEtkisi: 0.2,
  tazelikPencereYil: 25,
  gevsekCarpan: 0.85,
  orCarpan: 0.6,
  dugumUyumCarpani: 1.25,
  dalUyumCarpani: 1.1,
  sonucCarpanlari: { ret: 0.6, bozma: 0.95 },
  temsilciOlmayanSonuclar: ["bozma", "ret"],
  adayLimiti: 200,
  nadirTokenLimiti: 5,
  altKumeBoyutlari: [3, 2],
  enFazlaYedekSorgu: 24,
  altKumeHedefi: 150,
  enAzYedekSorgu: 3,
  genisSonda: 100,
  yedekOr: true,
  bozmaVarsayilanDahil: false,
  varsayilanLimit: 5,
};

/* --------------------------- ontology routing ----------------------------- */

export interface YonlendirmeAgirliklari {
  /** cosine(queryVector, nodeVector) */
  kosinusAgirlik: number;
  /** trigger-phrase match (0..1) */
  tetikAgirlik: number;
  /** best cosine against the node's example queries */
  ornekAgirlik: number;
  /** how much a leaf inherits its parent branch's cosine (generic "ayıplı mal" queries) */
  dalKosinusCarpani: number;
  /** Multiplier applied to a single-token trigger match (generic-word guard). */
  tekTokenTetikCarpani: number;
  /** Default number of candidates returned by dugumAra. */
  varsayilanLimit: number;
  /**
   * Exponent applied to ontology-vocabulary coverage when calibrating the final
   * score. Unknown query words are evidence that the question may be outside
   * consumer law; coverage^0.75 keeps that signal without letting one unknown
   * word sink an otherwise clear match.
   */
  kapsamUs: number;
}

export const YONLENDIRME_AGIRLIKLARI: YonlendirmeAgirliklari = {
  kosinusAgirlik: 0.55,
  tetikAgirlik: 0.3,
  ornekAgirlik: 0.15,
  dalKosinusCarpani: 0.9,
  tekTokenTetikCarpani: 0.85,
  varsayilanLimit: 5,
  kapsamUs: 0.75,
};

export interface YonlendirmeEsikleri {
  /** Calibrated top score below this => belirsiz (out of domain / too vague). */
  minSkor: number;
  /** Calibrated gap between #1 and #2 below this => belirsiz (genuinely ambiguous). */
  minFark: number;
}

export const YONLENDIRME_ESIKLERI: YonlendirmeEsikleri = {
  minSkor: 0.3,
  minFark: 0.02,
};

/** Hard floor after scoring. Below this, an honest empty result is better. */
export const ARAMA_ESIKLERI = {
  /** Hybrid score floor (after all multipliers). */
  minSkor: 0.3,
  /** A strict/relaxed result must cover at least this share of query tokens. */
  minLexKapsam: 0.34,
} as const;

/* ------------------------------ evaluation -------------------------------- */

/** Quality gates from the plan. eval/run.ts prints PASS/FAIL against these. */
export const KALITE_ESIKLERI = {
  yonlendirmeTop1: 0.85,
  yonlendirmeTop3: 0.97,
  geriCagirma5: 0.85,
  kaynakButunlugu: 1.0,
  gecikmeP95Ms: 400,
} as const;
