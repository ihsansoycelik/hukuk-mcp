/**
 * @hukuk/retrieval — Corpus: the read API over the compiled SQLite corpus.
 *
 * Design constraints (see NOTES.md for measurements):
 *  - node:sqlite only, no ORM, no native addons.
 *  - all Turkish text handling comes from @hukuk/tr-text.
 *  - hard filters run in SQL BEFORE scoring, so a filtered-out decision never
 *    consumes a result slot.
 *  - a bozma (overturned) decision is never representative: it is returned
 *    only with temsilci_uygun=false. Weak OR-only fallback hits are flagged the
 *    same way, and a score/coverage floor turns "nothing good" into no result.
 *  - scoring: 0.5*minmax(-bm25) + 0.5*lexical coverage, multiplied by a
 *    bindingness factor and a recency factor. All knobs live in config.ts.
 */
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { analyze, trLower } from "@hukuk/tr-text";
import type { AraInput, DugumKaydi, Kart } from "@hukuk/schema";
import type { DugumAday, DugumSatiri, MaddeKaydi, SearchHit, YonlendirmeSonucu } from "./types.ts";
import { ARAMA_AYARLARI, ARAMA_ESIKLERI } from "./config.ts";
import { ftsSorgulari, guvenliFtsToken } from "./fts.ts";
import { DugumYonlendirici, alanOneki } from "./router.ts";

export const VARSAYILAN_DB = "data/build/hukuk.db";

/** AraInput plus the defaulted fields; callers may omit butce/limit. */
export type AraSorgusu = Omit<AraInput, "butce" | "limit"> & { butce?: number; limit?: number };

interface AdaySatiri {
  id: string;
  mahkeme: string;
  daire: string | null;
  tarih: string;
  kesinlesme: string;
  agirlik: number;
  ozet_l0: string | null;
  ozet_l1: string | null;
  sonuc: string | null;
  dugum_id: string | null;
  kok: string;
  bm: number;
}

interface KararSatiri extends AdaySatiri {
  kaynak_url: string;
}

