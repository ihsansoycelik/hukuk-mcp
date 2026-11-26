"""Amendment-note parser for article text and the ``degisiklik`` column.

Notes look like ``(Değişik: 24/3/2022-7392/6 md.)``, ``(Ek cümle:24/3/2022-7392/2 md.)``,
``(Değişik: 2/1/2017-KHK-684/8 md.; Aynen kabul: 1/2/2018-7074/8 md.)``,
``(Mülga:16/7/2026-7589/19 md.)`` and Constitutional Court annulments
``(İptal: Anayasa Mahkemesinin 12/3/2020 tarihli ve E.: 2019/1, K.: 2020/12 sayılı Kararı ile.)``.

Nothing is dropped silently: every note segment that starts like an amendment
but cannot be read is returned in ``ParseResult.unparsed``.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

KEYWORDS = r"(?:Değişik|Ek|Mülga|İptal|Aynen\s+kabul|Değiştirilerek\s+kabul|Yeniden\s+düzenleme)"
_START = re.compile(r"\(\s*(?=" + KEYWORDS + r"\b)")
_FIKRA_PREFIX = re.compile(r"\((\d{1,3})\)\s*$")
_SEG_HEAD = re.compile(
    r"^\s*(" + KEYWORDS + r")([^:\d\u2013-]{0,60}?)\s*(?::|[\u2013-]|(?=\d))\s*(.*)$", re.S)
_LAW = re.compile(
    r"(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})\s*[-–—]\s*"
    r"((?:KHK\s*-\s*)?\d+)\s*/\s*([^\s;]+?)\s*(?:md\b|$)", re.I)
_AYM = re.compile(r"(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})\s+tarihli", re.I)
_ORDINALS = {
    "birinci": 1, "ikinci": 2, "üçüncü": 3, "dördüncü": 4, "beşinci": 5,
    "altıncı": 6, "yedinci": 7, "sekizinci": 8, "dokuzuncu": 9, "onuncu": 10,
}
_MAX_NOTE = 600


@dataclass(frozen=True)
class Note:
    fikra: int | None
    tur: str
    tarih: str
    kanun_no: str | None
    kanun_madde: str | None
    ham: str


@dataclass
class ParseResult:
    notes: list[Note] = field(default_factory=list)
    unparsed: list[str] = field(default_factory=list)
    seen: int = 0  # note segments seen (parsed + unparsed)


def _tur(head: str) -> str:
    h = re.sub(r"\s+", " ", head.replace("İ", "i").lower())
    return {"değişik": "degisik", "ek": "ek", "mülga": "mulga", "iptal": "iptal",
            "aynen kabul": "aynen_kabul"}.get(h, "diger")


def _iso(d: str, m: str, y: str) -> str | None:
    try:
        return date(int(y), int(m), int(d)).isoformat()
    except ValueError:
        return None


def _fikra_from_qualifier(q: str) -> int | None:
    low = q.lower()
    if "fıkra" not in low:
        return None
    for w, n in _ORDINALS.items():
        if re.search(r"\b" + w + r"\b", low):
            return n
    return None


def _groups(text: str):
    """Yield (start, end, inner) for each balanced note group."""
    pos = 0
    while True:
        m = _START.search(text, pos)
        if not m:
            return
        depth, i = 0, m.start()
        end = None
        while i < len(text) and i - m.start() <= _MAX_NOTE:
            ch = text[i]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    end = i
                    break
            i += 1
        if end is None:
            # unterminated: report the opening text, move past the "("
            yield m.start(), m.end(), text[m.end():m.end() + 80]
            pos = m.end()
            continue
        yield m.start(), end + 1, text[m.end():end]
        pos = end + 1


_SEG_SPLIT = re.compile(r";\s*(?=" + KEYWORDS + r"\b)")


def _split_segments(inner: str) -> list[str]:
    """Split on ";" only before a new note keyword (AYM notes contain "E.: 1/2; K.: 3")."""
    return [p for p in _SEG_SPLIT.split(inner) if p.strip()]


def _parse_segment(seg: str, fikra: int | None) -> Note | None:
    h = _SEG_HEAD.match(seg)
    if not h:
        return None
    kw, qual, rest = h.group(1), h.group(2), h.group(3)
    tur = _tur(kw)
    ham = re.sub(r"\s+", " ", seg).strip()
    fk = fikra if fikra is not None else _fikra_from_qualifier(qual)
    law = _LAW.search(rest)
    if law:
        iso = _iso(law.group(1), law.group(2), law.group(3))
        if iso is None:
            return None
        no = re.sub(r"\s+", "", law.group(4))
        return Note(fk, tur, iso, no, law.group(5), ham)
    if tur == "iptal" and "anayasa" in rest.lower():
        a = _AYM.search(rest)
        iso = _iso(*a.groups()) if a else None
        if iso:
            return Note(fk, tur, iso, None, None, ham)
    return None


def parse_notes(text: str | None, *, positional: bool = True) -> ParseResult:
    """Parse all amendment notes in ``text``.

    ``positional`` assigns ``fikra`` from a ``(n)`` marker directly before a note
    (or from an ordinal such as "birinci fıkra" in the note head). Notes are
    deduplicated on their full content.
    """
    res = ParseResult()
    if not text:
        return res
    seen_keys: set[tuple] = set()
    prev_end = 0
    prev_fikra: int | None = None
    for start, end, inner in _groups(text):
        before = text[prev_end:start]
        fikra: int | None = None
        m = _FIKRA_PREFIX.search(before) if positional else None
        if m:
            fikra = int(m.group(1))
        elif positional and prev_fikra is not None and before.strip() == "":
            fikra = prev_fikra  # chained notes after the same "(n)"
        prev_end, prev_fikra = end, fikra
        for seg in _split_segments(inner):
            res.seen += 1
            note = _parse_segment(seg, fikra)
            if note is None:
                res.unparsed.append(re.sub(r"\s+", " ", seg).strip()[:160])
                continue
            key = (note.fikra, note.tur, note.tarih, note.kanun_no, note.kanun_madde, note.ham)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            res.notes.append(note)
    return res


def parse_madde(metin: str | None, degisiklik: str | None) -> ParseResult:
    """Combine notes of the article body (with fıkra) and the header column.

    A header note that also occurs in the body is dropped in favour of the body
    copy (which knows its fıkra). ``seen`` counts distinct notes.
    """
    body = parse_notes(metin)
    head = parse_notes(degisiklik, positional=False)
    out = ParseResult(notes=list(body.notes), unparsed=list(body.unparsed))
    body_keys = {(n.tur, n.tarih, n.kanun_no, n.kanun_madde) for n in body.notes}
    head_new = 0
    for n in head.notes:
        if (n.tur, n.tarih, n.kanun_no, n.kanun_madde) in body_keys:
            continue
        out.notes.append(n)
        head_new += 1
    body_unp = set(body.unparsed)
    head_unp = [u for u in head.unparsed if u not in body_unp]
    out.unparsed.extend(head_unp)
    out.seen = len(out.notes) + len(out.unparsed)
    return out
