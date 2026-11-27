# hukuk-mcp

[![npm](https://img.shields.io/npm/v/hukuk-mcp)](https://www.npmjs.com/package/hukuk-mcp) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Türk tüketici hukuku ve SGK için MCP sunucusu. Olayı anlatırsınız; haklarınızı, sürelerinizi,
başvurulacak merciyi ve kaynak maddeleri tek yanıtta döner.

Çevrimdışı çalışır, sorgu sırasında LLM çağırmaz. Süreler ve parasal sınırlar kural motoruyla
hesaplanır. Korpus pakete gömülüdür: 14 kanun, 5.266 madde, 3.018 Yargıtay ve BAM kararı
(26 Kasım 2026).

```bash
npx -y hukuk-mcp
```

## Kurulum

Node.js 22.13 veya üstü gerekir.

```bash
claude mcp add hukuk -- npx -y hukuk-mcp
```

Diğer istemciler (Claude Desktop, Cursor, VS Code, Windsurf):

```json
{
  "mcpServers": {
    "hukuk": { "command": "npx", "args": ["-y", "hukuk-mcp"] }
  }
}
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.hukuk]
command = "npx"
args = ["-y", "hukuk-mcp"]
```

Claude Desktop için [Sürümler](https://github.com/ihsansoycelik/hukuk-mcp/releases) sayfasında
`hukuk-mcp.mcpb` paketi de var. Claude Code eklentisi:
`/plugin marketplace add ihsansoycelik/hukuk-mcp`, ardından `/plugin install hukuk@hukuk-mcp`.

HTTP üzerinden: `npx -y hukuk-mcp --http 8787` (`http://127.0.0.1:8787/mcp`, durumsuz, yalnız POST).
Dışarı açacaksanız önüne TLS ve erişim katmanı koyun.

## Araçlar

| Araç | Ne yapar |
| --- | --- |
| `hukuk_sor` | Olayı alır; özet, kurallar, haklar, yol haritası, eksik bilgiler ve örnek kararları döner |
| `derinles` | Madde, karar ya da konuyu kimliğiyle açar, ör. `m:6502/11` |
| `ara` | Yargıtay ve BAM kararlarında arama (mahkeme ve yıl süzgeci) |
| `hesapla` | Tek bir süre, eşik ya da merci kuralını hesaplar |
| `dogrula` | Metindeki kanun ve karar atıflarının korpusta olup olmadığını denetler |

Hepsi salt okunurdur. `hukuk_sor`, `hesapla` ve `dogrula` metnin yanında `structuredContent` da döner.

## Örnek

*"Bayiden aldığım sıfır arabanın şanzımanı 3 ayda 4 kez arıza yaptı, paramı geri alabilir
miyim?"* (tutar 250.000 TL, teslim 1 Haziran 2026). Kısaltılmış çıktı:

```text
ÖZET
Satın aldığınız araçta teslimden sonra ortaya çıkan arıza ayıplı mal sayılabilir; bu durumda
satıcıya karşı dört seçimlik haktan birini kullanabilirsiniz [m:6502/11]. …
KURALLAR
- gorevli_merci: tuketici_mahkemesi (sınır 186.000,00 TL)
- arabuluculuk_dava_sarti: gerekli (m.73/A)
- ayip_zamanasimi: 01.06.2028 (m.12/1)
- harc_durumu: muaf (m.73/2)
YOL
1) Satıcıya yazılı bildirim yapın ve dört haktan hangisini seçtiğinizi açıkça yazın [m:6502/11]
…
KARARLAR
- k:ygt-3hd-2025-3587-2026-1707 (3. Hukuk Dairesi, 30.03.2026, onama)
```

## Kapsam

Tüketici hukuku (6502 ve bağlantılı TBK, HMK, HAUK, İİK hükümleri) ve sosyal güvenlik (5510, 4447):
ayıplı mal ve hizmet, cayma, mesafeli satış, abonelik, kredi kartı aidatı, paket tur, devre tatil,
işsizlik ödeneği, GSS prim borcu, iş kazası, hizmet tespiti, SGK kararına itiraz.

Kira, iş hukuku (kıdem, ihbar), ceza ve aile hukuku kapsam dışıdır. Sunucu bunu söyler, konu uydurmaz.

## Sınırlar

- Korpus tüm içtihat değildir. Yanıttaki kararlar örnektir, emsal taraması yerine geçmez.
- Bazı kural parametreleri `[teyit bekliyor]` etiketlidir: değer kaynaklıdır ama avukat onayından
  geçmemiştir.
- Yönetmelikler korpusta yoktur. Kararların tam metni saklanmaz, kaynak bağlantısı verilir.
- `dogrula` yalnız varlık denetimi yapar; maddenin içeriğinin doğru aktarılıp aktarılmadığına bakmaz.
- Yanıt korpus tarihine kadar geçerlidir.

Ölçümler ve nasıl üretildikleri: [eval/README.md](eval/README.md). Benzer projelerle karşılaştırma:
[docs/RAKIPLER.md](docs/RAKIPLER.md).

## Gizlilik

Soru hiçbir yere gönderilmez. Telemetri ve kalıcı log yoktur. İnternet yalnız korpus derlenirken
kullanılır.

## Yasal uyarı

Bu araç hukuki danışmanlık vermez. Zamanaşımı, haciz, tahliye, işten çıkarma gibi durumlarda bir
avukata ya da baroya (adli yardım) başvurun.

## Kaynaktan derleme

```bash
git clone https://github.com/ihsansoycelik/hukuk-mcp && cd hukuk-mcp
pnpm install
python3 pipeline/collect/bedesten.py   # kararlar, saniyede 1 istek
pnpm build:data                        # kanunlar ve atıf grafiği, data/build/hukuk.db
pnpm check                             # typecheck, testler, kabul testi
```

Veri kaynakları: [mevzuat.gov.tr](https://www.mevzuat.gov.tr),
[bedesten.adalet.gov.tr](https://bedesten.adalet.gov.tr), [resmigazete.gov.tr](https://www.resmigazete.gov.tr).
Erişim kuralları [ADR-001](docs/adr/ADR-001-kaynak-erisim.md) içinde.

## Lisans

Kod MIT ([LICENSE](LICENSE)). Korpus için [DATA-LICENSE.md](DATA-LICENSE.md). Katkı:
[CONTRIBUTING.md](CONTRIBUTING.md).
