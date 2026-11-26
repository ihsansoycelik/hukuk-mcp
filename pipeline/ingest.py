"""SQLite writers for the compiled corpus.

The schema in ``data/build/schema.sql`` is the contract; this module only fills
it. FTS5 ``kok`` columns receive ASCII-folded, stemmed keys from
``pipeline.trtext_py`` (the Python port of the server's analyser), while the
``metin`` / ``baslik`` columns keep readable Turkish text.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from pipeline.parse.mevzuat import LawRecord
from pipeline.trtext_py import analyze

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "data" / "build" / "schema.sql"


def ensure_schema(conn: sqlite3.Connection, schema_path: Path = SCHEMA_PATH) -> None:
    conn.executescript(schema_path.read_text(encoding="utf-8"))
    conn.commit()


def insert_laws(conn: sqlite3.Connection, laws: list[LawRecord],
                article_l1: dict[str, tuple[str, int]]) -> int:
    """Insert mevzuat + madde + madde_fts. Returns article rows written."""
    n = 0
    for law in laws:
        conn.execute(
            "INSERT OR REPLACE INTO mevzuat"
            " (id, tur, ad, kabul_tarihi, rg_tarih, rg_sayi, kaynak_url)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (law.id, law.tur, law.ad, law.kabul_tarihi, law.rg_tarih,
             law.rg_sayi, law.kaynak_url),
        )
        for art in law.articles:
            l1, tokens = article_l1[art.id]
            conn.execute(
                "INSERT OR REPLACE INTO madde"
                " (id, mevzuat_id, madde_no, baslik, metin, degisiklik,"
                "  kaynak_url, token_l1)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (art.id, law.id, art.madde_no, art.baslik, art.metin,
                 art.degisiklik, law.kaynak_url, tokens),
            )
            kok = analyze(f"{art.baslik or ''} {art.metin}").kok
            conn.execute(
                "INSERT INTO madde_fts (madde_id, baslik, metin, kok)"
                " VALUES (?, ?, ?, ?)",
                (art.id, art.baslik or "", art.metin, kok),
            )
            n += 1
    conn.commit()
    return n


def insert_kararlar(conn: sqlite3.Connection, rows: list[dict]) -> int:
    """Insert karar + karar_fts rows. ``rows`` already carry summaries/tokens."""
    for r in rows:
        conn.execute(
            "INSERT OR REPLACE INTO karar"
            " (id, mahkeme, daire, esas, karar_no, tarih, kesinlesme, agirlik,"
            "  kaynak_url, ozet_l0, ozet_l1, token_l0, token_l1, dugum_id,"
            "  sonuc, tam_metin_key)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (r["id"], r["mahkeme"], r["daire"], r["esas"], r["karar_no"],
             r["tarih"], r["kesinlesme"], r["agirlik"], r["kaynak_url"],
             r["ozet_l0"], r["ozet_l1"], r["token_l0"], r["token_l1"],
             r.get("dugum_id"), r["sonuc"], r["tam_metin_key"]),
        )
        kok = analyze(r["metin"]).kok
        conn.execute(
            "INSERT INTO karar_fts (karar_id, kok) VALUES (?, ?)",
            (r["id"], kok),
        )
    conn.commit()
    return len(rows)


def write_meta(conn: sqlite3.Connection, meta: dict[str, object]) -> None:
    for k, v in meta.items():
        if isinstance(v, (list, dict)):
            v = json.dumps(v, ensure_ascii=False, sort_keys=True)
        conn.execute("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)", (k, str(v)))
    conn.commit()


def counts(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        "mevzuat": conn.execute("SELECT COUNT(*) FROM mevzuat").fetchone()[0],
        "madde": conn.execute("SELECT COUNT(*) FROM madde").fetchone()[0],
        "karar": conn.execute("SELECT COUNT(*) FROM karar").fetchone()[0],
        "madde_fts": conn.execute("SELECT COUNT(*) FROM madde_fts").fetchone()[0],
        "karar_fts": conn.execute("SELECT COUNT(*) FROM karar_fts").fetchone()[0],
        "dugum": conn.execute("SELECT COUNT(*) FROM dugum").fetchone()[0],
        "kart": conn.execute("SELECT COUNT(*) FROM kart").fetchone()[0],
        "arguman": conn.execute("SELECT COUNT(*) FROM arguman").fetchone()[0],
    }


def insert_dugumler(conn: sqlite3.Connection, rows: list[dict]) -> int:
    for r in rows:
        conn.execute(
            "INSERT OR REPLACE INTO dugum"
            " (id, ust_id, ad, aciklama, tetikleyiciler, ornek_sorgular,"
            "  kurallar, maddeler, sira, vektor)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (r["id"], r["ust_id"], r["ad"], r["aciklama"],
             json.dumps(r["tetikleyiciler"], ensure_ascii=False),
             json.dumps(r["ornek_sorgular"], ensure_ascii=False),
             json.dumps(r["kurallar"], ensure_ascii=False),
             json.dumps(r["maddeler"], ensure_ascii=False),
             r["sira"], r["vektor"]),
        )
    conn.commit()
    return len(rows)


def insert_kartlar(conn: sqlite3.Connection, rows: list[dict]) -> int:
    for r in rows:
        conn.execute(
            "INSERT OR REPLACE INTO kart"
            " (dugum_id, surum, durum, icerik, bolum_tokenlari, girdi_hash,"
            "  token, onaylayan, onay_zamani, guncelleme)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (r["dugum_id"], r["surum"], r["durum"], r["icerik_json"],
             r["bolum_tokenlari"], r["girdi_hash"], r["token"],
             r["onaylayan"], r["onay_zamani"], r["guncelleme"]),
        )
    conn.commit()
    return len(rows)


def insert_argumanlar(conn: sqlite3.Connection, rows: list[dict]) -> int:
    for r in rows:
        conn.execute(
            "INSERT OR REPLACE INTO arguman"
            " (id, dugum_id, taraf, iddia, kabul, ret, belirleyici)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (r["id"], r["dugum_id"], r["taraf"], r["iddia"],
             int(r.get("kabul", 0)), int(r.get("ret", 0)), r.get("belirleyici")),
        )
    conn.commit()
    return len(rows)


def resolve_ids(conn: sqlite3.Connection) -> set[str]:
    known = {r[0] for r in conn.execute("SELECT id FROM madde")}
    known |= {r[0] for r in conn.execute("SELECT id FROM karar")}
    return known
