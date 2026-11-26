/**
 * MCP tool surface — five tools, deliberately.
 *
 * Tool definitions are paid for on every model turn, so the surface is small and
 * the descriptions are one sentence each. Capability lives in the parameter
 * schemas and in the orchestration behind hukuk_sor, not in tool count.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { z } from "zod";
import {
  AraInput,
  DerinlesInput,
  DogrulaCikti,
  DogrulaInput,
  HesaplaCikti,
  HesaplaInput,
  HukukSorCikti,
  HukukSorInput,
  idTuru,
} from "@hukuk/schema";
import { dugumBul, tumDugumler, surum as ontolojiSurum } from "@hukuk/ontology";
import { paketle, tokenSay, butceyeSikistir } from "./budget.ts";
import { atifOzeti, atifRaporu, atiflariCikar, bozulmaUyarisi, maddeYokAciklama, type Atif } from "./atif.ts";
import { degisiklikSatirlari, olayTarihiBul, olaySonrasiUyarilari } from "./zaman.ts";
import { hukukSor, yeniOturum, type Oturum } from "./hukukSor.ts";
import type { CorpusPort, KuralPort } from "./ports.ts";
import { bugunISO, dayanakKimlikleri, kararBaglantiSatirlari, dayanakMetni, hataMetni, kararSatiri, sonucDegeri, trTarih, ustEki } from "./render.ts";

export const SURUM = "0.1.0";

const TALIMAT =
  "Türk hukuku asistanı (tüketici + sosyal güvenlik). Önce hukuk_sor çağır; yanıt yetmezse derinles ile kimlik aç; " +
  "konu eşleşmezse ara ile içtihat tara. Yanıtı kullanıcıya sade Türkçeyle aktar, kimlikleri koru.";

function metin(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

/**
 * Every tool only reads the compiled corpus and runs deterministic rules: no
 * writes, no network, same input gives the same output.
 */
