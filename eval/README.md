# eval

Run everything with `pnpm eval` (routing/rules/citations, then the variant table).
`data/build/hukuk.db` and `data/raw/decisions.jsonl` are gitignored; scripts stop with a message when missing.

## Golden files (eval/golden)

| file | rows | what | relevance |
| --- | --- | --- | --- |
| `routing.jsonl` | 166 | lay description to ontology node | hand-written |
| `search.jsonl`, `search-real.jsonl` | 118, 70 | mechanical decision-search sets (fixture, real corpus) | stem overlap; information only |
| `search-lay.jsonl` | 27 | lay decision queries, dev | see below |
| `search-lay-holdout.jsonl` | 20 | lay decision queries, holdout 1 | see below |
| `search-lay-holdout2.jsonl` | 40 | lay decision queries, holdout 2 | see below |
| `madde-atif.jsonl` | about 250 | set A: statute-article retrieval | the decision's own citations |

Lay sets: `kavram` is the phrase the collector searched on bedesten (`sorgu` in decisions.jsonl). A decision is
relevant when it was collected for that phrase and its full text contains it. The source decides, not our ranking.
Queries avoid the legal term on purpose.

Set A (`madde-atif.jsonl`, built by `eval/fixtures/build-madde-golden.ts`): query is a decision's summary with all
citations, law abbreviations and digits removed (at least 6 words left). Gold `ilgili` is the set of article ids that
`atiflariCikar` finds in the full decision text with status DOGRU, limited to laws 6502, 6098, 6100, 6325, 5510,
4447, 2004. Deterministic sample: sorted by documentId, every k-th row. The first line is a header with the method
and counts. Regenerate after a corpus rebuild.

## Variants (eval/variants.ts)

Each variant runs in a child process with its own env. Metrics: Recall@5, Recall@10, MRR@10 on set A; Hit@5, P@5,
MRR@10, nDCG@10 on the lay sets; p50/p95 of `Corpus.ara`. Gate: holdout and holdout2 combined Hit@5 of
the default variant (`+ köprü`) at least 65%, exit code 1 otherwise. Outputs: `eval/results/latest.json`,
`latest.md`. `node eval/variants.ts --readme` rewrites the README block from `latest.json`.

## Holdout rule

Synonym tables and weights are tuned only on the dev set. The two holdout sets are never used while tuning.
holdout2 was written before reading `esanlam.ts` or the other lay sets (one slip: the first lines of holdout 1
were seen, see the report). Add new holdout sets rather than reusing a set that has guided a change.
