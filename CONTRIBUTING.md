# Katkı

Bu proje hukuk bilmeyen birinin sorusuna kaynaklı ve süreleri doğru hesaplanmış bir yanıt
vermeye çalışır. En değerli katkı, yanlış bir yanıtı dayanağıyla birlikte bildirmektir.

## Nereden başlanır

- Yanlış yanıt gördüyseniz "Yanlış veya eksik yanıt" şablonuyla issue açın. Kanun maddesini,
  karar künyesini veya Resmî Gazete sayısını ekleyin.
- `good first issue` etiketli işler kod bilgisi az olanlar için ayrıldı. Çoğu ontolojiye
  (`packages/ontology/*.yaml`) örnek cümle veya kart eklemekten ibarettir.
- Avukat veya hukuk öğrencisiyseniz: `[teyit bekliyor]` etiketli kural parametrelerini ve
  kartları gözden geçirmek en büyük eksiğimiz.

## Geliştirme

```bash
pnpm install
node packages/mcp-server/test/make-fixture.ts data/build/fixture.db
pnpm check          # typecheck + node testleri + kabul testi
```

Python hattının testleri:

```bash
uv run --no-project --with pytest python -m pytest -c pipeline/test/pytest.ini pipeline/test
```

## Kurallar

- Sorgu yolunda üretken model yoktur ve olmayacak. Yanıtlar korpus ve kural motorundan gelir.
- Her iddia çözümlenebilir bir kimlik taşır (`m:6502/11`, `k:ygt-3hd-...`). Kimliksiz cümle
  eklemeyin.
- Süre, eşik ve parasal sınırlar `packages/rules/src/parametreler.ts` içinde, kaynak bağlantısı ve
  geçerlilik aralığıyla tutulur. Kaynaksız değer kabul edilmez.
- Kişisel veri, gerçek vaka belgesi, TC kimlik no, adres commit etmeyin. Test için uydurma
  vaka yazın.
- Kaynak sitelere istek hızı saniyede birdir ([ADR-001](docs/adr/ADR-001-kaynak-erisim.md)).

Ayrıntılı agent ve mimari kuralları: [`AGENTS.md`](AGENTS.md), [`docs/adr/`](docs/adr/).
