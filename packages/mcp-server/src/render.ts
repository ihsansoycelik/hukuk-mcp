/**
 * Rendering — cards and rule results into short, labelled Turkish plain text.
 *
 * Why not JSON: the same information costs markedly fewer tokens as tagged
 * lines, and every token saved here is budget available for legal substance.
 * Measured saving is in docs/adr/ADR-003-token-butcesi.md.
 */
import type { KuralSonucu } from "@hukuk/schema";
import type { ArgumanSatiri, CorpusPort, KararOzet } from "./ports.ts";

/** ISO (2027-03-14) -> 14.03.2027, the form a Turkish reader expects. */
export function trTarih(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function bugunISO(): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(new Date());
}

const ONAY_ETIKET: Record<string, string> = {
  uzman_onayli: "",
  teyit_bekliyor: " (teyit bekliyor)",
};

/** Internal rule-input keys -> the words a citizen can actually answer. */
const EKSIK_ETIKET: Record<string, string> = {
  teslim_tarihi: "teslim tarihi",
  sozlesme_tarihi: "sözleşme tarihi",
  basvuru_tarihi: "başvuru tarihi",
  dava_tarihi: "dava tarihi",
  uyusmazlik_degeri_tl: "uyuşmazlık tutarı (TL)",
  anapara_tl: "anapara (TL)",
  baslangic: "faiz başlangıç tarihi",
  bitis: "faiz bitiş tarihi",
  tuketici_yerlesim_yeri: "tüketicinin yerleşim yeri",
  islem_yeri: "işlemin yapıldığı yer",
  davali_yerlesim_yeri: "satıcının yerleşim yeri",
  asama: "başvuru aşaması",
  sure_degeri: "süre (sayı)",
  sure_birimi: "süre birimi",
  mal_turu: "mal türü (taşınır/konut)",
  sozlesme_turu: "sözleşme türü",
  kurulum_tarihi: "kurulum/montaj tarihi",
  onarim_talep_tarihi: "onarım talebinin tarihi",
  // SGK kurallarının olgu adları (hukuk_sor eksik olguları vatandaşa sorar)
  isten_cikis_tarihi: "işten çıkış tarihi",
  son_bir_yil_prim_gun: "son bir yıldaki prim gün sayısı",
  prim_borcu_gun: "prim borcu (gün)",
  sigortalilik_turu: "sigortalılık türü (4/a, 4/b, 4/c, 60/g)",
  tecil_var: "tecil/taksitlendirme var mı",
  odeme_tarihi: "ödeme tarihi",
  ogrenme_tarihi: "hakkın öğrenildiği tarih",
  odeme_suresi_son: "prim ödemesinin son günü",
  hane_aylik_gelir_tl: "hanenin aylık geliri (TL)",
  hane_kisi_sayisi: "hanedeki kişi sayısı",
  asgari_ucret_brut_tl: "aylık brüt asgari ücret (TL)",
  prim_gun_sayisi: "prim gün sayısı",
  son_4_ay_ortalama_gunluk_brut_kazanc_tl: "son 4 ay ortalama günlük brüt kazanç (TL)",
  aylik_asgari_ucret_brut_tl: "aylık brüt asgari ücret (TL)",
  son_120_gun_hizmet_akdi: "son 120 gün hizmet akdi (var/yok)",
  kaza_tarihi: "iş kazası tarihi",
  bildirim_tarihi: "bildirim tarihi",
  kuruma_basvuru_tarihi: "Kuruma başvuru tarihi",
  konu: "konu",
};

export function eksikEtiket(anahtar: string): string {
  return EKSIK_ETIKET[anahtar] ?? anahtar;
}

/**
 * Rule citations carry an as-of suffix and sometimes a dash form ("73-A").
 * The corpus id contract is "73A"; normalise so every emitted id resolves.
 */
export function kimlikNormalize(id: string): string {
  return id.replace(/\/(\d+)-([A-Za-z])(?=@|$)/, "/$1$2");
}

/**
 * Only ids the compiled corpus can resolve are printed. Secondary legislation
 * (`y:` yönetmelik/tebliğ) is cited by the rules but is not in the v1 corpus, so
 * it is summarised as a count instead of emitted as a dead id — a citation the
 * caller cannot resolve is worse than an honest gap.
 */
export function dayanakMetni(ids: string[]): string {
  const cozulen: string[] = [];
  let diger = 0;
  for (const id of ids) {
    const kok = kimlikNormalize(id);
    if (/^(m:|k:)/.test(kok)) cozulen.push(kok);
    else diger++;
  }
  if (cozulen.length === 0 && diger === 0) return "";
  const ek = diger > 0 ? ` [+${diger} ikincil mevzuat]` : "";
  return ` [${cozulen.join(", ")}]${ek}`;
}

