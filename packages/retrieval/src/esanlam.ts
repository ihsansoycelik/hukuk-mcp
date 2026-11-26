/**
 * Lay-Turkish -> legal-Turkish query expansion for case-law search.
 *
 * Citizens write "bozuk çıktı, paramı geri istiyorum"; decisions say "ayıplı
 * mal", "bedel iadesi". FTS over the decision vocabulary misses that gap. Each
 * row maps lay phrases (matched on the folded query) to the terms courts use.
 * The extra terms are appended to the query, so the existing AND -> rare-term
 * subset -> OR chain decides how much they weigh. Statute abbreviations are
 * expanded the same way ("TKHK" -> "tüketicinin korunması").
 *
 * Kept small and explicit on purpose: every row is reviewable, no learned
 * weights, no network.
 */
import { foldNormalized } from "@hukuk/tr-text";

interface Satir {
  /** folded lay phrases; any one triggers the row */
  halk: string[];
  /** legal terms appended to the query */
  hukuk: string;
}

const TABLO: Satir[] = [
  { halk: ["bozuk", "arizali", "ariza", "calismiyor", "bozuldu", "defolu", "kusurlu", "hasarli geldi"], hukuk: "ayıplı mal" },
  { halk: ["paramı geri", "parami geri", "para iadesi", "parasini geri", "ucret iadesi", "iade edilmedi", "iade etmiyor", "paramı vermiyor", "paramin iadesi"], hukuk: "bedel iadesi" },
  { halk: ["degistirmiyor", "yenisini", "yenisiyle degis", "degisim"], hukuk: "ayıpsız misli ile değişim" },
  { halk: ["tamir", "onarim", "servis"], hukuk: "ücretsiz onarım" },
  { halk: ["indirim", "fiyat farki"], hukuk: "bedelden indirim" },
  { halk: ["gelmedi", "teslim edilmedi", "kargo", "ulasmadi", "teslimat"], hukuk: "teslim mesafeli sözleşme" },
  { halk: ["internetten", "online", "e-ticaret", "siteden aldim", "uygulamadan"], hukuk: "mesafeli sözleşme" },
  { halk: ["vazgectim", "iade etmek istiyorum", "14 gun", "geri gondermek"], hukuk: "cayma hakkı" },
  { halk: ["kullanici hatasi", "kullanim hatasi", "kendim kirdim", "dusurdum"], hukuk: "kullanım hatası" },
  { halk: ["garanti"], hukuk: "garanti belgesi" },
  { halk: ["sifir arac", "sifir araba", "otomobil", "araba", "arac"], hukuk: "araç ayıp" },
  { halk: ["ikinci el"], hukuk: "ikinci el ayıp" },
  { halk: ["ev", "daire", "konut", "tesisat", "rutubet", "catlak"], hukuk: "konut ayıp" },
  { halk: ["aidat", "yillik ucret", "kart ucreti"], hukuk: "kredi kartı üyelik ücreti" },
  { halk: ["dosya masrafi", "kredi masrafi", "ekspertiz", "komisyon"], hukuk: "kredi masrafı" },
  { halk: ["abonelik", "taahhut", "cayma bedeli", "iptal ettiremiyorum"], hukuk: "abonelik sözleşmesi" },
  { halk: ["elektrik faturasi", "kacak elektrik", "sayac", "ek tahakkuk"], hukuk: "kaçak elektrik tahakkuk" },
  { halk: ["ucus", "ucak", "rotar", "havayolu"], hukuk: "uçuş iptali gecikme" },
  { halk: ["bavul", "valiz", "bagaj"], hukuk: "bagaj kaybı" },
  { halk: ["tatil", "otel", "tur"], hukuk: "paket tur" },
  { halk: ["sozlesmede yazan", "kucuk harf", "imzalattilar", "tek tarafli"], hukuk: "haksız şart" },
  { halk: ["isten cikarildim", "isten ayrildim", "isimi kaybettim", "issiz kaldim"], hukuk: "işsizlik ödeneği" },
  { halk: ["gss", "genel saglik", "prim borcu", "saglik sigortasi borcu"], hukuk: "genel sağlık sigortası prim" },
  { halk: ["sigortasiz", "sigortam yatirilmadi", "kayitsiz calistim", "eksik gun"], hukuk: "hizmet tespiti" },
  { halk: ["is kazasi", "iste yaralandim"], hukuk: "iş kazası" },
  { halk: ["sgk geri istiyor", "borc cikardi", "fazla odeme"], hukuk: "yersiz ödeme" },
  { halk: ["hakem heyeti", "nereye basvur", "sikayetimi nereye", "kurula basvur"], hukuk: "tüketici hakem heyeti" },
  { halk: ["usta", "boyaci", "boyadi", "tadilat", "iscilik", "kurulum", "montaj"], hukuk: "ayıplı hizmet" },
  { halk: ["yenisiyle", "yenisini ver"], hukuk: "ayıpsız misli" },
  { halk: ["kullanim hakki", "yazlik", "devre mulk"], hukuk: "devre tatil" },
  { halk: ["maketten", "insaat bitmedi", "teslim tarihinde ev"], hukuk: "ön ödemeli konut" },
  { halk: ["ihtiyac kredisi", "erken kapat", "erken odeme", "kredi cektim"], hukuk: "tüketici kredisi" },
  { halk: ["ucagimi", "ucusum", "ucusu iptal", "sefer iptal"], hukuk: "uçuş iptali" },
  { halk: ["valizim", "bavulum", "kayboldu"], hukuk: "bagaj kaybı" },
  { halk: ["fazla para", "fazla odedi", "geri istiyor"], hukuk: "yersiz ödeme" },
  { halk: ["karara karsi", "kararina itiraz", "kurumun karari", "sgk karari"], hukuk: "kurum işleminin iptali" },
  // statute abbreviations
  { halk: ["tkhk"], hukuk: "tüketicinin korunması" },
  { halk: ["tbk"], hukuk: "borçlar kanunu" },
  { halk: ["hmk"], hukuk: "hukuk muhakemeleri" },
];

const HAZIR = TABLO.map((s) => ({ halk: s.halk.map((h) => foldNormalized(h)), hukuk: s.hukuk }));

/** Legal terms implied by a lay query ("" when none). Deterministic. */
export function hukukTerimleri(sorgu: string): string {
  const f = ` ${foldNormalized(sorgu)} `;
  const ek: string[] = [];
  for (const s of HAZIR) {
    // short phrases must match a whole word ("ev" must not fire on "evrak");
    // longer ones may take Turkish suffixes ("arizali", "kargodan")
    if (s.halk.some((h) => f.includes(h.length < 5 ? ` ${h} ` : ` ${h}`))) ek.push(s.hukuk);
  }
  return [...new Set(ek)].join(" ");
}
