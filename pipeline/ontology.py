"""Ontology + card materialisation for every legal field.

Sources (read-only, owned by other packages):
  packages/ontology/tuketici.yaml               -> consumer-law dugum rows
  packages/ontology/sgk.yaml                    -> SGK dugum rows
  packages/ontology/cards/tuketici-kartlar.yaml -> authored consumer cards
  packages/ontology/cards/sgk-kartlar.yaml      -> authored SGK cards

Each field is one independent tree (`t/tuketici`, `s/sgk`) flattened into the
same ``dugum`` table. Every leaf gets exactly one card: either an authored
(``taslak``) card from the card YAML, or a deterministic ``otomatik`` template.
Every generated sentence carries a real ``[m:...]`` citation from the leaf's
own (or inherited) ``maddeler`` list; no legal text is invented beyond the
authored ``aciklama``. Nothing is ever marked ``uzman_onayli`` here.

YAML is parsed with the repository's own ``yaml`` package via Node (the project
already requires Node for the server and for token counting), so the pipeline
adds no new Python dependency.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

from pipeline.trtext_py import ngram_vector, vector_to_json

ROOT = Path(__file__).resolve().parents[1]
ONTOLOGY_FILES: tuple[Path, ...] = (
    ROOT / "packages" / "ontology" / "tuketici.yaml",
    ROOT / "packages" / "ontology" / "sgk.yaml",
)
CARDS_FILES: tuple[Path, ...] = (
    ROOT / "packages" / "ontology" / "cards" / "tuketici-kartlar.yaml",
    ROOT / "packages" / "ontology" / "cards" / "sgk-kartlar.yaml",
)
#: Backwards-compatible single-field aliases.
ONTOLOGY_YAML = ONTOLOGY_FILES[0]
CARDS_YAML = CARDS_FILES[0]

PRIORITY = {"ÖZET": 10, "HAKLAR": 30, "YOL": 40, "DİKKAT": 80}
CITATION = re.compile(r"\[([a-z]:[^\]\s]+)\]")

ONTOLOGY_SURUM = 1
CARD_SURUM = 1


class OntologyError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# YAML loading (via Node, using the repo's `yaml` dependency)
# ---------------------------------------------------------------------------

def load_sources() -> dict:
    """Load every configured ontology + card file in one Node process.

    Returns ``{"ontologies": [...raw roots...], "cards": {"surum": N,
    "kartlar": [...authored cards...]}}``. The order of the lists follows
    ``ONTOLOGY_FILES`` / ``CARDS_FILES``; the build never depends on it, but it
    keeps generated rows deterministic.
    """
    missing = [p for p in (*ONTOLOGY_FILES, *CARDS_FILES) if not p.exists()]
    if missing:
        raise OntologyError(
            "missing ontology source(s): " + ", ".join(str(p) for p in missing))

    onto_rel = [p.relative_to(ROOT).as_posix() for p in ONTOLOGY_FILES]
    cards_rel = [p.relative_to(ROOT).as_posix() for p in CARDS_FILES]
    script = f"""
