/**
 * @hukuk/schema — the single source of truth for the MCP tool surface.
 *
 * Every tool parameter lives here. Tool descriptions are kept to one sentence
 * because they are paid for on every single model turn; parameter semantics
 * belong in the field descriptions, not in prose.
 */
import { z } from "zod";

/* ----------------------------- ontology ----------------------------- */

export const TalepTuru = z.enum([
  "iade",
  "degisim",
  "onarim",
  "indirim",
  "tazminat",
  "iptal",
  "bilgi",
]);

export const KullaniciRolu = z.enum(["tuketici", "satici", "diger"]);

export const KarsiTaraf = z.enum(["bireysel", "sirket", "banka", "kamu", "platform"]);

/* ------------------------------ tools ------------------------------- */

export const HukukSorInput = z.object({
  ozet: z.string().max(400).describe("Olay özeti"),
  talep: TalepTuru.optional().describe("İstenen sonuç"),
  olay_tarihi: z.string().optional().describe("Teslim/olay tarihi (YYYY-AA-GG)"),
  bugun: z.string().optional().describe("Hesap günü (YYYY-AA-GG)"),
  tutar_tl: z.number().nonnegative().optional().describe("Uyuşmazlık tutarı TL"),
  prim_gun_sayisi: z.number().int().nonnegative().optional().describe("SGK son bir yıldaki prim gün sayısı"),
  kullanici_rolu: KullaniciRolu.optional(),
  karsi_taraf: KarsiTaraf.optional(),
  urun_hizmet: z.string().optional().describe("Ürün/hizmet"),
  butce: z.number().int().min(300).max(4000).default(1500).describe("Token bütçesi"),
});
export type HukukSorInput = z.infer<typeof HukukSorInput>;

export const DerinlesInput = z.object({
  id: z.string().describe("k: karar, m: madde, t/ veya s/ düğüm, a: argüman"),
  seviye: z.enum(["L0", "L1", "L2", "L3"]).default("L1"),

  butce: z.number().int().min(200).max(4000).default(900),
});
export type DerinlesInput = z.infer<typeof DerinlesInput>;

export const AraInput = z.object({
  sorgu: z.string(),
  alan: z.string().optional().describe("Ontoloji dalı"),
  mahkeme: z.array(z.string()).max(4).optional(),
  yil: z.tuple([z.number().int(), z.number().int()]).optional(),
  sonuc: z.array(z.string()).max(4).optional(),
  limit: z.number().int().min(1).max(10).default(5),
  butce: z.number().int().min(200).max(3000).default(800),
});
export type AraInput = z.infer<typeof AraInput>;

export const HesaplaInput = z.object({
  kural: z.string().describe("Kural kimliği"),
  girdiler: z.record(z.string(), z.unknown()).describe("Kurala özgü girdiler"),
});
export type HesaplaInput = z.infer<typeof HesaplaInput>;

export const DogrulaInput = z.object({
  kunye: z.string().optional().describe("Künye metni"),
  metin: z.string().max(20000).optional().describe("Atıf içeren serbest metin (ör. taslak yanıt). Tüm kanun maddesi ve karar atıflarını tek tek denetler."),
  id: z.string().optional().describe("Kararlı kimlik"),
});
export type DogrulaInput = z.infer<typeof DogrulaInput>;

/* --------------------------- rule output ---------------------------- */

export interface KuralSonucu {
  sonuc: string | number | boolean | { tarih: string } | null;
  kisa: string;
  dayanak: string[];
  varsayimlar: string[];
  eksik_girdiler: string[];
  uyarilar: string[];
  parametre_surumu: string;
  onay_durumu: "uzman_onayli" | "teyit_bekliyor";
}

/* ------------------------------ cards ------------------------------- */

export interface KartBolumu {
  /** short label used in the plain-text rendering */
  etiket: string;
  /** narrative or list content, already citation-tagged */
  metin: string;
  /** token count precomputed at build time */
  token: number;
  /** 1 = most important; the budget packer fills in this order */
  oncelik: number;
}

