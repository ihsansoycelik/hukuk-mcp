# pipeline/NOTES.md — build pipeline

Single entrypoint: **`uv run python pipeline/build.py`** → `data/build/hukuk.db`.
The database is composed in `data/build/hukuk.db.tmp` and atomically replaced, so
a failed build never leaves a half-written corpus. With unchanged inputs the
build is idempotent (same row counts, same `meta.surum`).

## Modules

| file | role |
| --- | --- |
| `pipeline/build.py` | Orchestrator: laws → decisions → summaries → FTS → ontology/cards → parameters → meta. Prints a one-line JSON `SUMMARY`. |
| `pipeline/collect/laws.py` | Polite mevzuat.gov.tr collector: 1 req/s global cap, descriptive UA, 4-try exponential backoff, disk cache in `data/raw/laws/`, tertip fallback 5→4→3. |
| `pipeline/parse/mevzuat.py` | Windows-1254 decode, Word-HTML → blocks, header metadata (name, kabul, RG date/number), article segmentation (`MADDE 11-`, `Madde 1 –`, `MADDE 73/A-`, `GEÇİCİ MADDE`, `EK MADDE`), mülga/amendment notes. Pure; no network/DB. |
| `pipeline/parse/karar.py` | Decision identity: canonical `k:...` id, ISO date validation, `mahkeme`, `daireSlug`, `agirlik`, `sonuc`, public `kaynak_url`, sha256 full-text key. Raises `MalformedDecision(reason)` instead of guessing. |
| `pipeline/trtext_py.py` | Line-for-line Python port of `packages/tr-text/src/index.ts`: `normalize`, `tr_lower`, `tr_fold`, `stem_folded`, `analyze`, `ngram_vector`, `vector_to_json`. |
| `pipeline/tokens.py` | Batched token counts using the project's own `gpt-tokenizer` via Node; SHA-256 cache in `data/build/token_cache.json`; `fit_many` word-wise trimming. |
| `pipeline/layers.py` | Deterministic extractive L0/L1 summaries. No LLM. |
| `pipeline/ontology.py` | YAML → `dugum` (51) and `kart` (41) rows; YAML parsed by Node using the repo's `yaml` package (no new Python dep). |
| `pipeline/routing.py` | Deterministic decision → leaf `dugum_id` routing from ontology triggers; substantive branches beat `t/usul`, no hit stays NULL. Needed because `hukuk_sor` pulls same-branch precedents via `k.dugum_id LIKE`. |
| `pipeline/ingest.py` | SQLite writers for `mevzuat`, `madde`, `madde_fts`, `karar`, `karar_fts`, `dugum`, `kart`, `arguman`, `meta`. |
| `pipeline/test/*.test.py` | pytest/unittest suite (see below). `pipeline/test/pytest.ini` forces `--import-mode=importlib` because the brief names files `*.test.py`. |
| `pipeline/test/gen_parity_fixture.py` | Regenerates `data/build/parity_words.json` with **Node running the TS analyser**. |

## Exact commands

```bash
# full build (fetches only missing law pages; cached afterwards)
uv run python pipeline/build.py

# offline build from data/raw/laws cache only
uv run python pipeline/build.py --no-fetch

# tests (37 passing)
uv run --with pytest python -m pytest pipeline/test -q

# parity fixture (writes data/build/parity_words.json, 300 real corpus words)
uv run python pipeline/test/gen_parity_fixture.py

# dated rule parameters (also called by build.py as its final stage)
node scripts/export-parametreler.ts --db data/build/hukuk.db   # satır=37 tarihsiz=0

# collector resume/trigger (crawl is resumable; candidates are cached)
SKIP_SEARCH=1 TARGET=900 python3 pipeline/collect/decisions.py
```

Frozen-input idempotency check (collector can keep running):

```bash
cp data/raw/decisions.jsonl /tmp/decisions.frozen.jsonl
HUKUK_DECISIONS=/tmp/decisions.frozen.jsonl uv run python pipeline/build.py
HUKUK_DECISIONS=/tmp/decisions.frozen.jsonl uv run python pipeline/build.py
# both runs: identical laws/articles/decisions/dugum/kart/arguman/surum
```

## Key design decisions

### Token counting (server parity)

Budgets are measured with **`gpt-tokenizer`**, the same package the TypeScript
server uses, not `tiktoken`. `pipeline/tokens.py` shells out to Node:

```js
import {encode} from 'gpt-tokenizer';   // project dependency
```

