/**
 * Fixture topics for eval/fixtures/test.db and eval/golden/search.jsonl.
 *
 * Each ontology leaf gets two realistic dispute scenarios. Every scenario owns
 * TWO synthetic decisions (Yargıtay + BAM) with the scenario's distinctive
 * vocabulary in the summary. That is what makes mechanical relevance labelling
 * honest: the query for a scenario contains terms that occur in its two
 * decisions and in no other fixture decision. Unjudged same-topic decisions are
 * treated as non-relevant by the metric (pooled-judgement convention), which
 * makes the reported recall conservative rather than inflated.
 *
 * These are synthetic summaries, not real judgments. `meta.fixture = true` in
 * the generated DB says so.
 */

export interface Senaryo {
  etiket: string;
  detay: string;
  sorgu: string;
}

export interface Konu {
  dugum: string;
  senaryolar: Senaryo[];
}

export const BRANS_METIN: Record<string, string> = {
  "t/ayipli-mal":
    "6502 sayılı Kanun'un 8-12. maddeleri uyarınca ayıplı malda tüketicinin bedel iadesi, değişim, onarım ve indirim hakları bulunmaktadır.",
  "t/ayipli-hizmet":
    "6502 sayılı Kanun'un 13-16. maddeleri uyarınca ayıplı hizmette tüketici bedel iadesi, yeniden ifa ve tazminat isteyebilir.",
  "t/mesafeli-sozlesme":
    "6502 sayılı Kanun'un 48-49. maddeleri mesafeli sözleşmelerde cayma hakkını ve teslimat yükümlülüğünü düzenlemektedir.",
  "t/abonelik":
    "6502 sayılı Kanun'un 52. maddesi abonelik sözleşmelerinde fesih, yenileme ve fatura bildirimine ilişkin kuralları düzenlemektedir.",
  "t/finansal":
    "6502 sayılı Kanun'un 22, 29, 30, 32 ve 35. maddeleri tüketici kredisi ve kart aidatı bakımından tüketiciyi korumaktadır.",
  "t/konut-ve-tatil":
    "6502 sayılı Kanun'un 40, 43, 45, 50 ve 51. maddeleri ön ödemeli konut, devre tatil ve paket tur sözleşmelerini düzenlemektedir.",
  "t/garanti-ve-servis":
    "6502 sayılı Kanun'un 56-58. maddeleri garanti belgesi, satış sonrası hizmet ve yedek parça yükümlülüğünü düzenlemektedir.",
  "t/haksiz":
    "6502 sayılı Kanun'un 5, 61 ve 62. maddeleri haksız şart, haksız ticari uygulama ve yanıltıcı reklama ilişkin kuralları içerir.",
  "t/usul":
    "6502 sayılı Kanun'un 68, 70 ve 73. maddeleri hakem heyeti, tüketici mahkemesi ve itiraz yollarını düzenlemektedir.",
};

