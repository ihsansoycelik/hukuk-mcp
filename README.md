# hukuk-mcp

[![npm](https://img.shields.io/npm/v/hukuk-mcp)](https://www.npmjs.com/package/hukuk-mcp) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Türk tüketici hukuku ve SGK için MCP sunucusu. "Başıma şu geldi, ne yapabilirim?" sorusunu tek
çağrıda yanıtlar. Yanıtta haklar, süreler, başvurulacak merci ve yol haritası yer alır. Her
cümle doğrulanabilir bir kanun maddesine veya karar kimliğine bağlıdır.

```bash
npx -y hukuk-mcp
```

- Avukatlar için değil, tüketici ve sigortalı için yazıldı. Dil sadedir: "şu hakkın var, şu süre
  içinde şuraya başvur".
- Sorgu anında internete çıkmaz, üretken model çağırmaz. Süreleri ve parasal sınırları kural
  motoru hesaplar, model tahmin etmez.
- Korpus pakete gömülüdür: 14 kanun, 5.266 madde, 3.018 Yargıtay ve Bölge Adliye
  Mahkemesi kararı (korpus tarihi 26 Kasım 2026).
- 5 araç. Araç tanımlarının her turdaki maliyeti 964 token.

Kapsam: tüketici hukuku (6502 sayılı Kanun ve bağlantılı TBK, HMK, HAUK, İİK hükümleri) ve sosyal
güvenlik (5510, 4447): ayıplı mal ve hizmet, iade, cayma, mesafeli satış, abonelik, kredi kartı
aidatı, kredi masrafları, paket tur, devre tatil, ön ödemeli konut, işsizlik ödeneği, GSS prim
borcu, iş kazası bildirimi, hizmet tespiti, SGK kararına itiraz. Kira, iş hukuku (kıdem, ihbar),
ceza ve aile hukuku kapsam dışıdır; sunucu bunu söyler ve konu uydurmaz.

## Kurulum

Gereken tek şey Node.js 22.13 veya üstü.

npm: [hukuk-mcp](https://www.npmjs.com/package/hukuk-mcp). MCP Registry: `io.github.ihsansoycelik/hukuk-mcp`.

| İstemci | Nasıl |
| --- | --- |
| Claude Code | `claude mcp add hukuk -- npx -y hukuk-mcp` |
| Claude Code (eklenti + beceri) | `/plugin marketplace add ihsansoycelik/hukuk-mcp` sonra `/plugin install hukuk@hukuk-mcp` |
| Claude Desktop | Sürümler sayfasındaki `hukuk-mcp.mcpb` dosyasını çift tıklayın, ya da aşağıdaki JSON |
| Cursor, Windsurf, VS Code | aşağıdaki JSON (`~/.cursor/mcp.json`, VS Code'da anahtar `servers`) |
| Codex | `~/.codex/config.toml` içine aşağıdaki TOML |

```json
{
  "mcpServers": {
    "hukuk": { "command": "npx", "args": ["-y", "hukuk-mcp"] }
  }
}
```

```toml
[mcp_servers.hukuk]
command = "npx"
args = ["-y", "hukuk-mcp"]
```

Uzak istemciler için `npx -y hukuk-mcp --http 8787` Streamable HTTP sunucusunu
`http://127.0.0.1:8787/mcp` adresinde açar (durumsuz, yalnız POST, `/health` sağlık kontrolü).
Dışarı açacaksanız önüne kendi TLS ve erişim katmanınızı koyun.

Kurulumdan sonra modele olayı anlatmanız yeterli: *"hukuk aracına sor: …"*.

## Araçlar

| Araç | Ne yapar | Örnek |
| --- | --- | --- |
| `hukuk_sor` | Tek çağrıda yanıt: özet, kurallar, haklar, yol, eksik bilgiler, kararlar | olayın kendisi, varsa tarih ve tutar |
| `derinles` | Bir madde, karar veya konuyu kimliğiyle açar | `derinles(id="m:6502/11")` |
| `ara` | Yargıtay ve BAM kararlarında arama, mahkeme ve yıl süzgeciyle | `ara(sorgu="paramı geri vermiyorlar")` |
| `hesapla` | Süre, eşik ve merci kuralı | `hesapla(kural="ayip_zamanasimi", girdiler={teslim_tarihi:"2025-03-10"})` |
| `dogrula` | Atıf denetimi: kimlik, künye ya da serbest metin | `dogrula(metin="TKHK m.11 ve aynı Kanunun 99. maddesi…")` |

### `hukuk_sor` örneği

Girdi: *"Bayiden aldığım sıfır arabanın şanzımanı 3 ayda 4 kez arıza yaptı, paramı geri alabilir
miyim?"*, tutar 250.000 TL, teslim 1 Haziran 2026. Gerçek çıktıdan kısaltılmıştır:

```text
DÜĞÜM t/ayipli-mal/arac (güven 0.51) | kart v1 taslak | sürüm …
ÖZET
Satın aldığınız araçta teslimden sonra ortaya çıkan arıza ayıplı mal sayılabilir; bu durumda
satıcıya karşı dört seçimlik haktan birini kullanabilirsiniz [m:6502/11]. …
KURALLAR
- gorevli_merci: tuketici_mahkemesi — 250.000,00 TL değerindeki uyuşmazlık için 26 Kasım 2026
  Perşembe tarihinde geçerli sınır 186.000,00 TL: görevli merci tüketici mahkemesi. […]
- arabuluculuk_dava_sarti: gerekli — … dava açmadan önce arabuluculuk dava şartıdır (m.73/A). […]
- ayip_zamanasimi: 01.06.2028 — Teslim 1 Haziran 2026 Pazartesi; ayıplı maldan sorumlulukta son
  gün 1 Haziran 2028 Perşembe (m.12/1 süresi). […]
- harc_durumu: muaf — davacı tüketici olduğu için m.73/2 uyarınca harçtan muaf. […]
HAKLAR
- Sözleşmeden dönme: aracı geri verip ödediğiniz bedeli isteme [m:6502/11]
- …
YOL
1) Satıcıya yazılı bildirim yapın ve dört haktan hangisini seçtiğinizi açıkça yazın [m:6502/11]
…
EKSİK OLGULAR
satıcının yerleşim yeri, tüketicinin yerleşim yeri
KARARLAR
- k:ygt-3hd-2025-3587-2026-1707 (3. Hukuk Dairesi, 30.03.2026, onama) — …
DERINLES
t/ayipli-mal/arac | m:6502/11 | m:6502/12 | k:ygt-3hd-2025-3587-2026-1707
NOT Bilgi amaçlıdır, hukuki danışmanlık değildir; somut olayınız için bir avukata danışın.
```

Bu yanıt 1.174 token tuttu ve tek çağrıdır. Yanıtın bir token bütçesi vardır (`butce`,
varsayılan 1500, en fazla 4000). İki konu birbirine yakınsa yanıt `DİĞER OLASILIK` satırıyla
ikinci konuyu adlandırır. Konu belirsizse sunucu tahmin etmez, `BELİRSİZ DÜĞÜM` ile seçenek sunar.

### `dogrula` ile atıf denetimi

Model kullanıcıya yanıt göndermeden önce taslağını `dogrula(metin=…)` ile denetleyebilir. Kanun
kısaltmaları (TKHK, TBK, HMK, TMK, İİK…), "6502 sayılı Kanunun 12. maddesi" gibi yazımlar,
"aynı Kanun" ve tek başına geçen "m. 73" gibi geri göndermeler çözülür. Gerçek çıktı:

```text
ATIF DENETİMİ 10 atıf: 5 doğru, 1 mülga, 1 yok, 3 kapsam dışı
✓ DOĞRU m:6502/11 | "TKHK m.11" | Tüketicinin seçimlik hakları | https://www.mevzuat.gov.tr/…
✓ DOĞRU m:6502/12 | "6502 sayılı Kanunun 12. maddesinde" | Zamanaşımı | …
✗ YOK m:6502/99 | "aynı Kanunun 99. maddesi" | 6502'de böyle madde yok (son madde 88)
⚠ MÜLGA m:6100/107 | "HMK m.107" | madde yürürlükten kalkmış: (Mülga:16/7/2026-7589/19 md.)
? KAPSAM DIŞI m:4857/17 | "4857 sayılı İş Kanunu m.17" | 4857 sayılı kanun korpusta yok; doğrulanamadı
✓ DOĞRU k:ygt-3hd-2026-5450-2026-4405 | "Yargıtay 3. Hukuk Dairesi 2026/5450 E., 2026/4405 K." | …
? KAPSAM DIŞI k:ygt-3hd-2019-1111-2020-2222 | "Yargıtay 3. Hukuk Dairesi 2019/1111 E. 2020/2222 K." | korpusta yok; …
NOT Varlık denetimidir: maddenin/kararın içeriğinin doğru aktarıldığını kontrol etmez.
```

Bu bir varlık denetimidir. Gerçek bir karar numarasının altına uydurulmuş bir hüküm yazılırsa
denetim bunu yakalamaz; içerik için `derinles` ile metni açın.

## Ölçülen sayılar

Korpus `v20261126.168861017`, 26 Kasım 2026. Ölçüm makinesi 2 vCPU, başka işlerle paylaşılan bir sunucu.

| Ölçüm | Sonuç |
| --- | --- |
| Konu yönlendirme, ilk sıra / ilk 3 (156 pozitif soru) | %97,4 (152/156) / %99,4 (155/156) |
| Kapsam dışı tuzak sorular belirsiz döndü | 26/26 |
| Atıf bütünlüğü (yanıtlardaki her kimlik korpusta var) | %100 |
| Halk dili arama, geliştirme seti (27 sorgu): Hit@5 / MRR | %85,2 (23/27) / 0,716 |
| Halk dili arama, ayrı set (20 sorgu, tabloya bakılmadan yazıldı): Hit@5 / MRR | %90,0 (18/20) / 0,641 |
| Gecikme p95, gerçek korpus, tüm araçlar | 163 ms |
| npm paketi (sıkıştırılmış / açılmış) | 19,8 MB / 60,8 MB |
| Birim + e2e testleri / kabul testi | 118/118 / 15/15 |

Halk dili arama ölçümü şöyle kuruldu. Her sorgu gündelik Türkçeyle yazıldı ve hukuk terimini
bilerek içermez ("paramı geri vermiyorlar", "bedel iadesi" değil). Bir karar, Adalet
Bakanlığı veritabanının kendi ifade aramasında o kavram için döndüyse ve tam metninde o ifade
geçiyorsa ilgili sayılır. Yani ilgililiği bizim sıralamamız ya da sorgunun kelimeleri değil, kaynak
belirler. Halk dili ile hukuk dili arasındaki köprü ([`esanlam.ts`](packages/retrieval/src/esanlam.ts))
geliştirme setine bakılarak yazıldı. Bu yüzden genellemeyi gösteren sayı ayrı settekidir.
Köprü kapalıyken (`HUKUK_ESANLAM=0`) ayrı sette Hit@5 %80,0 (16/20), MRR 0,545 idi.

Eski mekanik altın set (`eval/golden/search-real.jsonl`) bir kararı, sorgunun kendi köklerini
içeriyorsa ilgili sayar. Sorguyu hukuk diline çeviren her iyileştirmeyi cezalandırdığı için artık
kapı olarak kullanılmıyor; sayısı (%17,0; köprü kapalıyken %21,0) bilgi için `node eval/run.ts --db data/build/hukuk.db`
çıktısında duruyor.

Yeniden üretmek için:

```bash
node eval/run.ts --db data/build/hukuk.db         # yönlendirme, kurallar, atıf, gecikme
node eval/lay-search.ts                            # halk dili, geliştirme seti
node eval/lay-search.ts --golden eval/golden/search-lay-holdout.jsonl
./scripts/kabul-testi.sh                           # uçtan uca, gerçek stdio
```

## Benzerleri ve farkı

Türkçe hukuk MCP'leri ve başka dillerde hızla yayılan hukuk sunucuları Kasım 2026'da incelendi.

| Proje | Yaklaşım | hukuk-mcp'nin farkı |
| --- | --- | --- |
| saidsurucu/yargi-mcp | Türk içtihat arama; ücretsiz barındırılan uç kapandı, ücretli sürüme yönlendiriyor | ücretsiz, yerel, hesap gerekmez |
| saidsurucu/mevzuat-mcp (bir çatalı) | 26 araç, Chromium ile canlı kazıma (~480 MB) | 5 araç, tarayıcı yok, çevrimdışı |
| aydincan/turk-hukuku-mevzuat-mcp | mevzuat.gov.tr'den canlı güncel metin | süre ve merci hesabı, vatandaş dili; canlı güncellik bizde yok |
| chrisryugj/korean-law-mcp (Kore) | ~250 kısaltma, sıfır sonuçta geri düşme zinciri, serbest metin atıf denetimi | aynı fikirler Türkçeye uyarlandı: kısaltma ve halk dili köprüsü, atıf denetimi |
| aa0101181514/tw-legal-rag (Tayvan) | ~22,8 milyon karar, atıf beyaz listesi, temyiz zinciri | küçük ve gömülü korpus; temyiz zinciri henüz yok |

Bilerek alınmayanlar: sorgu yolunda LLM, gömme (embedding) ve vektör veritabanı, canlı kaynak
çağrısı, onlarca araç. Hepsi ya korpusu büyütür ya çevrimdışı çalışmayı bozar ya da her turda
token maliyetini artırır.

## Sınırlar

- Korpus tüm içtihat değildir. 3.018 karar, tüketici ve SGK konularında bedesten'in ifade
  aramasıyla toplandı. Yanıttaki kararlar örnektir, emsal taraması değildir.
- Kural parametrelerinin bir kısmı `[teyit bekliyor]` etiketlidir: değer kaynaklıdır ama bir
  avukatın onayından geçmemiştir. 2027 tüketici hakem heyeti sınırları Aralık 2026 tebliğiyle
  güncellenecek.
- Kararların tam metni saklanmaz; özet (L0/L1) ve arama anahtarı saklanır. Tam metin için
  kaynak bağlantısı verilir.
- Yönetmelikler (ör. Mesafeli Sözleşmeler Yönetmeliği) korpusta yoktur; sunucu bunları
  `[+1 ikincil mevzuat]` diye sayar, çözülemeyen kimlik üretmez.
- Emeklilik yaşı ve aylık hesabı, kıdem ve ihbar, malpraktis ve dilekçe üretimi kapsam dışıdır.
- Mevzuat ve içtihat değişir. Yanıt korpus tarihine kadar geçerlidir.

## Gizlilik

Sunucu yereldir. Soru hiçbir sunucuya gönderilmez, telemetri yoktur, kalıcı log tutulmaz.
İnternet yalnız korpusu derlerken kullanılır.

## Yasal uyarı

Bu araç hukuki danışmanlık vermez ve avukatın yerini almaz. Resmî metne erişimi kolaylaştırır;
somut olaya uygulamak sizin ya da avukatınızın işidir. Zamanaşımı, haciz, tahliye, işten çıkarma
gibi telafisi zor durumlarda bir avukata veya baroya (adli yardım) başvurun.

## Kaynaktan derleme

```bash
git clone https://github.com/ihsansoycelik/hukuk-mcp && cd hukuk-mcp
pnpm install
python3 pipeline/collect/bedesten.py      # kararlar, saniyede 1 istek
python3 pipeline/build.py                 # kanunları indirir, data/build/hukuk.db üretir
pnpm check                                # typecheck + testler + kabul testi
node scripts/build-npm.ts                 # dist-npm/ (npm paketi ve .mcpb içeriği)
```

## Kaynaklar

- Mevzuat: [mevzuat.gov.tr](https://www.mevzuat.gov.tr) (Cumhurbaşkanlığı Mevzuat Bilgi Sistemi)
- Kararlar: Adalet Bakanlığı [bedesten.adalet.gov.tr](https://bedesten.adalet.gov.tr), UYAP Emsal ve
  mevzuat.adalet.gov.tr'nin arka ucu
- Parasal sınırlar: [resmigazete.gov.tr](https://www.resmigazete.gov.tr) tebliğleri
- Erişim kuralları: [ADR-001](docs/adr/ADR-001-kaynak-erisim.md). Mimari kararlar: [`docs/adr/`](docs/adr/)

Katkı: [CONTRIBUTING.md](CONTRIBUTING.md). Lisans: kod MIT ([LICENSE](LICENSE)), korpus notu
[DATA-LICENSE.md](DATA-LICENSE.md).
