/**
 * @hukuk/ontology — the dispute trees for every legal field.
 *
 * The YAML files are the single source (consumer law + SGK social security).
 * This module loads, validates and flattens them, and is the only place that
 * knows the node-id contract (`t/<branch>/<leaf>` / `s/<branch>/<leaf>`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export interface Dugum {
  id: string;
  ust_id: string | null;
  ad: string;
  aciklama: string;
  tetikleyiciler: string[];
  ornek_sorgular: string[];
  kurallar: string[];
  maddeler: string[];
  /** 1 = branch, 2 = leaf, 0 = root */
  derinlik: number;
  yaprak: boolean;
}

interface RawLeaf {
  id: string;
  ad: string;
  aciklama?: string;
  tetikleyiciler?: string[];
  ornek_sorgular?: string[];
  /** A leaf's own list overrides the branch default. */
  maddeler?: string[];
  kurallar?: string[];
}

interface RawBranch {
  id: string;
  ad: string;
  aciklama?: string;
  maddeler?: string[];
  kurallar?: string[];
  yapraklar: RawLeaf[];
}

interface RawRoot {
  surum: number;
  ad: string;
  kok: string;
  durum: string;
  /** Optional hand-written root description; falls back to "<ad> kökü." */
  kok_aciklama?: string;
  dallar: RawBranch[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
// kept at the package root: packages/ontology/{tuketici,sgk}.yaml
export const YAML_PATHS: readonly string[] = [
  join(HERE, "..", "tuketici.yaml"),
  join(HERE, "..", "sgk.yaml"),
];
/** Backwards-compatible alias: the consumer-law tree. */
export const YAML_PATH = YAML_PATHS[0]!;

interface Yuklenen {
  dugumler: Dugum[];
  surum: number;
  kok: string;
  durum: string;
}

function load(): Yuklenen {
  const roots = YAML_PATHS.map((p) => parse(readFileSync(p, "utf8")) as RawRoot);
  const out: Dugum[] = [];

  for (const raw of roots) {
    out.push({
      id: raw.kok,
      ust_id: null,
      ad: raw.ad,
      aciklama: raw.kok_aciklama ?? `${raw.ad} kökü.`,
      tetikleyiciler: [],
      ornek_sorgular: [],
      kurallar: [],
      maddeler: [],
      derinlik: 0,
      yaprak: false,
    });

    for (const branch of raw.dallar) {
      out.push({
        id: branch.id,
        ust_id: raw.kok,
        ad: branch.ad,
        aciklama: branch.aciklama ?? "",
        tetikleyiciler: [],
        ornek_sorgular: [],
        kurallar: branch.kurallar ?? [],
        maddeler: branch.maddeler ?? [],
        derinlik: 1,
        yaprak: false,
      });
      for (const leaf of branch.yapraklar) {
        out.push({
          id: leaf.id,
          ust_id: branch.id,
          ad: leaf.ad,
          aciklama: leaf.aciklama ?? "",
          tetikleyiciler: leaf.tetikleyiciler ?? [],
          ornek_sorgular: leaf.ornek_sorgular ?? [],
          // own list wins; otherwise inherit the branch's defaults
          kurallar: leaf.kurallar ?? branch.kurallar ?? [],
          maddeler: leaf.maddeler ?? branch.maddeler ?? [],
          derinlik: 2,
          yaprak: true,
        });
      }
    }
  }
  // surum() stays a single number: the highest field version in the release.
  return {
    dugumler: out,
    surum: Math.max(...roots.map((r) => r.surum)),
    kok: roots[0]!.kok,
    durum: roots[0]!.durum,
  };
}

let cache: Yuklenen | null = null;

function veri(): Yuklenen {
  if (!cache) cache = load();
  return cache;
}

export function surum(): number {
  return veri().surum;
}

export function tumDugumler(): Dugum[] {
  return veri().dugumler;
}

/** Roots of every loaded field (1 node per YAML file). */
export function kokler(): Dugum[] {
  return veri().dugumler.filter((d) => d.ust_id === null);
}

export function yapraklar(): Dugum[] {
  return veri().dugumler.filter((d) => d.yaprak);
}

export function dallar(): Dugum[] {
  return veri().dugumler.filter((d) => d.derinlik === 1);
}

export function dugumBul(id: string): Dugum | null {
  return veri().dugumler.find((d) => d.id === id) ?? null;
}

/** Root -> ... -> node. Used to render breadcrumbs in a card header. */
export function ustZinciri(id: string): Dugum[] {
  const byId = new Map(veri().dugumler.map((d) => [d.id, d]));
  const out: Dugum[] = [];
  let cur = byId.get(id);
  while (cur) {
    out.unshift(cur);
    cur = cur.ust_id ? byId.get(cur.ust_id) : undefined;
  }
  return out;
}

export function cocuklar(id: string): Dugum[] {
  return veri().dugumler.filter((d) => d.ust_id === id);
}

/**
 * Text used to build the router vector and to embed a node. Deliberately
 * excludes the node id (slug tokens would leak the answer into the vector).
 */
export function dugumVektorMetni(d: Dugum): string {
  return [d.ad, d.aciklama, ...d.tetikleyiciler, ...d.ornek_sorgular].join(" ");
}

export interface DogrulamaHatasi {
  dugum: string;
  kural: string;
  mesaj: string;
}

/**
 * Structural validation. CI runs this; a broken ontology must never ship.
 * Checks: unique ids, resolvable parents, >=5 example phrasings per leaf,
 * a rule set per node, statute citations present, and example phrasings that are
 * globally unique (a duplicated example would make the golden set measure
 * itself).
 */
export function dogrula(): DogrulamaHatasi[] {
  const hatalar: DogrulamaHatasi[] = [];
  const ids = new Set<string>();
  const ornekSahibi = new Map<string, string>();
  const nodes = veri().dugumler;

  for (const d of nodes) {
    if (ids.has(d.id)) hatalar.push({ dugum: d.id, kural: "tekil-id", mesaj: "id birden fazla" });
    ids.add(d.id);
    if (!/^[ts]\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(d.id)) {
      hatalar.push({ dugum: d.id, kural: "id-bicimi", mesaj: "id t/<dal>[/<yaprak>] veya s/<dal>[/<yaprak>] olmalı" });
    }
    if (d.yaprak) {
      if (d.ornek_sorgular.length < 5) {
        hatalar.push({
          dugum: d.id,
          kural: "ornek-sorgu",
          mesaj: `en az 5 örnek gerekli, ${d.ornek_sorgular.length} var`,
        });
      }
      if (d.kurallar.length === 0) {
        hatalar.push({ dugum: d.id, kural: "kural-seti", mesaj: "kural listesi boş" });
      }
      if (d.maddeler.length === 0) {
        hatalar.push({ dugum: d.id, kural: "madde", mesaj: "madde listesi boş" });
      }
      for (const m of d.maddeler) {
        if (!/^m:\d+\/\d+[A-Za-z]?$/.test(m)) {
          hatalar.push({ dugum: d.id, kural: "madde-bicimi", mesaj: `geçersiz madde kimliği: ${m}` });
        }
      }
    }
    for (const o of d.ornek_sorgular) {
      const key = o.trim().toLocaleLowerCase("tr");
      const sahibi = ornekSahibi.get(key);
      if (sahibi) {
        hatalar.push({ dugum: d.id, kural: "ornek-tekil", mesaj: `örnek "${o}" ayrıca ${sahibi} düğümünde` });
      }
      ornekSahibi.set(key, d.id);
    }
    if (d.ust_id && !nodes.some((x) => x.id === d.ust_id)) {
      hatalar.push({ dugum: d.id, kural: "ust-id", mesaj: `üst düğüm yok: ${d.ust_id}` });
    }
  }
  return hatalar;
}


export {
  yaziliKartlar,
  kartlariDogrula,
  kartsizDugumler,
  KART_YOLU,
  KART_YOLLARI,
  type YaziliKart,
  type KartBolumu,
  type KartHatasi,
} from "./cards.ts";
