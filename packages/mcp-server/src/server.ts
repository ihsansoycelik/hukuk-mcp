/**
 * MCP tool surface — five tools, deliberately.
 *
 * Tool definitions are paid for on every model turn, so the surface is small and
 * the descriptions are one sentence each. Capability lives in the parameter
 * schemas and in the orchestration behind hukuk_sor, not in tool count.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  AraInput,
  DerinlesInput,
  DogrulaInput,
  HesaplaInput,
  HukukSorInput,
  idTuru,
} from "@hukuk/schema";
import { dugumBul, tumDugumler, surum as ontolojiSurum } from "@hukuk/ontology";
import { paketle, tokenSay, butceyeSikistir } from "./budget.ts";
import { hukukSor, yeniOturum, type Oturum } from "./hukukSor.ts";
import type { CorpusPort, KuralPort } from "./ports.ts";
import { bugunISO, dayanakMetni, hataMetni, kararSatiri, trTarih } from "./render.ts";

export const SURUM = "0.1.0";

const TALIMAT =
  "Türk hukuku asistanı (tüketici + sosyal güvenlik). Önce hukuk_sor çağır; yanıt yetmezse derinles ile kimlik aç; " +
  "konu eşleşmezse ara ile içtihat tara. Yanıtı kullanıcıya sade Türkçeyle aktar, kimlikleri koru.";

function metin(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
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
      description:
        "Tüketici veya SGK uyuşmazlığını tek çağrıda yanıtlar.",
      inputSchema: HukukSorInput.shape,
    },
    async (args) => {
      const input = HukukSorInput.parse(args);
      input.ozet = input.ozet.slice(0, 400);
      const sonuc = hukukSor(input, corpus, kural, oturum);
      return metin(sonuc.metin);
    },
  );

  sunucu.registerTool(
    "derinles",
    {
      description: "Bir kimliğin ayrıntısını açar.",
      inputSchema: DerinlesInput.shape,
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
        const govde = [
          `MADDE ${m.id} | ${m.baslik ?? ""}`.trim(),
          m.metin,
          m.degisiklik ? `DEĞİŞİKLİK ${m.degisiklik}` : "",
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
      description: "Karar ve madde metinlerinde kaynaklı arama yapar.",
      inputSchema: AraInput.shape,
    },
    async (args) => {
      const input = AraInput.parse(args);
      const butce = input.butce ?? 800;
      const limit = input.limit ?? 5;
      // guard rails live in code so the schema can stay small (schema is paid
      // for on every model turn; a handler check is free)
      const sorgu = input.sorgu.slice(0, 200);
      const hits = corpus.ara({ ...input, sorgu, limit });
      const maddelerOn = corpus.maddeAra?.(sorgu, 1) ?? [];
      if (hits.length === 0 && maddelerOn.length === 0) {
        return metin(hataMetni({ kod: "DUGUM_BULUNAMADI", mesaj: `sonuç yok: ${input.sorgu}`, sonraki_adim: "daha kısa ve genel bir sorgu deneyin" }));
      }
      const maddeler = corpus.maddeAra?.(sorgu, 3) ?? [];
      const bolumler = [
        {
          etiket: "KARARLAR",
          metin: hits.map((k) => kararSatiri(k)).join("\n"),
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
      const paket = paketle(
        `ARA ${hits.length} karar, ${maddeler.length} madde | sürüm ${corpus.yayinSurumu()}`,
        bolumler,
        butce,
      );
      return metin(paket.metin);
    },
  );

  sunucu.registerTool(
    "hesapla",
    {
      description: "Süre, eşik, merci ve faiz hesabını yasal dayanağıyla çalıştırır.",
      inputSchema: HesaplaInput.shape,
    },
    async (args) => {
      const input = HesaplaInput.parse(args);
      const h = input as { kural: string; girdiler: Record<string, unknown> };
      if (!kural.varMi(h.kural)) {
        return metin(hataMetni({ kod: "PARAMETRE_GUNCEL_DEGIL", mesaj: `bilinmeyen kural: ${h.kural}`, sonraki_adim: "geçerli kurallar: gorevli_merci, arabuluculuk_dava_sarti, ayip_zamanasimi, cayma_suresi, yetkili_yer, harc_durumu, sure_son_gun, yasal_faiz" }));
      }
      const s = kural.calistir(h.kural, { ...h.girdiler, bugun: (h.girdiler.bugun as string) ?? bugunISO() }, (h.girdiler.bugun as string) ?? bugunISO());
      const deger =
        typeof s.sonuc === "object" && s.sonuc !== null && "tarih" in s.sonuc
          ? trTarih(String((s.sonuc as { tarih: string }).tarih))
          : String(s.sonuc);
      const govde = [
        `KURAL ${h.kural} | SONUÇ ${deger} | ${s.onay_durumu}`,
        s.kisa,
        s.dayanak.length ? `DAYANAK${dayanakMetni(s.dayanak)}` : "",
        s.eksik_girdiler.length ? `EKSİK ${s.eksik_girdiler.join(", ")}` : "",
        s.varsayimlar.length ? `VARSAYIM ${s.varsayimlar.join(" | ")}` : "",
        s.uyarilar.length ? `UYARI ${s.uyarilar.join(" | ")}` : "",
        `PARAMETRE ${s.parametre_surumu}`,
      ]
        .filter(Boolean)
        .join("\n");
      return metin(butceyeSikistir(govde, 600));
    },
  );

  sunucu.registerTool(
    "dogrula",
    {
      description: "Bir künye veya kimliğin var olduğunu doğrular.",
      inputSchema: DogrulaInput.shape,
    },
    async (args) => {
      const input = DogrulaInput.parse(args);
      if (input.id) {
        const [kimlik, asof] = input.id.split("@");
        const tur = idTuru(kimlik ?? input.id);
        if (tur === "karar") {
          const k = corpus.kararGetir(kimlik ?? input.id);
          return metin(
            k
              ? `DOĞRU ${k.karar_id} | ${k.daire || k.mahkeme} | ${trTarih(k.tarih)} | ${k.kesinlesme} | ${k.kaynak_url}`
              : hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `karar yok: ${input.id}`, sonraki_adim: "ara ile künyeyi arayın" }),
          );
        }
        if (tur === "madde") {
          const m = corpus.maddeGetir(kimlik ?? input.id, asof);
          return metin(
            m
              ? `DOĞRU ${m.id}${asof ? `@${asof}` : ""} | ${m.baslik ?? ""} | ${m.kaynak_url}`
              : hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `madde yok: ${input.id}`, sonraki_adim: "madde numarasını kontrol edin" }),
          );
        }
        if (tur === "dugum") {
          const d = dugumBul(kimlik ?? input.id);
          if (d) return metin(`DOĞRU ${d.id} | ${d.ad} | yaprak=${d.yaprak}`);
          return metin(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `düğüm yok: ${input.id}`, sonraki_adim: "ontoloji://tuketici veya ontoloji://sgk kaynağına bakın" }));
        }
        return metin(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `kimlik çözülemedi: ${input.id}`, sonraki_adim: "k:, m:, t/ veya s/ kimliği verin" }));
      }

      if (input.kunye) {
        const adaylar = kunyeToId(input.kunye);
        if (adaylar.length === 0) {
          return metin(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `künye ayrıştırılamadı: ${input.kunye}`, sonraki_adim: "ör. '3. Hukuk Dairesi 2021/1234 E. 2022/567 K.' biçiminde yazın" }));
        }
        for (const ad of adaylar) {
          const k = corpus.kararGetir(ad);
          if (k) return metin(`DOĞRU ${k.karar_id} | ${k.daire} | ${trTarih(k.tarih)} | ${k.kesinlesme} | ${k.kaynak_url}`);
        }
        return metin(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: `bu künye korpusta yok: ${input.kunye}`, sonraki_adim: "ara aracıyla konu bazlı arayın; künye uydurmayın" }));
      }

      return metin(hataMetni({ kod: "KIMLIK_COZULEMEDI", mesaj: "kunye veya id gerekli", sonraki_adim: "id ya da künye metni verin" }));
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
