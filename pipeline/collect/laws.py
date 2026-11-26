"""Polite collector for mevzuat.gov.tr law pages.

Contract
--------
* one request per second (global, not per host: all requests go to one host)
* descriptive User-Agent with a contact
* retry with exponential backoff on transient failures (429 / 5xx / network)
* durable disk cache under ``data/raw/laws/`` so reruns never refetch
* a 404 / "ErrorPage" for one *tertip* is not an error: fall through 5 -> 4 -> 3

Legislation URL shape (verified 2026-10)::

    https://www.mevzuat.gov.tr/MevzuatMetin/<tur>.<tertip>.<no>.htm

``tur=1`` is kanun. The *tertip* encodes the era: 5 = 1982+, 4 = 1961-1982,
3 = 1924-1960. Some laws (İİK 2004, Tebligat 7201) only exist under tertip 3.
"""
from __future__ import annotations

import hashlib
import json
import random
import re
import time
from pathlib import Path
from typing import Iterable
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "raw" / "laws"
INDEX_PATH = CACHE_DIR / "index.json"

BASE = "https://www.mevzuat.gov.tr/MevzuatMetin"
UA = "hukuk-mcp/0.1 (legal-research corpus; +https://github.com/ihsansoycelik/hukuk-mcp)"
TERTIPS = (5, 4, 3)
MIN_INTERVAL = 1.0  # seconds between requests to mevzuat.gov.tr

#: Laws the corpus needs. ``tur=1`` (kanun) for all of them. The first group
#: serves the consumer-law field; the second group serves the SGK field.
DEFAULT_LAWS: tuple[str, ...] = (
    "6502",  # Tüketicinin Korunması Hakkında Kanun
    "6098",  # Türk Borçlar Kanunu
    "6100",  # Hukuk Muhakemeleri Kanunu
    "6102",  # Türk Ticaret Kanunu
    "4721",  # Türk Medeni Kanunu
    "5237",  # Türk Ceza Kanunu
    "2709",  # Türkiye Cumhuriyeti Anayasası
    "6325",  # Hukuk Uyuşmazlıklarında Arabuluculuk Kanunu
    "7201",  # Tebligat Kanunu
    "2004",  # İcra ve İflas Kanunu
    "3095",  # Kanuni Faiz ve Temerrüt Faizine İlişkin Kanun
    "2429",  # Ulusal Bayram ve Genel Tatiller Hakkında Kanun
    "5510",  # Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu
    "4447",  # İşsizlik Sigortası Kanunu
)

_LAW_NO_RE = re.compile(r"Kanun\s*Numaras[ıi]\s*:\s*\d+", re.IGNORECASE)
_HEAD_RE = re.compile(r"(?im)^\s*(?:ge[cç]ici\s+|ek\s+)?madde\s*\d+", re.IGNORECASE)
_SITE_ERROR = re.compile(r"ErrorPage|Mevzuat\s+Bilgi\s+Sistemi", re.IGNORECASE)


class RateLimiter:
    """Serialise requests and keep a minimum gap between them."""

    def __init__(self, min_interval: float = MIN_INTERVAL) -> None:
        self.min_interval = min_interval
        self._last = 0.0

    def wait(self) -> None:
        gap = time.monotonic() - self._last
        if gap < self.min_interval:
            time.sleep(self.min_interval - gap)
        self._last = time.monotonic()


def _http_get(url: str, limiter: RateLimiter, attempts: int = 4,
              timeout: int = 40) -> bytes | None:
    """GET with politeness + backoff. Returns None for a hard 404."""
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5",
    }
    last: Exception | None = None
    for attempt in range(attempts):
        limiter.wait()
        req = urlrequest.Request(url, headers=headers)
        try:
            with urlrequest.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except HTTPError as exc:
            if exc.code == 404:
                return None
            last = exc
            if exc.code == 429 or 500 <= exc.code < 600:
                time.sleep(2.0 * (2 ** attempt) + random.random())
                continue
            time.sleep(1.0 * (2 ** attempt))
        except (URLError, TimeoutError, ConnectionError) as exc:
            last = exc
            time.sleep(1.0 * (2 ** attempt) + random.random())
    raise RuntimeError(f"GET failed after {attempts} attempts: {url}: {last}")


