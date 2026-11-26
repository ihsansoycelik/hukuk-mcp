"""Decision identity + bindingness weight tests."""
from __future__ import annotations

import unittest

from pipeline.parse.karar import (
    MalformedDecision,
    agirlik_for,
    court_slug,
    normalize,
    parse_date,
    sonuc_for,
)

METIN = ("Dava, ayıplı malın bedel iadesi istemine ilişkindir. Mahkemece davanın kabulüne "
         "karar verilmiştir. " + "gerekçe " * 40)


def rec(**kw):
    base = {
        "src": "yargitay", "id": "123", "daire": "13. Hukuk Dairesi",
        "esas": "2013/7601", "karar": "2013/16449", "tarih": "2013-06-13",
        "durum": "", "metin": METIN,
    }
    base.update(kw)
    return base


class TestCanonicalId(unittest.TestCase):
    def test_brief_example(self) -> None:
        k = normalize(rec())
        self.assertEqual(k.id, "k:ygt-13hd-2013-7601-2013-16449")
        self.assertEqual(k.mahkeme, "yargitay")
        self.assertEqual(k.agirlik, 70)

    def test_bam_slug(self) -> None:
        mahkeme, slug = court_slug(
            "İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi", "emsal")
        self.assertEqual((mahkeme, slug), ("bam", "ist-bam-12hd"))
        k = normalize(rec(src="emsal", daire="İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi",
                          esas="2021/3210", karar="2025/225", tarih="2025-03-06"))
        self.assertEqual(k.id, "k:bam-ist-bam-12hd-2021-3210-2025-225")

    def test_tuketici(self) -> None:
        self.assertEqual(court_slug("Tüketici Mahkemesi", "emsal"),
                         ("ilkderece", "tuketici"))
        k = normalize(rec(src="emsal", daire="Tüketici Mahkemesi",
                          esas="2020/26", karar="2021/1652", tarih="2021-11-03"))
        self.assertEqual(k.id, "k:ilk-tuketici-2020-26-2021-1652")

    def test_kapatilan_prefix_and_ceza(self) -> None:
        self.assertEqual(court_slug("(Kapatılan)15. Hukuk Dairesi", "yargitay"),
                         ("yargitay", "15hd"))
        self.assertEqual(court_slug("9. Ceza Dairesi", "yargitay"),
                         ("yargitay", "9cd"))

    def test_hgk_ibk_aym(self) -> None:
        self.assertEqual(court_slug("Hukuk Genel Kurulu", "yargitay"), ("yargitay", "hgk"))
        self.assertEqual(
            court_slug("İçtihatları Birleştirme Büyük Genel Kurulu", "yargitay"),
            ("yargitay", "ibk"))
        self.assertEqual(court_slug("Anayasa Mahkemesi", "aym"), ("aym", "aym"))

    def test_bad_inputs_are_reported_not_guessed(self) -> None:
        with self.assertRaises(MalformedDecision) as cm:
            normalize(rec(esas=""))
        self.assertEqual(cm.exception.reason, "bad-case-no")
        with self.assertRaises(MalformedDecision) as cm:
            normalize(rec(tarih="31.02.2013"))
        self.assertEqual(cm.exception.reason, "bad-date")
        with self.assertRaises(MalformedDecision):
            normalize(rec(metin="short"))

    def test_dates(self) -> None:
        self.assertEqual(parse_date("2013-06-13"), "2013-06-13")
        self.assertEqual(parse_date("13.06.2013"), "2013-06-13")
        self.assertEqual(parse_date("13/6/2013"), "2013-06-13")


class TestAgirlik(unittest.TestCase):
    def test_table(self) -> None:
        self.assertEqual(agirlik_for("yargitay", "13. Hukuk Dairesi", ""), 70)
        self.assertEqual(agirlik_for("yargitay", "Hukuk Genel Kurulu", ""), 85)
        self.assertEqual(agirlik_for("yargitay", "İçtihatları Birleştirme Büyük Genel Kurulu", ""), 95)
        self.assertEqual(agirlik_for("bam", "İstanbul BAM 12. Hukuk Dairesi", ""), 50)
        self.assertEqual(agirlik_for("bam", "İstanbul BAM 12. Hukuk Dairesi", "KESİNLEŞTİ"), 60)
        self.assertEqual(agirlik_for("ilkderece", "Tüketici Mahkemesi", ""), 30)
        self.assertEqual(agirlik_for("aym", "Anayasa Mahkemesi", ""), 85)
        self.assertEqual(agirlik_for("bilinmeyen", "", ""), 40)

    def test_agirlik_on_normalised_record(self) -> None:
        self.assertEqual(normalize(rec(durum="KESİNLEŞTİ")).agirlik, 70)
        bam = normalize(rec(src="emsal", daire="Ankara Bölge Adliye Mahkemesi 11. Hukuk Dairesi",
                            durum="KESİNLEŞTİ"))
        self.assertEqual(bam.agirlik, 60)


class TestSonuc(unittest.TestCase):
    def test_dispositions(self) -> None:
        self.assertEqual(sonuc_for("SONUÇ: Hükmün BOZULMASINA karar verildi."), "bozma")
        self.assertEqual(sonuc_for("SONUÇ: Hükmün ONANMASINA karar verildi."), "onama")
        self.assertEqual(sonuc_for("SONUÇ: Davanın REDDİNE karar verildi."), "ret")
        self.assertEqual(sonuc_for("SONUÇ: Davanın KABULÜNE karar verildi."), "kabul")
        self.assertEqual(sonuc_for("davanın kısmen kabulüne"), "kismen")
        self.assertEqual(sonuc_for("hiçbir şey"), "diger")


if __name__ == "__main__":
    unittest.main()
