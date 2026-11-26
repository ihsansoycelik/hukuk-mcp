# Bu MCP nasıl test edilir

Üç seviye var: **30 saniyelik kabul testi**, **tek tek soru sorma**, **gerçek istemciye bağlama**.
Hepsi aynı MCP stdio taşımasını kullanır — yani testte gördüğünüz davranış, istemcinin göreceği
davranışın aynısıdır.

---

## 1) 30 saniye: kabul testi

```bash
./scripts/kabul-testi.sh
```

14 senaryoyu çalıştırır, her biri bir davranış sözleşmesini doğrular. Gerçek çıktı:

```
hukuk-mcp kabul testi · db=data/build/hukuk.db
  ✔ araç ayıbı doğru düğüme gider
  ✔ sınır üstü tutar mahkemeye gider
  ✔ kısa/anlamsız soru netleştirme ister
  ✔ kart aidatı doğru düğüme gider
  ✔ sınır altı tutar hakem heyetine gider
  ✔ ilgisiz anlatım reddedilir
  ✔ gerçek belirsizlik soru sorar
  ✔ zamanaşımı hesaplanır
  ✔ arabuluculuk dava şartı bilinir
  ✔ madde kimliği çözümlenir
  ✔ uydurma karar kimliği reddedilir
  ✔ madde metni açılır
  ✔ her yanıt disclaimer taşır
  ✔ bütçe aşılmıyor (397 ≤ 400 token)
SONUÇ: 14/14 geçti — kabul testi BAŞARILI
```

Başka bir anlık görüntüyü denemek için: `HUKUK_DB=/yol/hukuk.db ./scripts/kabul-testi.sh`

---

## 2) Tek tek soru sormak

`scripts/test-mcp.ts` küçük bir CLI'dır: sunucuyu gerçek MCP istemcisi gibi başlatır, aracı çağırır,
yanıtı **token sayısı ve süreyle** basar.

```bash
node scripts/test-mcp.ts tools                  # 5 araç + tanım token maliyeti
node scripts/test-mcp.ts sor "aracımın şanzımanı 3 ayda 4 kez bozuldu"
node scripts/test-mcp.ts sor "kredi kartı aidatı iadesi" --tutar 1200
node scripts/test-mcp.ts sor "..." --tutar 250000 --tarih 2026-06-01 --talep iade --urun "araç"
node scripts/test-mcp.ts sor "işten ayrıldım" --tarih 2026-07-25 --prim 109 --talep iade
node scripts/test-mcp.ts ara "ayıplı mal bedel iadesi" --limit 3
node scripts/test-mcp.ts hesapla ayip_zamanasimi '{"teslim_tarihi":"2025-03-10"}'
node scripts/test-mcp.ts derinles m:6502/12 --butce 300
node scripts/test-mcp.ts dogrula "15. HD 2006/4980 E. 2007/5033 K."
```

`pnpm sor "..."` kısaltması da aynı şeyi yapar. Her yanıtın sonunda:

```
[397 token · 336 ms · bağlantı 249 ms · db data/build/hukuk.db]
```

`--butce 400` gibi bir sınır verirseniz yanıtın **asla** o sınırı aşmadığını görürsünüz.
`--json` ham MCP yanıtını basar.

### Ne beklemelisiniz — davranış sözleşmesi

| Girdi | Beklenen davranış | Neden |
|---|---|---|
| "Bayiden aldığım sıfır arabanın şanzımanı 3 ayda 4 kez arıza yaptı" | `DÜĞÜM t/ayipli-mal/arac` + KURALLAR/HAKLAR/YOL/KARARLAR | net konu, tek çağrıda tam yanıt |
| aynı soru + `--tutar 250000` | `gorevli_merci: tuketici_mahkemesi` | 250.000 > 2026 sınırı 186.000 |
| aynı soru + `--tutar 1200` | `gorevli_merci: tuketici_hakem_heyeti` | sınırın altı |
| "kısa soru" / "araba arızalı" | `BELİRSİZ DÜĞÜM` + 3 aday + "HANGİ KONU?" | güven eşiğin altında; tahmin etmek yerine sorar |
| "bir sorunum var ne yapmalıyım" | `HATA DUGUM_BULUNAMADI` + sonraki adım | anlamsız girdi; uydurmaz |
| "ürün gelmedi ve ücret iadesi yapılmıyor" | `BELİRSİZ` — 2 gerçek aday (iade-bedeli / teslimat-gecikmesi) | iki düğüme birden düşen olay |
| `hesapla ayip_zamanasimi {"teslim_tarihi":"2025-03-10"}` | `10.03.2027` + dayanak `m:6502/12` | aritmetik, tahmin değil |
| `sor "25.07.2026'da işten ayrıldım, 109 prim günüm var" --tarih 2026-07-25 --prim 109` | `DÜĞÜM s/saglik/isten-ayrilma-sonrasi-hak` + `02.11.2026` | 10 gün temel + 90 gün şartlı ek süre (5510 m.67) |
| `sor "işten çıkarıldım, 700 prim günüm var" --prim 700` | `DÜĞÜM s/gelir/issizlik-odenegi` + `180` | 600–900 prim günü → 180 gün ödenek (4447 m.50) |
| `sor "SGK başvurumu reddetti, hangi mahkemeye"` | `DÜĞÜM s/usul/kurum-karari-itiraz` | görevli mahkeme; sabit dava süresi uydurulmaz |
| `dogrula "k:ygt-99hd-2021-1-2022-2"` | `HATA KIMLIK_COZULEMEDI` | uydurma künye reddedilir |
| `derinles m:6502/12 --butce 200` | madde metni kısaltılmış, ~198 token | bütçe içeriği silmez, keser |

