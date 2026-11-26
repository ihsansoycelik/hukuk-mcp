# @hukuk/retrieval — design, measurements, weaknesses

Read-only retrieval over the compiled SQLite corpus. No embeddings, no network,
no LLM in the query path. All Turkish folding/stemming is delegated to
`@hukuk/tr-text`; this package only composes it.

```
packages/retrieval/src/
  index.ts    public exports (Corpus + types + tuning configs)
  types.ts    SearchHit / DugumAday / MaddeKaydi / YonlendirmeSonucu
  config.ts   every ranking weight and threshold (single place)
  fts.ts      FTS5 query construction, escaping, AND/OR builders
  corpus.ts   Corpus: search, record lookup, ontology router owner
  router.ts   deterministic trigram + trigger router and ambiguity protocol
```

## 1. Decision search (`Corpus.ara`)

1. **Query key** — `ftsKey(user text)` → folded/stemmed tokens, de-duplicated.
   Every token is quoted as an FTS5 string literal (`"…"`, inner `"` doubled),
   so `*`, `-`, `:`, `^`, `NEAR`, `AND`, `OR`, `NOT` typed by a user are text,
   not operators.
2. **Hard filters in SQL before scoring** — `mahkeme`, `yil` (`substr(tarih,1,4)`),
   `sonuc`, `alan` (`dugum_id` prefix; `tuketici`/`t` means all `t/`).
3. **Candidate selection, cheapest first**
   - strict `AND` of all query tokens;
   - if empty: union of `AND` probes over the 5 rarest query tokens (IDF from
     `fts5vocab`), then 3- and 2-token combinations. A broad probe (>100 rows)
     stands alone; narrow probes keep probing;
   - if still empty: full `OR`, marked `gevsekTuru="or"`;
   - if scoring/coverage removes everything: one final `OR` rescue.
   `gevsek=true` on every relaxed result. OR results get `orCarpan` (0.6) and
   `temsilci_uygun=false`; AND-subset results get `gevsekCarpan` (0.85).
4. **Score**

   ```
   bm25raw = -bm25(karar_fts)                    // lower is better; invert
   bm25    = bm25Taban + (1-bm25Taban) * minmax(bm25raw)   // taban = 0.25
   lex     = matched query stems / query stems   // measured on karar_fts.kok
   base    = 0.5*bm25 + 0.5*lex
   skor    = base * gevsekCarpan * sonucCarpan * dugumCarpan
                  * (1 + 0.35*(agirlik/100)) * (1 + 0.2*tazelik)
   ```

   - `lex` uses the indexed full-text key, not `ozet_l0/l1` (real summaries are
     often truncated tails). Matching tolerates the 1–2 letter stem mismatches
     between query and index ("kurs" vs "kur") with a guarded same-prefix rule.
   - `tazelik = clamp(1 - age_years/25, 0, 1)`, year granularity (deterministic
     within a year).
   - `dugumCarpan`: 1.25 when the decision's `dugum_id` equals the router's top
     leaf, 1.10 for a sibling under the same branch, else 1.
   - `sonucCarpan`: `ret=0.6`, `bozma=0.95`; these are weaker representatives.
     `temsilciOlmayanSonuclar = ["bozma","ret"]` and all OR-only hits get
     `temsilci_uygun=false`. Bozma decisions are still returned (with the flag)
     so the server can cite them when useful; they are never representative.
   - **Hard floor** `ARAMA_ESIKLERI.minSkor = 0.30` plus
     `minLexKapsam = 0.34`. Below that the result is dropped: an empty list is
     better than a confident wrong answer.
5. **Tie-break** score desc → date desc → id asc. Limit is clamped to 1–10.

## 2. Ontology routing (`Corpus.dugumAra` / `dugumAraDetay`)

```
raw = 0.55*cosine(queryVec, nodeVec)
    + 0.30*triggerMatch
    + 0.15*exampleMatch
skor = raw * ontologyVocabularyCoverage^0.75       // linear, never saturates
```

- `nodeVec` = stored `dugum.vektor` when present, otherwise char-3gram vector of
  `ad + aciklama + tetikleyiciler + ornek_sorgular`.
