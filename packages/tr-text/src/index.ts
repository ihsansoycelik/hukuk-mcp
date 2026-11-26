/**
 * @hukuk/tr-text — Turkish text normalisation, stemming and similarity.
 *
 * Single algorithm shared by the build pipeline (Python port in
 * pipeline/trtext_py.py) and the query path. A parity test over 5.000 words
 * guarantees the index and the query fold to the same keys.
 *
 * Design notes
 *  - Turkish casing is locale sensitive: I -> ı, İ -> i. Never use
 *    toLowerCase() alone.
 *  - The FTS key space is ASCII-folded so SQLite's unicode61 tokenizer and the
 *    query agree exactly, regardless of diacritic input.
 *  - The stemmer is deliberately conservative (min stem 3, longest suffix first,
 *    max 2 passes). Over-stemming hurts precision more than under-stemming
 *    hurts recall in a legal corpus.
 */

const TR_LOWER: Record<string, string> = {
  I: "ı",
  İ: "i",
  Ş: "ş",
  Ğ: "ğ",
  Ü: "ü",
  Ö: "ö",
  Ç: "ç",
};

const FOLD: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
  ê: "e",
  ô: "o",
  ä: "a",
  ë: "e",
  ï: "i",
  ñ: "n",
};

/** Locale-correct Turkish lowercase. */
export function trLower(input: string): string {
  let out = "";
  for (const ch of input) out += TR_LOWER[ch] ?? ch.toLowerCase();
  return out;
}

/** Strip diacritics so the FTS key space is ASCII. */
export function trFold(input: string): string {
  let out = "";
  for (const ch of input) out += FOLD[ch] ?? ch;
  return out;
}