/** Same filter as `dayanakMetni`, as a list: only ids the corpus can resolve. */
export function dayanakKimlikleri(ids: string[]): string[] {
  return [...new Set(ids.map(kimlikNormalize).filter((k) => /^(m:|k:)/.test(k)))];
}

/**
 * Machine-readable rule result. "belirsiz" (not enough input) becomes null, a
 * date result becomes its ISO date; the text channel keeps the Turkish form.
 */
export function sonucDegeri(s: KuralSonucu): string | number | boolean | null {
  if (s.sonuc === "belirsiz" || s.sonuc === null || s.sonuc === undefined) return null;
  if (typeof s.sonuc === "object") return "tarih" in s.sonuc ? String(s.sonuc.tarih) : null;
  return s.sonuc;
}

/** One compact line per rule. Missing inputs are surfaced, never guessed. */
export function kuralSatiri(s: KuralSonucu, kuralId: string): string {
  const durum = ONAY_ETIKET[s.onay_durumu] ?? "";
  if (s.sonuc === "belirsiz") {
    const eksik = s.eksik_girdiler.length ? ` eksik: ${s.eksik_girdiler.map(eksikEtiket).join(", ")}` : "";
    return `- ${kuralId}: belirsiz${eksik}`;
  }
  const deger =
    typeof s.sonuc === "object" && s.sonuc !== null && "tarih" in s.sonuc
      ? trTarih(String((s.sonuc as { tarih: string }).tarih))
      : String(s.sonuc);
  const dayanak = dayanakMetni(s.dayanak);
  return `- ${kuralId}: ${deger} — ${s.kisa}${dayanak}${durum}`;
}

/** " · üst: bozma" suffix for a BAM hit whose Yargıtay review is in the corpus; "" otherwise. */
export function ustEki(corpus: { ustInceleme?(id: string): { ust_sonuc: string | null } | null }, k: KararOzet): string {
  if (k.mahkeme !== "bam") return "";
  const u = corpus.ustInceleme?.(k.karar_id);
  return u?.ust_sonuc ? ` · üst: ${u.ust_sonuc}` : "";
}

export function kararSatiri(k: KararOzet, oncedenGonderildi = false, ek = ""): string {
  const kunye = `${k.daire || k.mahkeme}, ${trTarih(k.tarih)}`;
  if (oncedenGonderildi) return `- ${k.karar_id} (önceden gönderildi)`;
  const sonuc = k.sonuc ? `, ${k.sonuc}` : "";
  const kesin = k.kesinlesme === "kesin" ? ", kesin" : "";
  const l0 = k.l0 ? ` — ${k.l0}` : "";
  return `- ${k.karar_id} (${kunye}${sonuc}${kesin})${l0}${ek}`;
}

export function argumanSatiri(a: ArgumanSatiri): string {
  const bel = a.belirleyici ? `; belirleyici: ${a.belirleyici}` : "";
  return `- ${a.id} (${a.taraf}) kabul ${a.kabul} / ret ${a.ret}${bel}`;
}

/** Deterministic error line: code + one actionable next step. */
export interface HukukHatasi {
  kod: string;
  mesaj: string;
  sonraki_adim: string;
}

export function hataMetni(h: HukukHatasi): string {
  return `HATA ${h.kod} ${h.mesaj} | SONRAKI ADIM: ${h.sonraki_adim}`;
}

/** DAYANDIĞI MADDELER / ÜST İNCELEME / İNCELEDİĞİ lines of a decision, from the citation graph. */
export function kararBaglantiSatirlari(
  corpus: Pick<CorpusPort, "kararAtiflari" | "ustInceleme" | "altInceleme">,
  k: Pick<KararOzet, "karar_id" | "mahkeme">,
): string[] {
  const out: string[] = [];
  const maddeler = corpus.kararAtiflari?.(k.karar_id) ?? [];
  if (maddeler.length) out.push(`DAYANDIĞI MADDELER ${maddeler.slice(0, 6).join(" , ")}`);
  if (k.mahkeme === "bam") {
    const u = corpus.ustInceleme?.(k.karar_id);
    if (u) out.push(`ÜST İNCELEME Yargıtay ${u.ust_karar_id}: ${u.ust_sonuc ?? "sonuç bilinmiyor"} (bağlantılı karar; sonuç metinden sezgisel)`);
  } else if (k.mahkeme === "yargitay") {
    for (const a of corpus.altInceleme?.(k.karar_id) ?? []) {
      const no = [a.alt_esas && `${a.alt_esas} E.`, a.alt_karar && `${a.alt_karar} K.`].filter(Boolean).join(" ");
      out.push(`İNCELEDİĞİ ${a.alt_daire}${no ? ` ${no}` : ""}${a.alt_karar_id ? ` (${a.alt_karar_id})` : ""}`);
    }
  }
  return out;
}
