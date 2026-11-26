"""L0/L1 summary quality gates (deterministic, no DB required)."""
from __future__ import annotations

import unittest

from pipeline.layers import fit_summaries, p95, summarize_karar
from pipeline.tokens import TokenCounter

BOILERPLATE = """(Kapatılan)15. Hukuk Dairesi 2006/4980 E. , 2007/5033 K.

"İçtihat Metni"
Mahkemesi :Ticaret Mahkemesi

Yukarıda tarih ve numarası yazılı hükmün temyizen tetkiki davacı vekili tarafından istenmiş ve temyiz dilekçesinin süresi içinde verildiği anlaşılmış olmakla dosyadaki kağıtlar okundu gereği konuşulup düşünüldü:

- K A R A R -

Dava, satım sözleşmesinden kaynaklanan ayıplı malın bedel iadesi istemine ilişkindir.
Davalı satıcı, malın ayıpsız olduğunu savunmuştur.
Mahkemece davanın reddine karar verilmiştir.

SONUÇ:Temyiz olunan hükmün yukarıda açıklanan nedenlerle davacı yararına BOZULMASINA, ödediği temyiz peşin harcının istek halinde temyiz eden davacıya geri verilmesine, 19.07.2007 gününde oybirliğiyle karar verildi."""


class TestL0(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.counter = TokenCounter()

    def _fit(self, metin: str, sonuc: str):
        cand = summarize_karar(metin, sonuc)
        l0, l1, t0, t1 = fit_summaries([cand], self.counter)
        return l0[0], l1[0], t0[0]

    def test_no_midword_and_outcome_present(self) -> None:
        l0, _l1, tok = self._fit(BOILERPLATE, "bozma")
        self.assertTrue(l0[:1].isupper() or l0[:1].isdigit(), l0)
        self.assertTrue(l0.rstrip().endswith((".", "?", "…", ":")), l0)
        self.assertIn("Sonuç: bozma", l0)
        self.assertNotIn("rarın", l0)
        self.assertLessEqual(tok, 45)

    def test_long_sentence_gets_ellipsis_not_midword(self) -> None:
        long = ("Dava, " + "ayıplı malın bedel iadesi ve sözleşmeden dönme istemine ilişkin "
                "olup " * 12 + "tüketici mahkemesinde açılmıştır.")
        l0, _l1, tok = self._fit(long, "ret")
        self.assertIn("…", l0)
        self.assertTrue(l0.rstrip().endswith("."), l0)
        self.assertIn("Sonuç: ret", l0)
        self.assertLessEqual(tok, 45)
        # the word before the ellipsis must be complete (it appears in source)
        head = l0.split(" …")[0]
        self.assertTrue(head.split()[-1] in long, head)

    def test_boilerplate_is_not_chosen(self) -> None:
        l0, _l1, _tok = self._fit(BOILERPLATE, "bozma")
        self.assertNotIn("temyiz eden", l0.lower())
        self.assertNotIn("istenilmekle", l0.lower())

    def test_fallback_is_deterministic(self) -> None:
        l0, _l1, _tok = self._fit("kısa", "diger")
        self.assertEqual(l0, "Karar sonucu: diğer.")

    def test_p95_budget(self) -> None:
        cands = [summarize_karar(BOILERPLATE, "bozma") for _ in range(20)]
        _l0, _l1, t0, _t1 = fit_summaries(cands, self.counter)
        self.assertLessEqual(p95(t0), 45)


if __name__ == "__main__":
    unittest.main()