### Elle kontrol edilmesi gerekenler (yeşil test yetmez)

- **Her cümlede kimlik var mı?** Örn. `[m:6502/11]`. Kimliksiz hukuki cümle olmamalı.
- **Kimlikler gerçekten çözülüyor mu?** `node scripts/test-mcp.ts dogrula m:6502/11`
- **`EKSİK OLGULAR` mantıklı mı?** "teslim tarihi", "tüketicinin yerleşim yeri" gibi cevaplanabilir şeyler istemeli.
- **`teyit bekliyor` etiketi** doğru yerde mi? Uzman onayı olmayan değerlerde görünür.
- **Tarihler tutarlı mı?** Aynı soruyu `--tarih` ile geçmişe sorun; o tarihin parametreleri kullanılmalı.

---

## 3) Otomatik testler ve ölçümler

```bash
pnpm typecheck        # tsc, 0 hata
pnpm test             # 105 test (ontology, rules, retrieval, mcp-server, citation, e2e)
node bench/bench.ts   # tip kontrolü + token/gecikme ölçümü + rakip alt sınırı + rapor
node eval/run.ts --set all --db eval/fixtures/test.db   # kalite kapıları
```

- `pnpm test` → **105/105** geçer (~4 sn; SGK kural testleri dahil). Retrieval benchmark'ı 50k satırlık sentetik korpus üretir.
- `bench/bench.ts` → `bench/report.md`'yi yeniler: 5 araç / **885 token** tanım, p50 **814 token** yanıt,
  p50 **4,3 ms** (p95 **21,6 ms**), bütçe **21/21**, atıf **64/64**. 21 senaryonun 16'sı doğrudan
  yanıt, 5'i netleştirme ister, 0 fallback.
- `eval/run.ts` → yönlendirme/arama/kural kapıları; gerçek korpusta top-1 **%97,4**, top-3 **%99,4**.
  **Dikkat:** gerçek korpusta `ara` Recall@5 %50,1 ile kapıyı geçmiyor ([KALITE.md](KALITE.md)).
  Bu bilinen ve belgelenmiş bir açık.

> `data/build/fixture.db` depoda yok (`.gitignore`). `mcp-server` e2e testleri onu bekler:
> `node packages/mcp-server/test/make-fixture.ts data/build/fixture.db`

---

## 4) Gerçek bir istemciye bağlamak

### Lokal (Claude Desktop / Claude Code / Codex)

```json
{
  "mcpServers": {
    "hukuk": {
      "command": "node",
      "args": ["/TAM/YOL/hukuk-mcp/packages/mcp-server/src/index.ts"],
      "env": { "HUKUK_DB": "/TAM/YOL/hukuk-mcp/data/build/hukuk.db" }
    }
  }
}
```

Bağlandıktan sonra istemciye şunu yazın:

> "Bayiden aldığım sıfır arabanın şanzımanı 3 ayda 4 kez arıza yaptı, paramı geri alabilir miyim?"

İstemci `hukuk_sor`'u **bir kez** çağırmalı; yanıt ~480–1.200 token olmalı; birden fazla araç
çağrısı zinciri görmemelisiniz (tasarım gereği).

### Uzak (SSH veya HTTP)

Sunucu başka bir makinede çalışıyorsa iki yol var. SSH üzerinden stdio:

```json
{ "mcpServers": { "hukuk": { "command": "ssh", "args": ["sunucum", "npx", "-y", "hukuk-mcp"] } } }
```

Ya da sunucuda `npx -y hukuk-mcp --http 8787` çalıştırıp `/mcp` yolunu kendi TLS katmanınızın
arkasından açın.

---

## 5) Sorun giderme

| Belirti | Sebep / çözüm |
|---|---|
| `Cannot find module '@hukuk/…'` | `pnpm install` çalıştırılmamış |
| `SQLITE_ERROR: no such table: karar` | `HUKUK_DB` yanlış dosyayı gösteriyor ya da korpus derlenmemiş: `uv run python pipeline/build.py` |
| `kural motoru yok, korpus modu` (stderr) | `packages/rules` yüklenemedi; kurallar olmadan da yanıt verir ama `KURALLAR` bölümü olmaz |
| 5 e2e testi kırmızı | `data/build/fixture.db` yok — `make-fixture.ts` ile üretin |
| `node:sqlite` deneysel uyarısı | Zararsız; sarmalayıcı `NODE_NO_WARNINGS=1` ile susturur |
| Yanıt sürekli `BELİRSİZ` | Anlatım çok kısa; ürün/hizmet + talep ekleyin (tasarım gereği tahmin etmez) |
| İstemci `ssh` ile bağlanamıyor | SSH anahtarı parolasız veya `ssh-agent`'ta olmalı; GUI uygulamaları agent'ı görmeyebilir |