import {{parse}} from 'yaml';
import {{readFileSync}} from 'fs';
const read = (p) => parse(readFileSync(p, 'utf8'));
const ontologies = {json.dumps(onto_rel)}.map(read);
const cardFiles = {json.dumps(cards_rel)}.map(read);
const kartlar = cardFiles.flatMap((f) => f.kartlar ?? []);
const surum = cardFiles.reduce((m, f) => Math.max(m, f.surum ?? 1), 1);
process.stdout.write(JSON.stringify({{ontologies, cards: {{surum, kartlar}}}}));
"""
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True, text=True, cwd=ROOT, check=False,
    )
    if proc.returncode != 0:
        raise OntologyError(f"YAML parse failed: {proc.stderr.strip()[:800]}")
    sources = json.loads(proc.stdout)
    if not sources.get("ontologies"):
        raise OntologyError("no ontology roots loaded")
    # single-field callers (routing tests, older scripts) read ["ontology"]
    sources["ontology"] = sources["ontologies"][0]
    return sources


# ---------------------------------------------------------------------------
# dugum
# ---------------------------------------------------------------------------

def _vektor_metni(node: dict) -> str:
    return " ".join([node["ad"], node["aciklama"],
                     *node["tetikleyiciler"], *node["ornek_sorgular"]])


def _as_ontologies(raw: dict | list[dict]) -> list[dict]:
    if isinstance(raw, dict):
        return [raw]
    return list(raw)


def build_dugumler(raw: dict | list[dict]) -> list[dict]:
    """Flatten one or more YAML trees exactly like packages/ontology/src/index.ts.

    A leaf that carries its own ``kurallar`` / ``maddeler`` list overrides the
    branch defaults; otherwise it inherits them. This is what lets the SGK
    leaves point at their own statute articles while the branch keeps the
    field-wide fallback.
    """
    rows: list[dict] = []
    for root in _as_ontologies(raw):
        rows.append({
            "id": root["kok"],
            "ust_id": None,
            "ad": root["ad"],
            "aciklama": (root.get("kok_aciklama") or f"{root['ad']} kökü.").strip(),
            "tetikleyiciler": [],
            "ornek_sorgular": [],
            "kurallar": [],
            "maddeler": [],
            "sira": len(rows),
        })
        for branch in root.get("dallar") or []:
            branch_kurallar = branch.get("kurallar") or []
            branch_maddeler = branch.get("maddeler") or []
            rows.append({
                "id": branch["id"],
                "ust_id": root["kok"],
                "ad": branch["ad"],
                "aciklama": branch.get("aciklama") or "",
                "tetikleyiciler": [],
                "ornek_sorgular": [],
                "kurallar": branch_kurallar,
                "maddeler": branch_maddeler,
                "sira": len(rows),
            })
            for leaf in branch.get("yapraklar") or []:
                rows.append({
                    "id": leaf["id"],
                    "ust_id": branch["id"],
                    "ad": leaf["ad"],
                    "aciklama": leaf.get("aciklama") or "",
                    "tetikleyiciler": leaf.get("tetikleyiciler") or [],
                    "ornek_sorgular": leaf.get("ornek_sorgular") or [],
                    # own list wins; otherwise inherit the branch's defaults
                    "kurallar": leaf.get("kurallar") or branch_kurallar,
                    "maddeler": leaf.get("maddeler") or branch_maddeler,
                    "sira": len(rows),
                })
    for row in rows:
        row["vektor"] = vector_to_json(ngram_vector(_vektor_metni(row)))
    return rows


def expected_counts(ontologies: list[dict]) -> tuple[int, int]:
    """(dugum, kart) counts implied by the source YAML trees.

    ``dugum`` = root + branches + leaves per field; ``kart`` = one per leaf.
    ``validate`` compares the materialised rows against these so the gate is
    derived from the sources, not from a hard-coded 51/41.
    """
    dugum = 0
    kart = 0
    for root in ontologies:
        dallar = root.get("dallar") or []
        yapraklar = sum(len(b.get("yapraklar") or []) for b in dallar)
        dugum += 1 + len(dallar) + yapraklar
        kart += yapraklar
    return dugum, kart


def _leaves(dugumler: list[dict]) -> list[dict]:
    """Nodes that have no children (works with any number of roots)."""
    parents = {d["ust_id"] for d in dugumler if d["ust_id"]}
    return [d for d in dugumler if d["id"] not in parents]


# ---------------------------------------------------------------------------
# kart
# ---------------------------------------------------------------------------

def _citations(bolumler: list[dict]) -> list[str]:
    out: list[str] = []
    for b in bolumler:
        for m in CITATION.finditer(b["metin"]):
            cid = m.group(1)
            if cid not in out:
                out.append(cid)
    return out


def _hash_icerik(icerik: dict) -> str:
    blob = json.dumps(icerik, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _row_from_sections(dugum_id: str, surum: int, durum: str,
                       sections: list[tuple[str, str]],
                       counter, guncelleme: str, onaylayan: str | None = None) -> dict:
    bolumler = []
    for etiket, metin in sections:
        metin = metin.strip()
        bolumler.append({
            "etiket": etiket,
            "metin": metin,
            "token": 0,  # filled below in one batch by caller
            "oncelik": PRIORITY.get(etiket, 90),
        })
    kaynaklar = _citations(bolumler)
    icerik = {
        "dugum_id": dugum_id,
        "surum": surum,
        "durum": durum,
        "bolumler": bolumler,
        "kaynaklar": kaynaklar,
        "girdi_hash": "",  # filled after hashing
        "token": 0,
    }
    return {
        "dugum_id": dugum_id,
        "surum": surum,
        "durum": durum,
        "bolumler": bolumler,
        "kaynaklar": kaynaklar,
        "icerik": icerik,
        "onaylayan": onaylayan,
        "onay_zamani": None,
        "guncelleme": guncelleme,
    }


def _template_sections(leaf: dict) -> list[tuple[str, str]]:
    maddeler = leaf.get("maddeler") or []
    if not maddeler:
        raise OntologyError(f"leaf {leaf['id']} inherits no maddeler; cannot cite a template")
    first = maddeler[0]
    aciklama = (leaf.get("aciklama") or "").strip()
    if not aciklama:
        raise OntologyError(f"leaf {leaf['id']} has no aciklama; refusing to invent one")

    ozet = f"{aciklama} [{first}]"

    if leaf["id"].startswith("t/ayipli-mal/"):
        haklar = "\n".join([
            "- Sözleşmeden dönme (bedel iadesi) [m:6502/11]",
            "- Satış bedelinden ayıp oranında indirim [m:6502/11]",
            "- Ücretsiz onarım [m:6502/11]",
            "- Ayıpsız misli ile değiştirme [m:6502/11]",
        ])
    elif leaf["id"].startswith("t/ayipli-hizmet/"):
        haklar = "\n".join([
            "- Hizmetin yeniden görülmesi [m:6502/15]",
            "- Hizmet sonucu ortaya çıkan eserin ücretsiz onarımı [m:6502/15]",
            "- Ayıp oranında bedelden indirim veya sözleşmeden dönme [m:6502/15]",
        ])
    else:
        haklar = f"- Ayrıntı için ilgili maddeye bakın [{first}]"

    if leaf["id"].startswith("s/"):
        # Generic social-security fallback: every sentence cites the leaf's own
        # statute article, never a consumer-law article. All SGK leaves ship
        # authored cards; this exists so a future missing card cannot break the
        # build or emit a wrong consumer citation.
        yol = "\n".join([
            f"1) Belgeleyin (karar, yazışma, provizyon kaydı) [{first}]",
            f"2) Kuruma yazılı başvurun [{first}]",
            f"3) Sonuç alamazsanız görevli mercie başvurun [{first}]",
        ])
    else:
        yol = "\n".join([
            f"1) Belgeleyin (fatura, sözleşme, yazışma) [{first}]",
            f"2) Karşı tarafa yazılı bildirim yapın [{first}]",
            "3) Uyuşmazlık değerine göre tüketici hakem heyeti veya tüketici mahkemesi "
            "[m:6502/68] [m:6502/73]",
        ])
    return [("ÖZET", ozet), ("HAKLAR", haklar), ("YOL", yol)]


def build_kartlar(raw_cards: dict | list[dict], dugumler: list[dict], counter,
                  guncelleme: str) -> tuple[list[dict], list[str]]:
    """Return (kart rows, integrity problems).

    ``raw_cards`` is either the combined ``{"kartlar": [...]}`` mapping from
    ``load_sources`` or a list of per-field card mappings.
    """
    if isinstance(raw_cards, dict):
        raw_list = raw_cards.get("kartlar") or []
    else:
        raw_list = [k for f in raw_cards for k in (f.get("kartlar") or [])]

    leaves = _leaves(dugumler)
    leaf_ids = {d["id"] for d in leaves}
    authored_ids = set()
    rows: list[dict] = []

    for raw in raw_list:
        did = raw["dugum_id"]
        if did not in leaf_ids:
            raise OntologyError(f"authored card targets non-leaf/unknown node: {did}")
        authored_ids.add(did)
        sections = [(b["etiket"], b["metin"]) for b in raw["bolumler"]]
        row = _row_from_sections(did, raw.get("surum") or CARD_SURUM,
                                 raw["durum"], sections, counter, guncelleme,
                                 raw.get("onaylayan"))
        rows.append(row)

    for leaf in leaves:
        if leaf["id"] in authored_ids:
            continue
        sections = _template_sections(leaf)
        rows.append(_row_from_sections(leaf["id"], CARD_SURUM, "otomatik",
                                       sections, counter, guncelleme))

    # token counts, batched
    all_sections = [b for row in rows for b in row["bolumler"]]
    tokens = counter.count_many([b["metin"] for b in all_sections])
    for b, tok in zip(all_sections, tokens):
        b["token"] = tok

    problems: list[str] = []
    for row in rows:
        row["token"] = sum(b["token"] for b in row["bolumler"])
        ic = row["icerik"]
        ic["bolumler"] = row["bolumler"]
        ic["kaynaklar"] = row["kaynaklar"]
        ic["token"] = row["token"]
        ic["girdi_hash"] = _hash_icerik({k: v for k, v in ic.items() if k != "girdi_hash"})
        row["girdi_hash"] = ic["girdi_hash"]
        row["bolum_tokenlari"] = json.dumps(
            {b["etiket"]: b["token"] for b in row["bolumler"]},
            ensure_ascii=False, separators=(",", ":"))
        row["icerik_json"] = json.dumps(ic, ensure_ascii=False, separators=(",", ":"))
        if not row["kaynaklar"]:
            problems.append(f"card-without-citations:{row['dugum_id']}")
        if row["durum"] == "uzman_onayli" and not row["onaylayan"]:
            problems.append(f"unapproved-card:{row['dugum_id']}")
    return rows, problems


def validate(dugumler: list[dict], kartlar: list[dict],
             known_ids: set[str], beklenen_dugum: int | None = None,
             beklenen_kart: int | None = None) -> list[str]:
    """Structural integrity; expected counts come from the source YAML trees."""
    problems: list[str] = []
    if beklenen_dugum is not None and len(dugumler) != beklenen_dugum:
        problems.append(f"dugum-count:{len(dugumler)}!={beklenen_dugum}")
    if beklenen_kart is not None and len(kartlar) != beklenen_kart:
        problems.append(f"kart-count:{len(kartlar)}!={beklenen_kart}")
    ids = {d["id"] for d in dugumler}
    for d in dugumler:
        if not d.get("vektor"):
            problems.append(f"missing-vector:{d['id']}")
        if d["ust_id"] and d["ust_id"] not in ids:
            problems.append(f"missing-parent:{d['id']}")
    for k in kartlar:
        if k["dugum_id"] not in ids:
            problems.append(f"card-unknown-node:{k['dugum_id']}")
        for cid in k["kaynaklar"]:
            if cid not in known_ids:
                problems.append(f"unresolved-citation:{k['dugum_id']}->{cid}")
    return problems
