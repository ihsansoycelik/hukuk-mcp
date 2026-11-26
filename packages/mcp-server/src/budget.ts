/**
 * Token budget packer.
 *
 * The budget is a first-class parameter: every tool call carries `butce` and the
 * server guarantees the rendered answer stays under it. Sections are filled in
 * priority order; a section that does not fit is never silently dropped — it is
 * replaced by a one-line stub that names the `derinles` id able to fetch it.
 *
 * Counting uses the same tokenizer the calibration was measured with
 * (o200k_base via gpt-tokenizer), so quoted numbers are reproducible.
 */
import { encode } from "gpt-tokenizer";

const cache = new Map<string, number>();

export function tokenSay(metin: string): number {
  if (!metin) return 0;
  const hit = cache.get(metin);
  if (hit !== undefined) return hit;
  const n = encode(metin).length;
  // bound the cache; answers repeat a lot across a session
  if (cache.size > 5000) cache.clear();
  cache.set(metin, n);
  return n;
}

export interface Bolum {
  /** label rendered as a heading, e.g. "ÖZET" */
  etiket: string;
  /** full content, already citation-tagged */
  metin: string;
  /** lower number = more important */
  oncelik: number;
  /** single-line replacement when the full section does not fit */
  kisaltma?: string;
}

export interface PaketSonucu {
  metin: string;
  token: number;
  /** sections that were reduced to a stub */
  kirpilan: string[];
  /** sections that did not fit even as a stub */
  dusen: string[];
}

/**
 * Greedy fill by priority. Two passes: all full sections first, then stubs for
 * the remainder, so a low-priority full section never crowds out a top-priority
 * stub. `rezerve` keeps room for the footer/disclaimer.
 */
export function paketle(
  baslik: string,
  bolumler: Bolum[],
  butce: number,
  rezerve = 0,
): PaketSonucu {
  const sirali = [...bolumler].filter((b) => b.metin.trim().length > 0).sort((a, b) => a.oncelik - b.oncelik);
  const parcalar: string[] = [];
  const kirpilan: string[] = [];
  const dusen: string[] = [];

  let kalan = butce - rezerve - tokenSay(baslik) - 1;
  if (kalan < 0) kalan = 0;

  const dolu: Bolum[] = [];
  for (const b of sirali) {
    const blok = `${b.etiket}\n${b.metin}`;
    const maliyet = tokenSay(blok) + 1;
    if (maliyet <= kalan) {
      dolu.push(b);
      parcalar.push(blok);
      kalan -= maliyet;
    }
  }

  const kirpilanSet = new Set(dolu.map((b) => b.etiket));
  for (const b of sirali) {
    if (kirpilanSet.has(b.etiket)) continue;
    if (!b.kisaltma) {
      dusen.push(b.etiket);
      continue;
    }
    const blok = `${b.etiket}: ${b.kisaltma}`;
    const maliyet = tokenSay(blok) + 1;
    if (maliyet <= kalan) {
      parcalar.push(blok);
      kirpilan.push(b.etiket);
      kalan -= maliyet;
    } else {
      dusen.push(b.etiket);
    }
  }

  const metin = [baslik, ...parcalar].filter(Boolean).join("\n");
  return { metin, token: tokenSay(metin), kirpilan, dusen };
}

/**
 * Last-resort fit. Drops trailing lines first, but when the remaining line is
 * itself longer than the budget it truncates INSIDE that line instead of
 * deleting it — otherwise a single long statute paragraph would silently
 * disappear and the caller would get only a heading.
 */
export function butceyeSikistir(metin: string, butce: number): string {
  if (tokenSay(metin) <= butce) return metin;
  const satirlar = metin.split("\n");

  // Keep at least the heading + one content line; a longer line is truncated
  // below rather than deleted.
  while (satirlar.length > 2 && tokenSay(satirlar.join("\n")) > butce) satirlar.pop();
  let out = satirlar.join("\n");
  if (tokenSay(out) <= butce) return out;

  // single over-long line: binary search the longest prefix that fits
  let lo = 0;
  let hi = out.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (tokenSay(out.slice(0, mid) + "…") <= butce) lo = mid;
    else hi = mid - 1;
  }
  out = out.slice(0, lo).trimEnd();
  // do not end mid-word if a space is close by
  const sonBosluk = out.lastIndexOf(" ");
  if (sonBosluk > out.length - 30) out = out.slice(0, sonBosluk);
  return out + "…";
}
