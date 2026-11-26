/**
 * FTS5 query construction.
 *
 * User input is never spliced into MATCH directly. We first run it through
 * @hukuk/tr-text (locale-correct folding + stemming, punctuation removed), then
 * quote every token as an FTS5 string literal:
 *
 *   - double quotes inside a token are doubled per the FTS5 grammar
 *   - `*`, `-`, `:`, `^`, `NEAR`, `OR`, `AND`, `NOT` inside quotes are literal
 *     text, not operators, so a user typing `OR` gets a term search, not a
 *     boolean union
 *
 * The strict query joins tokens with AND. If it yields nothing we retry with OR
 * and mark the result `gevsek` (loose). That fallback is what saves real,
 * sloppily phrased user queries.
 */
import { ftsKey } from "@hukuk/tr-text";

/** Quote one token as an FTS5 string literal. */
export function guvenliFtsToken(token: string): string {
  return `"${token.replace(/"/g, '""')}"`;
}

/**
 * Tokens for the MATCH expression: folded, stemmed, de-duplicated, in order.
 * Apostrophes left over by suffix stripping are trimmed because the unicode61
 * tokenizer treats them as separators anyway.
 */
export function ftsTokenleri(sorgu: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ftsKey(sorgu).split(" ")) {
    const t = raw.replace(/^'+|'+$/g, "").replace(/^["*\-]+|["*\-]+$/g, "");
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Strict AND query, or null when the query has no indexable tokens. */
export function ftsAndSorgusu(sorgu: string): string | null {
  const t = ftsTokenleri(sorgu);
  return t.length ? t.map(guvenliFtsToken).join(" AND ") : null;
}

/** Loose OR query, or null when the query has no indexable tokens. */
export function ftsOrSorgusu(sorgu: string): string | null {
  const t = ftsTokenleri(sorgu);
  return t.length ? t.map(guvenliFtsToken).join(" OR ") : null;
}

/** Convenience pair used by Corpus.ara. */
export function ftsSorgulari(sorgu: string): { and: string | null; or: string | null; tokens: string[] } {
  const tokens = ftsTokenleri(sorgu);
  if (tokens.length === 0) return { and: null, or: null, tokens };
  const quoted = tokens.map(guvenliFtsToken);
  return {
    and: quoted.join(" AND "),
    or: tokens.length > 1 ? quoted.join(" OR ") : quoted[0] ?? null,
    tokens,
  };
}
