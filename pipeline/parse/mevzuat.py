"""mevzuat.gov.tr HTML -> structured law records.

Source format (verified 2026-10): ``https://www.mevzuat.gov.tr/MevzuatMetin/
<tur>.<tertip>.<no>.htm`` served as Windows-1254. Pages are Word-exported
HTML with one ``<p>`` per line/block. Article headings look like:

    MADDE 11-          (new laws, 1982+)
    MADDE 11 –         (variant dash)
    Madde 1 –          (old laws, 1924-1980)
    MADDE 73/A-        (lettered articles)
    GEÇİCİ MADDE 1-    (transitional)
    EK MADDE 1-        (additional)

Body citations ("11. maddesi", "73 üncü maddesi") are *not* headings because
headings must start a block and carry no "maddesi" suffix.

This module is pure: no network, no DB. ``pipeline/collect/laws.py`` fetches and
caches; ``pipeline/ingest.py`` writes rows.
"""
from __future__ import annotations

import html as htmlmod
import re
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# decoding / HTML -> text blocks
# ---------------------------------------------------------------------------

_BLOCK_CLOSE = re.compile(
    r"(?i)</(?:p|div|h[1-6]|li|tr|table|ul|ol|blockquote|pre)\s*>"
)
_BLOCK_OPEN = re.compile(
    r"(?i)<(?:p|div|h[1-6]|li|tr|table|ul|ol|blockquote|pre)(?:\s[^>]*)?>"
)
_BR = re.compile(r"(?i)<br\s*/?>")
_DROP = re.compile(r"(?is)<(?:script|style|head|xml)[^>]*>.*?</(?:script|style|head|xml)\s*>")
_COMMENT = re.compile(r"(?s)<!--.*?-->")
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
_FOOTNOTE = re.compile(r"\[\d{1,3}\]")
_CTRL = re.compile(r"[\u200b\u200c\u200d\ufeff\u00ad]")


def decode_html(raw: bytes) -> str:
    """Decode a mevzuat.gov.tr response (Windows-1254, declared in <meta>)."""
    return raw.decode("windows-1254", "replace")


def html_to_blocks(page: str) -> list[str]:
    """Word-HTML -> list of trimmed text blocks (paragraph-ish units).

    Block boundaries are closing/opening block tags; ``<br>`` is a soft line
    break inside a block (collapsed to one space), which is what the old-law
    headings rely on ("Madde\\n1 –" is one paragraph in the source).
    """
    s = _DROP.sub(" ", page)
    s = _COMMENT.sub(" ", s)
    s = _CTRL.sub("", s)
    s = _BR.sub("\n", s)
    s = _BLOCK_CLOSE.sub("\n\n", s)
    s = _BLOCK_OPEN.sub("\n\n", s)
    s = _TAG.sub("", s)
    s = htmlmod.unescape(s)
    s = s.replace("\xa0", " ")

    blocks: list[str] = []
    for chunk in re.split(r"\n\s*\n|\n\n", s):
        text = _WS.sub(" ", chunk).strip()
        if not text:
            continue
        text = _FOOTNOTE.sub("", text).strip()
        text = _WS.sub(" ", text).strip()
        if text:
            blocks.append(text)
    return blocks


# ---------------------------------------------------------------------------
# metadata
# ---------------------------------------------------------------------------

_LAW_NO = re.compile(r"Kanun\s*Numaras[ıi]\s*:\s*(\d+)", re.IGNORECASE)
_KABUL = re.compile(
    r"Kabul\s*Tarihi\s*:\s*(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})", re.IGNORECASE
)
_RG = re.compile(
    r"Resm[îi]\s*Gazete\s*:\s*(?:Tarih[ıi]?\s*:\s*)?"
    r"(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})"
    r"\s*Say[ıi]\s*:\s*(\d+)",
    re.IGNORECASE,
)
_META_START = re.compile(
    r"^(?:T\.?C\.?\s+)?(?:Kanun\s*Numaras[ıi]|Kanun\s*$|Numaras[ıi]\s*:)", re.IGNORECASE
)


