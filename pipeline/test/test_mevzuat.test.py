"""Article segmentation over the *real* cached 6502 page.

Not a toy fixture: this is the page the pipeline actually compiles. It proves
the heading regex handles new-era ``MADDE 11-``, lettered ``MADDE 73/A-`` and
does not mistake body citations ("11. maddesi") for headings.
"""
from __future__ import annotations

import json
import unittest
from pathlib import Path

from pipeline.collect.laws import CACHE_DIR, load_index
from pipeline.parse.mevzuat import decode_html, parse_law


def _cached_6502() -> bytes:
    index = load_index()
    entry = index.get("6502")
    if entry:
        p = CACHE_DIR / entry["path"]
        if p.exists():
            return p.read_bytes()
    # fall back to any fetched copy
    for p in CACHE_DIR.glob("*.6502.htm"):
        return p.read_bytes()
    raise unittest.SkipTest("6502 cache missing; run pipeline/build.py first")


class TestMevzuatSegmentation(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        raw = _cached_6502()
        cls.law = parse_law(decode_html(raw), "6502", "cache://6502", tur="kanun")
        cls.by_id = {a.id: a for a in cls.law.articles}

    def test_real_article_contains_ayipli(self) -> None:
        art = self.by_id["m:6502/11"]
        self.assertIn("ayıplı", art.metin)
        self.assertEqual(art.baslik, "Tüketicinin seçimlik hakları")

    def test_required_articles_resolve(self) -> None:
        for aid in ("m:6502/11", "m:6502/12", "m:6502/48", "m:6502/68",
                    "m:6502/73", "m:6502/73A"):
            self.assertIn(aid, self.by_id, aid)
            self.assertTrue(self.by_id[aid].metin.strip(), aid)

    def test_lettered_article_is_not_duplicate(self) -> None:
        self.assertEqual(self.by_id["m:6502/73A"].baslik,
                         "Dava şartı olarak arabuluculuk")
        self.assertNotEqual(self.by_id["m:6502/73"].metin,
                            self.by_id["m:6502/73A"].metin)

    def test_body_citations_are_not_headings(self) -> None:
        # "73 üncü maddede" appears inside body text; it must not create m:6502/73#2
        ids = [a.id for a in self.law.articles]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn("m:6502/74", ids)

    def test_metadata(self) -> None:
        self.assertEqual(self.law.id, "6502")
        self.assertIn("TÜKETİCİNİN KORUNMASI", self.law.ad)
        self.assertEqual(self.law.kabul_tarihi, "2013-11-07")
        self.assertEqual(self.law.rg_tarih, "2013-11-28")
        self.assertEqual(self.law.rg_sayi, 28835)

    def test_mulga_is_recorded_not_dropped(self) -> None:
        # 6502 has repealed provisions; if present they keep their row + marker.
        mulga = [a for a in self.law.articles
                 if a.degisiklik and "ülga" in a.degisiklik]
        # not every version has one; if it does, text must still exist
        for a in mulga:
            self.assertTrue(a.metin)

    def test_count_is_sane(self) -> None:
        self.assertGreaterEqual(len(self.law.articles), 88)

    def test_official_holidays_law(self) -> None:
        p = CACHE_DIR / "1.5.2429.htm"
        if not p.exists():
            self.skipTest("2429 cache missing")
        law = parse_law(decode_html(p.read_bytes()), "2429", "cache://2429")
        by_id = {a.id: a for a in law.articles}
        self.assertIn("m:2429/2", by_id)
        self.assertIn("Ramazan Bayramı", by_id["m:2429/2"].metin)


class TestWindows1254(unittest.TestCase):
    def test_decode_turkish_bytes(self) -> None:
        raw = b"T\xfcketici Hakem Heyeti \xfd\xfe\xf0"
        self.assertEqual(decode_html(raw), "Tüketici Hakem Heyeti ışğ")

    def test_no_replacement_on_real_page(self) -> None:
        raw = _cached_6502()
        text = decode_html(raw)
        self.assertNotIn("\ufffd", text[:5000])
        self.assertIn("TÜKETİCİNİN", text)

    def test_old_law_encoding(self) -> None:
        p = CACHE_DIR / "1.3.2004.htm"
        if not p.exists():
            self.skipTest("2004 cache missing")
        text = decode_html(p.read_bytes())
        self.assertIn("İCRA VE İFLAS KANUNU", text)
        self.assertIn("Madde", text)


if __name__ == "__main__":
    unittest.main()
