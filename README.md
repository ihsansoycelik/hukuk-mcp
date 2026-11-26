# hukuk-mcp — Türk hukukunu vatandaşa çeviren MCP sunucusu

**Tek cümle:** Hukuk bilmeyen birinin "başıma şu geldi, ne yapabilirim?" sorusunu, resmî kaynağa
bağlı, süreleri hesaplanmış ve **yol haritası olan** tek bir yanıta çeviren yerel bir MCP sunucusu.

Avukatlar için değil; **tüketici, kiracı, işçi, yolcu, sigortalı ve işsiz** için yazıldı. Cevap
hukuk diliyle değil, "şu hakkın var, şu süre içinde şuraya başvur" diliyle verilir. Her cümlenin
yanında, iddiayı doğrulayabileceğiniz bir kanun maddesi veya karar kimliği bulunur.

**v1 kapsamı:** tüketici hukuku **+ sosyal güvenlik (SGK)**. 5510 ve 4447 sayılı kanunlara dayanan
işten ayrılma sonrası sağlık hakkı, GSS prim borcu, işsizlik ödeneği, iş kazası bildirimi ve SGK
kararına itiraz soruları aynı 5 araçla, `s/…` kimlikleriyle yanıtlanır
([ADR-005](docs/adr/ADR-005-sgk-kapsami.md)).

## Neden var?

Türk hukuku kamuya açık: `mevzuat.gov.tr`, `resmigazete.gov.tr`, Yargıtay karar arama, UYAP Emsal.
Ama üç engel var:

1. **Dil engeli.** "Ayıplı mal", "temerrüt", "görevli merci", "zamanaşımı" — vatandaşın günlük
   hayatında bu kelimeler yok. Hukuk metni *bilen* için yazılmış.
2. **Yapı engeli.** Süreler ve eşikler yıla, tutara, tarafların sıfatına göre değişiyor;
   bir yerde yazmıyor, dağınık. Modelin "tahmin etmesi" burada en tehlikeli şey.
3. **Araç engeli.** Mevcut yapay zekâ araçları çoğu zaman **30-47 araç** tanımlayıp her turda
   bunların hepsini modele gönderiyor; sonuç: yüksek maliyet, çok adımlı zincir, yavaş yanıt.

hukuk-mcp bu üçünü de hedefliyor: **5 araç**, **tek çağrı**, **kurallarla hesaplanmış süreler**,
**her cümlede çözümlenebilir kaynak**.

## Ne yapar — 5 araç

| Araç | Ne verir | Örnek |
| --- | --- | --- |
| `hukuk_sor` | Tek çağrıda tam yanıt: durum, haklar, süreler, yol haritası, eksik bilgiler, kaynaklar | "Bayiden aldığım sıfır arabanın şanzımanı 3 ayda 4 kez arıza yaptı, paramı geri alabilir miyim?" |
| `derinles` | Tek bir kaynağı (madde/karar/düğüm) daha ayrıntılı açar | `derinles(id="m:6502/11")` |
| `ara` | Kendi aramanızı yapın: içtihat/mevzuat, mahkeme ve yıl filtresiyle | `ara(sorgu="şanzıman ayıbı", mahkeme=["yargitay"], yil=[2015,2026])` |
| `hesapla` | Süre/eşik/merci hesabı — kuralla, tahminle değil | `hesapla(kural="ayip_zamanasimi", girdiler={teslim_tarihi:"2026-07-15"})` |
| `dogrula` | Bir künyenin veya kimliğin gerçekten var olduğunu doğrular | `dogrula(kunye="15. HD 2006/4980 E.")` |

SGK örneği de aynı yüzeydedir: `hesapla(kural="sgk_saglik_hakki", girdiler={isten_cikis_tarihi:"2026-07-25", son_bir_yil_prim_gun:109})`
→ `02.11.2026`. Yeni alan için **araç eklenmedi**; `hukuk_sor` yalnızca opsiyonel `prim_gun_sayisi`
alanını kazanır.