function metin(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function sayi(v: unknown, varsayilan = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : varsayilan;
}

function clamp(x: number, alt: number, ust: number): number {
  return x < alt ? alt : x > ust ? ust : x;
}

function yuvarla(x: number): number {
  return Math.round(x * 1_000_000) / 1_000_000;
}

function jsonDizi(v: unknown): string[] {
  if (typeof v !== "string" || !v) return [];
  try {
    const a: unknown = JSON.parse(v);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export class Corpus {
  readonly dbPath: string;
  private db: DatabaseSync;
  private stmtCache = new Map<string, StatementSync>();
  private lexCache = new Map<string, Set<string>>();
  private lexCacheLimiti = 20_000;
  private yonlendirici: DugumYonlendirici | null = null;
  private dfStmt: StatementSync | null = null;
  private dfCache = new Map<string, number>();

  constructor(dbPath?: string) {
    const secilen = dbPath ?? process.env["HUKUK_DB"] ?? VARSAYILAN_DB;
    this.dbPath = resolve(secilen);
    if (!existsSync(this.dbPath)) {
      throw new Error(
        `Hukuk veritabanı bulunamadı: ${this.dbPath}\n` +
          `Önce veri derlemesini çalıştırın (data/build/hukuk.db) veya HUKUK_DB ile yolu belirtin.`,
      );
    }
    this.db = new DatabaseSync(this.dbPath);
    // Keep hot corpus pages in memory; FTS ranking touches many rows per query.
    this.db.exec("PRAGMA cache_size = -65536;");
    try {
      this.db.exec("PRAGMA mmap_size = 268435456;");
    } catch {
      /* mmap is optional */
    }
    // Vocabulary access lets search pick rare query terms for subset probes
    // instead of running an expensive OR over common words. Temp table only;
    // no write touches the corpus.
    try {
      this.db.exec(
        "CREATE VIRTUAL TABLE IF NOT EXISTS temp.fts_kok USING fts5vocab('main','karar_fts','row')",
      );
      this.dfStmt = this.db.prepare("SELECT doc FROM temp.fts_kok WHERE term = ?");
    } catch {
      this.dfStmt = null; // older SQLite without fts5vocab: plain OR fallback still works
    }
    // The query path never writes. Fail loudly instead of silently corrupting.
    this.db.exec("PRAGMA query_only = ON;");
    const varMi = this.db
      .prepare("SELECT 1 AS v FROM sqlite_master WHERE name = 'karar' LIMIT 1")
      .get();
    if (!varMi) {
      throw new Error(`Hukuk DB şeması eksik (karar tablosu yok): ${this.dbPath}`);
    }
  }

  private stmt(sql: string): StatementSync {
    let s = this.stmtCache.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.stmtCache.set(sql, s);
    }
    return s;
  }

  /* ------------------------------- search -------------------------------- */

  ara(input: AraSorgusu): SearchHit[] {
    const limit = clamp(Math.trunc(input.limit ?? ARAMA_AYARLARI.varsayilanLimit), 1, 10);
    const sorgular = ftsSorgulari(input.sorgu);
    if (!sorgular.and) return [];

    let gevsekTuru: "altkume" | "or" | null = null;
    let satirlar = this.adaylar(sorgular.and, input);

    if (satirlar.length === 0 && ARAMA_AYARLARI.yedekOr) {
      // Strict AND fails on almost every real phrasing because morphology
      // differs between the query and the indexed keys. Probe AND subsets of
      // the rarest tokens and UNION them: one subset often describes a sibling
      // node (e.g. ayipli-mal/konut vs on-odemeli-konut), so the first hit is
      // not enough. Broad probes stand alone; narrow ones keep probing.
      const birlesim = new Map<string, AdaySatiri>();
      let deneme = 0;
      for (const yedek of this.yedekSorgular(sorgular.tokens)) {
        if (yedek === sorgular.and) continue;
        const r = this.adaylar(yedek, input);
        deneme++;
        for (const satir of r) {
          const onceki = birlesim.get(satir.id);
          if (!onceki) birlesim.set(satir.id, satir);
          else if (satir.bm < onceki.bm) onceki.bm = satir.bm;
        }
        if (r.length >= ARAMA_AYARLARI.genisSonda) break;
        if (deneme >= ARAMA_AYARLARI.enAzYedekSorgu && birlesim.size >= ARAMA_AYARLARI.altKumeHedefi) break;
      }
      if (birlesim.size > 0) {
        satirlar = [...birlesim.values()];
        gevsekTuru = "altkume";
      }
    }

    if (satirlar.length === 0) return [];

    let hits = this.puanla(satirlar, input, gevsekTuru);
    // Subset probes use exact FTS tokens, so a stem mismatch ("kart" vs
    // "karti") can hide every relevant document. Only when nothing survived
    // the coverage/score floor do we pay for the OR-everything rescue.
    if (hits.length === 0 && sorgular.or && ARAMA_AYARLARI.yedekOr) {
      const orSatirlar = this.adaylar(sorgular.or, input);
      if (orSatirlar.length > 0) {
        gevsekTuru = "or";
        hits = this.puanla(orSatirlar, input, gevsekTuru);
      }
    }
    return hits.slice(0, limit);
  }

  private puanla(satirlar: AdaySatiri[], input: AraSorgusu, gevsekTuru: "altkume" | "or" | null): SearchHit[] {
    const qTokenleri = new Set(analyze(input.sorgu).tokens);
    // Soft ontology agreement: if the router confidently places the question in
    // a leaf/branch, decisions already tagged there rank above lookalikes.
    const yon = this.dugumAraDetay(input.sorgu, input.alan, 1);
    const hedefDugum = yon.adaylar[0]?.id ?? null;
    const hedefDal = hedefDugum ? hedefDugum.split("/").slice(0, 2).join("/") : null;
    const bmDegerleri = satirlar.map((s) => -sayi(s.bm));
    let min = Infinity;
    let max = -Infinity;
    for (const v of bmDegerleri) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const aralik = max - min;
    const taban = ARAMA_AYARLARI.bm25Taban;
    // Lower bm25 = better in SQLite; invert first, then min-max (with a floor
    // so the weakest candidate does not lose all BM25 credit).
    const normBm = (v: number) => (aralik > 1e-9 ? taban + (1 - taban) * ((v - min) / aralik) : 0.5);

    const simdikiYil = new Date().getFullYear();
    const hits: SearchHit[] = [];
    for (let i = 0; i < satirlar.length; i++) {
      const s = satirlar[i]!;
      const lex = this.kapsam(s.kok, s.ozet_l0, s.ozet_l1, qTokenleri);
      // Hard relevance floor: a weak lexical match is not worth a citizen's
      // attention. Empty is better than confidently wrong.
      if (lex < ARAMA_ESIKLERI.minLexKapsam) continue;

      const bm = normBm(bmDegerleri[i]!);
      const temel = ARAMA_AYARLARI.bm25Agirlik * bm + ARAMA_AYARLARI.lexAgirlik * lex;

      const agirlik = clamp(sayi(s.agirlik, 50), 0, 100);
      const yas = Math.max(0, simdikiYil - Number(s.tarih.slice(0, 4)));
      const tazelik = clamp(1 - yas / ARAMA_AYARLARI.tazelikPencereYil, 0, 1);
      const gevsekCarpan =
        gevsekTuru === "or"
          ? ARAMA_AYARLARI.orCarpan
          : gevsekTuru === "altkume"
            ? ARAMA_AYARLARI.gevsekCarpan
            : 1;
      const temsilci =
        !ARAMA_AYARLARI.temsilciOlmayanSonuclar.includes(s.sonuc ?? "") && gevsekTuru !== "or";
      const sonucCarpan = ARAMA_AYARLARI.sonucCarpanlari[s.sonuc ?? ""] ?? 1;
      let dugumCarpan = 1;
      if (hedefDugum && s.dugum_id) {
        if (s.dugum_id === hedefDugum) dugumCarpan = ARAMA_AYARLARI.dugumUyumCarpani;
        else if (hedefDal && s.dugum_id.startsWith(hedefDal + "/")) dugumCarpan = ARAMA_AYARLARI.dalUyumCarpani;
      }
      const skor = yuvarla(
        temel *
          gevsekCarpan *
          sonucCarpan *
          dugumCarpan *
          (1 + ARAMA_AYARLARI.baglilikEtkisi * (agirlik / 100)) *
          (1 + ARAMA_AYARLARI.tazelikEtkisi * tazelik),
      );
      if (skor < ARAMA_ESIKLERI.minSkor) continue;

      const hit: SearchHit = {
        karar_id: s.id,
        skor,
        l0: s.ozet_l0 ?? "",
        l1: s.ozet_l1 ?? "",
        tarih: s.tarih,
        daire: s.daire ?? "",
        mahkeme: s.mahkeme,
        sonuc: s.sonuc,
        kesinlesme: s.kesinlesme,
        agirlik,
        temsilci_uygun: temsilci,
      };
      if (gevsekTuru !== null) {
        hit.gevsek = true;
        hit.gevsekTuru = gevsekTuru;
      }
      hits.push(hit);
    }

    hits.sort((a, b) => {
      if (b.skor !== a.skor) return b.skor - a.skor;
      if (a.tarih !== b.tarih) return a.tarih < b.tarih ? 1 : -1;
      return a.karar_id < b.karar_id ? -1 : 1;
    });
    return hits;
  }

  private adaylar(match: string, input: AraSorgusu): AdaySatiri[] {
    const kosullar: string[] = [];
    const parametreler: Array<string | number> = [match];

    // Hard filters run BEFORE scoring.
    if (input.mahkeme && input.mahkeme.length > 0) {
      const degerler = input.mahkeme.map((m) => trLower(m.trim())).filter(Boolean);
      if (degerler.length) {
        kosullar.push(`k.mahkeme IN (${degerler.map(() => "?").join(", ")})`);
        parametreler.push(...degerler);
      }
    }
    if (input.yil) {
      const [alt, ust] = input.yil;
      kosullar.push("CAST(substr(k.tarih, 1, 4) AS INTEGER) BETWEEN ? AND ?");
      parametreler.push(Math.trunc(alt), Math.trunc(ust));
    }
    if (input.sonuc && input.sonuc.length > 0) {
      const degerler = input.sonuc.map((x) => trLower(x.trim())).filter(Boolean);
      if (degerler.length) {
        kosullar.push(`k.sonuc IN (${degerler.map(() => "?").join(", ")})`);
        parametreler.push(...degerler);
      }
    }
    if (input.alan && input.alan.trim()) {
      const prefix = alanOneki(input.alan)!;
      const taban = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
      kosullar.push(`(k.dugum_id = ? OR k.dugum_id LIKE ? ESCAPE '\\')`);
      parametreler.push(taban, prefix + "%");
    }

    if (kosullar.length === 0) {
      return this.adaylarHizli(match, ARAMA_AYARLARI.adayLimiti);
    }

    const sql =
      `SELECT k.id, k.mahkeme, k.daire, k.tarih, k.kesinlesme, k.agirlik, ` +
      `k.ozet_l0, k.ozet_l1, k.sonuc, k.dugum_id, karar_fts.kok AS kok, bm25(karar_fts) AS bm ` +
      `FROM karar_fts JOIN karar k ON k.id = karar_fts.karar_id ` +
      `WHERE karar_fts MATCH ? AND ${kosullar.join(" AND ")}` +
      ` ORDER BY rank ASC LIMIT ?`;
    parametreler.push(ARAMA_AYARLARI.adayLimiti);

    const rows = this.stmt(sql).all(...parametreler) as unknown as AdaySatiri[];
    return rows.map((r) => ({ ...r, bm: sayi(r.bm), kok: metin(r.kok) }));
  }

  private adaylarHizli(match: string, limit: number): AdaySatiri[] {
    const secilen = this.stmt(
      "SELECT karar_id, rank AS bm, kok FROM karar_fts WHERE karar_fts MATCH ? ORDER BY rank ASC LIMIT ?",
    ).all(match, limit);
    if (secilen.length === 0) return [];
    const idler = secilen.map((r) => metin(r["karar_id"]));
    const bmById = new Map<string, number>();
    const kokById = new Map<string, string>();
    for (const r of secilen) {
      const id = metin(r["karar_id"]);
      bmById.set(id, sayi(r["bm"]));
      kokById.set(id, metin(r["kok"]));
    }
    const yer = idler.map(() => "?").join(", ");
    const sql =
      `SELECT id, mahkeme, daire, tarih, kesinlesme, agirlik, ozet_l0, ozet_l1, sonuc, dugum_id ` +
      `FROM karar WHERE id IN (${yer})`;
    const satirlar = this.stmt(sql).all(...idler) as unknown as Array<Omit<AdaySatiri, "bm" | "kok">>;
    const byId = new Map(satirlar.map((s) => [s.id, s]));
    const out: AdaySatiri[] = [];
    for (const id of idler) {
      const s = byId.get(id);
      if (s) out.push({ ...s, bm: bmById.get(id) ?? 0, kok: kokById.get(id) ?? "" });
    }
    return out;
  }

  /**
   * Query-token coverage measured on the indexed full-text key (already folded
   * and stemmed by @hukuk/tr-text). Summaries in ozet_l0/l1 can be truncated
   * tails on the real corpus, so they are only a fallback.
   */
  private kapsam(kok: string, l0: string | null, l1: string | null, qTokenleri: Set<string>): number {
    if (qTokenleri.size === 0) return 0;
    if (kok) {
      // Tokens come from the same tr-text stemmer as the index, but the two
      // sides can still disagree by 1-2 letters ("kurs" vs "kur"). Exact match
      // first; then a guarded prefix match with the same first two letters.
      const parcalar = kok.split(" ").filter(Boolean);
      const kume = new Set(parcalar);
      let eslesen = 0;
      for (const t of qTokenleri) {
        if (kume.has(t)) {
          eslesen++;
          continue;
        }
        const onEk = t.slice(0, 2);
        for (const p of parcalar) {
          if (p.length < 3 || Math.abs(p.length - t.length) > 2 || p.slice(0, 2) !== onEk) continue;
          if (p.startsWith(t) || t.startsWith(p)) {
            eslesen++;
            break;
          }
        }
      }
      return eslesen / qTokenleri.size;
    }
    let tokenler = this.lexCache.get(kok);
    if (!tokenler) {
      tokenler = new Set(analyze([l0 ?? "", l1 ?? ""].join(" ")).tokens);
      this.lexCache.set(kok, tokenler);
      if (this.lexCache.size > this.lexCacheLimiti) {
        for (const k of this.lexCache.keys()) {
          this.lexCache.delete(k);
          if (this.lexCache.size <= this.lexCacheLimiti * 0.9) break;
        }
      }
    }
    if (tokenler.size === 0) return 0;
    let eslesen = 0;
    for (const t of qTokenleri) if (tokenler.has(t)) eslesen++;
    return eslesen / qTokenleri.size;
  }

  private tokenDf(token: string): number {
    const cacheli = this.dfCache.get(token);
    if (cacheli !== undefined) return cacheli;
    let df = 0;
    if (this.dfStmt) {
      const r = this.dfStmt.get(token);
      df = r ? sayi(r["doc"]) : 0;
    }
    if (this.dfCache.size > 20_000) this.dfCache.clear();
    this.dfCache.set(token, df);
    return df;
  }

  /**
   * Relaxed MATCH expressions in decreasing precision: all known tokens, then
   * the five rarest, then 3- and 2-token subsets. Unknown tokens (no index
   * presence) are dropped rather than killing the whole query.
   */
  private yedekSorgular(tokens: string[]): string[] {
    const bilinen = [...new Set(tokens)]
      .filter((t) => this.tokenDf(t) > 0)
      .sort((a, b) => this.tokenDf(a) - this.tokenDf(b) || b.length - a.length);
    if (bilinen.length === 0) return [];

    const out: string[] = [];
    const ekle = (parcalar: string[]) => {
      if (parcalar.length === 0) return;
      out.push(parcalar.map(guvenliFtsToken).join(" AND "));
    };
    ekle(bilinen);
    const nadir = bilinen.slice(0, ARAMA_AYARLARI.nadirTokenLimiti);
    if (nadir.length < bilinen.length) ekle(nadir);
    for (const boyut of ARAMA_AYARLARI.altKumeBoyutlari) {
      if (boyut > nadir.length) continue;
      for (const kombinasyon of kombinasyonlar(nadir, boyut)) ekle(kombinasyon);
      if (out.length >= ARAMA_AYARLARI.enFazlaYedekSorgu) break;
    }
    return [...new Set(out)].slice(0, ARAMA_AYARLARI.enFazlaYedekSorgu);
  }

  /* ------------------------------ records -------------------------------- */

  maddeGetir(id: string): MaddeKaydi | null {
    const adaylar = /^\d+\/\d+[A-Za-z]?$/.test(id) ? [id, `m:${id}`] : [id];
    const sql =
      "SELECT id, mevzuat_id, madde_no, baslik, metin, kaynak_url, degisiklik FROM madde WHERE id = ?";
    for (const anahtar of adaylar) {
      const r = this.stmt(sql).get(anahtar);
      if (r) {
        return {
          id: metin(r["id"]),
          mevzuat_id: metin(r["mevzuat_id"]),
          madde_no: metin(r["madde_no"]),
          baslik: r["baslik"] == null ? null : metin(r["baslik"]),
          metin: metin(r["metin"]),
          kaynak_url: metin(r["kaynak_url"]),
          degisiklik: r["degisiklik"] == null ? null : metin(r["degisiklik"]),
        };
      }
    }
    return null;
  }

  kararGetir(id: string): (SearchHit & { kaynak_url: string }) | null {
    const sql =
      "SELECT id, mahkeme, daire, tarih, kesinlesme, agirlik, ozet_l0, ozet_l1, sonuc, kaynak_url " +
      "FROM karar WHERE id = ?";
    const r = this.stmt(sql).get(id);
    if (!r) return null;
    return {
      karar_id: metin(r["id"]),
      skor: 1,
      l0: metin(r["ozet_l0"]),
      l1: metin(r["ozet_l1"]),
      tarih: metin(r["tarih"]),
      daire: metin(r["daire"]),
      mahkeme: metin(r["mahkeme"]),
      sonuc: r["sonuc"] == null ? null : metin(r["sonuc"]),
      kesinlesme: metin(r["kesinlesme"]),
      agirlik: sayi(r["agirlik"], 50),
      temsilci_uygun: !ARAMA_AYARLARI.temsilciOlmayanSonuclar.includes(metin(r["sonuc"])),
      kaynak_url: metin(r["kaynak_url"]),
    };
  }

  dugumGetir(id: string): DugumKaydi | null {
    const sql =
      "SELECT id, ust_id, ad, aciklama, tetikleyiciler, ornek_sorgular, kurallar, maddeler, vektor " +
      "FROM dugum WHERE id = ?";
    const r = this.stmt(sql).get(id);
    return r ? dugumKaydi(r) : null;
  }

  kartGetir(dugumId: string): Kart | null {
    const r = this.stmt("SELECT icerik FROM kart WHERE dugum_id = ?").get(dugumId);
    if (!r) return null;
    const metinIcerik = metin(r["icerik"]);
    try {
      const kart = JSON.parse(metinIcerik) as Kart;
      if (!kart || !Array.isArray(kart.bolumler)) {
        throw new Error("bolumler dizisi yok");
      }
      return kart;
    } catch (e) {
      throw new Error(`Kart içeriği bozuk (${dugumId}): ${(e as Error).message}`);
    }
  }

  cocukDugumler(id: string): DugumKaydi[] {
    const d = this.stmt(
      "SELECT id, ust_id, ad, aciklama, tetikleyiciler, ornek_sorgular, kurallar, maddeler, vektor " +
        "FROM dugum WHERE ust_id = ? ORDER BY COALESCE(sira, 2147483647), ad, id",
    ).all(id);
    return d.map(dugumKaydi);
  }

  meta(k: string): string | null {
    const r = this.stmt("SELECT v FROM meta WHERE k = ?").get(k);
    return r ? metin(r["v"]) : null;
  }

  /* ------------------------------ routing -------------------------------- */

  dugumAra(metinGirdi: string, alan?: string, limit?: number): DugumAday[] {
    return this.yonlendiriciGetir().ara(metinGirdi, alan, limit);
  }

  /**
   * Same ranking as dugumAra plus the ambiguity verdict. The server uses this
   * for its disambiguation protocol; dugumAra stays the plain list API.
   */
  dugumAraDetay(metinGirdi: string, alan?: string, limit?: number): YonlendirmeSonucu {
    return this.yonlendiriciGetir().detay(metinGirdi, alan, limit);
  }

  private yonlendiriciGetir(): DugumYonlendirici {
    if (!this.yonlendirici) {
      const rows = this.stmt(
        "SELECT id, ust_id, ad, aciklama, tetikleyiciler, ornek_sorgular, kurallar, maddeler, vektor FROM dugum",
      ).all();
      const dugumler: DugumSatiri[] = rows.map((r) => ({
        ...dugumKaydi(r),
        vektor: r["vektor"] == null ? null : metin(r["vektor"]),
      }));
      this.yonlendirici = new DugumYonlendirici(dugumler);
    }
    return this.yonlendirici;
  }

  close(): void {
    this.stmtCache.clear();
    this.lexCache.clear();
    this.db.close();
  }
}

/** All k-element combinations, preserving input order (rarest token first). */
function kombinasyonlar<T>(dizi: T[], k: number): T[][] {
  const out: T[][] = [];
  if (k <= 0 || k > dizi.length) return out;
  const gez = (baslangic: number, mevcut: T[]): void => {
    if (mevcut.length === k) {
      out.push([...mevcut]);
      return;
    }
    for (let i = baslangic; i < dizi.length; i++) {
      mevcut.push(dizi[i]!);
      gez(i + 1, mevcut);
      mevcut.pop();
    }
  };
  gez(0, []);
  return out;
}

function dugumKaydi(r: Record<string, unknown>): DugumKaydi {
  return {
    id: metin(r["id"]),
    ust_id: r["ust_id"] == null ? null : metin(r["ust_id"]),
    ad: metin(r["ad"]),
    aciklama: metin(r["aciklama"]),
    tetikleyiciler: jsonDizi(r["tetikleyiciler"]),
    ornek_sorgular: jsonDizi(r["ornek_sorgular"]),
    kurallar: jsonDizi(r["kurallar"]),
    maddeler: jsonDizi(r["maddeler"]),
  };
}