- A leaf inherits `0.9 * cosine(query, parentBranchVec)` when that is larger, and
  the parent branch name is added as an extra trigger. This keeps a generic
  "ayıplı mal" query inside `t/ayipli-mal` instead of falling through to a node
  that merely contains "iade".
- `triggerMatch` is IDF-weighted (DF over the ontology itself), per-trigger
  `coverage * specificity`, combined with noisy-OR, so several medium signals
  beat one generic word. Single-token triggers are multiplied by 0.85.
- Vocabulary coverage = share of the query's IDF mass the ontology has ever
  used. Out-of-domain questions ("vergi", "boşanma", "gümrük") collapse to low
  coverage instead of matching "itiraz/dava" by trigram accident.
- `DugumAday` carries `id, ad, skor, aciklama, ornek` (max 2 examples), enough
  for the server's ~150-token disambiguation prompt.
- `dugumGuven` = top score scaled down when #1 and #2 are close.
- `belirsizMi` returns `bos` / `esik_alti` / `dar_fark` / null using
  `YONLENDIRME_ESIKLERI = { minSkor: 0.30, minFark: 0.02 }`.

## 3. Measured numbers

### Fixture (`eval/fixtures/test.db`: 178 synthetic decisions, 51 nodes)

`node eval/run.ts --set all --db eval/fixtures/test.db`

| metric | value |
| --- | --- |
| routing top-1 | **97.1%** (134/138) |
| routing top-3 | **99.3%** (137/138) |
| out-of-domain traps flagged belirsiz | 28/28 (100%) |
| positive rows unnecessarily belirsiz | 8.7% (12/138) |
| search Recall@5 | **98.3%** |
| search Precision@5 | 66.0% |
| search nDCG@10 / MRR | 0.954 / 0.956 |
| citation integrity | 100% |
| token p95 (10 hits, full summaries) | 2261 |
| latency p95 (routing+search calls) | 2.3 ms |

The fixture uses synthetic text co-designed with the queries; **98.3% is not
evidence about real Turkish case law**. It exists to exercise every code path.

### Real corpus snapshot (`data/build/hukuk.db`, 239 decisions, `v20261022.619817691`)

`node eval/run.ts --set all --db data/build/hukuk.db`
(search golden auto-switches to `eval/golden/search-real.jsonl`, 70 queries)

| metric | value |
| --- | --- |
| routing top-1 / top-3 | **97.1% / 99.3%** (same golden, same node set) |
| search Recall@5 | **50.1%** |
| search Precision@5 | **29.3%** |
| search nDCG@10 / MRR | 0.695 / 0.644 |
| empty-result rate | 0% |
| citation integrity | 100% |
| latency p95 | 14.5 ms |

**Honest context**

- Goldens are **mechanically labelled, pooled judgements**: ontology example
  queries; a decision is judged relevant when its full-text stem set covers
  ≥60% of known query stems and every "rare" stem (DF ≤ 20%); the judged set is
  capped at the 4 highest-coverage decisions. Other decisions are unjudged and
  counted non-relevant → Recall@5 is optimistic, Precision@5 conservative.
- With the **outcome prior disabled** (`ret`/`bozma` not demoted) the same
  239-decision snapshot measured Recall@5 **61.1%**, Precision@5 **34.3%**,
  nDCG@10 **0.782**, MRR **0.749**. The prior is kept because citizens should
  see a representative remedy before a rejection; it costs ~11 recall points on
  this keyword-labelled set. Both numbers are real; neither hides the other.
- The strongest failure mode: many judged-relevant decisions are `ret`, and
  `ret` is deliberately demoted. That is a product choice, not a measurement
  accident.
- The corpus is small and growing (~900 decisions planned); treat these as
  small-corpus numbers, not final quality.
- `ozet_l0/l1` on the real corpus are often truncated tails of the decision
  (`"…Sonuç: ret."`), which is why lexical overlap uses `karar_fts.kok`.

### 50k-row latency micro-benchmark

`node --test packages/retrieval/test/benchmark.test.ts` (fixture
`eval/fixtures/bench.db`, 50.000 synthetic decisions, 200 queries):

```
p50 ≈ 5–6 ms, p95 ≈ 7–10 ms, max ≈ 23–32 ms   // gate: p95 <= 40 ms
```

Cold outliers (first query) are excluded by warm-up. The 15 ms target from the
brief is met at p95 on this machine; the measured absolute numbers depend on
disk cache and are printed by the test every run.

