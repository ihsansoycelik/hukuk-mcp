"""Deterministic decision -> ontology node routing.

The MCP server's ``hukuk_sor`` asks ``ara`` for representative decisions in the
same branch (``k.dugum_id LIKE 't/<dal>/%'``). The collector has no node labels,
so this stage assigns one leaf per decision from the ontology's own triggers.

It is a routing heuristic, not a legal conclusion: ties fall to the lowest
``sira``, procedural ``t/usul`` matches lose to substantive branches, and a
decision with no trigger hit stays NULL rather than being forced into a node.
"""
from __future__ import annotations

from pipeline.trtext_py import tr_lower


def _leaves(dugumler: list[dict]) -> list[dict]:
    """Childless nodes, independent of how many roots the ontology has.

    Consumer (``t/``) and SGK (``s/``) trees coexist; picking the first row as
    "the root" silently excluded every SGK leaf.
    """
    parents = {d["ust_id"] for d in dugumler if d["ust_id"]}
    return [d for d in dugumler if d["id"] not in parents]


def _score(text: str, leaf: dict) -> int:
    score = 0
    for trig in leaf.get("tetikleyiciler") or []:
        t = tr_lower(trig).strip()
        if len(t) >= 3 and t in text:
            # longer phrases are stronger evidence than single words
            score += 1 + len(t.split())
    for word in tr_lower(leaf.get("ad") or "").replace("(", " ").replace(")", " ").split():
        if len(word) >= 4 and word in text:
            score += 1
    return score


#: last-resort branch hints, used only when no leaf trigger matches
_FALLBACK = [
    ("t/mesafeli-sozlesme", ("mesafeli", "cayma", "internet", "e-ticaret", "online")),
    ("t/finansal", ("kredi", "aidat", "banka", "kart", "faiz", "masraf")),
    ("t/konut-ve-tatil", ("konut", "paket tur", "tatil", "devre", "taşınmaz")),
    ("t/garanti-ve-servis", ("garanti", "servis", "yedek parça")),
    ("t/abonelik", ("abonelik", "gsm", "internet fatura", "enerji")),
    ("t/haksiz", ("haksız şart", "reklam", "haksız ticari")),
    ("t/ayipli-hizmet", ("hizmet", "tamir", "onarım")),
    ("t/ayipli-mal", ("ayıplı", "ayıp", "mal", "satıcı")),
]


def assign(metin: str, dugumler: list[dict]) -> str | None:
    text = tr_lower(metin or "")
    leaves = _leaves(dugumler)
    if not leaves:
        return None
    scored = [(_score(text, leaf), leaf["sira"], leaf["id"]) for leaf in leaves]
    # Substantive branches beat t/usul: a decision that merely mentions a court
    # should still be retrievable under its dispute branch.
    substantive = [x for x in scored
                   if not (x[2].startswith("t/usul/") or x[2].startswith("s/usul/"))]
    best_sub = max(substantive, key=lambda x: (x[0], -x[1]), default=(0, 0, None))
    if best_sub[0] > 0:
        return best_sub[2]
    best = max(scored, key=lambda x: (x[0], -x[1]))
    if best[0] > 0:
        return best[2]
    for prefix, needles in _FALLBACK:
        if any(n in text for n in needles):
            candidate = next((x[2] for x in leaves if x[2].startswith(prefix + "/")), None)
            if candidate:
                return candidate
    return None
