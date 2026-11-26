/**
 * Time-awareness helpers: amendment notes (`madde_degisiklik`) shown with an
 * article, and warnings when a rule's legal basis changed after the event date.
 *
 * The corpus holds only the CURRENT text of an article. When an article changed
 * after the event, the text in force on the event date is not available; the
 * warning says so instead of guessing.
 */
import type { CorpusPort, DegisiklikKaydi } from "./ports.ts";
import { kimlikNormalize, trTarih } from "./render.ts";

/** Rule input fields that carry the date of the event itself (not "today"). */
const OLAY_ALANLARI = [
  "olay_tarihi",
  "teslim_tarihi",
  "isten_cikis_tarihi",
  "sozlesme_tarihi",
  "kaza_tarihi",
  "odeme_tarihi",
  "kurulum_tarihi",
];

const ISO = /^\d{4}-\d{2}-\d{2}/;

/** Earliest ISO event date among the given inputs, or null. Earliest = most warnings, never fewer. */
export function olayTarihiBul(girdiler: Record<string, unknown>): string | null {
  const t = OLAY_ALANLARI.map((k) => girdiler[k])
    .filter((v): v is string => typeof v === "string" && ISO.test(v))
    .map((v) => v.slice(0, 10))
    .sort();
  return t[0] ?? null;
}

/** "7392 s. K. m.6" / "KHK-684 m.8" / "AYM kararı". */
export function kanunEtiketi(d: DegisiklikKaydi, madde = true): string {
  const ek = madde && d.kanun_madde ? ` m.${d.kanun_madde}` : "";
  if (!d.kanun_no) return d.tur === "iptal" ? "AYM kararı" : d.tur;
  return /^\d+$/.test(d.kanun_no) ? `${d.kanun_no} s. K.${ek}` : `${d.kanun_no}${ek}`;
}

/** Lines for derinles: summary of the latest change plus up to 3 recent ones. */
export function degisiklikSatirlari(d: DegisiklikKaydi[]): string[] {
  if (d.length === 0) return [];
  const sirali = [...d].sort((a, b) => b.tarih.localeCompare(a.tarih));
  const son = sirali[0]!;
  const bas = `DEĞİŞİKLİK son ${trTarih(son.tarih)} (${kanunEtiketi(son)}, ${son.tur}) | toplam ${d.length}`;
  const liste = sirali
    .slice(0, 3)
    .map((x) => `- ${trTarih(x.tarih)} ${kanunEtiketi(x)} ${x.tur}${x.fikra ? ` (fıkra ${x.fikra})` : ""}`);
  return [bas, ...liste];
}

/**
 * DİKKAT lines for dayanak articles that changed after `olay` (ISO). Max 2.
 * Ids may carry an "@YYYY-MM-DD" suffix; only corpus articles (m:) are checked.
 */
export function olaySonrasiUyarilari(corpus: CorpusPort, dayanak: string[], olay: string | null): string[] {
  if (!olay || !corpus.degisiklikler) return [];
  const out: string[] = [];
  const goruldu = new Set<string>();
  for (const ham of dayanak) {
    const id = kimlikNormalize(ham).split("@")[0]!;
    if (!id.startsWith("m:") || goruldu.has(id)) continue;
    goruldu.add(id);
    const sonrasi = corpus
      .degisiklikler(id)
      .filter((d) => d.tarih > olay)
      .sort((a, b) => a.tarih.localeCompare(b.tarih));
    const d = sonrasi[0];
    if (!d) continue;
    out.push(
      `DİKKAT dayanak ${id} olaydan sonra değişti (${trTarih(d.tarih)}, ${kanunEtiketi(d, false)}); olay tarihindeki metin korpusta yok, resmî kaynaktan teyit edin.`,
    );
    if (out.length >= 2) break;
  }
  return out;
}