export interface Kart {
  dugum_id: string;
  surum: number;
  durum: "taslak" | "otomatik" | "uzman_onayli" | "eskimis";
  bolumler: KartBolumu[];
  /** identity strings the card is allowed to cite */
  kaynaklar: string[];
  girdi_hash: string;
  token: number;
}

export interface DugumKaydi {
  id: string;
  ust_id: string | null;
  ad: string;
  aciklama: string;
  tetikleyiciler: string[];
  ornek_sorgular: string[];
  kurallar: string[];
  maddeler: string[];
}

/* ----------------------------- ids ---------------------------------- */

export const ID_PATTERNS = {
  madde: /^m:\d+\/\d+/,
  karar: /^k:[a-z0-9-]+$/,
  dugum: /^(t|s)\//,
  arguman: /^a:/,
} as const;

export function idTuru(id: string): "madde" | "karar" | "dugum" | "arguman" | "bilinmiyor" {
  if (ID_PATTERNS.madde.test(id)) return "madde";
  if (ID_PATTERNS.karar.test(id)) return "karar";
  if (ID_PATTERNS.dugum.test(id)) return "dugum";
  if (ID_PATTERNS.arguman.test(id)) return "arguman";
  return "bilinmiyor";
}

/* ------------------------- structured output ------------------------ */
/*
 * Kept small and stable: these schemas are paid for in tools/list on every turn.
 */

const nesne = <T extends z.ZodRawShape>(shape: T) => z.object(shape);

const KuralSatiriCikti = nesne({
  kural: z.string(),
  sonuc: z.string().nullable(),
  ozet: z.string(),
  dayanak: z.array(z.string()),
  eksik: z.array(z.string()),
});

export const HukukSorCikti = nesne({
  durum: z.enum(["yanit", "belirsiz", "kapsam_disi", "hata"]),
  dugum: z.string().optional(),
  guven: z.number().optional(),
  diger_olasilik: z.string().optional(),
  kurallar: z.array(KuralSatiriCikti),
  eksik_olgular: z.array(z.string()),
  atiflar: z.array(z.string()),
  korpus: z.string(),
  /** olaydan sonra değişen dayanak maddeler (DİKKAT satırlarının yapısal ikizi) */
  uyarilar: z.array(z.string()).optional(),
});
export type HukukSorCikti = {
  durum: "yanit" | "belirsiz" | "kapsam_disi" | "hata";
  dugum?: string;
  guven?: number;
  diger_olasilik?: string;
  kurallar: Array<{ kural: string; sonuc: string | null; ozet: string; dayanak: string[]; eksik: string[] }>;
  eksik_olgular: string[];
  atiflar: string[];
  korpus: string;
  uyarilar?: string[];
};

export const HesaplaCikti = nesne({
  kural: z.string(),
  sonuc: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  ozet: z.string(),
  dayanak: z.array(z.string()),
  varsayimlar: z.array(z.string()),
  eksik: z.array(z.string()),
  /** olaydan sonra değişen dayanak maddeler (varsa) */
  uyarilar: z.array(z.string()).optional(),
  parametre_surumu: z.string(),
});
export type HesaplaCikti = z.infer<typeof HesaplaCikti>;

export const DogrulaCikti = nesne({
  atiflar: z.array(
    nesne({
      ham: z.string(),
      tur: z.enum(["madde", "karar", "kanun", "dugum"]),
      kimlik: z.string().nullable(),
      durum: z.enum(["DOGRU", "MULGA", "YOK", "KAPSAM", "MULGA_KANUN"]),
      aciklama: z.string(),
    }),
  ),
  ozet: nesne({
    dogru: z.number(),
    mulga: z.number(),
    yok: z.number(),
    kapsam: z.number(),
    mulga_kanun: z.number(),
  }),
});
export type DogrulaCikti = z.infer<typeof DogrulaCikti>;
