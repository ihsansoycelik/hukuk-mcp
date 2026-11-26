"""Deterministic extractive summaries (L0 / L1).

No LLM, no generation: every summary is a subset of the decision/article text,
trimmed to a token budget with the server's own tokenizer. Selection is by
fixed keyword/position rules, so the same input always yields the same output.

  L0  <= 45 tokens (target 35), one sentence naming the dispute and outcome
  L1  <= 170 tokens, 2-4 lead sentences: subject, reasoning, outcome

L0 rules (from the quality gate):
  * never cut mid-word: trimming is word-wise and leaves " …" when cut
  * skip Yargıtay procedural boilerplate (temyiz/incelenmesi/...)
  * prefer the final SONUÇ/HÜKÜM sentence, then the outcome-verb sentence,
    then the first substantive dispute sentence, then a fixed fallback
  * the outcome is always present as a trailing "Sonuç: <label>." clause

Token budgets are enforced *after* composition; ``token_l0`` / ``token_l1``
store counts measured on the exact final strings.
"""
from __future__ import annotations

import math
import re

from pipeline.tokens import TokenCounter, fit_many

L0_LIMIT = 35
L1_LIMIT = 170

_NOISE_LINE = re.compile(
    r"^\s*(?:"
    r"\"?i[çc]tihat metni\"?"
    r"|-?\s*k\s*a\s*r\s*a\s*r\s*-?"
    r"|t\s*ü\s*r\s*k\s+m\s*i\s*l\s*l\s*e\s*t\s*i.*"
    r"|mahkemesi\s*:.*"
    r"|taraflar\s*"
    r")\s*$",
    re.IGNORECASE,
)
_HEADER_SENTENCE = re.compile(
    r"(?:\d{4}/\d+\s*E\.|\d{4}/\d+\s*K\.|\(kapat[ıi]lan\)|dairesi\s+\d{4}/)",
    re.IGNORECASE,
)
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9\"“'(\[])")


def _clean_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in (text or "").splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        line = re.sub(r'(?i)^["“”\']?i[çc]tihat metni["“”\']?\s*', "", line).strip()
        if not line or _NOISE_LINE.match(line):
            continue
        lines.append(line)
    return lines


# ---------------------------------------------------------------------------
# sentence extraction
# ---------------------------------------------------------------------------

_LABEL = re.compile(
    r"^(?:DAVANIN KONUSU|DAVACININ İDDİALARININ ÖZETİ|DAVALININ SAVUNMALARININ ÖZETİ|"
    r"DAVACININ İDDİA VE SAVUNMALARININ ÖZETİ|TARAFLARIN İDDİA VE SAVUNMALARININ ÖZETİ|"
    r"DAVALININ İDDİA VE SAVUNMALARININ ÖZETİ|GEREĞİ DÜŞÜNÜLDÜ|GEREKÇELİ KARAR|"
    r"İLK DERECE MAHKEMESİ KARARI|İLK DERECE MAHKEMESİNİN KARARI|DELİLLER)\s*:\s*",
    re.IGNORECASE,
)
_SKIP_LINE = re.compile(
    r"^(?:T\.C\.|KARAR TARİHİ|YAZIM TARİHİ|DAVA TARİHİ|ESAS NO|KARAR NO|"
    r"İNCELENEN KARARIN|MAHKEMESİ|T Ü R K|B Ö L G E|KARAR\s*$)",
    re.IGNORECASE,
)
_TERMINAL = (".", "!", "?", "…")


def _reflow_segments(text: str) -> list[str]:
    """Join soft-wrapped lines back into sentences.

    Decision text from the collector keeps source line breaks. Splitting per
    line produced mid-word fragments ("rarın Yargıtay'ca ..."), so lines are
    reflowed until terminal punctuation or a structural label.
    """
    segments: list[str] = []
    buf: list[str] = []

    def flush() -> None:
        if buf:
            segments.append(" ".join(buf).strip())
            buf.clear()

    for line in _clean_lines(text):
        if _SKIP_LINE.match(line):
            continue
        if len(line) < 100 and not any(ch.islower() for ch in line):
            # all-caps court/header line
            flush()
            continue
        while True:
            stripped = _LABEL.sub("", line, count=1).strip()
            if stripped == line:
                break
            line = stripped
        if not line:
            flush()
            continue
        if line.endswith(":"):
            flush()
            continue
        buf.append(line)
        if line.endswith(_TERMINAL):
            flush()
    flush()
    return segments