def _iso(d: str) -> str | None:
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", d.strip())
    if not m:
        return None
    return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"


# ---------------------------------------------------------------------------
# article segmentation
# ---------------------------------------------------------------------------

_HEAD = re.compile(
    r"^(?:(?P<kind>GE[CÇ][Iİ]C[Iİ]|EK)\s+)?"
    r"MADDE\s*(?P<no>\d+(?:\s*/\s*[A-ZÇĞİÖŞÜ])?)\s*"
    r"(?P<sep>[-–—.]|\s|$)",
    re.IGNORECASE,
)

_SECTION = re.compile(
    r"^(?:"
    r"(?:B[İI]R[İI]NC[İI]|[İI]K[İI]NC[İI]|[ÜU][ÇC][ÜU]NC[ÜU]|D[ÖO]RD[ÜU]NC[ÜU]|"
    r"BE[ŞS][İI]NC[İI]|ALTINCI|YED[İI]NC[İI]|SEK[İI]Z[İI]NC[İI]|DOKUZUNCU|ONUNCU|"
    r"ON\s+B[İI]R[İI]NC[İI]|ON\s+[İI]K[İI]NC[İI]|"
    r"[İI]LK|SON)\s+(?:KISIM|BÖLÜM|AYIRIM|BAP|K[İI]TAP)"
    r"|BA[ŞS]LANGI[ÇC]"
    r"|Y[ÜU]R[ÜU]RL[ÜU]K|Y[ÜU]R[ÜU]TME|Y[ÜU]R[ÜU]TME\s+VE\s+Y[ÜU]R[ÜU]RL[ÜU]K"
    r")$",
    re.IGNORECASE,
)

#: blocks that are structure, never an article title
_TITLE_REJECT_TAIL = (".", ";", ",")


def _looks_like_section(block: str) -> bool:
    return bool(_SECTION.match(block.strip()))


def _looks_like_title(block: str) -> bool:
    b = block.strip()
    if not b or len(b) > 160:
        return False
    if _HEAD.match(b) or _SECTION.match(b):
        return False
    if b[0] in "([{":
        return False
    if b.endswith(_TITLE_REJECT_TAIL):
        return False
    if re.match(r"^\d+(?:\.\d+)*$", b):
        return False
    if "MADDE" in b.upper():
        return False
    return True


def _norm_article_no(kind: str | None, raw: str) -> str:
    no = re.sub(r"\s+", "", raw).replace("/", "")
    # Letter suffix is an identity, not a diacritic: 73/A -> 73A, 150/ı -> 150I
    if no and no[-1].isalpha():
        no = no[:-1] + no[-1].upper().replace("İ", "I")
    if kind:
        k = "gecici" if kind.upper().startswith("GE") else "ek"
        return f"{k}-{no}"
    return no


def _clean_heading_remainder(block: str) -> str:
    m = _HEAD.match(block)
    if not m:
        return block
    return block[m.end():].strip(" -–—:.")


@dataclass
class Article:
    id: str
    madde_no: str
    baslik: str | None
    metin: str
    degisiklik: str | None
    sira: int


@dataclass
class LawRecord:
    id: str
    tur: str
    ad: str
    kabul_tarihi: str | None
    rg_tarih: str | None
    rg_sayi: int | None
    kaynak_url: str
    articles: list[Article] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


_AMEND_NOTE = re.compile(
    r"\((?:De[ğg][iı][şs][iı]kl[ıi]k|De[ğg][iı][şs][iı]k|Ek|M[üu]lga)[^)]{0,200}\)",
    re.IGNORECASE,
)


def _detect_degisiklik(text: str) -> str | None:
    m = _AMEND_NOTE.search(text)
    if m:
        return _WS.sub(" ", m.group(0)).strip()
    if re.search(r"\bM[ÜU]LGA\b", text, re.IGNORECASE):
        return "Mülga"
    return None