`hukuk_sor` yanıtı **etiketli düz metindir** (JSON değil) ve bir **token bütçesi** vardır
(`butce`, varsayılan **1500**, en fazla **4000**). Bölümler:
`DÜĞÜM · ÖZET · KURALLAR · HAKLAR · YOL · EKSİK OLGULAR · DİKKAT · ARGÜMANLAR · KARARLAR · DERİNLEŞ · NOT`.

Örnek (kısaltılmış):

```text
DÜĞÜM t/ayipli-mal/arac — Araçta ayıp
ÖZET Sıfır araçta 3 ayda 4 kez şanzıman arızası: ayıplı mal rejimi…
KURALLAR
- ayip_zamanasimi: 2 yıl (m:6502/12) [teyit bekliyor]
- gorevli_merci: tüketici hakem heyeti (m:6502/66)
HAKLAR
- Bedel iadesi isteyebilirsiniz (m:6502/11).
YOL
- 1) Satıcıya yazılı ayıp bildirimi gönderin…
- 2) Tüketici hakem heyetine başvurun…
EKSİK OLGULAR teslim tarihi · servis raporu
NOT Hukuki görüş değildir; resmî metni kaynaktan teyit edin.
```

## Kurulum

Gereken tek şey **Node.js 22.13+**. Korpus pakete dahildir, API anahtarı, Docker veya derleme yok.
Sorgu anında internete çıkılmaz.

```bash
npx -y hukuk-mcp --version
```

**Claude Code**

```bash
claude mcp add hukuk -- npx -y hukuk-mcp
```

**Claude Desktop** (`claude_desktop_config.json`), **Cursor** (`~/.cursor/mcp.json`), **Windsurf**,
**VS Code** (`.vscode/mcp.json`, anahtar `servers`):

```json
{
  "mcpServers": {
    "hukuk": { "command": "npx", "args": ["-y", "hukuk-mcp"] }
  }
}
```

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.hukuk]
command = "npx"
args = ["-y", "hukuk-mcp"]
```

**HTTP (uzak istemciler için):** `npx -y hukuk-mcp --http 8787` komutu Streamable HTTP sunucusunu
`http://127.0.0.1:8787/mcp` adresinde açar (durumsuz, yalnız POST; `/health` sağlık kontrolü).
Dışarı açacaksanız önüne kendi TLS/erişim katmanınızı koyun.

Kurulduktan sonra modele şunu söylemeniz yeterli: *"hukuk aracına sor: …"*. Model tek çağrı yapar.

### Kaynaktan çalıştırma

```bash
git clone https://github.com/ihsansoycelik/hukuk-mcp && cd hukuk-mcp
pnpm install
python3 pipeline/collect/bedesten.py      # kararlar (≈1 istek/sn, ~30 dk)
python3 pipeline/build.py                 # kanunları indirir, data/build/hukuk.db üretir
pnpm mcp                                  # stdio sunucu
pnpm check                                # typecheck + testler + kabul testi
node scripts/build-npm.ts                 # dist-npm/ (yayınlanan paket)
```

## Ölçülen sayılar

Aşağıdaki sayılar `bench/` harness'inin çıktısıdır; her hücrenin kaynağı `bench/report.md`'de
**ÖLÇÜLDÜ / BELGE / TAHMİN** olarak etiketlidir. Rakip gecikmesi **ölçülmedi**.