const SALT_OKUNUR = {
  readOnlyHint: true,
  idempotentHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

/** Text stays the primary channel; structuredContent is its machine-readable twin. */
function yapili<T extends Record<string, unknown>>(t: string, yapisal: T) {
  return { content: [{ type: "text" as const, text: t }], structuredContent: yapisal };
}

/** Error text: no structured twin, so flag it as an error. */
function hata(t: string) {
  return { content: [{ type: "text" as const, text: t }], isError: true as const };
}

/** Free-text künye -> candidate id, best effort and explicitly non-authoritative. */
export function kunyeToId(kunye: string): string[] {
  const s = kunye.replace(/\s+/g, " ").trim();
  const daire = /(\d+)\.\s*(hukuk|ceza)\s*dairesi/i.exec(s);
  const hgk = /hukuk\s*genel\s*kurulu/i.test(s);
  const esas = /(\d{4})\s*\/\s*(\d+)\s*e\.?/i.exec(s);
  const karar = /(\d{4})\s*\/\s*(\d+)\s*k\.?/i.exec(s);
  if (!esas) return [];
  const slug = hgk ? "hgk" : daire ? `${daire[1]}hd` : null;
  if (!slug) return [];
  const orta = `${slug}-${esas[1]}-${esas[2]}`;
  if (karar) return [`k:ygt-${orta}-${karar[1]}-${karar[2]}`, `k:emsal-${orta}-${karar[1]}-${karar[2]}`];
  return [`k:ygt-${orta}`, `k:emsal-${orta}`];
}

export function olusturSunucu(corpus: CorpusPort, kural: KuralPort): McpServer {
  const sunucu = new McpServer({ name: "turk-hukuk", version: SURUM }, { instructions: TALIMAT });

  /** One session per server process; stdio transport is one client. */
  const oturum: Oturum = yeniOturum();

  sunucu.registerTool(
    "hukuk_sor",
    {
      title: "Hukuki soru (tek çağrı)",
      description:
        "Tüketici veya SGK uyuşmazlığını tek çağrıda yanıtlar.",
      inputSchema: HukukSorInput.shape,
      annotations: SALT_OKUNUR,
    },
    async (args) => {
      const input = HukukSorInput.parse(args);
      input.ozet = input.ozet.slice(0, 400);
      const sonuc = hukukSor(input, corpus, kural, oturum);
      return yapili(sonuc.metin, sonuc.yapisal);
    },
  );

  sunucu.registerTool(
    "derinles",
    {
      title: "Kimlik aç",
      description: "Bir kimliğin ayrıntısını açar.",
      inputSchema: DerinlesInput.shape,
      annotations: SALT_OKUNUR,
    },
    async (args) => {
      const input = DerinlesInput.parse(args);
      const butce = input.butce ?? 900;
      // "m:6502/12@2026-01-01" is a dated resolution request, not a different id
      const [kimlik, asof] = input.id.split("@");
      const tur = idTuru(kimlik ?? input.id);

      if (tur === "madde") {
        const m = corpus.maddeGetir(kimlik ?? input.id, asof);
        if (!m) return metin(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `madde bulunamadı: ${input.id}`, sonraki_adim: "kimliği dogrula ile kontrol edin" }));
        const dg = degisiklikSatirlari(corpus.degisiklikler?.(m.id) ?? []);
        const dayanan = corpus.maddeyeDayananKararlar?.(m.id, 3) ?? [];
        const dayananSatiri = dayanan.length
          ? `DAYANAN KARARLAR ${corpus.maddeyeDayananSayisi?.(m.id) ?? dayanan.length} karar | ${dayanan.join(" | ")}`
          : "";
        const govde = [
          `MADDE ${m.id} | ${m.baslik ?? ""}`.trim(),
          ...dg,
          dayananSatiri,
          m.metin,
          dg.length === 0 && m.degisiklik ? `DEĞİŞİKLİK ${m.degisiklik}` : "",
          `KAYNAK ${m.kaynak_url}`,
        ]
          .filter(Boolean)
          .join("\n");
        return metin(butceyeSikistir(govde, butce));
      }

      if (tur === "karar") {
        const k = corpus.kararGetir(kimlik ?? input.id);
        if (!k) return metin(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `karar bulunamadı: ${input.id}`, sonraki_adim: "kunye ile arayın: ara aracı" }));
        const seviye = input.seviye ?? "L1";
        // The published corpus carries L0/L1 only; L2 (paragraphs) and L3 (full
        // text) are future layers. Say so instead of silently pretending L1 == L3.
        const seviyeNotu =
          seviye === "L2" || seviye === "L3"
            ? `NOT Bu sürümde ${seviye} katmanı yayınlanmadı (yalnızca L0/L1); aşağıdaki L1 özetidir.`
            : "";
        const govde = [
          `KARAR ${k.karar_id} | ${k.daire || k.mahkeme} | ${trTarih(k.tarih)} | ${k.kesinlesme}`,
          seviye === "L0" ? (k.l0 ?? "") : (k.l1 || k.l0 || ""),
          seviyeNotu,
          ...kararBaglantiSatirlari(corpus, k),
          `KAYNAK ${k.kaynak_url}`,
        ]
          .filter(Boolean)
          .join("\n");
        return metin(butceyeSikistir(govde, butce));
      }

      if (tur === "dugum") {
        const kart = corpus.kartGetir(kimlik ?? input.id);
        const d = dugumBul(kimlik ?? input.id);
        if (!kart) return metin(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `kart yok: ${input.id}`, sonraki_adim: "hukuk_sor ile konuyu tarif edin" }));
        const paket = paketle(
          `DÜĞÜM ${input.id} (${d?.ad ?? ""}) | kart v${kart.surum} ${kart.durum}`,
          kart.bolumler.map((b) => ({ etiket: b.etiket, metin: b.metin, oncelik: b.oncelik })),
          butce,
        );
        return metin(paket.metin);
      }

      if (tur === "arguman") {
        const a = corpus.argumanGetir?.(input.id) ?? null;
        if (!a) return metin(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `argüman bulunamadı: ${input.id}`, sonraki_adim: "hukuk_sor yanıtındaki argüman kimliğini kullanın" }));
        const govde = [
          `ARGÜMAN ${a.id} (${a.taraf})`,
          a.iddia,
          `KABUL ${a.kabul} / RET ${a.ret}`,
          a.belirleyici ? `BELİRLEYİCİ ${a.belirleyici}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        return metin(butceyeSikistir(govde, butce));
      }

      return metin(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `tanınmayan kimlik: ${input.id}`, sonraki_adim: "k:, m:, t/ veya s/ düğüm, a: ile başlayan bir kimlik verin" }));
    },
  );

  sunucu.registerTool(
    "ara",
    {
      title: "Karar ara",
      description: "Karar ve madde metinlerinde kaynaklı arama yapar.",
      inputSchema: AraInput.shape,
      annotations: SALT_OKUNUR,
    },
    async (args) => {
      const input = AraInput.parse(args);
      const butce = input.butce ?? 800;
      const limit = input.limit ?? 5;
      // guard rails live in code so the schema can stay small (schema is paid
      // for on every model turn; a handler check is free)
      const sorgu = input.sorgu.slice(0, 200);
      const arama = corpus.araDetay
        ? corpus.araDetay({ ...input, sorgu, limit })
        : { hits: corpus.ara({ ...input, sorgu, limit }), strateji: "", denenen: [] as string[] };
      const hits = arama.hits;
      const maddelerOn = corpus.maddeAra?.(sorgu, 1) ?? [];
      if (hits.length === 0 && maddelerOn.length === 0) {
        const satirlar = [hataMetni({ kod: "DUGUM_BULUNAMADI", mesaj: `sonuç yok: ${input.sorgu}`, sonraki_adim: "daha kısa ve genel bir sorgu deneyin" })];
        if (arama.denenen.length) {
          const uzun = sorgu.trim().split(/\s+/).length > 3;
          const oneri = uzun
            ? "sorguyu 2-3 anahtar sözcüğe kısaltın, ya da olayı hukuk_sor ile anlatın"
            : "gündelik sözcük yerine hukuki terim deneyin (ör. 'bedel iadesi', 'ayıp'), ya da olayı hukuk_sor ile anlatın";
          satirlar.push("STRATEJİ yok", `DENENEN ${arama.denenen.join(", ")} | SONRAKİ ADIM ${oneri}`);
        }
        return metin(satirlar.join("\n"));
      }
      const maddeler = corpus.maddeAra?.(sorgu, 3) ?? [];
      const bolumler = [
        {
          etiket: "KARARLAR",
          metin: hits.map((k) => kararSatiri(k, false, ustEki(corpus, k))).join("\n"),
          oncelik: 10,
        },
      ];
      if (maddeler.length) {
        bolumler.push({
          etiket: "MEVZUAT",
          metin: maddeler
            .map((m) => `- ${m.id} ${m.baslik ?? ""} — ${m.metin.replace(/\s+/g, " ").slice(0, 160)}`)
            .join("\n"),
          oncelik: 20,
        });
      }
      // the strategy line sits in the header so the budget packer never drops it
      const stratejiSatiri = arama.strateji ? `\nSTRATEJİ ${arama.strateji}` : "";
      const paket = paketle(
        `ARA ${hits.length} karar, ${maddeler.length} madde | sürüm ${corpus.yayinSurumu()}${stratejiSatiri}`,
        bolumler,
        butce,
      );
      return metin(paket.metin);
    },
  );

  sunucu.registerTool(
    "hesapla",
    {
      title: "Süre ve merci hesapla",
      description: "Süre, eşik, merci ve faiz hesabını yasal dayanağıyla çalıştırır.",
      inputSchema: HesaplaInput.shape,
      annotations: SALT_OKUNUR,
    },
    async (args) => {
      const input = HesaplaInput.parse(args);
      const h = input as { kural: string; girdiler: Record<string, unknown> };
      if (!kural.varMi(h.kural)) {
        return hata(hataMetni({ kod: "PARAMETRE_GUNCEL_DEGIL", mesaj: `bilinmeyen kural: ${h.kural}`, sonraki_adim: "geçerli kurallar: gorevli_merci, arabuluculuk_dava_sarti, ayip_zamanasimi, cayma_suresi, yetkili_yer, harc_durumu, sure_son_gun, yasal_faiz" }));
      }
      const s = kural.calistir(h.kural, { ...h.girdiler, bugun: (h.girdiler.bugun as string) ?? bugunISO() }, (h.girdiler.bugun as string) ?? bugunISO());
      const deger =
        typeof s.sonuc === "object" && s.sonuc !== null && "tarih" in s.sonuc
          ? trTarih(String((s.sonuc as { tarih: string }).tarih))
          : String(s.sonuc);
      const dayanakIdleri = dayanakKimlikleri(s.dayanak);
      const tarihUyarilari = olaySonrasiUyarilari(corpus, s.dayanak, olayTarihiBul(h.girdiler));
      const govde = [
        `KURAL ${h.kural} | SONUÇ ${deger} | ${s.onay_durumu}`,
        s.kisa,
        s.dayanak.length ? `DAYANAK${dayanakMetni(s.dayanak)}` : "",
        s.eksik_girdiler.length ? `EKSİK ${s.eksik_girdiler.join(", ")}` : "",
        s.varsayimlar.length ? `VARSAYIM ${s.varsayimlar.join(" | ")}` : "",
        s.uyarilar.length ? `UYARI ${s.uyarilar.join(" | ")}` : "",
        ...tarihUyarilari,
        `PARAMETRE ${s.parametre_surumu}`,
      ]
        .filter(Boolean)
        .join("\n");
      return yapili(butceyeSikistir(govde, 600), {
        kural: h.kural,
        sonuc: sonucDegeri(s),
        ozet: s.kisa,
        dayanak: dayanakIdleri,
        varsayimlar: s.varsayimlar,
        eksik: s.eksik_girdiler,
        uyarilar: tarihUyarilari,
        parametre_surumu: s.parametre_surumu,
      });
    },
  );

  sunucu.registerTool(
    "dogrula",
    {
      title: "Atıf denetimi",
      description: "Atıf denetimi: id, künye veya metin (taslak yanıt). Uydurma, mülga ve kapsam dışı atıfları işaretler.",
      inputSchema: DogrulaInput.shape,
      annotations: SALT_OKUNUR,
    },
    async (args) => {
      const input = DogrulaInput.parse(args);
      const tek = (t: string, a: Atif) => yapili(t, { atiflar: [a], ozet: atifOzeti([a]) });
      const KAPSAM_ACIKLAMA = "korpusta yok; gerçek olabilir ama doğrulanamadı, resmî arama ile teyit edin";
      if (input.metin) {
        const atiflar = atiflariCikar(input.metin, corpus);
        return yapili(butceyeSikistir(atifRaporu(atiflar), 1200), { atiflar, ozet: atifOzeti(atiflar) });
      }
      if (input.id) {
        const [kimlik, asof] = input.id.split("@");
        const tur = idTuru(kimlik ?? input.id);
        if (tur === "karar") {
          const k = corpus.kararGetir(kimlik ?? input.id);
          if (!k) {
            return tek(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `karar yok: ${input.id}`, sonraki_adim: "ara ile künyeyi arayın" }), {
              ham: input.id, tur: "karar", kimlik: kimlik ?? input.id, durum: "KAPSAM", aciklama: KAPSAM_ACIKLAMA,
            });
          }
          const uyari = bozulmaUyarisi(corpus, k.karar_id, k.mahkeme);
          const sonek = uyari ? ` | ${uyari}` : "";
          return tek(`DOĞRU ${k.karar_id} | ${k.daire || k.mahkeme} | ${trTarih(k.tarih)} | ${k.kesinlesme} | ${k.kaynak_url}${sonek}`, {
            ham: input.id, tur: "karar", kimlik: k.karar_id, durum: "DOGRU",
            aciklama: `${k.daire || k.mahkeme} | ${trTarih(k.tarih)} | ${k.kesinlesme} | ${k.kaynak_url}${sonek}`,
            ...(uyari ? { uyari } : {}),
          });
        }
        if (tur === "madde") {
          const m = corpus.maddeGetir(kimlik ?? input.id, asof);
          if (!m) {
            const kanun = (kimlik ?? input.id).match(/^m:([^/]+)\//)?.[1] ?? "";
            return tek(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `madde yok: ${input.id}`, sonraki_adim: "madde numarasını kontrol edin" }), {
              ham: input.id, tur: "madde", kimlik: kimlik ?? input.id, durum: "YOK", aciklama: kanun ? maddeYokAciklama(corpus, kanun) : "böyle madde yok",
            });
          }
          return tek(`DOĞRU ${m.id}${asof ? `@${asof}` : ""} | ${m.baslik ?? ""} | ${m.kaynak_url}`, {
            ham: input.id, tur: "madde", kimlik: m.id, durum: "DOGRU", aciklama: `${m.baslik ?? ""} | ${m.kaynak_url}`,
          });
        }
        if (tur === "dugum") {
          const d = dugumBul(kimlik ?? input.id);
          if (d) {
            return tek(`DOĞRU ${d.id} | ${d.ad} | yaprak=${d.yaprak}`, {
              ham: input.id, tur: "dugum", kimlik: d.id, durum: "DOGRU", aciklama: `${d.ad} | yaprak=${d.yaprak}`,
            });
          }
          return tek(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `düğüm yok: ${input.id}`, sonraki_adim: "ontoloji://tuketici veya ontoloji://sgk kaynağına bakın" }), {
            ham: input.id, tur: "dugum", kimlik: kimlik ?? input.id, durum: "YOK", aciklama: "böyle düğüm yok",
          });
        }
        return tek(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `kimlik çözülemedi: ${input.id}`, sonraki_adim: "k:, m:, t/ veya s/ kimliği verin" }), {
          ham: input.id, tur: input.id.startsWith("k:") ? "karar" : "madde", kimlik: null, durum: "KAPSAM", aciklama: "kimlik biçimi tanınmadı; doğrulanamadı",
        });
      }

      if (input.kunye) {
        const adaylar = kunyeToId(input.kunye);
        if (adaylar.length === 0) {
          return tek(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `künye ayrıştırılamadı: ${input.kunye}`, sonraki_adim: "ör. '3. Hukuk Dairesi 2021/1234 E. 2022/567 K.' biçiminde yazın" }), {
            ham: input.kunye, tur: "karar", kimlik: null, durum: "KAPSAM", aciklama: "künye ayrıştırılamadı; doğrulanamadı",
          });
        }
        for (const ad of adaylar) {
          const k = corpus.kararGetir(ad);
          if (k) {
            const uyari = bozulmaUyarisi(corpus, k.karar_id, k.mahkeme);
            const sonek = uyari ? ` | ${uyari}` : "";
            return tek(`DOĞRU ${k.karar_id} | ${k.daire} | ${trTarih(k.tarih)} | ${k.kesinlesme} | ${k.kaynak_url}${sonek}`, {
              ham: input.kunye, tur: "karar", kimlik: k.karar_id, durum: "DOGRU",
              aciklama: `${k.daire} | ${trTarih(k.tarih)} | ${k.kesinlesme} | ${k.kaynak_url}${sonek}`,
              ...(uyari ? { uyari } : {}),
            });
          }
        }
        return tek(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `bu künye korpusta yok: ${input.kunye}`, sonraki_adim: "ara aracıyla konu bazlı arayın; künye uydurmayın" }), {
          ham: input.kunye, tur: "karar", kimlik: adaylar[0] ?? null, durum: "KAPSAM", aciklama: KAPSAM_ACIKLAMA,
        });
      }

      return hata(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: "kunye veya id gerekli", sonraki_adim: "id ya da künye metni verin" }));
    },
  );

  // ------------------------- prompts & resources -------------------------
  // Prompts encode the good workflow so a client model does not have to discover
  // it; the resource exposes the ontology tree lazily (never auto-loaded).

  sunucu.registerPrompt(
    "tuketici_sikayeti_analizi",
    {
      description: "Olayı toplar, hukuk_sor ile analiz eder, eksik olguları sorar ve yol haritası çıkarır.",
      argsSchema: { sikayet: z.string().describe("Kullanıcının kendi cümleleriyle anlattığı olay") },
    },
    ({ sikayet }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Aşağıdaki tüketici şikâyetini analiz et.\n\nŞİKÂYET: ${sikayet}\n\n` +
              "Adımlar: 1) eksik olguları (tarih, tutar, ürün, talep) belirle. 2) hukuk_sor aracını bu olgularla çağır. " +
              "3) yanıttaki EKSİK OLGULAR alanındaki bilgileri kullanıcıya tek tek sor. " +
              "4) yanıtı sade Türkçeyle, YOL bölümündeki sırayı koruyarak özetle. " +
              "5) kimlikleri (m:, k:, t/) aynen koru ve kullanıcıya hukuki danışmanlık olmadığını hatırlat.",
          },
        },
      ],
    }),
  );

  sunucu.registerPrompt(
    "basvuru_taslagi",
    {
      description: "Bir düğümün yol haritasından ihtarname veya başvuru iskeleti üretir.",
      argsSchema: {
        dugum_id: z.string().describe("t/ veya s/ ile başlayan düğüm kimliği"),
        taraf: z.string().optional().describe("Muhatap: satıcı, banka, hakem heyeti vb."),
      },
    },
    ({ dugum_id, taraf }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `derinles aracını id="${dugum_id}" seviye="L2" ile çağır ve dönen kartın YOL ve HAKLAR bölümlerini kullan. ` +
              `Muhatap: ${taraf ?? "belirtilmedi"}. ` +
              "Kısa bir başvuru/dilekçe iskeleti yaz: başlık, muhatap, konu, olgular, hukuki dayanak (karttaki m: kimlikleri), talep, ekler. " +
              "Uydurma künye veya madde numarası yazma; yalnızca kartta geçen kimlikleri kullan. " +
              "Sonuna 'TASLAK — avukat kontrolü önerilir' notu ekle.",
          },
        },
      ],
    }),
  );

  /**
   * L0 ontology view over one id space. `t/` (consumer) and `s/` (SGK) share the
   * same node shape, so the same renderer serves both resources.
   */
  const ontolojiKaynagi = (
    ad: string,
    uri: string,
    baslik: string,
    onek: string,
    aciklama: string,
  ): void => {
    sunucu.registerResource(ad, uri, { description: aciklama, mimeType: "text/plain" }, async () => {
      const satirlar = tumDugumler()
        .filter((d) => d.derinlik > 0 && d.id.startsWith(onek))
        .map((d) => `${"  ".repeat(d.derinlik - 1)}${d.id} — ${d.ad}${d.kurallar.length ? ` [${d.kurallar.join(",")}]` : ""}`);
      return {
        contents: [
          {
            uri,
            mimeType: "text/plain",
            text: `${baslik} v${ontolojiSurum()}\n${satirlar.join("\n")}`,
          },
        ],
      };
    });
  };

  // Output schemas are not advertised in tools/list (they cost tokens on every
  // turn); structuredContent is still returned and its JSON Schemas live here.
  sunucu.registerResource(
    "cikti-semalari",
    "sema://cikti",
    { title: "Çıktı şemaları", description: "hukuk_sor, hesapla ve dogrula structuredContent JSON Schema'ları.", mimeType: "application/json" },
    async () => ({
      contents: [
        {
          uri: "sema://cikti",
          mimeType: "application/json",
          text: JSON.stringify({
            hukuk_sor: toJsonSchemaCompat(HukukSorCikti),
            hesapla: toJsonSchemaCompat(HesaplaCikti),
            dogrula: toJsonSchemaCompat(DogrulaCikti),
          }),
        },
      ],
    }),
  );

  ontolojiKaynagi(
    "ontoloji-tuketici",
    "ontoloji://tuketici",
    "TÜKETİCİ ONTOLOJİSİ",
    "t/",
    "Ağacın L0 görünümü: dal ve yaprak düğüm kimlikleri, adları ve kural setleri.",
  );
  ontolojiKaynagi(
    "ontoloji-sgk",
    "ontoloji://sgk",
    "SGK ONTOLOJİSİ",
    "s/",
    "Sosyal güvenlik ağacının L0 görünümü: dal ve yaprak düğüm kimlikleri, adları ve kural setleri.",
  );

  return sunucu;
}

export { yeniOturum };
