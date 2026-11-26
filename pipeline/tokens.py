"""Token counting with the *same* tokenizer as the server (``gpt-tokenizer``).

Why shell out to Node
---------------------
The MCP server is TypeScript and uses ``gpt-tokenizer`` (``encode``). Python's
``tiktoken`` is a different implementation/encoding family; using it would make
our token budgets drift from the server's. Instead we run a tiny Node script
that imports the project's own ``gpt-tokenizer`` and counts a batch of strings
passed as JSON on stdin. Counts are cached by SHA-256 of the text in
``data/build/token_cache.json`` so reruns are cheap and fully offline.

Documented in ``pipeline/NOTES.md``. No new Python dependencies.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE_PATH = ROOT / "data" / "build" / "token_cache.json"
SCHEME = "gpt-tokenizer-default"

_NODE_SCRIPT = r"""
import {encode} from 'gpt-tokenizer';
let data = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) data += chunk;
const texts = JSON.parse(data);
process.stdout.write(JSON.stringify(texts.map(t => encode(t).length)));
"""


class TokenCounter:
    """Batched, cached token counter backed by Node + gpt-tokenizer."""

    def __init__(self, cache_path: Path = CACHE_PATH, batch_size: int = 400) -> None:
        self.cache_path = Path(cache_path)
        self.batch_size = batch_size
        self._cache: dict[str, int] = {}
        self._dirty = False
        self._load()

    # -- cache -------------------------------------------------------------
    def _load(self) -> None:
        if not self.cache_path.exists():
            return
        try:
            payload = json.loads(self.cache_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return
        if payload.get("scheme") == SCHEME and isinstance(payload.get("counts"), dict):
            self._cache = {k: int(v) for k, v in payload["counts"].items()}

    def save(self) -> None:
        if not self._dirty:
            return
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "scheme": SCHEME,
            "counts": {k: self._cache[k] for k in sorted(self._cache)},
        }
        tmp = self.cache_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
        tmp.replace(self.cache_path)
        self._dirty = False

    @staticmethod
    def _key(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    # -- counting ----------------------------------------------------------
    def _node(self, texts: list[str]) -> list[int]:
        node = shutil.which("node")
        if not node:
            raise RuntimeError("node not found: token counts need Node + gpt-tokenizer")
        proc = subprocess.run(
            [node, "--input-type=module", "-e", _NODE_SCRIPT],
            input=json.dumps(texts, ensure_ascii=False),
            capture_output=True,
            text=True,
            cwd=ROOT,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"gpt-tokenizer node call failed: {proc.stderr.strip()[:500]}")
        try:
            counts = json.loads(proc.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"bad tokenizer output: {proc.stdout[:200]!r}") from exc
        if len(counts) != len(texts):
            raise RuntimeError("tokenizer returned wrong number of counts")
        return [int(c) for c in counts]

    def count_many(self, texts: list[str]) -> list[int]:
        if not texts:
            return []
        out: list[int | None] = [None] * len(texts)
        missing: dict[str, str] = {}
        for i, t in enumerate(texts):
            k = self._key(t)
            if k in self._cache:
                out[i] = self._cache[k]
            else:
                missing[k] = t
        keys = list(missing)
        for start in range(0, len(keys), self.batch_size):
            chunk_keys = keys[start : start + self.batch_size]
            counts = self._node([missing[k] for k in chunk_keys])
            for k, c in zip(chunk_keys, counts):
                self._cache[k] = c
                self._dirty = True
        for i, t in enumerate(texts):
            if out[i] is None:
                out[i] = self._cache[self._key(t)]
        return [int(c) for c in out]  # type: ignore[arg-type]

    def count(self, text: str) -> int:
        return self.count_many([text])[0]


def fit_many(texts: list[str], limit: int, counter: TokenCounter) -> list[str]:
    """Trim texts to <= ``limit`` tokens, word-wise, in batched waves.

    Deterministic: same input -> same output. Trimming keeps whole words and
    never adds content. Most texts fit on the first pass; over-budget ones are
    trimmed proportionally and re-counted until they fit.
    """
    result: list[str] = [""] * len(texts)
    pending: list[tuple[int, str]] = []
    initial = counter.count_many(texts)
    for i, (t, c) in enumerate(zip(texts, initial)):
        if c <= limit:
            result[i] = t
        else:
            pending.append((i, t))

    for _wave in range(10):
        if not pending:
            break
        counts = counter.count_many([t for _, t in pending])
        nxt: list[tuple[int, str]] = []
        for (i, text), count in zip(pending, counts):
            if count <= limit:
                result[i] = text
                continue
            words = text.split(" ")
            if len(words) <= 1:
                result[i] = text[: max(1, limit)]
                continue
            keep = max(1, int(len(words) * limit / max(count, 1) * 0.97))
            keep = min(keep, len(words) - 1)
            nxt.append((i, " ".join(words[:keep]).rstrip(" ,;:")))
        pending = nxt

    for i, text in pending:
        # Pathological fallback: keep roughly half a token per word budget.
        words = text.split(" ")
        result[i] = " ".join(words[: max(1, limit // 3)]).rstrip(" ,;:")
    return result