/** Full normalisation: NFKC, Turkish lowercasing, diacritic folding, punctuation cleanup. */
export function normalize(input: string): string {
  let s = input.normalize("NFKC").replace(/\s+/g, " ").trim();
  s = trLower(s);
  s = s.replace(/[’‘`´]/g, "'");
  // keep letters, digits, apostrophe and single spaces
  s = s.replace(/[^\p{L}\p{N}'\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Folding applied after normalisation, used for index/query keys. */
export function foldNormalized(input: string): string {
  return trFold(normalize(input));
}

const NOUN_SUFFIXES = [
  "lerimizden", "larımızdan", "lerimizin", "larımızın", "lerimizle", "larımızla",
  "lerinizden", "larınızdan", "lerinden", "larından", "lerine", "larına",
  "lerini", "larını", "lerinin", "larının", "lerinin", "larının",
  "mizden", "mızdan", "nizden", "nızdan", "mizde", "mızda", "nizde", "nızda",
  "lerden", "lardan", "lerle", "larla", "lerin", "ların", "leri", "ları",
  "lerde", "larda", "lere", "lara", "ler", "lar",
  "nın", "nin", "nun", "nün", "dan", "den", "tan", "ten",
  "dır", "dir", "dur", "dür", "tır", "tir", "tur", "tür",
  "nda", "nde", "ndan", "nden", "nın", "nin",
  "yla", "yle", "yı", "yi", "yu", "yü", "ya", "ye",
  "da", "de", "ta", "te", "ın", "in", "un", "ün",
  "lık", "lik", "luk", "lük", "cı", "ci", "cu", "cü", "çı", "çi", "çu", "çü",
  "sı", "si", "su", "sü", "ı", "i", "u", "ü", "a", "e",
  "im", "ım", "um", "üm", "ın", "in", "un", "ün",
];

const VERB_STRONG = [
  "maktadır", "mektedir", "mamıştır", "memiştir", "dığından", "diğinden",
  "acağından", "eceğinden", "masından", "mesinden", "mıştır", "miştir",
  "muştur", "müştür", "yacak", "yecek", "acak", "ecek", "malı", "meli",
  "mış", "miş", "muş", "müş", "yor", "mak", "mek",
];

const SORTED_NOUN = [...NOUN_SUFFIXES].sort((a, b) => b.length - a.length);
const SORTED_VERB_STRONG = [...VERB_STRONG].sort((a, b) => b.length - a.length);

/**
 * Strip the longest applicable suffix, with guards that keep short roots and
 * vowel-final roots intact:
 *   - 1-letter suffix: only on 6+ letter words, leaving a 4+ letter stem
 *     ("şımanı" -> "sanziman", but "arıza" stays "ariza").
 *   - longer suffix: leave a 3+ letter stem ("kartı" -> "kart", "iadesi" -> "iade").
 */
function stripWith(word: string, inventory: readonly string[]): string | null {
  for (const suf of inventory) {
    if (!word.endsWith(suf)) continue;
    const rest = word.length - suf.length;
    if (suf.length === 1) {
      if (word.length >= 6 && rest >= 4) return word.slice(0, rest);
      continue;
    }
    if (rest >= 3) return word.slice(0, rest);
  }
  return null;
}

/**
 * Conservative Turkish stemmer over ASCII-folded input.
 * Noun morphology first, then strong verb morphology, then guarded short past
 * tense. Two passes cover stacked suffixes ("aracımdaki" -> "arac").
 *
 * The invariant that matters for retrieval is consistency, not linguistic
 * purity: morphological variants of one lemma must collapse to one key
 * ("iade" and "iadesi" -> "iade").
 */
export function stemFolded(word: string, permitVerb = true): string {
  if (word.length <= 3) return word;
  let w = word;
  for (let pass = 0; pass < 2; pass++) {
    const noun = stripWith(w, SORTED_NOUN);
    if (noun) {
      w = noun;
      continue;
    }
    if (!permitVerb || w.length < 5) break;
    const strong = stripWith(w, SORTED_VERB_STRONG);
    if (strong) {
      w = strong;
      continue;
    }
    break;
  }
  return w.length >= 2 ? w : word;
}

/** Full analysis: display tokens plus FTS key. */
export interface Analyzed {
  /** space separated FTS keys (stopwords removed) */
  kok: string;
  /** folded, stemmed tokens in order */
  tokens: string[];
  /** original normalised tokens in order */
  words: string[];
}

const STOPWORDS = new Set([
  "ve", "veya", "ile", "bir", "bu", "su", "o", "da", "de", "ki", "mi", "mu",
  "ne", "icin", "gibi", "kadar", "daha", "cok", "az", "en", "her", "hem",
  "ama", "fakat", "ancak", "lakin", "ise", "olan", "olarak", "oldu", "olur",
  "var", "yok", "dir", "dır", "midir", "mudur", "mi", "mu", "ya", "ye",
  "ben", "sen", "biz", "siz", "onlar", "benim", "senin", "onun",
  "hangi", "nasil", "neden", "niye", "nerede", "kim", "acaba",
  "tum", "bazi", "bircok", "hic", "hep", "ayni", "baska",
  // interrogative / copula particles that survive morphology
  "miyim", "misin", "miyiz", "misiniz", "miydi", "mis", "miyim",
  "mıyım", "mısın", "mıyız", "mısınız", "mıydı", "mu", "mü",
  "mudur", "müdür", "mıdır", "midir", "mudur", "muyum", "müyüm",
  "birsey", "seyler", "sey", "bile", "sadece", "yalniz", "uzere",
]);

/** Tokens used for the FTS key: folded + stemmed, stopwords dropped. */
export function analyze(input: string): Analyzed {
  const norm = normalize(input);
  const words = norm.split(" ").filter(Boolean);
  const tokens: string[] = [];
  for (const w of words) {
    const folded = trFold(w).replace(/^'+|'+$/g, "");
    if (!folded) continue;
    if (STOPWORDS.has(folded)) continue;
    if (/^\d+$/.test(folded)) {
      tokens.push(folded);
      continue;
    }
    if (folded.length < 2) continue;
    tokens.push(stemFolded(folded));
  }
  return { kok: tokens.join(" "), tokens, words };
}

/** Convenience: index/query key for arbitrary text. */
export function ftsKey(input: string): string {
  return analyze(input).kok;
}

/* ------------------------------------------------------------------ */
/* Character n-gram similarity (deterministic semantic-ish matching)   */
/* ------------------------------------------------------------------ */

export type Vec = Map<string, number>;

function ngrams(word: string, n = 3): string[] {
  const padded = `^${word}$`;
  const out: string[] = [];
  for (let i = 0; i <= padded.length - n; i++) out.push(padded.slice(i, i + n));
  return out;
}

/** Build a normalised char n-gram vector from text. */
export function ngramVector(input: string, n = 3): Vec {
  const { words } = analyze(input);
  const counts = new Map<string, number>();
  for (const w of words) {
    for (const g of ngrams(w, n)) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let norm = 0;
  for (const v of counts.values()) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  const out: Vec = new Map();
  for (const [k, v] of counts) out.set(k, v / norm);
  return out;
}

export function cosine(a: Vec, b: Vec): number {
  let dot = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of small) {
    const w = large.get(k);
    if (w !== undefined) dot += v * w;
  }
  return dot;
}

/** Serialise a vector compactly for storing in SQLite (JSON object). */
export function vectorToJSON(v: Vec): string {
  return JSON.stringify(Object.fromEntries(v));
}

export function vectorFromJSON(json: string): Vec {
  return new Map(Object.entries(JSON.parse(json) as Record<string, number>));
}
