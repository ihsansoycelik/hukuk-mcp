#!/usr/bin/env python3
"""Regenerate ``data/build/parity_words.json`` from the real collected corpus.

The fixture is the shared contract between the TypeScript analyser
(packages/tr-text) and the Python port (pipeline/trtext_py.py). Expected
outputs are produced by *Node running the TS source*, never by Python:

    uv run python pipeline/test/gen_parity_fixture.py

Then ``pytest`` compares the Python analyser against it word for word.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TARGET = 300
WORD_RE = re.compile(r"[A-Za-zÇĞİÖŞÜçğıöşüâîûêô]{4,20}")

#: words whose morphology/casing we explicitly want covered
SEEDS = [
    "ayıplı", "ayıpsız", "iadesi", "iade", "bedel", "gizli", "Tüketicinin",
    "tüketici", "İSTANBUL", "IĞDIR", "hukuk", "dairesi", "sözleşme", "ayıp",
    "zamanaşımı", "müteselsilen", "satıcı", "davalı", "davacı", "hüküm",
    "bozulmasına", "onanmasına", "reddine", "kabulüne", "kartı", "şımanı",
    "arıza", "aracımdaki", "bilirkişi", "mahkemesi", "kararı", "kanunun",
]


def corpus_texts() -> list[str]:
    texts: list[str] = []
    dec = ROOT / "data" / "raw" / "decisions.jsonl"
    if dec.exists():
        for line in dec.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(rec, dict) and rec.get("metin"):
                texts.append(str(rec["metin"]))
    db = ROOT / "data" / "build" / "hukuk.db"
    if db.exists():
        import sqlite3
        conn = sqlite3.connect(db)
        try:
            texts.extend(r[0] for r in conn.execute("SELECT metin FROM madde"))
        finally:
            conn.close()
    if not texts:
        raise SystemExit("no corpus found: run pipeline/build.py first")
    return texts


def select_words(texts: list[str]) -> list[str]:
    counter: Counter[str] = Counter()
    for t in texts:
        counter.update(WORD_RE.findall(t))
    chosen: list[str] = []

    def add(w: str) -> None:
        if w not in chosen and len(chosen) < TARGET:
            chosen.append(w)

    for w in SEEDS:
        add(w)
    # frequency-ranked, but keep the set varied rather than 300 forms of "dava"
    for w, _n in counter.most_common():
        add(w)
    # deterministic tail: alphabetical fill
    for w in sorted(counter):
        add(w)
    return chosen[:TARGET]


def ts_expected(words: list[str]) -> list[dict]:
    script = """
import {analyze} from './packages/tr-text/src/index.ts';
let data = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) data += chunk;
const words = JSON.parse(data);
process.stdout.write(JSON.stringify(words.map(w => {
  const a = analyze(w);
  return {word: w, tokens: a.tokens, kok: a.kok};
})));
"""
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        input=json.dumps(words, ensure_ascii=False),
        capture_output=True, text=True, cwd=ROOT, check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(f"node/TS analyser failed: {proc.stderr[:800]}")
    return json.loads(proc.stdout)


def main() -> None:
    words = select_words(corpus_texts())
    expected = ts_expected(words)
    out = ROOT / "data" / "build" / "parity_words.json"
    out.write_text(
        json.dumps(
            {
                "generated_by": "node packages/tr-text/src/index.ts (analyze)",
                "count": len(words),
                "words": words,
                "expected": expected,
            },
            ensure_ascii=False,
            indent=1,
        ) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {out} ({len(words)} words)")


if __name__ == "__main__":
    main()