| Ölçüm | Sonuç | Kaynak |
| --- | --- | --- |
| Araç sayısı | **5** | ÖLÇÜLDÜ |
| Araç tanımı (her turda ödenen) | **885 token** | ÖLÇÜLDÜ (`tools/list`) |
| `hukuk_sor` için çağrı sayısı | **1** | ÖLÇÜLDÜ |
| Yanıt uzunluğu (medyan) | **814 token** (en yüksek 1266); doğrudan yanıtlar ~478–1.194, "hangi konu?" netleştirmeleri ~218–249 token | ÖLÇÜLDÜ |
| Gecikme (p50 / p95, yerel stdio) | **4,3 ms / 21,64 ms** (3 koşu: p50 4,3 / 4,51 / 2,92 ms) | ÖLÇÜLDÜ |
| Soğuk başlangıç (süreç → ilk `tools/list`) | **~0,46 sn** (3 koşu: 0,46 / 0,65 / 0,78 sn) | ÖLÇÜLDÜ |
| Token bütçesine uyum | **21/21 senaryo** | ÖLÇÜLDÜ |
| Atıf çözümlenebilirliği | **64/64 benzersiz kimlik** veritabanında bulundu | ÖLÇÜLDÜ |
| Senaryo kapsamı | **16 doğrudan yanıt · 5 "hangi konu?" netleştirmesi · 0 fallback** | ÖLÇÜLDÜ |

Karşılaştırma (aynı tabloda, `bench/report.md`): 47 araçlı bir rakip yüzeyinin **açıklamasız şema
alt sınırı** 3.053 token; dayanak'ın kendi belgelediği **20.000 karakterlik docstring bütçesi**
tek başına ≈5.952 token. Bizim 5 aracımız **885 token** (ölçüldü). **Ama** çıplak şema
karşılaştırmasında dayanak'ın 11 aracı (713 token) hâlâ bizden biraz ucuz (1,24×) — bu yüzden
"az araç = her zaman az token" demiyoruz; farkı **tanım başına maliyet + tek çağrı** olarak
ifade ediyoruz.

Yeniden üretmek için:

```bash
node bench/merge-dbs.ts                      # ölçüm için birleşik korpus (bench/results/merged.db)
node bench/measure.ts --iterations 20         # bizim sunucu: token + gecikme
node bench/baseline.ts                       # rakip alt sınırı (ağ gerekmez)
node bench/report.ts                         # bench/report.md
```

## Kalite kapıları — biri hariç geçiyor

Planın 12. bölümündeki kapıların gerçek korpus üzerindeki ölçümü ([ayrıntı](docs/KALITE.md)):

| Kapı | Hedef | Ölçülen | Durum |
| --- | --- | --- | --- |
| Yönlendirme top-1 / top-3 | %85 / %97 | **%97,4 / %99,4** (152/156 · 155/156) | ✅ |
| Kural testleri | %100 | **%100** (60 test, 313 tablo vakası) | ✅ |
| Atıf çözümlenebilirliği | %100 | **64/64** | ✅ |
| Token bütçesi | 21/21 | **21/21** | ✅ |
| Gecikme p95 | < 400 ms | **21,6 ms** | ✅ |
| **İçtihat Recall@5** | **%85** | **%50,1** | ❌ |

Yönlendirme altın seti **182 satır** (156 pozitif + 26 tuzak) ve iki alanı birlikte ölçer; SGK'nın
8 yaprağının her biri için en az 2 bağımsız örnek vardır. "İlaç yan etkisi" (r157) bilinçli olarak
**tuzak** kalır: ürün/malpraktis sorusudur, SGK katılım payı değildir.

**Arama kapısı geçmiyor ve bunu saklamıyoruz.** Sebep: 239 kararlık tohum korpus + mekanik
(pooled) etiketleme; ayrıca `ret`/`bozma` kararlarını bilinçli olarak geriye atan sonuç önsavı
tek başına ~11 recall puanına mal oluyor (önsav kapalıyken Recall@5 %61,1). Sonuç: `hukuk_sor`
akışı güvenilir, **`ara` aracı bugün deneysel**. Korpus büyüdükçe ve altın set bağımsız
etiketlendikçe bu sayı yükselir; yükselene kadar "%85 isabetli içtihat araması" demiyoruz.

## Dürüst sınırlar

