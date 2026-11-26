#!/usr/bin/env python3
"""P0 decision collector for Turkish consumer-law case law.

Sources (both are public JSON APIs, no auth):
  * karararama.yargitay.gov.tr  -> Yargıtay (Court of Cassation)
  * emsal.uyap.gov.tr           -> UYAP Emsal (BAM + first instance)

Politeness: <= ~2 req/s per host, jittered, identifying User-Agent, resumable.
Output: data/raw/decisions.jsonl (append-only, deduped by (src,id)).
"""
from __future__ import annotations

import json
import os
import random
import re
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "raw" / "decisions.jsonl"
OUT.parent.mkdir(parents=True, exist_ok=True)

UA = "hukuk-mcp/0.1 (+academic-research; +https://github.com/ihsansoycelik/hukuk-mcp)"
CONTACT = "hukuk-mcp/0.1"

ENDPOINTS = {
    "yargitay": {
        "search": "https://karararama.yargitay.gov.tr/aramalist",
        "detail": "https://karararama.yargitay.gov.tr/getDokuman",
        "referer": "https://karararama.yargitay.gov.tr/",
    },
    "emsal": {
        "search": "https://emsal.uyap.gov.tr/aramalist",
        "detail": "https://emsal.uyap.gov.tr/getDokuman",
        "referer": "https://emsal.uyap.gov.tr/",
    },
}

# Consumer-law focused query set. Turkish morphology means short stems retrieve more.
KEYWORDS = [
    "ayıplı mal", "ayıplı hizmet", "gizli ayıp", "bedel iadesi",
    "tüketici hakem heyeti", "tüketici mahkemesi", "cayma hakkı",
    "mesafeli sözleşme", "kredi kartı aidatı", "kredi masrafı",
    "haksız şart", "garanti belgesi", "satış sonrası hizmet",
    "paket tur", "devre tatil", "ön ödemeli konut",
    "ayıpsız misli", "tüketicinin korunması", "ayıp zamanaşımı",
    "tüketici arabuluculuk", "ikinci el araç ayıp", "abonelik sözleşmesi",
]

PACE = {"yargitay": 2.0, "emsal": 1.3}
_last_call: dict[str, float] = {}
_pace_lock = threading.Lock()


def paced(src: str) -> None:
    """Serialise and space calls per host. Government sites throttle bursts."""
    with _pace_lock:
        last = _last_call.get(src, 0.0)
        wait = PACE[src] - (time.time() - last)
        if wait > 0:
            time.sleep(wait + random.random() * 0.25)
        _last_call[src] = time.time()


_lock = threading.Lock()

_done: set[tuple[str, str]] = set()
_seen_file_lines = 0


def load_seen() -> set[tuple[str, str]]:
    seen: set[tuple[str, str]] = set()
    if OUT.exists():
        with OUT.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                seen.add((rec.get("src", ""), str(rec.get("id", ""))))
    return seen


def http_json(url: str, payload: dict | None, referer: str, timeout: int = 30) -> dict:
    data = None
    headers = {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Referer": referer,
        "Origin": referer.rstrip("/"),
        "Accept-Language": "tr-TR,tr;q=0.9",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    paced(url.split("/")[2].split(".")[1] if "yargitay" in url.split("/")[2] else "emsal")
    req = urlrequest.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    last = None
    for attempt in range(4):
        try:
            with urlrequest.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8", "replace"))
        except HTTPError as exc:
            last = exc
            if exc.code == 429:
                # hard backoff, then retry
                time.sleep(45 + 15 * attempt)
                continue
            time.sleep(1.5 * (2**attempt) + random.random())
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            time.sleep(1.5 * (2**attempt) + random.random())
    raise RuntimeError(f"failed {url}: {last}")


def search(src: str, kelime: str, page: int) -> list[dict]:
    ep = ENDPOINTS[src]
    body = {
        "data": {
            "arananKelime": kelime,
            "pageNumber": page,
            "pageSize": 10,
            "siralama": "1",
            "siralamaDirection": "desc",
        },
        "applicationName": "Uyap",
    }
    out = http_json(ep["search"], body, ep["referer"])
    payload = out.get("data") or {}
    rows = payload.get("data") or []
    return [r for r in rows if r.get("id")]


TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"[ \t\u00a0]+")
NL_RE = re.compile(r"\n{3,}")


