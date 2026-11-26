# bench/ — ölçüm harness'i

Bu dizin iddiaları değil, ölçümleri üretir. `docs/RAKIPLER.md` ve `README.md`
buradaki sayılara atıf yapar; sayı yoksa orada da sayı yoktur.

## Ne ölçülüyor

| ölçüm | nasıl | nerede |
| --- | --- | --- |
| Araç tanımı token'ı | sunucunun gerçek `tools/list` payload'ı, `gpt-tokenizer` | `measure.ts` |
| Çağrı sayısı | `hukuk_sor` için istemcinin yaptığı MCP çağrısı (ölçülen: 1) | `measure.ts` |
| Yanıt token'ı | dönen `text` bloklarının tamamı | `measure.ts` |
| Gecikme | duvar saati, `tools/list` sonrası tekrarlı çağrılar (p50/p95) | `measure.ts` |
| Soğuk başlangıç | spawn → ilk başarılı `tools/list` | `measure.ts` |
| Rakip alt sınırı | belgelenen araç sayısı + yeniden kurulan şemalar + açık varsayımlar | `baseline.ts` |
| Rapor | yukarıdakilerden üretilen tablo | `report.ts` |

Ortak kural: **token sayısı her yerde `gpt-tokenizer`'ın `encode`'u iledir**,
çünkü sunucunun token bütçesi de onunla tanımlı. Farklı tokenizer = kıyaslanamaz sayı.

## Komutlar

```bash
pnpm install                  # gpt-tokenizer + @modelcontextprotocol/sdk
node bench/bench.ts           # hepsi: measure -> baseline -> report
node bench/measure.ts         # --iterations 5 --only arac-sanziman --verbose
node bench/baseline.ts        # --live-rtt ile mevzuat.gov.tr'ye TEK istek ölçümü
node bench/report.ts          # bench/report.md üretir
```

`pnpm bench` kökteki `bench` betiği üzerinden `bench/bench.ts`'i çalıştırır.

## Dosyalar

- `scenarios.jsonl` — 18 gerçekçi vatandaş sorusu; `bugun` sabit (2026-10-22) ki ölçüm tekrarlanabilsin.
- `measure.ts` — sunucuyu gerçek MCP istemcisi olarak başlatır; `tools/list` + `hukuk_sor` ölçer.
- `baseline.ts` — rakip alt sınırı: profiller, varsayımlar, senaryo başına token/süre.
- `report.ts` — `report.md` üretir (korpus sayıları, kapsam, atıf çözümlenebilirliği dahil).
- `merge-dbs.ts` — ölçüm için birleşik DB: fixture ontolojisi + gerçek mevzuat (`bench/results/merged.db`).
  `data/build/` dosyalarına **dokunmaz**; yalnız okur.
- `encoding.ts` — etiketli düz metin ile JSON'un token maliyetini karşılaştırır (ADR-003).
- `bench.ts` — hepsini sırayla çalıştırır.
- `results/measurements.json` — kayıtlı ölçüm (yoksa `status: pending`).
- `results/measurements-*.json` — farklı korpuslar ve gecikme tekrarları (ham kanıt).
- `results/latency-runs.json` — 3 koşunun p50/p95'i ve seçilen koşu.
- `results/baseline.json`, `results/encoding.json` — üretilen ham sayılar.
- `report.md` — üretilen rapor; her hücre ÖLÇÜLDÜ / BELGE / TAHMİN etiketli.

## Korpus seçimi

`measure.ts` varsayılan olarak `data/build/hukuk.db`'yi kullanır (gerçek korpus); yoksa
`data/build/fixture.db`'ye düşer. Başka bir DB için `--db <yol>`. Rapor, ölçülen DB'nin yolunu,
boyutunu ve satır sayılarını yazar — sayıların hangi korpusa ait olduğu her zaman görünür.

## Dürüstlük kuralları (değiştirmeyin)

1. Rakip gecikmesi ölçülmediyse **TAHMİN** yazılır; "ölçüldü" denmez.
2. Rakip şeması kamuya açık değilse araç sayısı **BELGE**, şema boyutu **TAHMİN** olur.
3. `--live-rtt` yalnızca *bu ağdan* tek isteğin süresini ölçer; rakip sunucunun
   uçtan uca süresi diye raporlanamaz.
4. Ölçüm sonucu beklenenden kötüyse sayı değişmez; yorum değişir.
5. Yeni senaryo eklerken `bugun` alanını doldurun ve `ozet`'i vatandaşın kendi
   cümlesiyle yazın.