def _valid_law_page(raw: bytes) -> bool:
    if len(raw) < 1500:
        return False
    text = raw.decode("windows-1254", "replace")
    if _SITE_ERROR.search(text[:4000]):
        return False
    # Word HTML splits "Kanun" / "Numarası : 6098" across <p> tags, so the
    # plain-text check must run on tag-stripped, whitespace-collapsed text.
    plain = re.sub(r"<[^>]+>", " ", text)
    plain = re.sub(r"\s+", " ", plain)
    if not _LAW_NO_RE.search(plain[:30000]):
        return False
    # An article heading at the start of a line (blocks become spaces -> use a
    # second pass over a newline-preserving form to avoid matching body prose).
    blocks = re.sub(r"(?i)</(?:p|div|h[1-6]|li|tr|table)\s*>", "\n", text)
    blocks = re.sub(r"<[^>]+>", "", blocks)
    return bool(_HEAD_RE.search(blocks))


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def load_index() -> dict:
    if INDEX_PATH.exists():
        try:
            return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def save_index(index: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = INDEX_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(index, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                   encoding="utf-8")
    tmp.replace(INDEX_PATH)


def cache_path(tur: int, tertip: int, law_id: str) -> Path:
    return CACHE_DIR / f"{tur}.{tertip}.{law_id}.htm"


def fetch_law(law_id: str, tur: int = 1, tertips: Iterable[int] = TERTIPS,
              limiter: RateLimiter | None = None, force: bool = False) -> dict | None:
    """Fetch (or reuse) one law page.

    Returns ``{"law_id", "url", "tertip", "path", "sha256", "cached"}`` or
    ``None`` when no tertip yields a valid page.
    """
    limiter = limiter or RateLimiter()
    index = load_index()
    entry = index.get(law_id)
    if entry and not force:
        p = CACHE_DIR / entry["path"]
        if p.exists():
            raw = p.read_bytes()
            if _valid_law_page(raw):
                return {**entry, "law_id": law_id, "cached": True}

    for tertip in tertips:
        url = f"{BASE}/{tur}.{tertip}.{law_id}.htm"
        try:
            raw = _http_get(url, limiter)
        except RuntimeError as exc:
            print(f"[laws] {law_id}: {exc}", flush=True)
            continue
        if raw is None or not _valid_law_page(raw):
            continue
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path = cache_path(tur, tertip, law_id)
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(raw)
        tmp.replace(path)
        entry = {
            "url": url,
            "tertip": tertip,
            "path": path.name,
            "sha256": _sha256(raw),
            "bytes": len(raw),
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        index[law_id] = entry
        save_index(index)
        print(f"[laws] {law_id}: fetched {url} ({len(raw)} bytes)", flush=True)
        return {**entry, "law_id": law_id, "cached": False}

    print(f"[laws] {law_id}: no valid page for tur={tur} tertips={list(tertips)}", flush=True)
    return None


def collect(law_ids: Iterable[str] = DEFAULT_LAWS, force: bool = False,
            allow_fetch: bool = True) -> tuple[list[dict], list[str]]:
    """Fetch all requested laws; returns (found, missing)."""
    limiter = RateLimiter()
    found: list[dict] = []
    missing: list[str] = []
    for law_id in law_ids:
        if not allow_fetch:
            entry = load_index().get(law_id)
            if entry:
                p = CACHE_DIR / entry["path"]
                if p.exists() and _valid_law_page(p.read_bytes()):
                    found.append({**entry, "law_id": law_id, "cached": True})
                    continue
            missing.append(law_id)
            continue
        try:
            rec = fetch_law(law_id, limiter=limiter, force=force)
        except Exception as exc:  # noqa: BLE001 - one bad law must not kill the build
            print(f"[laws] {law_id}: unexpected error: {exc}", flush=True)
            rec = None
        if rec:
            found.append(rec)
        else:
            missing.append(law_id)
    return found, missing
