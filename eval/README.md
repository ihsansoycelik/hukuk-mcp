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
`latest.md`. `node eval/variants.ts --readme` rewrites the results block below from `latest.json`.

## Holdout rule

Synonym tables and weights are tuned only on the dev set. The two holdout sets are never used while tuning.
holdout2 was written before reading `esanlam.ts` or the other lay sets (one slip: the first lines of holdout 1
were seen, see the report). Add new holdout sets rather than reusing a set that has guided a change.

## Latest results

Corpus `v20261126.168861017`, 26 November 2026, on a shared 2 vCPU machine.

<!-- eval:start -->
| Ölçüm | yalın FTS | + köprü | + köprü + atıf sinyali |
| --- | --- | --- | --- |
| Madde getirme, küme A (250 karar): Recall@5 | 1.3% | 1.3% | 1.3% |
| Madde getirme, küme A: Recall@10 | 2.1% | 2.1% | 2.1% |
| Madde getirme, küme A: MRR@10 | 0.013 | 0.013 | 0.013 |
| Halk dili karar arama, geliştirme (27 sorgu): Hit@5 | 59.3% | 85.2% | 85.2% |
| geliştirme: P@5 | 36.3% | 48.1% | 47.4% |
| geliştirme: MRR@10 | 0.442 | 0.640 | 0.631 |
| geliştirme: nDCG@10 | 0.307 | 0.470 | 0.471 |
| Halk dili karar arama, ayrı set 1 (20 sorgu): Hit@5 | 80.0% | 90.0% | 85.0% |
| ayrı set 1: P@5 | 38.0% | 41.0% | 39.0% |
| ayrı set 1: MRR@10 | 0.553 | 0.653 | 0.594 |
| ayrı set 1: nDCG@10 | 0.346 | 0.406 | 0.394 |
| Halk dili karar arama, ayrı set 2 (38 sorgu): Hit@5 | 55.3% | 60.5% | 63.2% |
| ayrı set 2: P@5 | 26.3% | 35.3% | 34.7% |
| ayrı set 2: MRR@10 | 0.436 | 0.522 | 0.514 |
| ayrı set 2: nDCG@10 | 0.260 | 0.351 | 0.353 |
| Ayrı setler birleşik (58 sorgu): Hit@5 | 63.8% | 70.7% | 70.7% |
| Gecikme `ara`: p50 | 68.6 ms | 86.9 ms | 65.3 ms |
| Gecikme `ara`: p95 | 177.4 ms | 244.9 ms | 157.8 ms |

Kapı: ayrı setler birleşik Hit@5 en az %65 (varsayılan varyant "+ köprü": 70.7%, geçti). Üretildi: 2026-11-26, `node eval/variants.ts`.
<!-- eval:end -->