def parse_law(page: str, law_id: str, kaynak_url: str, tur: str = "kanun") -> LawRecord:
    """Parse one law page into metadata + articles. Never fabricates text."""
    blocks = html_to_blocks(page)
    if not blocks:
        return LawRecord(law_id, tur, f"Kanun {law_id}", None, None, None, kaynak_url,
                         warnings=["empty-page"])

    # ---- header metadata ----
    meta_idx = None
    for i, b in enumerate(blocks):
        if _META_START.match(b):
            meta_idx = i
            break
    head_text = " \n ".join(blocks[: (meta_idx if meta_idx is not None else 0) + 8])

    m = _LAW_NO.search(head_text)
    if m:
        law_id = m.group(1)
    else:
        m2 = re.search(r"\b(\d{3,5})\b", " ".join(blocks[:6]))
        if m2:
            law_id = m2.group(1)

    name_parts = blocks[:meta_idx] if meta_idx is not None else blocks[:1]
    ad = _WS.sub(" ", " ".join(name_parts)).strip()
    ad = _FOOTNOTE.sub("", ad).strip()
    ad = re.sub(r"\s+", " ", ad)
    if not ad:
        ad = f"Kanun {law_id}"

    kabul = _KABUL.search(head_text)
    kabul_iso = _iso("/".join(kabul.groups())) if kabul else None
    rg = _RG.search(head_text)
    rg_iso = _iso("/".join(rg.groups()[:3])) if rg else None
    rg_sayi = int(rg.group(4)) if rg else None

    # ---- article headings ----
    heads: list[tuple[int, re.Match[str]]] = []
    for i, b in enumerate(blocks):
        mh = _HEAD.match(b)
        if mh:
            heads.append((i, mh))

    articles: list[Article] = []
    seen: dict[str, int] = {}
    warnings: list[str] = []

    for n, (idx, mh) in enumerate(heads):
        kind = mh.group("kind")
        no = _norm_article_no(kind, mh.group("no"))
        uid = f"m:{law_id}/{no}"
        next_idx = heads[n + 1][0] if n + 1 < len(heads) else len(blocks)

        baslik = None
        if idx > 0 and _looks_like_title(blocks[idx - 1]):
            baslik = blocks[idx - 1]

        body_blocks = blocks[idx + 1 : next_idx]
        # the next article's title block is not part of this article's body
        if body_blocks and n + 1 < len(heads) and next_idx - 1 > idx:
            if _looks_like_title(blocks[next_idx - 1]):
                body_blocks = blocks[idx + 1 : next_idx - 1]
        # trailing all-caps section markers belong to the next section, not us
        while body_blocks and _looks_like_section(body_blocks[-1]):
            body_blocks.pop()

        first = _clean_heading_remainder(blocks[idx])
        parts = ([first] if first else []) + body_blocks
        metin = _WS.sub(" ", " ".join(parts)).strip()
        if not metin:
            # Source gives us only the heading: skip rather than invent text.
            warnings.append(f"empty-article:{uid}")
            continue

        if no in seen:
            warnings.append(f"duplicate-article:{uid}@{idx}")
            continue
        seen[no] = idx

        degisiklik = _detect_degisiklik(metin)
        articles.append(
            Article(
                id=uid,
                madde_no=no,
                baslik=baslik,
                metin=metin,
                degisiklik=degisiklik,
                sira=len(articles),
            )
        )

    if not articles:
        warnings.append("no-articles")

    return LawRecord(
        id=law_id,
        tur=tur,
        ad=ad,
        kabul_tarihi=kabul_iso,
        rg_tarih=rg_iso,
        rg_sayi=rg_sayi,
        kaynak_url=kaynak_url,
        articles=articles,
        warnings=warnings,
    )


def article_l1_source(article: Article) -> str:
    """Readable text used for the article summary (title + body)."""
    if article.baslik:
        return f"{article.baslik}. {article.metin}"
    return article.metin
