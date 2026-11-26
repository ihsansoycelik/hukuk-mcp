"""Ontology + card materialisation tests (no DB required)."""
from __future__ import annotations

import json
import unittest

from pipeline.ontology import (
    OntologyError,
    _template_sections,
    build_dugumler,
    build_kartlar,
    expected_counts,
    load_sources,
    validate,
)
from pipeline.tokens import TokenCounter

SGK_LEAVES = (
    "s/saglik/isten-ayrilma-sonrasi-hak",
    "s/saglik/provizyon-alinamama",
    "s/saglik/katilim-payi-iadesi",
    "s/gss/gelir-testi",
    "s/gss/prim-borcu",
    "s/gelir/issizlik-odenegi",
    "s/is-kazasi/bildirim-ve-haklar",
    "s/usul/kurum-karari-itiraz",
)


class TestOntology(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sources = load_sources()
        cls.ontologies = cls.sources["ontologies"]
        cls.dugumler = build_dugumler(cls.ontologies)
        cls.by_id = {d["id"]: d for d in cls.dugumler}
        cls.counter = TokenCounter()
        cls.kartlar, cls.problems = build_kartlar(
            cls.sources["cards"], cls.dugumler, cls.counter, "2026-10-22T00:00:00")

    def test_counts(self) -> None:
        # 51 consumer nodes + 14 SGK nodes; one card per leaf (41 + 8).
        self.assertEqual(expected_counts(self.ontologies), (65, 49))
        self.assertEqual(len(self.dugumler), 65)
        self.assertEqual(len(self.kartlar), 49)

        roots = [d for d in self.dugumler if d["ust_id"] is None]
        self.assertEqual([d["id"] for d in roots], ["t/tuketici", "s/sgk"])

        consumer = [k for k in self.kartlar if k["dugum_id"].startswith("t/")]
        sgk = [k for k in self.kartlar if k["dugum_id"].startswith("s/")]
        self.assertEqual(len(consumer), 41)
        self.assertEqual(len(sgk), 8)
        # 16 consumer cards are hand-written (the enerji-fatura card is the 16th);
        # the remaining 25 consumer leaves get a deterministic template.
        self.assertEqual(sum(1 for k in consumer if k["durum"] == "taslak"), 16)
        self.assertEqual(sum(1 for k in consumer if k["durum"] == "otomatik"), 25)
        # every SGK leaf ships a hand-written card
        self.assertEqual(sum(1 for k in sgk if k["durum"] == "taslak"), 8)
        self.assertEqual(sum(1 for k in sgk if k["durum"] == "otomatik"), 0)

    def test_two_roots_and_tree_shape(self) -> None:
        self.assertEqual(sum(1 for d in self.dugumler if d["ust_id"] == "t/tuketici"), 9)
        self.assertEqual(sum(1 for d in self.dugumler if d["ust_id"] == "s/sgk"), 5)

        branch_ids = {d["ust_id"] for d in self.dugumler if d["ust_id"]}
        leaves = [d for d in self.dugumler if d["id"] not in branch_ids]
        self.assertEqual(len(leaves), 49)
        self.assertEqual(sum(1 for d in leaves if d["id"].startswith("t/")), 41)
        self.assertEqual(sum(1 for d in leaves if d["id"].startswith("s/")), 8)

    def test_root_descriptions_come_from_source(self) -> None:
        self.assertEqual(self.by_id["s/sgk"]["aciklama"], "Sosyal güvenlik (SGK) kökü.")
        # tuketici.yaml has no kok_aciklama; the fallback is derived from ad.
        self.assertEqual(self.by_id["t/tuketici"]["aciklama"], "Tüketici Hukuku kökü.")

    def test_leaf_rules_override_branch(self) -> None:
        leaf = self.by_id["s/gss/prim-borcu"]
        self.assertEqual(leaf["maddeler"], ["m:5510/67", "m:5510/89", "m:5510/93"])
        self.assertEqual(leaf["kurallar"], ["gss_prim_zamanasimi"])
        branch = self.by_id["s/gss"]
        self.assertIn("m:5510/60", branch["maddeler"])
        self.assertNotIn("m:5510/60", leaf["maddeler"])

        # consumer leaves still inherit the branch's defaults
        inherited = self.by_id["t/ayipli-mal/arac"]
        self.assertEqual(inherited["maddeler"], self.by_id["t/ayipli-mal"]["maddeler"])
        self.assertEqual(inherited["kurallar"], self.by_id["t/ayipli-mal"]["kurallar"])

    def test_sgk_leaves_and_cards_present(self) -> None:
        for leaf_id in SGK_LEAVES:
            self.assertIn(leaf_id, self.by_id)
            self.assertTrue(self.by_id[leaf_id]["id"].startswith("s/"))
        carded = {k["dugum_id"] for k in self.kartlar}
        for leaf_id in SGK_LEAVES:
            self.assertIn(leaf_id, carded)

    def test_every_node_has_vector(self) -> None:
        for d in self.dugumler:
            self.assertTrue(d["vektor"], d["id"])
            self.assertTrue(d["vektor"].startswith("{"), d["id"])

    def test_no_template_is_approved(self) -> None:
        self.assertEqual(self.problems, [])
        for k in self.kartlar:
            if k["durum"] == "otomatik":
                self.assertIsNone(k["onaylayan"])
                self.assertNotEqual(k["durum"], "uzman_onayli")

    def test_template_citations_and_shape(self) -> None:
        mal = next(d for d in self.dugumler if d["id"] == "t/ayipli-mal/arac")
        sections = dict(_template_sections(mal))
        self.assertEqual(list(sections), ["ÖZET", "HAKLAR", "YOL"])
        self.assertIn("[m:6502/11]", sections["HAKLAR"])
        self.assertIn("[m:6502/68]", sections["YOL"])
        self.assertIn("[m:6502/73]", sections["YOL"])
        self.assertIn("[m:6502/8]", sections["ÖZET"])

        hizmet = next(d for d in self.dugumler if d["id"] == "t/ayipli-hizmet/tamir-servis")
        h = dict(_template_sections(hizmet))
        self.assertIn("[m:6502/15]", h["HAKLAR"])

        other = next(d for d in self.dugumler if d["id"] == "t/finansal/kredi-masraflari")
        o = dict(_template_sections(other))
        self.assertIn("[m:6502/4]", o["HAKLAR"])

    def test_sgk_template_fallback_never_cites_consumer_law(self) -> None:
        # Every SGK leaf ships an authored card; this guards the fallback path so
        # a future missing card cannot emit a consumer-law citation.
        sgk = self.by_id["s/usul/kurum-karari-itiraz"]
        sections = dict(_template_sections(sgk))
        self.assertEqual(list(sections), ["ÖZET", "HAKLAR", "YOL"])
        self.assertIn("[m:5510/96]", sections["ÖZET"])
        # every fallback citation comes from the leaf's own maddeler list
        import re as _re
        cited = {m for text in sections.values() for m in _re.findall(r"\[(m:[^\]]+)\]", text)}
        self.assertTrue(cited)
        self.assertLessEqual(cited, set(sgk["maddeler"]), cited)
        self.assertNotIn("6502", " ".join(sections.values()))
        self.assertNotIn("tüketici", " ".join(sections.values()).lower())

    def test_template_refuses_to_invent_text(self) -> None:
        with self.assertRaises(OntologyError):
            _template_sections({"id": "s/yok/bos", "aciklama": "", "maddeler": ["m:5510/1"]})
        with self.assertRaises(OntologyError):
            _template_sections({"id": "s/yok/bos", "aciklama": "x", "maddeler": []})

    def test_card_json_shape(self) -> None:
        for k in self.kartlar:
            ic = json.loads(k["icerik_json"])
            self.assertEqual(ic["dugum_id"], k["dugum_id"])
            self.assertEqual(ic["token"], sum(b["token"] for b in ic["bolumler"]))
            self.assertEqual(ic["kaynaklar"], k["kaynaklar"])
            self.assertEqual(json.loads(k["bolum_tokenlari"]),
                             {b["etiket"]: b["token"] for b in ic["bolumler"]})
            self.assertTrue(ic["girdi_hash"])

    def test_validate_uses_source_counts(self) -> None:
        known = {cid for k in self.kartlar for cid in k["kaynaklar"]}
        beklenen = expected_counts(self.ontologies)
        self.assertEqual(validate(self.dugumler, self.kartlar, known, *beklenen), [])
        stale = validate(self.dugumler, self.kartlar, known, 51, 41)
        self.assertTrue(any(p.startswith("dugum-count:") for p in stale), stale)
        self.assertTrue(any(p.startswith("kart-count:") for p in stale), stale)

    def test_vectors_are_deterministic(self) -> None:
        again = build_dugumler(self.ontologies)
        self.assertEqual([d["vektor"] for d in self.dugumler],
                         [d["vektor"] for d in again])


if __name__ == "__main__":
    unittest.main()
