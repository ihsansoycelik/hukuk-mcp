#!/usr/bin/env python3
"""Deterministic build entrypoint: raw sources -> data/build/hukuk.db.

Usage:
    uv run python pipeline/build.py            # fetch missing law pages, build
    uv run python pipeline/build.py --no-fetch # cache only (offline build)

The build is idempotent: it composes a fresh database in a temp file, then
atomically replaces ``data/build/hukuk.db``. With unchanged inputs the row
counts are identical on every run.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline import ingest, ontology  # noqa: E402
from pipeline.collect import laws as law_collector  # noqa: E402
from pipeline.layers import (  # noqa: E402
    fit_article_summaries,
    fit_summaries,
    p95,
    summarize_article,
    summarize_karar,
)
from pipeline.parse import karar as karar_parse  # noqa: E402
from pipeline.routing import assign as assign_dugum  # noqa: E402
from pipeline.parse.mevzuat import decode_html, parse_law  # noqa: E402
from pipeline.tokens import TokenCounter  # noqa: E402
from pipeline.trtext_py import fts_key  # noqa: E402

DB_PATH = ROOT / "data" / "build" / "hukuk.db"
TMP_PATH = ROOT / "data" / "build" / "hukuk.db.tmp"
DECISIONS = Path(os.environ.get("HUKUK_DECISIONS", ROOT / "data" / "raw" / "decisions.jsonl"))

REQUIRED_ARTICLES = [
    # consumer law
    "m:6502/11", "m:6502/12", "m:6502/48", "m:6502/68",
    "m:6502/73", "m:6502/73A", "m:6098/227", "m:2429/2",
    # social security (SGK)
    "m:5510/13", "m:5510/60", "m:5510/61", "m:5510/67", "m:5510/68",
    "m:5510/93", "m:5510/97", "m:5510/101",
    "m:4447/50", "m:4447/51",
]
FTS_PROBE = "gizli ayıp bedel iadesi"


# ---------------------------------------------------------------------------
# inputs
# ---------------------------------------------------------------------------

def load_laws(no_fetch: bool = False) -> tuple[list, list[str], list[dict]]:
    """Collect + parse law pages from the disk cache (fetching only if needed)."""
    found, missing = law_collector.collect(allow_fetch=not no_fetch)
    parsed = []
    manifest = []
    for rec in found:
        path = law_collector.CACHE_DIR / rec["path"]
        page = decode_html(path.read_bytes())
        law = parse_law(page, rec["law_id"], rec["url"], tur="kanun")
        if not law.articles:
            missing.append(rec["law_id"])
            manifest.append({"id": rec["law_id"], "articles": 0,
                             "warnings": law.warnings[:10], "status": "no-articles"})
            continue
        parsed.append(law)
        manifest.append({
            "id": law.id,
            "ad": law.ad,
            "articles": len(law.articles),
            "url": law.kaynak_url,
            "warnings": law.warnings[:10],
            "status": "ok",
        })
    return parsed, missing, manifest


def load_decisions(path: Path = DECISIONS) -> tuple[list[dict], Counter, int]:
    """Read decisions.jsonl; returns (normalised, malformed-by-reason, raw lines).

    A tail line that is still being written by the running collector is retried
    once before being reported as malformed.
    """
    if not path.exists():
        return [], Counter({"missing-file": 1}), 0

    def _read() -> list[str]:
        return path.read_text(encoding="utf-8", errors="replace").splitlines()

    lines = _read()
    rows: list[dict] = []
    bad: Counter = Counter()
    seen: set[str] = set()
    raw_lines = 0

    for i, line in enumerate(lines):
        if not line.strip():
            continue
        raw_lines += 1
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            if i == len(lines) - 1:
                # the collector may be mid-write; give it a moment, re-read once
                time.sleep(0.4)
                retry = _read()
                if len(retry) > len(lines):
                    lines = retry
                    try:
                        rec = json.loads(lines[i])
                    except json.JSONDecodeError:
                        bad["bad-json"] += 1
                        continue
                else:
                    bad["bad-json"] += 1
                    continue
            else:
                bad["bad-json"] += 1
                continue
        if not isinstance(rec, dict):
            bad["not-an-object"] += 1
            continue
        try:
            k = karar_parse.normalize(rec)
        except karar_parse.MalformedDecision as exc:
            bad[exc.reason] += 1
            continue
        if k.id in seen:
            bad["duplicate-id"] += 1
            continue
        seen.add(k.id)
        rows.append({
            "id": k.id, "mahkeme": k.mahkeme, "daire": k.daire,
            "esas": k.esas, "karar_no": k.karar_no, "tarih": k.tarih,
            "kesinlesme": k.kesinlesme, "agirlik": k.agirlik,
            "kaynak_url": k.kaynak_url, "sonuc": k.sonuc,
            "tam_metin_key": k.tam_metin_key, "metin": k.metin,
        })
    return rows, bad, raw_lines


# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------

PARAM_SCRIPT = ROOT / "scripts" / "export-parametreler.ts"
PARAM_JSON = ROOT / "data" / "build" / "kural_parametre.json"


def export_parametreler(db_path: Path) -> int:
    """Final stage: copy the rules engine's dated table into the DB.

    The engine keeps a compiled-in fallback; the published DB must carry the
    same dated rows so expert approvals and the query-time overlay work.
    """
    proc = subprocess.run(
        ["node", str(PARAM_SCRIPT), "--db", str(db_path)],
        cwd=ROOT, capture_output=True, text=True, check=False,
    )
    if proc.stdout.strip():
        print("[build] " + proc.stdout.strip().replace("\n", "\n[build] "), flush=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"kural_parametre export failed ({proc.returncode}): {proc.stderr.strip()[:500]}")
    with sqlite3.connect(db_path) as c:
        return c.execute("SELECT COUNT(*) FROM kural_parametre").fetchone()[0]


def build(no_fetch: bool = False) -> dict:
    t0 = time.time()
    counter = TokenCounter()

    # 1-2. legislation: collect + parse
    laws, missing_laws, manifest = load_laws(no_fetch=no_fetch)
    if no_fetch:
        print("[build] --no-fetch: using cached laws only", flush=True)

    print(f"[build] laws: {len(laws)} parsed, missing={missing_laws}", flush=True)
    for m in manifest:
        print(f"[build]   {m['id']}: {m.get('articles', 0)} articles ({m['status']})",
              flush=True)

    # 3. article L1 summaries (batched across all laws)
    art_ids: list[str] = []
    art_texts: list[str] = []
    for law in laws:
        for art in law.articles:
            art_ids.append(art.id)
            art_texts.append(summarize_article(art.baslik, art.metin))
    art_l1s, art_tokens = fit_article_summaries(art_texts, counter)
    article_l1 = {i: (l1, tok) for i, l1, tok in zip(art_ids, art_l1s, art_tokens)}

    # 4. decisions: normalise + summaries
    rows, bad, raw_lines = load_decisions()
    print(f"[build] decisions: {len(rows)} normalised, {sum(bad.values())} malformed "
          f"of {raw_lines} raw lines", flush=True)
    if bad:
        print(f"[build]   malformed by reason: {dict(sorted(bad.items()))}", flush=True)

    candidates = [summarize_karar(r["metin"], r["sonuc"]) for r in rows]
    l0s, l1s, t0s, t1s = fit_summaries(candidates, counter)
    for r, l0, l1, tok0, tok1 in zip(rows, l0s, l1s, t0s, t1s):
        r["ozet_l0"], r["ozet_l1"] = l0, l1
        r["token_l0"], r["token_l1"] = tok0, tok1
        r["dugum_id"] = None

    # L0 quality gate (see NOTES.md): no mid-word starts/ends, outcome present.
    l0_start_bad = sum(1 for x in l0s if not (x[:1].isupper() or x[:1].isdigit()))
    l0_end_bad = sum(1 for x in l0s if not x.rstrip().endswith((".", "?", "…", ":")))
    l0_outcome = sum(1 for x in l0s if "sonuç:" in x.lower())
    l0_outcome_pct = (100.0 * l0_outcome / len(l0s)) if l0s else 0.0
    print(f"[build] L0 gate: start_bad={l0_start_bad} end_bad={l0_end_bad} "
          f"outcome={l0_outcome_pct:.1f}%", flush=True)
    if l0_start_bad or l0_end_bad or l0_outcome_pct < 90.0:
        raise RuntimeError(
            f"L0 quality gate failed: start_bad={l0_start_bad} "
            f"end_bad={l0_end_bad} outcome={l0_outcome_pct:.1f}%")

    # 4b. ontology + cards. Node/card counts are derived from the source YAML
    # trees (consumer + SGK), never hard-coded: one card per leaf, authored or
    # templated.
    guncelleme = time.strftime("%Y-%m-%dT%H:%M:%S")
    sources = ontology.load_sources()
    beklenen_dugum, beklenen_kart = ontology.expected_counts(sources["ontologies"])
    dugumler = ontology.build_dugumler(sources["ontologies"])
    kartlar, kart_problems = ontology.build_kartlar(
        sources["cards"], dugumler, counter, guncelleme)
    known_ids = {a.id for law in laws for a in law.articles} | {r["id"] for r in rows}
    ontology_problems = kart_problems + ontology.validate(
        dugumler, kartlar, known_ids, beklenen_dugum, beklenen_kart)
    authored = sum(1 for k in kartlar if k["durum"] == "taslak")
    otomatik = sum(1 for k in kartlar if k["durum"] == "otomatik")
    print(f"[build] ontology: {len(dugumler)} dugum (beklenen {beklenen_dugum}), "
          f"{len(kartlar)} kart (beklenen {beklenen_kart}; "
          f"{authored} authored, {otomatik} otomatik)", flush=True)
    if ontology_problems:
        raise RuntimeError("ontology/card integrity failed: " + "; ".join(ontology_problems[:20]))

    # Route each decision to a leaf so hukuk_sor can pull same-branch precedents.
    for r in rows:
        r["dugum_id"] = assign_dugum(r["metin"], dugumler)
    routed = sum(1 for r in rows if r["dugum_id"])
    print(f"[build] decision routing: {routed}/{len(rows)} assigned to a dugum", flush=True)

    # 5. compose the database atomically
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    for p in (TMP_PATH, Path(str(TMP_PATH) + "-wal"), Path(str(TMP_PATH) + "-shm")):
        if p.exists():
            p.unlink()
    conn = sqlite3.connect(TMP_PATH)
    try:
        ingest.ensure_schema(conn)
        n_art = ingest.insert_laws(conn, laws, article_l1)
        n_karar = ingest.insert_kararlar(conn, rows)
        n_dugum = ingest.insert_dugumler(conn, dugumler)
        n_kart = ingest.insert_kartlar(conn, kartlar)
        n_arguman = ingest.insert_argumanlar(conn, [])

        # 6. sanity probes before publishing
        probe_key = fts_key(FTS_PROBE)
        fts_hits = conn.execute(
            "SELECT COUNT(*) FROM karar_fts WHERE karar_fts MATCH ?", (probe_key,)
        ).fetchone()[0]
        fts_or_hits = conn.execute(
            "SELECT COUNT(*) FROM karar_fts WHERE karar_fts MATCH ?",
            (" OR ".join(probe_key.split()),),
        ).fetchone()[0]
        present = {r[0]: 1 for r in conn.execute("SELECT id FROM madde")}
        missing_required = [m for m in REQUIRED_ARTICLES if m not in present]
        art11 = conn.execute("SELECT metin FROM madde WHERE id='m:6502/11'").fetchone()
        art11_ok = bool(art11 and "ayıplı" in art11[0])

        l0_p95 = p95([r["token_l0"] for r in rows])
        l1_p95 = p95([r["token_l1"] for r in rows])
        art_l1_p95 = p95(art_tokens)

        # content-addressed snapshot version: changes whenever inputs change
        snapshot = {
            "laws": sorted((law.id, sorted(a.id for a in law.articles)) for law in laws),
            "decisions": sorted(r["id"] for r in rows),
            # Include routing-relevant content, not just ids: a trigger or
            # example edit changes router behaviour and therefore the snapshot.
            "dugum": sorted(
                (d["id"], d["ad"], d["aciklama"], d["tetikleyiciler"],
                 d["ornek_sorgular"], d["kurallar"], d["maddeler"])
                for d in dugumler
            ),
            "kart": sorted((k["dugum_id"], k["girdi_hash"]) for k in kartlar),
        }
        snapshot_sha = hashlib.sha256(
            json.dumps(snapshot, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":")).encode("utf-8")).hexdigest()
        surum = f"v20261022.{int(snapshot_sha[:12], 16) % 1_000_000_000}"

        # version is the maximum source-field version; each YAML carries its own
        ontology_surum = max((o.get("surum") or 0) for o in sources["ontologies"])
        meta = {
            "schema_version": "1",
            "surum": surum,
            "snapshot_sha256": snapshot_sha,
            "dugum": n_dugum,
            "kart": n_kart,
            "arguman": n_arguman,
            "kart_authored": authored,
            "kart_otomatik": otomatik,
            "kural_parametre": "staged after build via scripts/export-parametreler.ts",
            "ontology_surum": ontology_surum,
            "kart_surum": sources["cards"].get("surum"),
            "pipeline": "pipeline/build.py",
            "built_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "tokenizer": "gpt-tokenizer (Node, project dependency); counts cached",
            "laws": len(laws),
            "law_ids": sorted(law.id for law in laws),
            "articles": n_art,
            "decisions": n_karar,
            "decisions_raw_lines": raw_lines,
            "decisions_malformed": sum(bad.values()),
            "decisions_malformed_by_reason": dict(sorted(bad.items())),
            "token_l0_p95": l0_p95,
            "token_l1_p95": l1_p95,
            "l0_start_bad": l0_start_bad,
            "l0_end_bad": l0_end_bad,
            "l0_outcome_pct": round(l0_outcome_pct, 2),
            "decisions_with_dugum": routed,
            "madde_token_l1_p95": art_l1_p95,
            "fts_probe": FTS_PROBE,
            "fts_probe_kok": probe_key,
            "fts_probe_hits_and": fts_hits,
            "fts_probe_hits_or": fts_or_hits,
            "missing_laws": missing_laws,
            "missing_required_articles": missing_required,
            "m6502_11_has_ayipli": int(art11_ok),
            "known_gaps": [
                "arguman is empty by design: decisions carry no reliable party/issue labels, so no rows are fabricated",
                "kural_parametre/atif are populated by the rules/retrieval stages",
                "no full-text table in schema: tam_metin_key is sha256, metin not stored",
                "AYM decisions (if any) use mahkeme='aym' although brief listed 3 tiers",
            ],
        }
        ingest.write_meta(conn, meta)
        db_counts = ingest.counts(conn)
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.commit()
    finally:
        conn.close()
    counter.save()

    # 7. final stage: dated rule parameters (fails hard if any row is undated)
    n_param = export_parametreler(TMP_PATH)
    param_surum = None
    if PARAM_JSON.exists():
        try:
            param_surum = json.loads(PARAM_JSON.read_text(encoding="utf-8")).get("surum")
        except (json.JSONDecodeError, OSError):
            param_surum = None
    with sqlite3.connect(TMP_PATH) as c:
        c.execute("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)",
                  ("kural_parametre", str(n_param)))
        if param_surum:
            c.execute("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)",
                      ("kural_parametre_surum", str(param_surum)))
        c.commit()
        c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    db_counts["kural_parametre"] = n_param

    for p in (DB_PATH, Path(str(DB_PATH) + "-wal"), Path(str(DB_PATH) + "-shm")):
        if p.exists():
            p.unlink()
    TMP_PATH.replace(DB_PATH)
    for suffix in ("-wal", "-shm"):
        p = Path(str(TMP_PATH) + suffix)
        if p.exists():
            p.unlink()

    elapsed = time.time() - t0
    summary = {
        "db": str(DB_PATH),
        "laws": len(laws),
        "articles": n_art,
        "decisions": n_karar,
        "malformed": dict(sorted(bad.items())),
        "missing_laws": missing_laws,
        "counts": db_counts,
        "token_l0_p95": l0_p95,
        "token_l1_p95": l1_p95,
        "madde_token_l1_p95": art_l1_p95,
        "l0_start_bad": l0_start_bad,
        "l0_end_bad": l0_end_bad,
        "l0_outcome_pct": round(l0_outcome_pct, 2),
        "fts_probe": FTS_PROBE,
        "fts_probe_kok": probe_key,
        "fts_probe_hits_and": fts_hits,
        "fts_probe_hits_or": fts_or_hits,
        "missing_required_articles": missing_required,
        "m6502_11_has_ayipli": art11_ok,
        "dugum": n_dugum,
        "kart": n_kart,
        "beklenen_dugum": beklenen_dugum,
        "beklenen_kart": beklenen_kart,
        "arguman": n_arguman,
        "decisions_with_dugum": routed,
        "kural_parametre": n_param,
        "surum": surum,
        "seconds": round(elapsed, 2),
    }
    print("[build] SUMMARY " + json.dumps(summary, ensure_ascii=False, sort_keys=True),
          flush=True)
    return summary


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build data/build/hukuk.db")
    ap.add_argument("--no-fetch", action="store_true",
                    help="never touch the network; use data/raw/laws cache only")
    args = ap.parse_args(argv)
    summary = build(no_fetch=args.no_fetch)
    if summary["laws"] < 8 or summary["articles"] < 400:
        print("[build] ERROR: acceptance floor not met (laws>=8, articles>=400)", flush=True)
        return 1
    if summary["dugum"] != summary["beklenen_dugum"] or \
            summary["kart"] != summary["beklenen_kart"]:
        print(f"[build] ERROR: ontology floor not met (dugum={summary['dugum']}/"
              f"{summary['beklenen_dugum']}, kart={summary['kart']}/"
              f"{summary['beklenen_kart']})", flush=True)
        return 1
    if summary["kural_parametre"] < 1:
        print("[build] ERROR: kural_parametre is empty", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
