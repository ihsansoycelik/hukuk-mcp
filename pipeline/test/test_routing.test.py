"""Decision routing heuristic tests."""
from __future__ import annotations

import unittest

from pipeline.ontology import build_dugumler, load_sources
from pipeline.routing import assign


class TestRouting(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dugumler = build_dugumler(load_sources()["ontology"])

    def test_vehicle_decision_routes_to_vehicle_leaf(self) -> None:
        text = ("Davacı, galeriden aldığı ikinci el aracın motorunda gizli ayıp "
                "bulunduğunu, servis kayıtlarının hasarı gizlediğini ileri sürmüştür.")
        d = assign(text, self.dugumler)
        self.assertTrue(d and d.startswith("t/ayipli-mal/"), d)

    def test_substantive_branch_beats_usul(self) -> None:
        text = ("Tüketici mahkemesi ve hakem heyeti kararına rağmen satıcı, "
                "ayıplı malın bedelini iade etmemiştir.")
        d = assign(text, self.dugumler)
        self.assertFalse(d.startswith("t/usul/"), d)

    def test_unknown_text_stays_null(self) -> None:
        self.assertIsNone(assign("zzzz qqqq xxxx", self.dugumler))

    def test_deterministic(self) -> None:
        text = "Mesafeli sözleşmede cayma hakkı kullanıldı, iade yapılmadı."
        self.assertEqual(assign(text, self.dugumler), assign(text, self.dugumler))


if __name__ == "__main__":
    unittest.main()
