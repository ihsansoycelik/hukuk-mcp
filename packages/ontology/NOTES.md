# Ontoloji notları

## Yapı

`tuketici.yaml` — 9 dal, 41 yaprak, 1 kök (`t/tuketici`). Derinlik 2 (dal → yaprak).
Yaprak = tek uyuşmazlık konusu + o konuyu yöneten kural seti.

Dallar: `ayipli-mal`, `ayipli-hizmet`, `mesafeli-sozlesme`, `abonelik`, `finansal`,
`konut-ve-tatil`, `garanti-ve-servis`, `haksiz`, `usul`.

## Bilinçli sapma: talep tipi düğüm değil

Planın örneği `t/ayipli-mal/arac/gizli-ayip/bedel-iadesi` gibi talep düzeyinde yapraklar
öngörüyordu. Bunun yerine talep, kartın **HAKLAR** bölümünde dört seçenek olarak sunuluyor
ve `hukuk_sor.talep` alanı yalnızca vurguyu değiştiriyor.

Gerekçe:
1. **Hukuken doğru olan bu.** 6502 m.11 tüketiciye bir *menü* verir: dönme, indirim,
   onarım, ayıpsız misli. Bunlar aynı uyuşmazlığın alternatif çözümleridir, ayrı
   uyuşmazlıklar değil. Dört ayrı yaprak, aynı maddeyi dört kez kartlaştırır.
2. **Vatandaş böyle sormuyor.** "Sözleşmeden dönme dalını istiyorum" demiyor; "paramı geri
   alabilir miyim" diyor. Talep, olay anlatımından çıkarılır ve dört hak birlikte gösterilir —
   kullanıcı hangisinin kendisine uygun olduğunu ancak hepsini görünce seçebilir.
3. **Token maliyeti.** Dört yaprak = dört kart = dört kat bakım ve token. Menü modeli aynı
   bilgiyi tek kartta verir.

Bunun bedeli: `talep` alanı zorunlu değil ve yönlendirmeyi keskinleştirmiyor; talep
farklılaşması yalnızca HAKLAR sıralamasında ve `derinles` odağında kullanılabilir.

## Düğüm sınırı nerede çizildi

- **Konut vs diğer mal:** ayrı yaprak, çünkü zamanaşımı 5 yıl (m.12), onarım/değişim süresi
  60 iş günü (m.11/4). Hukuki sonuç değişiyor.
- **İkinci el galeri:** ayrı yaprak, çünkü m.12/2 asgari 1 yıllık sorumluluk ve hile iddiası
  pratikte burada yoğunlaşıyor.
- **Usul dalı:** uyuşmazlık tipi değil, "nasıl yapılır" rehberi. Kural motorunun en yoğun
  çalıştığı dal; bu yüzden 6 yaprak.
- **Çapraz konular düğüm değil:** arabuluculuk, hakem heyeti, süre hesabı, harç — hepsi
  `kurallar` alanıyla düğümlere bağlanır.

## Kartlar

- 15 kart **elle yazıldı** (`cards/tuketici-kartlar.yaml`), durum `taslak`.
- 26 kart **şablondan** üretildi (build sırasında), durum `otomatik`. Şablon kartlarda
  her satır yaprağın `maddeler` listesinden gelen bir kimlik taşır; uydurma cümle yok.
- Hiçbir kart `uzman_onayli` değil. Bu bilinçli: avukat onayı olmadan o etiket alınamaz
  (`kartlariDogrula` bunu zorlar — `onaylayan` alanı olmadan `uzman_onayli` kart hatadır).

## Doğrulama

`node --test packages/ontology/test/*.test.ts` şunları zorlar:
- id tekilliği ve biçimi (`t/<dal>[/<yaprak>]`),
- her yaprakta ≥5 örnek anlatım ve boş olmayan kural + madde listesi,
- örnek anlatımların **global tekilliği** (aynı cümle iki düğümde olamaz — yoksa altın set
  kendini ölçer),
- her kartın düğümü var, zorunlu bölümleri (ÖZET/HAKLAR/YOL) tam, her bölümde en az bir
  kaynak kimliği, kimliklerin biçimi doğru.

## Büyüme

Yeni düğüm eklemek için: YAML'a yaprak ekle → ≥5 örnek yaz → `kurallar` ve `maddeler` bağla →
`node --test packages/ontology/test` → `uv run python pipeline/build.py`. Kimlik değişikliği
alias olmadan yasaktır.