def sentences(text: str) -> list[str]:
    out: list[str] = []
    for segment in _reflow_segments(text):
        for p in _SENT_SPLIT.split(segment):
            p = p.strip()
            if len(p) < 15:
                continue
            if _HEADER_SENTENCE.search(p) and len(p) < 200:
                continue
            if p not in out:
                out.append(p)
    return out


# ---------------------------------------------------------------------------
# L0 selection helpers
# ---------------------------------------------------------------------------

_BOILERPLATE = re.compile(
    r"(incelenmesi|temyiz|süresi içinde istenilmekle|dosyadaki kağıtlar okundu|"
    r"gereği konuşulup düşünüldü|vekilinin|tarafından istenilmesi|"
    r"temyizen tetkiki|dilekçesinin süresi içinde)",
    re.IGNORECASE,
)
_DISPUTE = re.compile(
    r"(ayıp|sözleşme|bedel|iade|tüketici|uyuşmazlık|alacak|fatura|satış|garanti|"
    r"kredi|abonelik|konut|araç|onarım|teslim|kira|tazmin|borç|iflas|icra|tapu|"
    r"sigorta|ücret|aidat|cayma|arabuluculuk|hakem|itiraz|istirdat|zarar|mal|hizmet|dava)",
    re.IGNORECASE,
)
_OUTCOME_WORDS = {
    "bozma": ("bozul", "bozma"),
    "onama": ("onan",),
    "ret": ("redd",),
    "kabul": ("kabul",),
    "kismen": ("kısmen",),
    "diger": ("hüküm", "karar"),
}


def _is_boilerplate(sent: str) -> bool:
    return bool(_BOILERPLATE.search(sent))


def _is_dispute(sent: str) -> bool:
    return bool(_DISPUTE.search(sent))


def _has_outcome(sent: str, sonuc: str) -> bool:
    low = sent.lower()
    return any(w in low for w in _OUTCOME_WORDS.get(sonuc, ()))


def _score_subject(sent: str) -> int:
    low = sent.lower()
    score = 0
    if any(k in low for k in ("davacı", "davalı", "taraflar")):
        score += 2
    if any(k in low for k in ("dava", "uyuşmazlık", "istem", "talep")):
        score += 3
    if any(k in low for k in ("ayıp", "sözleşme", "tüketici", "bedel", "iade")):
        score += 3
    if len(sent) >= 80:
        score += 1
    return score


def _pick_subject(sents: list[str]) -> str:
    candidates = [s for s in sents if not _is_boilerplate(s)]
    if not candidates:
        candidates = sents
    best_i, best_score = -1, -1
    for i, s in enumerate(candidates[:12]):
        score = _score_subject(s)
        if score > best_score:
            best_i, best_score = i, score
    if best_i >= 0:
        return candidates[best_i]
    return sents[0] if sents else ""


def _final_outcome_sentence(text: str, sents: list[str], sonuc: str) -> str:
    """Outcome sentence near the end of the decision (starts on a sentence boundary).

    Never slice the raw text at the word "sonuç": that produced fragments like
    \":Yukarıda ...\" and mid-word starts. Work on extracted sentences instead.
    """
    if not sents:
        return ""
    window = sents[-8:]
    for s in reversed(window):
        if _has_outcome(s, sonuc) and not _is_boilerplate(s):
            return s
    for s in reversed(sents):
        if _has_outcome(s, sonuc):
            return s
    return window[-1] if window else ""


def _outcome_verb_sentence(sents: list[str], sonuc: str) -> str:
    for s in reversed(sents):
        if _has_outcome(s, sonuc) and not _is_boilerplate(s):
            return s
    return ""


def _outcome(text: str, sents: list[str], sonuc: str = "diger") -> str:
    """Outcome sentence used by L1 (never invented)."""
    final = _final_outcome_sentence(text, sents, sonuc)
    if final:
        return final
    verb = _outcome_verb_sentence(sents, sonuc)
    if verb:
        return verb
    return sents[-1] if sents else ""


_SONUC_LABEL = {
    "bozma": "bozma",
    "onama": "onama",
    "ret": "ret",
    "kabul": "kabul",
    "kismen": "kısmen kabul",
    "diger": "diğer",
}


