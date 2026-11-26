/**
 * @hukuk/retrieval — public surface.
 *
 * The MCP server imports `Corpus` and the three public types below. Everything
 * else is exported for the evaluation harness and for tuning.
 */
export { Corpus, VARSAYILAN_DB, type AraSorgusu } from "./corpus.ts";
export type { SearchHit, DugumAday, MaddeKaydi, YonlendirmeSonucu } from "./types.ts";
export {
  ARAMA_AYARLARI,
  ARAMA_ESIKLERI,
  YONLENDIRME_AGIRLIKLARI,
  YONLENDIRME_ESIKLERI,
  KALITE_ESIKLERI,
  type AramaAyarlari,
  type YonlendirmeAgirliklari,
  type YonlendirmeEsikleri,
} from "./config.ts";
export {
  DugumYonlendirici,
  dugumGuven,
  belirsizMi,
  kalibreEt,
  alanOneki,
  dugumVektorMetni,
} from "./router.ts";
export { ftsTokenleri, guvenliFtsToken, ftsAndSorgusu, ftsOrSorgusu, ftsSorgulari } from "./fts.ts";
export { hukukTerimleri } from "./esanlam.ts";