Texts are sent as a JSON array on stdin and counts are cached by SHA-256 in
`data/build/token_cache.json` (`scheme: gpt-tokenizer-default`). This keeps
`token_l0` / `token_l1` / card `token` fields trustworthy to the server and
makes reruns offline and fast (~7 s warm).

### Article ids

`m:<kanunNo>/<maddeNo>`, with the slash in a lettered article removed:
`MADDE 73/A-` → `m:6502/73A`; `150/ı` → `150I`. Transitional/additional
articles use `m:6502/gecici-1`, `m:6502/ek-1`.

### Decision ids

Literal contract:
`k:<mahkeme>-<daireSlug>-<esasYil>-<esasNo>-<kararYil>-<kararNo>`.
`mahkeme` short codes are `ygt` / `bam` / `ilk` / `aym`. Examples:

- `13. Hukuk Dairesi` → `k:ygt-13hd-2013-7601-2013-16449`
- `İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi` → daireSlug `ist-bam-12hd`,
  so the full id is `k:bam-ist-bam-12hd-...` (the brief's daireSlug already
  contains the `bam` token; kept verbatim).
- `Tüketici Mahkemesi` → `k:ilk-tuketici-...`

Malformed records are never repaired. Reasons currently seen:
`bad-case-no`, `duplicate-id`; each is counted in `meta.decisions_malformed_by_reason`.

### Summaries (L0 / L1)

Extractive only: selected sentences are copied from the source, then trimmed
word-wise. `…` marks a cut; a cut never happens inside a word.

**L0** (target ≤35 tokens, gate ≤45): skip Yargıtay procedural boilerplate
(`temyiz`, `incelenmesi`, `süresi içinde istenilmekle`, `dosyadaki kağıtlar
okundu`, `gereği konuşulup düşünüldü`, `vekilinin`, `tarafından istenilmesi`),
then prefer the final SONUÇ/HÜKÜM sentence with dispute content, then the
outcome-verb sentence, then the first substantive dispute sentence, then a fixed
`Karar sonucu: <sonuc>.` fallback. The outcome is always present as a trailing
`Sonuç: kabul|kismen kabul|ret|bozma|onama|diğer.` clause.

**L1** (≤170 tokens): subject + up to two lead reasoning sentences + outcome,
in original order, 2-4 sentences.

**Law article L1** (≤170 tokens): title + first up to three sentences of the
article text.

### Ontology and cards