def summarize_karar(metin: str, sonuc: str) -> tuple[str, str]:
    """Compose (L0, L1) *candidates*; token budgets are applied by the caller."""
    sents = sentences(metin)
    label = _SONUC_LABEL.get(sonuc, "diğer")
    if not sents:
        return f"Karar sonucu: {label}.", ""

    final = _final_outcome_sentence(metin, sents, sonuc)
    verb = _outcome_verb_sentence(sents, sonuc)
    subject = _pick_subject(sents)

    base = ""
    if final and not _is_boilerplate(final) and _is_dispute(final):
        base = final
    elif subject and _is_dispute(subject) and not _is_boilerplate(subject):
        base = subject
    elif verb and _is_dispute(verb):
        base = verb
    elif subject and not _is_boilerplate(subject):
        base = subject
    elif final:
        base = final
    elif verb:
        base = verb

    if base:
        base = re.sub(r"(?i)^(?:sonuç|hüküm)\s*[:\-]?\s*", "", base).strip()
        base = base.lstrip('"“\'‘').strip()
        base = base.rstrip(" .;:")
    # Never ship a fragment that starts mid-word/lowercase.
    if base and not (base[0].isupper() or base[0].isdigit()):
        fallback = next((c for c in (subject, verb, final)
                         if c and (c[0].isupper() or c[0].isdigit())), "")
        base = fallback.rstrip(" .;:") if fallback else ""
    if not base or len(base) < 15:
        l0 = f"Karar sonucu: {label}."
    else:
        l0 = f"{base} Sonuç: {label}."

    # L1: subject + up to two reasoning sentences + outcome (2-4 sentences).
    outcome = _outcome(metin, sents, sonuc)
    reasoning: list[str] = []
    start = sents.index(subject) if subject in sents else 0
    for s in sents[start + 1 :]:
        if s in (subject, outcome) or _is_boilerplate(s):
            continue
        if len(s) < 40:
            continue
        reasoning.append(s)
        if len(reasoning) == 2:
            break
    if not reasoning:
        for s in sents:
            if s not in (subject, outcome) and len(s) >= 40 and not _is_boilerplate(s):
                reasoning = [s]
                break

    l1_parts = [subject] + reasoning
    if outcome and outcome not in l1_parts:
        l1_parts.append(outcome)
    l1 = " ".join(p.strip() for p in l1_parts[:4] if p.strip())
    return l0, l1


def summarize_article(baslik: str | None, metin: str) -> str:
    """Article L1: title + first substantive sentences, token-trimmed later."""
    sents = sentences(metin)
    body = " ".join(sents[:3]) if sents else metin.strip()
    title = (baslik or "").strip()
    if title:
        return f"{title}. {body}".strip()
    return body


def fit_summaries(
    candidates: list[tuple[str, str]],
    counter: TokenCounter,
) -> tuple[list[str], list[str], list[int], list[int]]:
    """Apply the L0/L1 budgets to candidates.

    L0 keeps its trailing outcome clause and never cuts a word: the subject is
    trimmed word-wise (with " …") and the outcome is appended afterwards.
    Returns (l0s, l1s, token_l0, token_l1) counted on the final strings.
    """
    subjects: list[str] = []
    suffixes: list[str] = []
    for l0, _l1 in candidates:
        marker = " Sonuç: "
        if marker in l0:
            subject, suffix = l0.rsplit(marker, 1)
            subjects.append(subject)
            suffixes.append(marker + suffix)
        else:
            subjects.append(l0)
            suffixes.append("")
    original = list(subjects)
    suffix_tokens = counter.count_many(suffixes)
    subject_budget = max(10, L0_LIMIT - max(suffix_tokens or [0]) - 3)
    trimmed = fit_many(subjects, subject_budget, counter)
    for i, text in enumerate(trimmed):
        if text != original[i] and not text.endswith("…"):
            trimmed[i] = text.rstrip(" ,;:") + " …"
    l0s = [s + x for s, x in zip(trimmed, suffixes)]
    # Safety pass: only pathological texts reach it; keeps <= L0_LIMIT.
    l0s = fit_many(l0s, L0_LIMIT, counter)

    l1s = fit_many([c[1] for c in candidates], L1_LIMIT, counter)
    t0 = counter.count_many(l0s)
    t1 = counter.count_many(l1s)
    return l0s, l1s, t0, t1


def fit_article_summaries(texts: list[str], counter: TokenCounter) -> tuple[list[str], list[int]]:
    l1s = fit_many(texts, L1_LIMIT, counter)
    return l1s, counter.count_many(l1s)


def p95(values: list[int]) -> int:
    """Nearest-rank 95th percentile (deterministic, no interpolation)."""
    if not values:
        return 0
    ordered = sorted(values)
    idx = max(0, math.ceil(0.95 * len(ordered)) - 1)
    return ordered[idx]
