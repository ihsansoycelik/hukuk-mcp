/**
 * Authored cards — the lay-language layer.
 *
 * Cards are written by hand (not generated) because the citizen-facing wording is
 * the product. The build verifies that every citation resolves and that no card
 * claims approval it does not have.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { dugumBul } from "./index.ts";

export interface KartBolumu {
  etiket: string;
  metin: string;
  oncelik: number;
}

export interface YaziliKart {
  dugum_id: string;
  durum: "taslak" | "otomatik" | "uzman_onayli";
  surum: number;
  bolumler: KartBolumu[];
  onaylayan?: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
export const KART_YOLLARI: readonly string[] = [
  join(HERE, "..", "cards", "tuketici-kartlar.yaml"),
  join(HERE, "..", "cards", "sgk-kartlar.yaml"),
];
/** Backwards-compatible alias: the consumer-law card file. */
export const KART_YOLU = KART_YOLLARI[0]!;

/** Section render order when the build materialises a card. */
const ONCELIK: Record<string, number> = { ÖZET: 10, HAKLAR: 30, YOL: 40, DİKKAT: 80 };

interface HamKart {
  dugum_id: string;
  durum: "taslak" | "otomatik" | "uzman_onayli";
  surum?: number;
  onaylayan?: string;
  bolumler: { etiket: string; metin: string }[];
}

interface HamDosya {
  surum: number;
  kartlar: HamKart[];
}

let cache: YaziliKart[] | null = null;

export function yaziliKartlar(): YaziliKart[] {
  if (cache) return cache;
  const dosyalar = KART_YOLLARI.map((p) => parse(readFileSync(p, "utf8")) as HamDosya);
  cache = dosyalar.flatMap((raw) =>
    raw.kartlar.map((k) => ({
      dugum_id: k.dugum_id,
      durum: k.durum,
      surum: k.surum ?? 1,
      onaylayan: k.onaylayan,
      bolumler: k.bolumler.map((b) => ({ etiket: b.etiket, metin: b.metin, oncelik: ONCELIK[b.etiket] ?? 90 })),
    })),
  );
  return cache;
}

const CITATION = /\[([a-z]:[^\]\s]+)\]/g;

export interface KartHatasi {
  dugum: string;
  kural: string;
  mesaj: string;
}

/**
 * Card integrity:
 *  - the node exists and is a leaf
 *  - required sections present, labels unique
 *  - every [id] citation is a well-formed, resolvable-looking id
 *  - each section carries at least one citation (no unsourced legal claim)
 *  - "uzman_onayli" requires an approver name
 */
export function kartlariDogrula(bilinenMevzuat: Set<string> = new Set(["6502", "6098", "6100", "6325", "3095", "2709", "5510", "4447"])): KartHatasi[] {
  const hatalar: KartHatasi[] = [];
  const gorulen = new Set<string>();
  for (const k of yaziliKartlar()) {
    const d = dugumBul(k.dugum_id);
    if (!d) {
      hatalar.push({ dugum: k.dugum_id, kural: "dugum-yok", mesaj: "kart bilinmeyen düğüme bağlı" });
      continue;
    }
    if (!d.yaprak) hatalar.push({ dugum: k.dugum_id, kural: "yaprak-degil", mesaj: "kart yalnızca yaprak düğüme bağlanır" });
    if (gorulen.has(k.dugum_id)) hatalar.push({ dugum: k.dugum_id, kural: "tekil-kart", mesaj: "aynı düğüm için iki kart" });
    gorulen.add(k.dugum_id);

    const etiketler = new Set<string>();
    for (const b of k.bolumler) {
      if (etiketler.has(b.etiket)) hatalar.push({ dugum: k.dugum_id, kural: "tekil-bolum", mesaj: `bölüm iki kez: ${b.etiket}` });
      etiketler.add(b.etiket);

      const idler = [...b.metin.matchAll(CITATION)].map((m) => m[1]!);
      if (idler.length === 0) {
        hatalar.push({ dugum: k.dugum_id, kural: "kaynaksiz-bolum", mesaj: `${b.etiket} bölümünde hiç kaynak kimliği yok` });
      }
      for (const id of idler) {
        const madde = /^m:(\d+)\/(\d+[A-Za-z]?)$/.exec(id);
        if (madde) {
          if (!bilinenMevzuat.has(madde[1]!)) {
            hatalar.push({ dugum: k.dugum_id, kural: "bilinmeyen-mevzuat", mesaj: `mevzuat dışı kimlik: ${id}` });
          }
          continue;
        }
        if (/^k:[a-z0-9-]+$/.test(id)) continue;
        hatalar.push({ dugum: k.dugum_id, kural: "kimlik-bicimi", mesaj: `bozuk kimlik: ${id}` });
      }
    }
    for (const zorunlu of ["ÖZET", "HAKLAR", "YOL"]) {
      if (!etiketler.has(zorunlu)) hatalar.push({ dugum: k.dugum_id, kural: "zorunlu-bolum", mesaj: `eksik bölüm: ${zorunlu}` });
    }
    if (k.durum === "uzman_onayli" && !k.onaylayan) {
      hatalar.push({ dugum: k.dugum_id, kural: "onaysiz", mesaj: "uzman_onayli kartta onaylayan zorunlu" });
    }
  }
  return hatalar;
}

/** Node ids that still need an authored card; the build fills them with a template. */
export function kartsizDugumler(tumYapraklar: { id: string }[]): string[] {
  const varOlan = new Set(yaziliKartlar().map((k) => k.dugum_id));
  return tumYapraklar.filter((y) => !varOlan.has(y.id)).map((y) => y.id);
}
