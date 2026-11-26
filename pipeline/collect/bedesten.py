#!/usr/bin/env python3
"""Decision collector for bedesten.adalet.gov.tr (Ministry of Justice).

bedesten is the JSON backend behind emsal.uyap.gov.tr and mevzuat.adalet.gov.tr.
It serves Yargıtay decisions (``YARGITAYKARARI``) and regional appeal court
decisions (``ISTINAFHUKUK``) with full text. No auth, no captcha.

Verified request shapes (2026-11):

* search:  POST /emsal-karar/searchDocuments
           {"data": {"phrase": "\"ayıplı mal\"", "itemTypeList": [...],
                     "pageSize": n, "pageNumber": p,
                     "sortFields": ["KARAR_TARIHI"], "sortDirection": "desc"},
            "applicationName": "UyapMevzuat", "paging": true}
           The phrase must be wrapped in double quotes, otherwise it is ignored.
* detail:  POST /emsal-karar/getDocContent {"data": {"documentId": id}}
           -> {"data": {"content": <base64 html>}}

Politeness: one request per second (global), identifying User-Agent,
resumable (dedupes against data/raw/decisions.jsonl).

Output records match what ``pipeline/parse/karar.py::normalize`` expects:
``{"src", "id", "daire", "esas", "karar", "tarih", "durum", "metin"}``.

Usage:
    python3 pipeline/collect/bedesten.py                  # defaults
    PER_KEYWORD=60 python3 pipeline/collect/bedesten.py   # more per keyword
"""
from __future__ import annotations

import base64
import json
import os
import random
import re
import sys
import time
from pathlib import Path
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.collect.decisions import html_to_text  # noqa: E402

OUT = Path(os.environ.get("HUKUK_DECISIONS", ROOT / "data" / "raw" / "decisions.jsonl"))
BASE = "https://bedesten.adalet.gov.tr/emsal-karar"
UA = "hukuk-mcp/0.2 (open-source legal research corpus; +https://github.com/ihsansoycelik/hukuk-mcp)"
MIN_INTERVAL = float(os.environ.get("MIN_INTERVAL", "1.0"))
PER_KEYWORD = int(os.environ.get("PER_KEYWORD", "40"))
PAGE_SIZE = 20