export const KONULAR: Konu[] = [
  {
    dugum: "t/ayipli-mal/arac",
    senaryolar: [
      {
        etiket: "Sıfır araçta şanzıman arızası",
        detay:
          "Bayiden sıfır alınan aracın şanzımanı üç ay içinde dört kez arıza yaptı; servis her seferinde yazılım güncellemesiyle aracı teslim etti.",
        sorgu: "sıfır aldığım arabanın şanzımanı üç ayda dört kez arıza yaptı paramı geri istiyorum",
      },
      {
        etiket: "Galeride tramer kaydı gizleme",
        detay:
          "Galeriden ikinci el alınan araçta ağır hasar kaydı ve tramer kaydı bulunduğu satış sırasında söylenmedi.",
        sorgu: "galeriden aldığım ikinci el araçta tramer kaydı varmış hasarı gizlemişler",
      },
    ],
  },
  {
    dugum: "t/ayipli-mal/elektronik",
    senaryolar: [
      {
        etiket: "Telefon şarj tutmuyor",
        detay:
          "Yeni alınan cep telefonu bir hafta sonra şarj tutmamaya başladı; mağaza iade yerine servise yönlendiriyor.",
        sorgu: "aldığım telefon bir hafta sonra şarj tutmuyor iade edebilir miyim",
      },
      {
        etiket: "Laptop ekranı kendiliğinden çatladı",
        detay:
          "Laptopun ekranı kendiliğinden çatladı; yetkili servis olayı kullanıcı hatası sayarak garanti dışı bıraktı.",
        sorgu: "laptop ekranı kendiliğinden çatladı servis kullanıcı hatası diyor",
      },
    ],
  },
  {
    dugum: "t/ayipli-mal/beyaz-esya",
    senaryolar: [
      {
        etiket: "Çamaşır makinesi su kaçırıyor",
        detay:
          "Yeni çamaşır makinesi ilk ayda su kaçırmaya başladı; servis contanın değişeceğini söyleyip üç hafta parça bekledi.",
        sorgu: "çamaşır makinesi ilk ayda su kaçırıyor tamir mi iade mi istemeliyim",
      },
      {
        etiket: "Buzdolabı kompresör arızası",
        detay:
          "Buzdolabının kompresörü iki ayda bozuldu; satıcı ayıplı ürünü değiştirmek yerine ücretli tamir öneriyor.",
        sorgu: "buzdolabı iki ayda bozuldu servis parça bekliyor değişim isteyebilir miyim",
      },
    ],
  },
  {
    dugum: "t/ayipli-mal/mobilya",
    senaryolar: [
      {
        etiket: "Koltuk üç ayda çöktü",
        detay:
          "Satın alınan koltuk üç ay içinde oturma yerinden çöktü; satıcı kullanım hatası olduğunu söylüyor.",
        sorgu: "aldığım koltuk üç ayda çöktü para iadesi veya değişim istiyorum",
      },
      {
        etiket: "Yatak sözleşmedeki ölçüde gelmedi",
        detay:
          "Sipariş edilen yatak sözleşmede yazan ölçüde gelmedi; satıcı özel üretim olduğu için iade kabul etmiyor.",
        sorgu: "yatak söylenen ölçüde gelmedi para iadesi alabilir miyim",
      },
    ],
  },
  {
    dugum: "t/ayipli-mal/konut",
    senaryolar: [
      {
        etiket: "Yeni dairede duvar nemi",
        detay:
          "Yeni teslim edilen dairede duvarlar nem yapıyor ve boya kabarmış durumda; müteahhit ayıbı kabul etmiyor.",
        sorgu: "yeni aldığım dairede duvarlar nem yapıyor müteahhit ilgilenmiyor",
      },
      {
        etiket: "Daire metrekaresi eksik",
        detay:
          "Dairenin net metrekaresi sözleşmede yazandan küçük çıktı; satıcı tapudaki brüt alanı göstererek itiraz ediyor.",
        sorgu: "dairemin metrekaresi sözleşmedekinden küçük çıktı ne yapabilirim",
      },
    ],
  },
  {
    dugum: "t/ayipli-mal/ikinci-el-galeri",
    senaryolar: [
      {
        etiket: "Kilometre düşürülmüş araç",
        detay:
          "Galeriden alınan ikinci el aracın kilometresi düşürülmüş; satış ilanındaki değerle muayene kaydı uyuşmuyor.",
        sorgu: "ikinci el aracın kilometresi düşürülmüş çıktı galeri iade eder mi",
      },
      {
        etiket: "Şasi hasarı gizlenmiş",
        detay:
          "İkinci el araçta şasi kaydı ve gizlenmiş hasar olduğu, satıcı galerinin bunu bildiği iddia ediliyor.",
        sorgu: "galeriden aldığım araçta şasi hasarı varmış söylemediler",
      },
    ],
  },
  {
    dugum: "t/ayipli-mal/gida",
    senaryolar: [
      {
        etiket: "Son kullanma tarihi geçmiş gıda",
        detay:
          "Markette satılan paketli gıdanın son kullanma tarihi geçmiş çıktı; market fiş olmadığı için iade kabul etmiyor.",
        sorgu: "markette aldığım ürünün son kullanma tarihi geçmiş iade almadılar",
      },
      {
        etiket: "Ambalajı kapalı ürün küflü",
        detay:
          "Ambalajı kapalı süt ürününün içi küflü çıktı; tüketici şikâyet ve tazminat istiyor.",
        sorgu: "aldığım gıda küflü çıktı şikayet edebilir miyim",
      },
    ],
  },
  {
    dugum: "t/ayipli-mal/tekstil",
    senaryolar: [
      {
        etiket: "Elbise ilk yıkamada çekti",
        detay:
          "Yeni alınan elbise ilk yıkamada çekti ve rengi soldu; mağaza kullanım hatası diyerek değişim yapmıyor.",
        sorgu: "yeni aldığım kıyafet ilk yıkamada çekti değiştirirler mi",
      },
      {
        etiket: "Ayakkabı tabanı yırtıldı",
        detay:
          "Ayakkabının tabanı iki hafta içinde yırtıldı; satıcı iade yerine yapıştırma öneriyor.",
        sorgu: "ayakkabı iki haftada yırtıldı mağaza kabul etmiyor",
      },
    ],
  },

  {
    dugum: "t/ayipli-hizmet/tamir-servis",
    senaryolar: [
      {
        etiket: "Tamir sonrası ekran çizildi",
        detay:
          "Telefon tamire verildi; teslim alındığında ekranın çizildiği ve kameranın çalışmadığı görüldü.",
        sorgu: "telefonu tamire verdim ekranı çizik geldi kamera çalışmıyor",
      },
      {
        etiket: "Aynı arıza tamirden sonra devam ediyor",
        detay:
          "Servis aynı arızayı iki kez tamir ettiğini söyledi; araç teslimden sonra yine yolda kaldı.",
        sorgu: "tamir ettirdim ama aynı arıza devam ediyor servis ilgilenmiyor",
      },
    ],
  },
  {
    dugum: "t/ayipli-hizmet/egitim-kurs",
    senaryolar: [
      {
        etiket: "Kursta söz verilen dersler yapılmadı",
        detay:
          "Ödenen kurs ücretine rağmen on ders yerine üç ders yapıldı; eğitmen değişti ve içerik verilmedi.",
        sorgu: "ödediğim kurs on ders yerine üç ders yapıldı para iadesi isterim",
      },
      {
        etiket: "Kurs kapandı ücret iadesi yok",
        detay:
          "Dil kursu kapanınca öğrencilere kalan dersler için ücret iadesi yapılmadı.",
        sorgu: "kurs kapanınca ücretimi geri vermiyorlar ne yapabilirim",
      },
    ],
  },
  {
    dugum: "t/ayipli-hizmet/saglik-estetik",
    senaryolar: [
      {
        etiket: "Saç ekimi sonrası iz kaldı",
        detay:
          "Klinikte yapılan saç ekimi sonrası saç derisinde kalıcı iz oluştu; işlem öncesi riskler anlatılmadı.",
        sorgu: "saç ekimi sonrası iz kaldı klinik sorumlu mu",
      },
      {
        etiket: "Diş implantı düştü",
        detay:
          "Diş implantı iki ay içinde düştü; klinik ücret iadesi yapmıyor ve yeniden işlem için ek ücret istiyor.",
        sorgu: "diş implantı iki ayda düştü ücret iadesi istiyorum",
      },
    ],
  },
  {
    dugum: "t/ayipli-hizmet/tasimacilik-kargo",
    senaryolar: [
      {
        etiket: "Kargo kayboldu",
        detay:
          "Gönderdiğim kargo kayboldu; kargo firması tazminat ödemiyor ve takip kaydı dağıtımda görünüyor.",
        sorgu: "kargom kayboldu firma tazminat vermiyor ne yapabilirim",
      },
      {
        etiket: "Paket ezilmiş teslim edildi",
        detay:
          "Teslim edilen paket ezilmiş ve içindeki cam ürün kırık çıktı; kargo firması hasarı kabul etmiyor.",
        sorgu: "paketim ezilmiş geldi içindeki ürün kırık kargo firması kabul etmiyor",
      },
    ],
  },
  {
    dugum: "t/ayipli-hizmet/otel-konaklama",
    senaryolar: [
      {
        etiket: "Vaat edilen deniz manzaralı oda verilmedi",
        detay:
          "Otel rezervasyonunda deniz manzaralı oda vaat edildi; otel girişte otopark manzaralı oda verdi.",
        sorgu: "otelde vaat edilen deniz manzaralı oda verilmedi para iadesi istiyorum",
      },
      {
        etiket: "Her şey dahil paket eksik ifa",
        detay:
          "Her şey dahil alınan tatil paketinde akşam yemeği ve içecekler dahil değildi; otel ek ücret istedi.",
        sorgu: "her şey dahil aldım ama yemekler dahil değildi otel ek ücret istiyor",
      },
    ],
  },

  {
    dugum: "t/mesafeli-sozlesme/cayma-hakki",
    senaryolar: [
      {
        etiket: "İnternetten alınan ürün on gün sonra iade",
        detay:
          "İnternetten alınan ayakkabı on gün sonra iade edilmek istendi; satıcı cayma süresinin dolduğunu söylüyor.",
        sorgu: "internetten aldığım ayakkabıyı on gün sonra iade etmek istiyorum hakkım var mı",
      },
      {
        etiket: "On dört gün geçti ama ürün ayıplı",
        detay:
          "Mesafeli satışta on dört günlük cayma süresi geçtikten sonra ürünün ayıplı olduğu anlaşıldı.",
        sorgu: "on dört gün geçti ama ürün ayıplı çıktı iade alırlar mı",
      },
    ],
  },
  {
    dugum: "t/mesafeli-sozlesme/teslimat-gecikmesi",
    senaryolar: [
      {
        etiket: "Sipariş bir aydır gelmedi",
        detay:
          "İnternet siparişim bir aydır gelmedi; satıcı kargo firmasını suçluyor ve paramı geri vermiyor.",
        sorgu: "siparişim bir aydır gelmedi paramı geri alabilir miyim",
      },
      {
        etiket: "Üç günde teslim sözü üç haftada yerine gelmedi",
        detay:
          "Sitede üç günde teslim yazıyordu; üç hafta geçtiği halde sipariş kargoya bile verilmedi.",
        sorgu: "sitede üç günde teslim yazıyordu üç hafta oldu ürün gelmedi",
      },
    ],
  },
  {
    dugum: "t/mesafeli-sozlesme/iade-bedeli",
    senaryolar: [
      {
        etiket: "İade edilen ürünün bedeli ödenmedi",
        detay:
          "Ürünü iade ettim ama bir aydır para gelmedi, hesabıma geçmedi; satıcı iadeyi onaylamıştı.",
        sorgu: "ürünü iade ettim ama bir aydır para gelmedi hesabıma geçmedi",
      },
      {
        etiket: "İade kargo ücreti tüketiciden kesildi",
        detay:
          "Cayma hakkı kullanılarak iade edilen üründe kargo ücreti tüketiciden kesildi ve eksik ödeme yapıldı.",
        sorgu: "iade ederken kargo ücretini benden kestiler kesinti yapabilirler mi",
      },
    ],
  },
  {
    dugum: "t/mesafeli-sozlesme/pazaryeri-sorumlulugu",
    senaryolar: [
      {
        etiket: "Pazaryeri satıcısı ilgilenmiyor",
        detay:
          "Trendyol üzerinden alınan ürün ayıplı çıktı; satıcı ilgilenmiyor, platform aracı olduğunu söylüyor.",
        sorgu: "trendyoldan aldım satıcı ilgilenmiyor platform sorumlu mu",
      },
      {
        etiket: "Pazaryerinde sahte ürün satılıyor",
        detay:
          "Hepsiburada üzerinden satılan ürünün sahte olduğu anlaşıldı; satıcı kapanmış, platform bilgi vermiyor.",
        sorgu: "pazaryerinde sahte ürün satılıyor satıcı kapanmış kim sorumlu",
      },
    ],
  },

  {
    dugum: "t/abonelik/gsm-internet",
    senaryolar: [
      {
        etiket: "İnternet hızı sözleşmenin yarısı",
        detay:
          "Fiber internette ölçülen hız sözleşmede yazanın yarısı; operatör cayma bedeli istiyor.",
        sorgu: "internet hızım sözleşmede yazanın yarısı cayma bedeli isterler mi",
      },
      {
        etiket: "Taahhüt bitti otomatik yenilendi",
        detay:
          "Taahhüt süresi dolduktan sonra operatör haber vermeden sözleşmeyi otomatik yeniledi ve cayma bedeli çıkardı.",
        sorgu: "taahhüdüm bitti ama otomatik yenilemişler cayma bedeli istiyorlar",
      },
    ],
  },
  {
    dugum: "t/abonelik/enerji-fatura",
    senaryolar: [
      {
        etiket: "Elektrik faturası dört katı geldi",
        detay:
          "Elektrik faturası normalin dört katı geldi; dağıtım şirketi endeksin doğru okunduğunu söylüyor.",
        sorgu: "elektrik faturam normalin dört katı geldi itiraz edebilir miyim",
      },
      {
        etiket: "Sayaç arızalı fatura yüksek",
        detay:
          "Doğalgaz sayacının arızalı olduğu servis raporuyla tespit edildi; fatura yüksek tahakkuk etti.",
        sorgu: "sayaç arızalı fatura yüksek çıkıyor doğalgaz aboneliğim ne olacak",
      },
    ],
  },
  {
    dugum: "t/abonelik/uyelik-spor",
    senaryolar: [
      {
        etiket: "Spor salonu kapandı",
        detay:
          "Spor salonu şube kapatınca kalan üyelik ücreti iade edilmedi; başka şubede yer yok.",
        sorgu: "spor salonu kapandı kalan üyelik ücretimi geri alamıyorum",
      },
      {
        etiket: "Taşındım başka şehirde salon yok",
        detay:
          "Üyelik sözleşmesinde taşınma halinde iade hakkı olduğu halde spor salonu ücreti geri ödemiyor.",
        sorgu: "taşındım başka şehirde salon yok ücret iadesi isterim",
      },
    ],
  },
  {
    dugum: "t/abonelik/otomatik-yenileme",
    senaryolar: [
      {
        etiket: "Ücretsiz deneme ücretlendirildi",
        detay:
          "Dijital uygulamada ücretsiz deneme süresi bitmeden abonelik ücreti kredi kartından çekildi.",
        sorgu: "ücretsiz denemeydi otomatik ücretlendirildi kartımdan çekim yapılmış",
      },
      {
        etiket: "İptal ettim yine çekim yapıldı",
        detay:
          "Netflix aboneliğimi iptal ettim ama kartımdan yine çekim yapılmış; ücretsiz deneme sonrası otomatik ücretlendirme yapılmış.",
        sorgu: "aboneliğimi iptal ettim ama kartımdan yine çekim yapılmış",
      },
    ],
  },

  {
    dugum: "t/finansal/kredi-masraflari",
    senaryolar: [
      {
        etiket: "Kredi dosya masrafı iadesi",
        detay:
          "Kredi kullandırılırken dosya masrafı adı altında kesinti yapıldı; banka masrafın zorunlu olduğunu söylüyor.",
        sorgu: "kredi çektiğimde dosya masrafı aldılar geri alabilir miyim",
      },
      {
        etiket: "İpotek ve ekspertiz ücreti",
        detay:
          "Konut kredisinde ipotek tesis ücreti ve ekspertiz ücreti tüketiciden tahsil edildi.",
        sorgu: "konut kredisinde ipotek ücreti ve ekspertiz ücreti iadesi isteyebilir miyim",
      },
    ],
  },
  {
    dugum: "t/finansal/kredi-karti-aidati",
    senaryolar: [
      {
        etiket: "Kredi kartı yıllık aidatı",
        detay:
          "Kredi kartı hesabından yıllık kart aidatı kesildi; banka sözleşmede yazdığını belirtiyor.",
        sorgu: "kredi kartımdan yıllık aidat kesilmiş iade alabilir miyim",
      },
      {
        etiket: "Kullanılmayan kartdan aidat",
        detay:
          "Kullanmadığım kredi kartından aidat ve yıllık üyelik bedeli tahsil edilmiş; banka geri iade etmiyor.",
        sorgu: "kullanmadığım kartdan aidat alınmış geri iade edilir mi",
      },
    ],
  },
  {
    dugum: "t/finansal/erken-odeme",
    senaryolar: [
      {
        etiket: "Kredi erken kapatıldı faiz iadesi",
        detay:
          "Kredi erken kapatıldığı halde kullanılmayan döneme ait faiz ve masraf indirimi yapılmadı.",
        sorgu: "krediyi erken kapatırsam faiz iadesi alır mıyım",
      },
      {
        etiket: "Erken ödeme tazminatı kesildi",
        detay:
          "Konut kredisi erken ödendiğinde banka erken ödeme tazminatı adı altında ek kesinti yaptı.",
        sorgu: "bankam erken ödeme tazminatı kesti bu kesinti doğru mu",
      },
    ],
  },
  {
    dugum: "t/finansal/bagli-kredi",
    senaryolar: [
      {
        etiket: "Krediyle alınan ürün teslim edilmedi",
        detay:
          "Bağlı kredi ile alınan ürün satıcı tarafından teslim edilmedi; banka taksit ödemeye devam etmesini istiyor.",
        sorgu: "kredi ile aldığım ürün gelmedi bankaya ödeme yapmak zorunda mıyım",
      },
      {
        etiket: "Satıcı battı kredi borcu",
        detay:
          "Taksitli satışta satıcı firma iflas etti; teslim edilmeyen ürünün kredi borcu tüketiciden isteniyor.",
        sorgu: "satıcı battı teslim edilmeyen ürünün kredi borcu kimde kalır",
      },
    ],
  },
  {
    dugum: "t/finansal/sigorta",
    senaryolar: [
      {
        etiket: "Kasko hasarı ödenmiyor",
        detay:
          "Kasko sigortasına bildirilen hasar için sigorta şirketi düşük ekspertiz bedeli belirleyip ödeme yapmıyor.",
        sorgu: "kasko hasarımı ödemiyorlar ekspertiz düşük bedel belirledi ne yapabilirim",
      },
      {
        etiket: "Zorunlu hayat sigortası iadesi",
        detay:
          "Kredi çekerken zorunlu olmadığı halde hayat sigortası yaptırıldı; prim iadesi isteniyor.",
        sorgu: "kredi çekerken zorunlu hayat sigortası yapıldı iadesi olur mu",
      },
    ],
  },

  {
    dugum: "t/konut-ve-tatil/on-odemeli-konut",
    senaryolar: [
      {
        etiket: "Müteahhit konutu geç teslim ediyor",
        detay:
          "Ön ödemeli konut sözleşmesinde teslim tarihi geçtiği halde müteahhit konutu teslim etmiyor.",
        sorgu: "ön ödemeli daireyi aldım müteahhit konutu zamanında teslim etmiyor",
      },
      {
        etiket: "Proje iptal oldu ön ödeme geri gelmiyor",
        detay:
          "Ön ödeme yapılan konut projesi iptal edildi; müteahhit ödemeyi geri vermiyor.",
        sorgu: "ön ödeme yaptım proje iptal oldu paramı alamıyorum",
      },
    ],
  },
  {
    dugum: "t/konut-ve-tatil/devre-tatil",
    senaryolar: [
      {
        etiket: "Tanıtım toplantısında devre tatil imzalandı",
        detay:
          "Tatil köyünde tanıtım toplantısı sırasında devre tatil sözleşmesi imzalatıldı; satış baskısı yapıldı.",
        sorgu: "tanıtım toplantısında devre tatil sözleşmesi imzaladım cayabilir miyim",
      },
      {
        etiket: "Devre tatil yıllık aidatı habersiz artırıldı",
        detay:
          "Devre tatil üyeliğinde yıllık aidat haber verilmeden yükseltildi ve ek kredi çektirildi.",
        sorgu: "devre tatil üyeliği yıllık aidatı habersiz artırıldı ne yapabilirim",
      },
    ],
  },
  {
    dugum: "t/konut-ve-tatil/paket-tur",
    senaryolar: [
      {
        etiket: "Paket tur üç gün önce iptal edildi",
        detay:
          "Paket tur üç gün önce iptal edildi; acente kalan ücreti iade etmiyor ve kesinti yapıyor.",
        sorgu: "paket turu üç gün önce iptal ettim ücret iadesi alabilir miyim",
      },
      {
        etiket: "Vaat edilen otel farklı çıktı",
        detay:
          "Paket turda vaat edilen beş yıldızlı otel yerine farklı ve daha düşük nitelikli bir otel verildi.",
        sorgu: "turda vaat edilen otel farklı çıktı acente tazminat öder mi",
      },
    ],
  },

  {
    dugum: "t/garanti-ve-servis/garanti-belgesi",
    senaryolar: [
      {
        etiket: "Garanti belgesi verilmedi",
        detay:
          "Ürün satılırken garanti belgesi verilmedi; satıcı belgenin gerekli olmadığını söylüyor.",
        sorgu: "garanti belgesi verilmedi hakkım var mı",
      },
      {
        etiket: "Garanti dışı denildi ama üretim hatası",
        detay:
          "Arıza üretim hatası olmasına rağmen yetkili servis garanti dışı olduğunu belirtip ücret istiyor.",
        sorgu: "garanti dışı denildi ama arıza üretim hatası ücret ödemek zorunda mıyım",
      },
    ],
  },
  {
    dugum: "t/garanti-ve-servis/satis-sonrasi-hizmet",
    senaryolar: [
      {
        etiket: "Servis otuz iş gününü geçti",
        detay:
          "Arızalı ürün otuz iş gününü aşan süredir serviste; üretici yeni ürün vermiyor.",
        sorgu: "servis otuz iş gününü geçti yeni ürün talep edebilir miyim",
      },
      {
        etiket: "İthalatçı firma kapanmış",
        detay:
          "Ürünün ithalatçısı kapanmış; garanti kapsamındaki arıza için muhatap bulunamıyor.",
        sorgu: "ithalatçı firma kapanmış garanti kimde servis bulamıyorum",
      },
    ],
  },
  {
    dugum: "t/garanti-ve-servis/yedek-parca",
    senaryolar: [
      {
        etiket: "Yedek parça bulunamıyor",
        detay:
          "Servis, ürün için yedek parça bulunamadığını söyleyerek tamiri iki aydır yapamıyor.",
        sorgu: "ürün için yedek parça bulunamıyor servis iki aydır bekletiyor",
      },
      {
        etiket: "Üretimden kalkan ürüne parça yok",
        detay:
          "Üretimden kaldırılan ürün için yedek parça temin yükümlülüğü yerine getirilmiyor.",
        sorgu: "üretimden kalkan ürüne yedek parça temin zorunluluğu var mı",
      },
    ],
  },

  {
    dugum: "t/haksiz/haksiz-sozlesme-sarti",
    senaryolar: [
      {
        etiket: "Tek taraflı fiyat artışı maddesi",
        detay:
          "Abonelik sözleşmesinde yer alan tek taraflı fiyat artışı maddesine dayanılarak zam yapıldı.",
        sorgu: "sözleşmede tek taraflı fiyat artışı maddesi var geçerli mi",
      },
      {
        etiket: "Küçük yazıyla ek ücret",
        detay:
          "Sözleşmenin küçük yazılı bölümünde ek hizmet ücreti konduğu sonradan fark edildi.",
        sorgu: "küçük yazıyla ek ücret konmuş itiraz edebilir miyim",
      },
    ],
  },
  {
    dugum: "t/haksiz/haksiz-ticari-uygulama",
    senaryolar: [
      {
        etiket: "Sahte indirim kampanyası",
        detay:
          "İndirimli diye alınan ürünün fiyatının kampanya öncesiyle aynı olduğu ve indirimin gerçek olmadığı anlaşıldı.",
        sorgu: "indirimli diye aldım aslında indirim yokmuş sahte indirim",
      },
      {
        etiket: "Stokta var gösterip sipariş iptali",
        detay:
          "Sitede stokta var gösterilen ürün sipariş sonrası tükendi denilerek iptal edildi ve para iadesi geciktirildi.",
        sorgu: "stokta var gösterip sonra iptal ettiler kampanya koşulları değişti",
      },
    ],
  },
  {
    dugum: "t/haksiz/yaniltici-reklam",
    senaryolar: [
      {
        etiket: "Reklamdaki indirim kasada yok",
        detay:
          "Reklamda yüzde elli indirim yazıyordu; kasada ürünün indirimsiz fiyatı tahsil edildi.",
        sorgu: "reklamda yüzde elli indirim yazıyordu kasada farklı fiyat çıktı",
      },
      {
        etiket: "Sağlığa iyi geldiği iddia edilen ürün",
        detay:
          "Reklamda sağlığa iyi geldiği söylenen ürünün etkisiz olduğu ve bilimsel dayanağı bulunmadığı anlaşıldı.",
        sorgu: "sağlığa iyi geldiği söylenen ürün etkisiz yanıltıcı reklam şikayeti",
      },
    ],
  },

  {
    dugum: "t/usul/hakem-heyeti-basvurusu",
    senaryolar: [
      {
        etiket: "Hakem heyetine nasıl başvurulur",
        detay:
          "Tüketici, ayıplı ürün bedeli için tüketici hakem heyetine başvuru yapmak istiyor; belgeleri ve başvuru yerini bilmiyor.",
        sorgu: "tüketici hakem heyetine nasıl başvururum hangi belgeler gerekli",
      },
      {
        etiket: "Hakem heyeti parasal sınır",
        detay:
          "Tüketici, uyuşmazlık bedelinin hakem heyeti parasal sınırını aşıp aşmadığını öğrenmek istiyor.",
        sorgu: "hakem heyeti için parasal sınır ne kadar hangi mercie başvurulur",
      },
    ],
  },
  {
    dugum: "t/usul/tuketici-mahkemesi-davasi",
    senaryolar: [
      {
        etiket: "Tüketici mahkemesinde dava açmak",
        detay:
          "Tüketici, hakem heyeti kararından sonra tüketici mahkemesinde dava açmak için görevli mahkemeyi ve harcı soruyor.",
        sorgu: "tüketici mahkemesinde dava açmak için ne gerekli harç öder miyim",
      },
      {
        etiket: "Arabuluculuk dava şartı",
        detay:
          "Tüketici mahkemesinde dava açmadan önce arabuluculuğa başvurunun zorunlu olup olmadığı tartışılıyor.",
        sorgu: "dava açmadan arabulucuya gitmek zorunlu mu tüketici mahkemesi",
      },
    ],
  },
  {
    dugum: "t/usul/itiraz-ve-istinaf",
    senaryolar: [
      {
        etiket: "Hakem heyeti kararına itiraz süresi",
        detay:
          "Hakem heyeti kararı tebliğ edildi; tüketici karara itiraz süresinin kaç gün olduğunu öğrenmek istiyor.",
        sorgu: "hakem heyeti kararına kaç gün içinde itiraz edilir",
      },
      {
        etiket: "Tüketici mahkemesi kararına istinaf",
        detay:
          "İlk derece tüketici mahkemesi kararına karşı istinaf ve temyiz süresi ve mercii soruluyor.",
        sorgu: "tüketici mahkemesi kararına istinaf süresi ne kadar nereye başvurulur",
      },
    ],
  },
  {
    dugum: "t/usul/icra",
    senaryolar: [
      {
        etiket: "Hakem heyeti kararını icraya koymak",
        detay:
          "Kesinleşen hakem heyeti kararına rağmen karşı taraf ödeme yapmadı; tüketici icra takibi başlatmak istiyor.",
        sorgu: "hakem heyeti kararını icraya nasıl koyarım karşı taraf ödemiyor",
      },
      {
        etiket: "Ödeme emrine itiraz",
        detay:
          "Tüketiciye gönderilen icra ödeme emrine itiraz süresi ve itirazın nasıl yapılacağı soruluyor.",
        sorgu: "ödeme emrine itiraz süresi ne kadar icra dosyasına nasıl itiraz edilir",
      },
    ],
  },
  {
    dugum: "t/usul/arabuluculuk-basvurusu",
    senaryolar: [
      {
        etiket: "Arabuluculuğa nasıl başvurulur",
        detay:
          "Tüketici uyuşmazlığında dava şartı arabuluculuk için başvuru yeri ve süreci soruluyor.",
        sorgu: "arabuluculuğa nasıl başvururum dava şartı arabuluculuk süreci",
      },
      {
        etiket: "Arabuluculuk ücretli mi",
        detay:
          "Tüketici, arabuluculuk başvurusunun ücretli olup olmadığını ve anlaşma belgesinin icra edilebilirliğini soruyor.",
        sorgu: "arabuluculuk ücretli mi anlaşırsam icra edilebilir mi",
      },
    ],
  },
  {
    dugum: "t/usul/on-bilgilendirme",
    senaryolar: [
      {
        etiket: "Ön bilgilendirme formu verilmedi",
        detay:
          "Mesafeli sözleşmede sipariş öncesi ön bilgilendirme formu verilmedi; cayma hakkının etkilenip etkilenmediği soruluyor.",
        sorgu: "sipariş öncesi ön bilgilendirme yapılmadı cayma hakkım etkilenir mi",
      },
      {
        etiket: "Onay kutusu işaretlenmeden üyelik",
        detay:
          "Onay kutusu işaretlenmeden üyelik başlatıldı ve sözleşme şartları tüketiciye gösterilmedi.",
        sorgu: "onay kutusu işaretlenmeden üyelik başlatılmış sözleşme geçerli mi",
      },
    ],
  },
];

const BRANS_SIRASI = Object.keys(BRANS_METIN);
void BRANS_SIRASI;
