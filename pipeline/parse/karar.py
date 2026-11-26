"""Normalise collected decisions (``data/raw/decisions.jsonl``) into DB rows.

The collector already strips HTML and normalises the date to ``YYYY-MM-DD``.
This module is the deterministic identity layer:

  id       canonical, content-addressed by court + case numbers
  tarih    ISO date (validated, never guessed)
  agirlik  bindingness weight from the fixed table in the brief
  mahkeme  yargitay | bam | ilkderece (plus aym only if Anayasa data appears)
  kaynak_url  the public detail endpoint for the document
  sonuc    kabul | kismen | ret | bozma | onama | diger

Malformed records raise :class:`MalformedDecision` with a short machine reason;
``pipeline/build.py`` counts them by reason and never invents missing values.
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import re
import unicodedata
from dataclasses import dataclass

from pipeline.trtext_py import tr_fold, tr_lower

DETAIL_URL = {
    "yargitay": "https://bedesten.adalet.gov.tr/emsal-karar/getDocContent?documentId={id}",
    "emsal": "https://bedesten.adalet.gov.tr/emsal-karar/getDocContent?documentId={id}",
}

MAHKEME_SHORT = {"yargitay": "ygt", "bam": "bam", "ilkderece": "ilk", "aym": "aym"}

_ESAS = re.compile(r"(\d{4})\s*/\s*(\d+)")
_DATE_DMY = re.compile(r"^(\d{1,2})[./](\d{1,2})[./](\d{4})$")
_DATE_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_DAIRE_NO = re.compile(r"(\d+)\.\s*(Hukuk|Ceza)\s*Daire", re.IGNORECASE)
_BAM = re.compile(r"(.+?)\s+B[öo]lge\s+Adliye\s+Mahkemesi", re.IGNORECASE)
_BIM = re.compile(r"(.+?)\s+B[öo]lge\s+[İI]dare\s+Mahkemesi", re.IGNORECASE)


class MalformedDecision(ValueError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass
class Karar:
    id: str
    mahkeme: str
    daire: str | None
    esas: str | None
    karar_no: str | None
    tarih: str
    kesinlesme: str
    agirlik: int
    kaynak_url: str
    sonuc: str
    tam_metin_key: str
    metin: str


def _ascii_slug(text: str) -> str:
    """Turkish-safe ASCII slug: '13. Hukuk Dairesi' -> '13-hukuk-dairesi'."""
    s = tr_fold(tr_lower(unicodedata.normalize("NFKC", text)))
    s = s.replace("ı", "i").replace("ş", "s").replace("ğ", "g")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return re.sub(r"-{2,}", "-", s)


def _city_slug(city: str) -> str:
    s = _ascii_slug(city)
    return s[:3] if s else "bam"


def parse_date(value: str) -> str:
    """Return ISO date or raise ``bad-date``. Never guesses."""
    v = (value or "").strip()
    m = _DATE_ISO.match(v)
    if m:
        try:
            return _dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
        except ValueError:
            raise MalformedDecision("bad-date")
    m = _DATE_DMY.match(v)
    if m:
        try:
            return _dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
        except ValueError:
            raise MalformedDecision("bad-date")
    raise MalformedDecision("bad-date")


def parse_case_no(value: str) -> tuple[str, str]:
    """'2013/7601 E.' -> ('2013', '7601'). Leading zeros are not identity."""
    m = _ESAS.search(value or "")
    if not m:
        raise MalformedDecision("bad-case-no")
    return m.group(1), str(int(m.group(2)))


def court_slug(daire: str, src: str) -> tuple[str, str]:
    """Return (mahkeme, daireSlug) from the raw chamber/court string.

    Examples
      '13. Hukuk Dairesi'                              -> ('yargitay', '13hd')
      'İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi'
                                                       -> ('bam', 'ist-bam-12hd')
      'Tüketici Mahkemesi'                             -> ('ilkderece', 'tuketici')
    """
    d = (daire or "").strip()
    d = re.sub(r"\(\s*kapat[ıi]lan\s*\)", " ", d, flags=re.IGNORECASE)
    d = re.sub(r"\s+", " ", d).strip()
    if not d:
        raise MalformedDecision("missing-court")

    low = tr_lower(d)

    # --- Anayasa Mahkemesi -------------------------------------------------
    if "anayasa mahkemesi" in low or src == "aym":
        return "aym", "aym"

    # --- Yargıtay genel kurulları / İBK -----------------------------------
    if "içtihatları birleştirme" in low or "içtihat birleştirme" in low or "ibk" in low:
        return "yargitay", "ibk"
    if "hukuk genel kurulu" in low:
        return "yargitay", "hgk"
    if "ceza genel kurulu" in low:
        return "yargitay", "cgk"
    if "genel kurul" in low:
        return "yargitay", "gk"

    # --- Bölge Adliye Mahkemesi (emsal) -----------------------------------
    bam = _BAM.search(d)
    if bam or "bölge adliye mahkemesi" in low or src == "bam":
        city = _city_slug(bam.group(1)) if bam else "bam"
        no = _DAIRE_NO.search(d)
        if no:
            return "bam", f"{city}-bam-{no.group(1)}{no.group(2)[0].lower()}d"
        return "bam", f"{city}-bam"

    # --- Bölge İdare Mahkemesi (idari; not consumer law but keep ids sane) --
    bim = _BIM.search(d)
    if bim or "bölge idare mahkemesi" in low:
        city = _city_slug(bim.group(1)) if bim else "bim"
        no = re.search(r"(\d+)\.\s*[İI]dare\s+Daire", d, re.IGNORECASE)
        return "ilkderece", f"{city}-bim-{no.group(1)}id" if no else f"{city}-bim"

    # --- Yargıtay daireleri ------------------------------------------------
    no = _DAIRE_NO.search(d)
    if no and ("yargıtay" in low or src == "yargitay" or "daire" in low):
        return "yargitay", f"{no.group(1)}{no.group(2)[0].lower()}d"
    if "yargıtay" in low:
        return "yargitay", _ascii_slug(d) or "yargitay"

    # --- first instance named courts ---------------------------------------
    named = [
        ("tüketici mahkemesi", "tuketici"),
        ("tüketici hakem heyeti", "thh"),
        ("fikri ve sınai haklar hukuk mahkemesi", "fshhm"),
        ("fikri ve sınai haklar ceza mahkemesi", "fshcm"),
        ("asliye ticaret mahkemesi", "asliye-ticaret"),
        ("asliye hukuk mahkemesi", "asliye-hukuk"),
        ("sulh hukuk mahkemesi", "sulh-hukuk"),
        ("icra hukuk mahkemesi", "icra-hukuk"),
        ("icra ceza mahkemesi", "icra-ceza"),
        ("ağır ceza mahkemesi", "agir-ceza"),
        ("asliye ceza mahkemesi", "asliye-ceza"),
        ("sulh ceza mahkemesi", "sulh-ceza"),
        ("aile mahkemesi", "aile"),
        ("iş mahkemesi", "is"),
        ("kadastro mahkemesi", "kadastro"),
        ("idare mahkemesi", "idare"),
        ("vergi mahkemesi", "vergi"),
    ]
    for needle, slug in named:
        if needle in low:
            return "ilkderece", slug

    base = _ascii_slug(re.sub(r"\bmahkemesi\b", "", d, flags=re.IGNORECASE))
    return "ilkderece", base or "mahkeme"


def agirlik_for(mahkeme: str, daire: str, durum: str) -> int:
    """Bindingness table from the brief (0-100).

    Yargıtay İBK 95 / HGK 85 / daire 70; BAM 50 (+10 when KESİNLEŞTİ);
    first instance 30; AYM 85; unknown 40.
    """
    low = tr_lower(daire or "")
    kesin = "kesin" in tr_lower(durum or "")
    if mahkeme == "aym":
        return 85
    if "içtihatları birleştirme" in low or "içtihat birleştirme" in low or "ibk" in low:
        return 95
    if "hukuk genel kurulu" in low or low.strip() == "hgk":
        return 85
    if mahkeme == "yargitay":
        return 70
    if mahkeme == "bam":
        return 60 if kesin else 50
    if mahkeme == "ilkderece":
        return 30
    return 40


_SONUC_RULES = [
    # (needle, result) in priority order; kısmen must beat kabul/ret
    ("kısmen kabul", "kismen"),
    ("kismen kabul", "kismen"),
    ("kısmen boz", "kismen"),
    ("bozulmasına", "bozma"),
    ("bozma", "bozma"),
    ("onanmasına", "onama"),
    ("onama", "onama"),
    ("reddine", "ret"),
    ("reddi", "ret"),
    ("kabulüne", "kabul"),
    ("kabul", "kabul"),
]


def sonuc_for(metin: str) -> str:
    """Extract the disposition from the outcome section (deterministic)."""
    up = tr_lower(metin or "")
    # prefer the explicit SONUÇ block / last 1200 chars
    idx = up.rfind("sonuç")
    tail = up[idx:] if idx >= 0 else up[-1600:]
    for needle, label in _SONUC_RULES:
        if needle in tail:
            return label
    for needle, label in _SONUC_RULES:
        if needle in up:
            return label
    return "diger"


def normalize(rec: dict) -> Karar:
    """dict from decisions.jsonl -> Karar, or raise MalformedDecision."""
    metin = (rec.get("metin") or "").strip()
    if len(metin) < 200:
        raise MalformedDecision("text-too-short")

    src = (rec.get("src") or "").strip()
    raw_id = str(rec.get("id") or "").strip()
    if not raw_id:
        raise MalformedDecision("missing-source-id")
    if src not in DETAIL_URL:
        raise MalformedDecision("unknown-source")

    daire = (rec.get("daire") or "").strip()
    # The corpus serves consumer and social-security (civil) questions. Criminal
    # chambers match phrases like "ayıplı mal" through fraud cases; drop them.
    if re.search(r"ceza\s+(dairesi|genel\s+kurulu)", tr_lower(daire)):
        raise MalformedDecision("criminal-chamber")
    mahkeme, dslug = court_slug(daire, src)

    esas_yil, esas_no = parse_case_no(rec.get("esas") or "")
    karar_yil, karar_no = parse_case_no(rec.get("karar") or "")
    tarih = parse_date(rec.get("tarih") or "")

    short = MAHKEME_SHORT[mahkeme]
    # Literal brief contract: k:<mahkeme>-<daireSlug>-<esasYil>-<esasNo>-<kararYil>-<kararNo>
    cid = f"k:{short}-{dslug}-{esas_yil}-{esas_no}-{karar_yil}-{karar_no}"

    durum = (rec.get("durum") or "").strip()
    return Karar(
        id=cid,
        mahkeme=mahkeme,
        daire=daire or None,
        esas=str(rec.get("esas") or "").strip() or None,
        karar_no=str(rec.get("karar") or "").strip() or None,
        tarih=tarih,
        kesinlesme=durum or "bilinmiyor",
        agirlik=agirlik_for(mahkeme, daire, durum),
        kaynak_url=DETAIL_URL[src].format(id=raw_id),
        sonuc=sonuc_for(metin),
        tam_metin_key=hashlib.sha256(metin.encode("utf-8")).hexdigest(),
        metin=metin,
    )


def canonical_id(rec: dict) -> str:
    return normalize(rec).id