def html_to_text(html: str) -> str:
    s = re.sub(r"(?is)<(script|style).*?</\1>", " ", html)
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</(p|div|li|tr|h[1-6])>", "\n", s)
    s = TAG_RE.sub(" ", s)
    s = (
        s.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    s = WS_RE.sub(" ", s)
    s = "\n".join(ln.strip() for ln in s.split("\n"))
    return NL_RE.sub("\n\n", s).strip()


def fetch_detail(src: str, rid: str) -> str:
    ep = ENDPOINTS[src]
    url = f"{ep['detail']}?id={rid}"
    out = http_json(url, None, ep["referer"], timeout=40)
    return out.get("data") or ""


def norm_date(d: str) -> str:
    m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", (d or "").strip())
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else (d or "")


def main() -> None:
    target = int(os.environ.get("TARGET", "2400"))
    pages = int(os.environ.get("PAGES", "10"))
    seen = load_seen()
    print(f"[collect] resuming with {len(seen)} known decisions", flush=True)

    # ---- phase 1: gather candidate ids from search (cached across runs) ----
    cand_file = ROOT / "data" / "raw" / "candidates.jsonl"
    candidates: list[tuple[str, dict]] = []
    if cand_file.exists():
        for line in cand_file.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            c = json.loads(line)
            candidates.append((c["src"], c))
        print(f"[collect] reused {len(candidates)} cached candidates", flush=True)
    skip_search = os.environ.get("SKIP_SEARCH") == "1" and len(candidates) > 0
    if skip_search:
        print("[collect] skipping search, using cached candidates only", flush=True)
    sources = tuple(x for x in os.environ.get("SOURCES", "yargitay,emsal").split(",") if x)
    for src in (() if skip_search else sources):
        for kw in KEYWORDS:
            for page in range(1, pages + 1):
                try:
                    rows = search(src, kw, page)
                except Exception as exc:  # noqa: BLE001
                    print(f"[collect] search fail {src} {kw} p{page}: {exc}", flush=True)
                    time.sleep(2)
                    continue
                if not rows:
                    break
                for r in rows:
                    candidates.append((src, r))
                    cand_file.parent.mkdir(parents=True, exist_ok=True)
                    with cand_file.open("a", encoding="utf-8") as cf:
                        cf.write(json.dumps({"src": src, **r}, ensure_ascii=False) + "\n")
            if len(candidates) >= target * 2:
                break
        if len(candidates) >= target * 2:
            break

    # dedupe, prefer unseen
    uniq: dict[tuple[str, str], dict] = {}
    for src, r in candidates:
        key = (src, str(r["id"]))
        if key in uniq:
            continue
        uniq[key] = r
    todo = [(k, v) for k, v in uniq.items() if k not in seen][:target]
    print(f"[collect] {len(uniq)} unique candidates, fetching {len(todo)} details", flush=True)

    # ---- phase 2: fetch details with polite concurrency ----
    write_lock = threading.Lock()
    counter = {"n": 0, "ok": 0}
    t0 = time.time()

    def work(item):
        (src, rid), row = item
        try:
            html = fetch_detail(src, rid)
        except Exception as exc:  # noqa: BLE001
            return None, str(exc)
        text = html_to_text(html)
        if len(text) < 200:
            return None, "too-short"
        rec = {
            "src": src,
            "id": str(rid),
            "daire": row.get("daire") or "",
            "esas": row.get("esasNo") or "",
            "karar": row.get("kararNo") or "",
            "tarih": norm_date(row.get("kararTarihi") or ""),
            "durum": row.get("durum") or "",
            "metin": text,
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        return rec, None

    with OUT.open("a", encoding="utf-8") as fh, ThreadPoolExecutor(max_workers=1) as pool:
        futures = {pool.submit(work, it): it for it in todo}
        for fut in as_completed(futures):
            rec, err = fut.result()
            with write_lock:
                counter["n"] += 1
                if rec:
                    fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    fh.flush()
                    counter["ok"] += 1
                if counter["n"] % 25 == 0:
                    el = time.time() - t0
                    rate = counter["n"] / max(el, 1)
                    print(
                        f"[collect] {counter['n']}/{len(todo)} ok={counter['ok']} "
                        f"{rate:.2f}/s eta={max(0,(len(todo)-counter['n'])/max(rate,0.01))/60:.1f}m",
                        flush=True,
                    )


    print(f"[collect] DONE ok={counter['ok']} err={counter['n']-counter['ok']} -> {OUT}", flush=True)


if __name__ == "__main__":
    main()
