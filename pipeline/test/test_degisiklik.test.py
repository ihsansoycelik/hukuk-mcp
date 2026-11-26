"""Amendment-note parser: every documented form plus an unparseable case."""
from __future__ import annotations

import unittest

from pipeline.parse.degisiklik import parse_madde, parse_notes


class TestDegisiklik(unittest.TestCase):
    def test_degisik_header(self) -> None:
        r = parse_notes("(Değişik:24/3/2022-7392/6 md.)", positional=False)
        n = r.notes[0]
        self.assertEqual((n.tur, n.tarih, n.kanun_no, n.kanun_madde, n.fikra),
                         ("degisik", "2022-03-24", "7392", "6", None))
        self.assertEqual((r.seen, r.unparsed), (1, []))

    def test_ek_cumle_normalised_to_ek(self) -> None:
        n = parse_notes("(Ek cümle:24/3/2022-7392/2 md.)").notes[0]
        self.assertEqual((n.tur, n.tarih), ("ek", "2022-03-24"))
        self.assertIn("Ek cümle", n.ham)

    def test_khk_and_aynen_kabul(self) -> None:
        r = parse_notes("(Değişik: 2/1/2017-KHK-684/8 md.; Aynen kabul: 1/2/2018-7074/8 md.)")
        self.assertEqual([x.tur for x in r.notes], ["degisik", "aynen_kabul"])
        self.assertEqual(r.notes[0].kanun_no, "KHK-684")
        self.assertEqual(r.notes[0].tarih, "2017-01-02")
        self.assertEqual(r.notes[1].kanun_no, "7074")

    def test_mulga(self) -> None:
        n = parse_notes("(Mülga:16/7/2026-7589/19 md.)").notes[0]
        self.assertEqual((n.tur, n.tarih, n.kanun_madde), ("mulga", "2026-07-16", "19"))

    def test_iptal_aym_with_semicolon_inside(self) -> None:
        r = parse_notes("(İptal: Anayasa Mahkemesinin 25/12/2024 tarihli ve E.:2022/6; "
                        "K.:2024/225 sayılı Kararı ile)")
        self.assertEqual(len(r.notes), 1)
        self.assertEqual((r.notes[0].tur, r.notes[0].tarih, r.notes[0].kanun_no),
                         ("iptal", "2024-12-25", None))
        self.assertEqual(r.unparsed, [])

    def test_fikra_from_marker_and_chain(self) -> None:
        r = parse_notes("(1) (Değişik:23/5/2024-7511/19 md.) Bu Kanunun; (2) metin "
                        "(3) (Ek: 1/1/2020-7000/1 md.) (Mülga: 2/2/2021-7100/2 md.) x")
        self.assertEqual([(n.fikra, n.tur) for n in r.notes],
                         [(1, "degisik"), (3, "ek"), (3, "mulga")])

    def test_fikra_from_ordinal_and_dash_forms(self) -> None:
        n = parse_notes("(Değişik birinci fıkra: 4/5/2007-5650/1 md.)").notes[0]
        self.assertEqual((n.fikra, n.tur), (1, "degisik"))
        n = parse_notes("(Değişik: 29/6/2005 – 5377/2 md.)").notes[0]
        self.assertEqual(n.tarih, "2005-06-29")

    def test_dedupe_and_merge_header_with_body(self) -> None:
        note = "(Değişik:24/3/2022-7392/6 md.)"
        r = parse_madde(f"(1) {note} A. (2) {note} B.", note)
        self.assertEqual(len(r.notes), 2)  # fikra 1 and 2; header copy dropped
        self.assertEqual(sorted(n.fikra for n in r.notes), [1, 2])
        self.assertEqual(len(parse_notes(note + note).notes), 1)

    def test_unparseable_is_counted_not_dropped(self) -> None:
        r = parse_notes("(Değişik: bilinmeyen tarih)")
        self.assertEqual((r.seen, len(r.notes), len(r.unparsed)), (1, 0, 1))
        r = parse_notes("(Mülga: 31/2/2020-7000/1 md.)")  # impossible date
        self.assertEqual(len(r.unparsed), 1)

    def test_plain_parentheses_ignored(self) -> None:
        self.assertEqual(parse_notes("(1) Ek ödeme (bkz. madde 5) yapılır.").seen, 0)


if __name__ == "__main__":
    unittest.main()