- **Korpus bir v1 tohumudur, "tüm içtihat" değildir; arama recall'ı bu yüzden düşüktür.** Ölçüm anındaki korpus 14 mevzuat / 5266 madde /
  **239 karar** / 65 konu düğümü / 49 kart / 58 tarihli parametre satırı
  (korpus sürümü `v20261022.436046465`). Bu hacim tüketici hukukunun ve SGK'nın yaygın
  uyuşmazlıklarını kapsamaya yeter, **kapsamlı içtihat iddiası değildir**; karar sayısı arttıkça
  cevaplar zenginleşir. Konu ontolojide yoksa sunucu **uydurmuyor**: "hangi konu?" diye soruyor
  ya da `DUGUM_BULUNAMADI` + eksik bilgi listesi döndürüyor.
- **SGK kapsamı vardır; emeklilik hesabı yoktur.** 5510/4447 kaynaklı 8 yaprak ve 8 kural eklendi.
  Emeklilik yaşı/aylık hesabı (5510 m.28), kıdem/ihbar, sağlık hukuku/malpraktis ve dilekçe
  üretimi kapsam dışıdır; sunucu bunu söyler, zorlamaz ([ADR-005](docs/adr/ADR-005-sgk-kapsami.md)).
- **Kural parametreleri "teyit bekliyor"** olabilir; yanıtta `[teyit bekliyor]` etiketi görürsünüz.
  Bu etiket, değerin uzman onayından geçmediğini söyler.
- **Yerel stdio** ölçümüdür; ağ taşıması (barındırılan sürüm) ve model gecikmesi kapsam dışıdır.
- **Rakip sayıları** ya belgeden ya varsayımdan gelir; hiçbir rakip kurulup ölçülmedi.
- Mahkeme kararları ve mevzuat **değişir**. Yanıt, korpusun derlendiği tarihe kadar doğrudur;
  kritik kararlarda resmî kaynaktan teyit edin.

## Gizlilik

Sunucu **yerel** çalışır: sorunuz hiçbir sunucuya gönderilmez, telemetri yoktur, log kalıcı
tutulmaz. `ozet` alanına yazdığınız kişisel bilgiler yalnızca o çağrı için işlenir. İnternet
yalnızca **korpusu ilk kez indirirken/derlerken** kullanılır; sorgu anında dış istek yoktur.

## Yasal uyarı

Bu araç **hukuki danışmanlık vermez** ve avukatın yerini almaz. Resmî metne erişimi kolaylaştırır;
yorum ve somut olaya uygulama sizin/avukatınızın işidir. Süreler ve eşikler mevzuat değişikliğiyle
geçersizleşebilir. Yanıtlardaki her kaynağı, verilen bağlantıdan teyit edin. Acil ve telafisi zor
durumlarda (zamanaşımı, haciz, tahliye, işten çıkarma süreleri) **derhâl bir avukata danışın**.

## Kaynaklar

- **Mevzuat:** [mevzuat.gov.tr](https://www.mevzuat.gov.tr) — Cumhurbaşkanlığı Mevzuat Bilgi Sistemi
- **Resmî Gazete:** [resmigazete.gov.tr](https://www.resmigazete.gov.tr)
- **Yargıtay ve Bölge Adliye Mahkemesi kararları:** Adalet Bakanlığı [bedesten.adalet.gov.tr](https://bedesten.adalet.gov.tr) (UYAP Emsal ve mevzuat.adalet.gov.tr'nin arka ucu)
- Erişim politikası ve sınırları: [`docs/adr/ADR-001-kaynak-erisim.md`](docs/adr/ADR-001-kaynak-erisim.md)

Rakipler ve kanıtlı karşılaştırma: [`docs/RAKIPLER.md`](docs/RAKIPLER.md).
Mimari kararlar: [`docs/adr/`](docs/adr/).
Katkı: [`CONTRIBUTING.md`](CONTRIBUTING.md) · agent kuralları: [`AGENTS.md`](AGENTS.md).
Lisans: kod MIT ([`LICENSE`](LICENSE)); korpus notu: [`DATA-LICENSE.md`](DATA-LICENSE.md).