## 4. Known weaknesses

1. **Morphology mismatch.** `@hukuk/tr-text` can produce different keys for the
   same lemma ("kurs" vs "kur"); FTS AND cannot bridge that. Mitigations:
   subset union, OR rescue, guarded prefix coverage. Not a substitute for a
   proper query-side stemming fix in `tr-text`.
2. **Summary/FTs text quality.** Real `ozet_l0/l1` are truncated; full-text keys
   are used instead. Decisions whose full text happens to contain all query
   words far apart can outrank a topically closer short decision. BM25 length
   normalisation helps but does not solve this.
3. **Ontology mapping quality.** `dugum_id` is populated by the pipeline. Two
   4. HD `ret` decisions match `ayıplı mal bedel iadesi zamanaşımı` and are
   pipeline-tagged `t/ayipli-mal/konut`; retrieval cannot know that a human
   would call them unrelated. Branch filters are only as good as this mapping.
4. **Router generic-query tie.** A query that names only a branch ("ayıplı mal
   bedel iadesi") returns sibling leaves with close scores (by design it asks
   for disambiguation). There is no branch-level card for the server to use.
5. **OR rescue cost.** Full OR on a very large corpus is expensive. It only runs
   when strict/subset probes and coverage produce nothing. On the 50k bench it
   is rare; on the small real corpus latency p95 stayed ~15 ms.
6. **Outcome prior is a policy judgement.** `ret=0.6/bozma=0.95` and
   `temsilciOlmayanSonuclar` are not learned; they are a citizen-facing product
   choice and should be reviewed with legal experts.
7. **Evaluation optimises lexical/mechanical relevance.** Pooled, mechanically
   labelled goldens cannot measure legal correctness; they measure findability.
8. **No cross-encoder / embeddings by design.** Synonym-only phrasings that
   share no stems with the decision text are missed (honest empty result).

## 5. Tuning knobs (all exported)

`ARAMA_AYARLARI` (`config.ts`)
`bm25Agirlik` 0.5 · `lexAgirlik` 0.5 · `bm25Taban` 0.25 · `baglilikEtkisi` 0.35 ·
`tazelikEtkisi` 0.2 · `tazelikPencereYil` 25 · `gevsekCarpan` 0.85 ·
`orCarpan` 0.6 · `dugumUyumCarpani` 1.25 · `dalUyumCarpani` 1.1 ·
`sonucCarpanlari` `{ret:0.6,bozma:0.95}` · `temsilciOlmayanSonuclar`
`["bozma","ret"]` · `adayLimiti` 200 · `nadirTokenLimiti` 5 ·
`altKumeBoyutlari` `[3,2]` · `altKumeHedefi` 150 · `enAzYedekSorgu` 3 ·
`genisSonda` 100 · `enFazlaYedekSorgu` 24 · `yedekOr` true.

`ARAMA_ESIKLERI`: `minSkor` 0.30 · `minLexKapsam` 0.34.

`YONLENDIRME_AGIRLIKLARI`: `kosinusAgirlik` 0.55 · `tetikAgirlik` 0.30 ·
`ornekAgirlik` 0.15 · `dalKosinusCarpani` 0.9 · `tekTokenTetikCarpani` 0.85 ·
`varsayilanLimit` 5 · `kapsamUs` 0.75.

`YONLENDIRME_ESIKLERI`: `minSkor` 0.30 · `minFark` 0.02.

`KALITE_ESIKLERI`: routing 85/97%, Recall@5 85%, integrity 100%, latency < 400 ms.

## 6. Reproduce

```bash
# fixture + fixture goldens (rebuild after ontology edits)
node eval/fixtures/build.ts --golden

# 50k benchmark fixture (only if missing)
node eval/fixtures/build.ts --bench

# fixture eval (acceptance)
node eval/run.ts --set all --db eval/fixtures/test.db

# real-corpus eval (regenerate goldens after rebuilds)
node eval/fixtures/build-real-golden.ts --db data/build/hukuk.db
node eval/run.ts --set all --db data/build/hukuk.db

# tests (incl. p95 gate)
node --test packages/retrieval/test/*.test.ts
```

`HUKUK_DB` overrides the default `data/build/hukuk.db` path for `new Corpus()`.