#: (keyword, court types). Consumer law first, then social security.
KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    # tüketici
    ("ayıplı mal", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("ayıplı hizmet", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("gizli ayıp", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("bedel iadesi", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("ayıpsız misli", ("YARGITAYKARARI",)),
    ("tüketici hakem heyeti", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("cayma hakkı", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("mesafeli sözleşme", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("haksız şart", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("kredi kartı üyelik ücreti", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("dosya masrafı", ("YARGITAYKARARI",)),
    ("garanti belgesi", ("YARGITAYKARARI",)),
    ("paket tur", ("YARGITAYKARARI",)),
    ("devre tatil", ("YARGITAYKARARI",)),
    ("ön ödemeli konut", ("YARGITAYKARARI",)),
    ("abonelik sözleşmesi", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("kaçak elektrik", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("ikinci el araç", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("tüketici kredisi", ("YARGITAYKARARI",)),
    ("arabuluculuk dava şartı tüketici", ("YARGITAYKARARI",)),
    ("uçuş iptali", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("bagaj kaybı", ("YARGITAYKARARI",)),
    # sgk
    ("işsizlik ödeneği", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("genel sağlık sigortası prim", ("YARGITAYKARARI", "ISTINAFHUKUK")),
    ("iş kazası bildirimi", ("YARGITAYKARARI",)),
    ("hizmet tespiti", ("YARGITAYKARARI",)),
    ("kurum işleminin iptali", ("YARGITAYKARARI",)),
    ("yersiz ödeme", ("YARGITAYKARARI",)),
]

_last = 0.0


def _post(path: str, body: dict, timeout: int = 40) -> dict:
    global _last
    gap = time.monotonic() - _last
    if gap < MIN_INTERVAL:
        time.sleep(MIN_INTERVAL - gap + random.random() * 0.2)
    _last = time.monotonic()
    req = urlrequest.Request(
        f"{BASE}/{path}",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "User-Agent": UA,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "AdaletApplicationName": "UyapMevzuat",
        },
        method="POST",
    )
    last: Exception | None = None
    for attempt in range(4):
        try:
            with urlrequest.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8", "replace"))
        except HTTPError as exc:
            last = exc
            time.sleep((45 if exc.code == 429 else 2) * (attempt + 1))
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            time.sleep(2 * (2 ** attempt))
    raise RuntimeError(f"{path}: {last}")


def search(phrase: str, item_type: str, page: int) -> list[dict]:
    out = _post("searchDocuments", {
        "data": {
            "pageSize": PAGE_SIZE,
            "pageNumber": page,
            "itemTypeList": [item_type],
            "phrase": f'"{phrase}"',
            "sortFields": ["KARAR_TARIHI"],
            "sortDirection": "desc",
        },
        "applicationName": "UyapMevzuat",
        "paging": True,
    })
    return ((out.get("data") or {}).get("emsalKararList")) or []


def detail(doc_id: str) -> str:
    out = _post("getDocContent", {"data": {"documentId": doc_id}, "applicationName": "UyapMevzuat"})
    b64 = (out.get("data") or {}).get("content") or ""
    if not b64:
        return ""
    return base64.b64decode(b64).decode("utf-8", "replace")


def _date(row: dict) -> str:
    m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", row.get("kararTarihiStr") or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else ""


def seen_ids() -> set[str]:
    ids: set[str] = set()
    if OUT.exists():
        for line in OUT.read_text(encoding="utf-8").splitlines():
            if line.strip():
                try:
                    ids.add(str(json.loads(line)["id"]))
                except (ValueError, KeyError):
                    pass
    return ids


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    seen = seen_ids()
    print(f"[bedesten] {len(seen)} decisions already on disk", flush=True)
    ok = err = 0
    t0 = time.time()
    with OUT.open("a", encoding="utf-8") as fh:
        start = os.environ.get("START_AT")
        keywords = KEYWORDS[[k for k, _ in KEYWORDS].index(start):] if start else KEYWORDS
        for phrase, types in keywords:
            for item_type in types:
                want = PER_KEYWORD if item_type == "YARGITAYKARARI" else max(PER_KEYWORD // 2, 10)
                got = 0
                page = 1
                while got < want:
                    try:
                        rows = search(phrase, item_type, page)
                    except RuntimeError as exc:
                        print(f"[bedesten] search fail {phrase!r} {item_type} p{page}: {exc}", flush=True)
                        break
                    if not rows:
                        break
                    for row in rows:
                        if got >= want:
                            break
                        rid = str(row.get("documentId") or "")
                        if not rid or rid in seen:
                            continue
                        if "ceza" in (row.get("birimAdi") or "").lower():
                            continue  # criminal chambers are out of scope
                        try:
                            text = html_to_text(detail(rid))
                        except RuntimeError as exc:
                            err += 1
                            print(f"[bedesten] detail fail {rid}: {exc}", flush=True)
                            continue
                        if len(text) < 200:
                            err += 1
                            continue
                        rec = {
                            "src": "yargitay" if item_type == "YARGITAYKARARI" else "emsal",
                            "id": rid,
                            "daire": row.get("birimAdi") or "",
                            "esas": row.get("esasNo") or "",
                            "karar": row.get("kararNo") or "",
                            "tarih": _date(row),
                            "durum": row.get("kesinlesmeDurumu") or "",
                            "metin": text,
                            "sorgu": phrase,
                            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                        }
                        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                        fh.flush()
                        seen.add(rid)
                        got += 1
                        ok += 1
                    page += 1
                print(f"[bedesten] {phrase!r} {item_type}: +{got} (toplam {ok}, {time.time() - t0:.0f}s)", flush=True)
    print(f"[bedesten] DONE ok={ok} err={err} -> {OUT}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