- `dugum`: 51 rows = synthetic root `t/tuketici` + 9 branches + 41 leaves,
  flattened exactly like `packages/ontology/src/index.ts` (leaves inherit their
  branch's `maddeler` and `kurallar`). `sira` is the flatten order.
- `vektor`: JSON char-3gram vector of
  `ad + " " + aciklama + " " + tetikleyiciler + " " + ornek_sorgular`,
  `^`/`$` padded, L2-normalised — exact port of `ngramVector` (spot-checked
  byte-identical JSON against Node).
- `kart`: 41 rows = 15 authored (`durum=taslak`, from
  `packages/ontology/cards/tuketici-kartlar.yaml`) + 26 generated
  (`durum=otomatik`). Every generated line carries a real citation; every
  `kaynaklar` id is validated against `madde` ∪ `karar` and the build fails on
  an unresolved id. No template is ever `uzman_onayli`.
- `icerik` = the JSON `Kart` shape `{dugum_id, surum, durum, bolumler,
  kaynaklar, girdi_hash, token}`; `bolum_tokenlari` = `{etiket: token}`;
  section priorities 10/30/40/80 (ÖZET/HAKLAR/YOL/DİKKAT).
- `k.dugum_id` on decisions is a **routing heuristic** from the ontology's
  `tetikleyiciler` (and a tiny fallback map). It is not a legal holding; it only
  lets `hukuk_sor` retrieve representative decisions from the routed branch.
  Current snapshot: every ingested decision gets a leaf.
- `arguman`: **0 rows by design.** Collected decisions do not carry reliable
  party-position labels, and the brief says an empty table is better than
  fabricated arguments. Recorded in `meta.known_gaps`.

### Dated rule parameters

Final build stage: `node scripts/export-parametreler.ts --db <temp db>`.
Expected **37 rows, 0 undated** (2023-2026 hakem heyeti limits, official
holidays, adli tatil, 3095 rate periods). `build.py` fails if the script exits
non-zero or if the table is empty. `data/build/kural_parametre.json` is kept as
an audit artifact (not ignored) and `meta.kural_parametre_surum` records its
version.

### Snapshot version

`meta.surum` is content-addressed and numeric:
`v20261022.<sha-derived integer>` (e.g. `v20261022.53669532`), changing whenever
laws, articles, decisions, dugum or card hashes change. `meta.snapshot_sha256`
stores the full hash. The MCP server prints it in every answer header.

## Measured numbers (snapshot 2026-10-22, crawl still running)

| metric | value |
| --- | --- |
| laws | 12 (6502, 6098, 6100, 6102, 4721, 5237, 2709, 6325, 7201, 2004, 3095, **2429**) |
| articles | 4.953 |
| decisions ingested | 239 (of 244 raw lines) |
| malformed | 5 (`duplicate-id` 4, `bad-case-no` 1) |
| decisions with `dugum_id` | 239 / 239 |
| required ids | `m:6502/11,12,48,68,73,73A`, `m:6098/227`, `m:6100/*`, `m:2429/2` all resolve |
| `m:6502/11` contains "ayıplı" | yes |
| FTS `kok="gizli ayip bedel iade"` | **15** decisions (AND), 169 (OR) |
| L0 tokens p95 | **31** (gate ≤45) |
| L1 tokens p95 | **169** (gate ≤190) |
| madde L1 p95 | 167 |
| L0 start-mid-word / end-mid-word | **0 / 0** |
| L0 with outcome clause | **100.0%** |
| dugum / kart | **51 / 41** (15 authored + 26 otomatik) |
| unresolved card citations | **0** |
| kural_parametre | **37**, undated 0 |
| parity fixture | **300 / 300 words** (100% identical tokens+kok vs TS) |
| tests | **41 passed** |
| warm build | ~8 s |
| `meta.surum` | `v20261022.619817691` |
| `hukuk_sor` KARARLAR | populated (routed decisions, e.g. `k:ygt-3hd-2022-7621-2023-569`) |

### L0 before/after (Lead's spot-check)

- `k:ygt-4hd-2009-15001-2010-627`
  - before: `rarın Yargıtay’ca incelenmesi davalı vekili tarafından süresi içinde istenilmekle Sonuç: ret.`
  - after: `Malin teslim tarihi ile dava tarihi gözönüne alındığında dava süresi … Sonuç: ret.` (22 tokens)
- `k:ygt-15hd-2017-1948-2018-2291`
  - before: `Davalı yüklenici vekili; davalı yüklenici şirket ile davacı site yönetimi arasında yapılmış Sonuç: kabul.`
  - after: `Satım sözleşmeleri için geçerli olan misliyle değiştirmenin, tüketici işlemi niteliğindeki … Sonuç: kabul.` (30 tokens)
- `k:ygt-15hd-2006-4980-2007-5033` (bozma)
  - before: `Temyiz olunan hükmün yukarıda açıklanan nedenlerle davacı yararına BOZULMASINA Sonuç: bozma.`
  - after: `Yetersiz ve eksik incelemeye dayalı karar açıklanan nedenlerle bozulmalıdır Sonuç: bozma.` (25 tokens)

## Known gaps

- `arguman` is empty by design (see above). `atif` and `kural_parametre` are
  owned by other stages; `kural_parametre` is now filled here, `atif` is not.
- The schema has no full-text table: `tam_metin_key` is a sha256 of the source
  text; the text itself is not stored in the DB (L0/L1 are).
- `y:mesafeli-sozlesmeler/7` (Mesafeli Sözleşmeler Yönetmeliği) is **not** in the
  corpus. Its URL id was not verified, and the server already drops non-`m:`/`k:`
  ids and prints `[+1 ikincil mevzuat]`. Recorded as an honest gap rather than a
  guessed fetch.
- AYM decisions, if any ever arrive, use `mahkeme='aym'` although the brief
  listed only `{yargitay,bam,ilkderece}`; the `agirlik` table explicitly includes
  AYM 85.
- Duplicate decisions from the same court/case numbers collapse to one canonical
  id; the later copies are counted as `duplicate-id` and not ingested.
- The collector is rate-limited by the sources (~0.2/s) and stopped at 244 raw
  lines during this build (not killed by the pipeline). `data/raw/decisions.jsonl`
  is append-only and resumable with `SKIP_SEARCH=1 TARGET=900 python3
  pipeline/collect/decisions.py`; rerun `build.py` afterwards. `pipeline/build.py`
  is safe to run at any time and is idempotent.
- Node is required at build time (tokenizer, YAML, parameter export). Python
  dependencies are stdlib + pytest only.
