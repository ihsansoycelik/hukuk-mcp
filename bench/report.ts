/**
 * bench/report.ts — render bench/report.md from the raw results.
 *
 * Every cell in the output table carries its provenance:
 *   ÖLÇÜLDÜ = measured by bench/measure.ts on this machine
 *   BELGE   = taken from a public document (README / tool contract)
 *   TAHMİN  = an explicit assumption (see bench/baseline.ts)
 *
 * Never add a competitor latency to this table unless it was measured; the
 * modelled latency column is labelled TAHMİN everywhere.
 *
 * Usage: node bench/report.ts
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  benchPath,
  gitSha,
  mdTable,
  nowIso,
  readJson,
  readScenarios,
  round,
  type Scenario,
} from "./util.ts";

interface Measurements {
  status: "ok" | "pending";
  measuredAt?: string;
  gitSha?: string;
  node?: string;
  reason?: string;
  expectedServerPath?: string;
  tokenizer?: string;
  server?: {
    path: string;
    db?: string;
    dbBytes?: number | null;
    transport: string;
    tool: string;
    iterations: number;
  };
  toolSurface?: {
    count: number;
    tokens: number;
    perTool: Array<{ name: string; tokens: number; chars: number }>;
    names: string[];
  };
  summary?: {
    scenarios: number;
    scenariosOk: number;
    tools: number;
    toolDefinitionTokens: number;
    resultTokensMedian: number;
    resultTokensMax: number;
    latencyP50: number;
    latencyP95: number;
    latencyMean: number;
    coldCallP50?: number;
    coldCallP95?: number;
    coldStartMs: number;
    toolsListMs: number;
    budgetCompliance: string;
    answered?: number;
    clarify?: number;
    fallback?: number;
  };
  scenarios?: Array<{
    id: string;
    butce: number | null;
    calls: number;
    error: string | null;
    isError: boolean;
    tokensMedian: number;
    latencyP50: number;
    latencyP95: number;
    textChars: number;
    contentBlocks: number;
    sections: string[];
    citationIds: string[];
    withinBudget: boolean | null;
    fallback?: boolean;
    preview: string;
  }>;
}

interface Baseline {
  status: string;
  measuredAt: string;
  tokenizer: string;
  anchors: {
    corpus: {
      source: string;
      decisions: number;
      charsPerToken: number;
      medianDocChars: number;
      medianDocTokens: number;
      truncatedAtChars: number;
      label: string;
    };
    dayanakDocstring: { chars: number; estimatedTokens: number; evidence: string; sourceUrl: string };
    snippet: { chars: number; tokens: number; evidence: string };
    hitsPerSearch: number;
    metadataTokensPerHit: number;
    callsStandard: number;
    callsOptimistic: number;
    roundTripMs: number;
    parseMsPerCall: number;
    rttSource: string;
  };
  profiles: Array<{
    id: string;
    label: string;
    toolCount: number;
    schemasOnly: number;
    evidence: string;
    sourceUrl: string;
    note: string;
  }>;
  scenarioModel: {
    tokensSource: string;
    latencySource: string;
    searchCallTokens: number;
    documentTokens: number;
    perCallMs: number;
    note: string;
  };
  scenarios: Array<{
    id: string;
    calls: number;
    resultTokens: number;
    latencyMs: number;
    latencySource: string;
    tokensSource: string;
    detail: string;
  }>;
  optimistic: {
    calls: number;
    resultTokens: number;
    latencyMs: number;
    latencySource: string;
  };
}

function repoShort(): string {
  // strip the absolute repo prefix so the table stays readable
  const root = benchPath();
  return root.replace(/\/bench$/, "/");
}

function profile(b: Baseline, id: string) {
  const p = b.profiles.find((x) => x.id === id);
  if (p === undefined) throw new Error(`profil yok: ${id}`);
  return p;
}

function ratio(num: number, den: number): string {
  if (den === 0) return "—";
  return `${round(num / den, 2).toFixed(2)}×`;
}

function main(): void {
  const scenarios: Scenario[] = readScenarios();
  const m = readJson<Measurements>(benchPath("results", "measurements.json"));
  const tc = readJson<{ ok: boolean; checkedAt: string; errorCount: number; errors: string[]; command: string }>(
    benchPath("results", "typecheck.json"),
  );
  const runs = readJson<{
    note: string;
    chosen: string;
    runs: Array<{ file: string; p50: number; p95: number; coldStartMs: number; loadavg?: number[]; cpus?: number }>;
  }>(benchPath("results", "latency-runs.json"));
  const b = readJson<Baseline>(benchPath("results", "baseline.json"));

  if (b === null) {
    console.error("bench/results/baseline.json yok. Önce: node bench/baseline.ts");
    process.exit(1);
  }

  const core = profile(b, "dayanak-core");
  const full = profile(b, "dayanak-full");

  const measured = m !== null && m.status === "ok" && m.summary !== undefined && m.scenarios !== undefined;
  const ours = m?.summary;
  const ourScenarios = new Map((m?.scenarios ?? []).map((s) => [s.id, s]));
  const baselineByScenario = new Map(b.scenarios.map((s) => [s.id, s]));
  // Every modelled scenario shares the same chain, so the first entry is the model value.
  const baseResultTokens = b.scenarios[0]?.resultTokens ?? 0;
  const baseLatencyMs = b.scenarios[0]?.latencyMs ?? 0;

  const lines: string[] = [];
  const push = (s = ""): void => void lines.push(s);

  /* ------------------------------- header ------------------------------ */

  push("# hukuk-mcp — ölçüm raporu");
  push();
  push(
    "> Bu rapor `bench/` altındaki harness tarafından üretilir. Her hücrenin kaynağı " +
      "**ÖLÇÜLDÜ / BELGE / TAHMİN** olarak işaretlenmiştir. Rakip gecikmesi ölçülmemiştir; " +
      "modellenen süreler TAHMİN'dir.",
  );
  push();
  push(`- Rapor üretimi: ${nowIso()}`);
  push(`- Tokenizer: \`${b.tokenizer}\` (sunucunun bütçede kullandığı tokenizer'ın aynısı)`);
  if (tc !== null) {
    const errFiles = [...new Set(tc.errors.map((e) => e.split("(")[0] ?? e))].slice(0, 3);
    push(
      `- Tip kontrolü: ${tc.ok ? "**yeşil (0 hata)**" : `**KIRMIZI — ${tc.errorCount} hata**`} ` +
        `(\`${tc.command}\`, ${tc.checkedAt})` +
        (tc.ok ? "" : ` · dosyalar: ${errFiles.map((f) => `\`${f}\``).join(", ")}`),
    );
  }
  push(`- Sunucu commit: \`${m?.gitSha ?? gitSha()}\` · Node \`${m?.node ?? process.version}\``);
  const snap = (m as unknown as { snapshot?: { serverFiles?: Array<{ name: string; sha256: string }>; db?: { sha256?: string } } })?.snapshot;
  if (snap?.serverFiles !== undefined && snap.serverFiles.length > 0) {
    const entry = snap.serverFiles.find((f) => f.name === "index.ts");
    push(
      `- Anlık görüntü: sunucu \`index.ts#${entry?.sha256 ?? "?"}\`, ` +
        `${snap.serverFiles.length} kaynak dosya hash'lendi` +
        (snap.db?.sha256 !== undefined ? `, db#${snap.db.sha256}` : "") +
        " (repo'da git yok; bu yüzden commit yerine içerik hash'i kaydediliyor)",
    );
  }
  if (measured && m?.server !== undefined) {
    const dbBytes = m.server.dbBytes;
    push(
      `- Ölçüm: ${m.server.tool} × ${m.server.iterations} tekrar, ` +
        `taşıma \`${m.server.transport}\`, sunucu \`${m.server.path}\``,
    );
    if (m.server.db !== undefined) {
      push(
        `- Ölçülen veritabanı: \`${m.server.db}\`` +
          (dbBytes !== null && dbBytes !== undefined
            ? ` (${round(dbBytes / 1024 / 1024, 1)} MB)`
            : "") +
          " · ölçüm anı: " + (m.measuredAt ?? "—"),
      );
      const snapMeta = (m as unknown as { snapshot?: { dbMeta?: Record<string, string>; dbCounts?: Record<string, number | string> } }).snapshot;
      if (snapMeta?.dbMeta?.["surum"] !== undefined) {
        const c = snapMeta.dbCounts ?? {};
        push(
          `- Korpus sürümü: \`${snapMeta.dbMeta["surum"]}\` · ${c["mevzuat"] ?? "?"} mevzuat · ` +
            `${c["madde"] ?? "?"} madde · ${c["karar"] ?? "?"} karar · ${c["dugum"] ?? "?"} düğüm · ` +
            `${c["kart"] ?? "?"} kart · ${c["kural_parametre"] ?? "?"} parametre satırı`,
        );
      }
    }
  } else {
    push("- Ölçüm: **PENDING** — sunucu henüz çalıştırılabilir değil (aşağıya bakın)");
  }
  push();

  /* ------------------------------ headline ----------------------------- */

  push("## 1. Her tur ödenen sabit maliyet (araç tanımları)");
  push();
  push(
    "Araç tanımları modelin her turunda yeniden gönderilir. Aşağıdaki tablo `tools/list` " +
      "cevabının JSON'u üzerinden `gpt-tokenizer` ile sayılmıştır.",
  );
  push();

  const defRows: string[][] = [];
  if (measured && m?.toolSurface !== undefined) {
    defRows.push([
      "**hukuk-mcp (bu sunucu)**",
      String(m.toolSurface.count),
      `**${m.toolSurface.tokens}**`,
      "ÖLÇÜLDÜ",
      "gerçek tools/list payload'ı",
    ]);
  } else {
    defRows.push(["**hukuk-mcp (bu sunucu)**", "5", "PENDING", "—", "sunucu hazır olunca ölçülecek"]);
  }
  for (const p of b.profiles) {
    defRows.push([
      p.label,
      String(p.toolCount),
      `${p.schemasOnly}`,
      p.evidence,
      p.id === "dayanak-full" || p.id === "yargi-mcp" || p.id === "turkiye-mcp"
        ? "araç sayısı belgeli, şemalar varsayım"
        : "belgelenen parametrelerden kuruldu, açıklama yok",
    ]);
  }
  push(
    mdTable(["yüzey", "araç", "tanım token", "kanıt", "not"], defRows),
  );
  push();
  const ourDef = measured && m?.toolSurface !== undefined ? m.toolSurface.tokens : 0;
  const docTok = b.anchors.dayanakDocstring.estimatedTokens;
  const coreReal = core.schemasOnly + docTok;
  push(
    "**Dürüst okuma (bu bölüm önemli).** Rakip şemaları **nesir açıklaması olmadan** kuruldu; " +
      "gerçek payload daha büyüktür, yani o sütun bir **alt sınırdır**. Buna rağmen:",
  );
  push();
  push(
    `- Bizim 5 aracımız **${ourDef} token** (ÖLÇÜLDÜ). dayanak'ın 11 core aracının ` +
      `**açıklamasız** şema alt sınırı **${core.schemasOnly} token** — yani çıplak şema ` +
      `karşılaştırmasında biz **${ratio(ourDef, core.schemasOnly)} daha pahalıyız**. ` +
      `"Az araç = her zaman az token" iddiası **yanlıştır**; araç başına açıklama maliyeti belirleyici.`,
  );
  push(
    `- dayanak core için **${b.anchors.dayanakDocstring.chars.toLocaleString("tr-TR")} karakter** ` +
      `docstring bütçesi belgeliyor → ölçtüğümüz ${b.anchors.corpus.charsPerToken} karakter/token ` +
      `oranıyla ≈ **${docTok} token**. Şema + bu açıklama ≈ **${coreReal} token** (TAHMİN); ` +
      `bu durumda biz **${ratio(coreReal, ourDef)} daha ucuzuz**.`,
  );
  push(
    `- 47 araçlı full profilin açıklamasız alt sınırı **${full.schemasOnly} token** → biz ` +
      `**${ratio(full.schemasOnly, ourDef)} daha ucuzuz**; açıklamalar eklenince fark büyür.`,
  );
  push(
    `- Sonuç: avantajımız **araç sayısından** çok **tanım başına maliyet** ve **tur başına çağrı** ` +
      `sayısında. Kendi tanımlarımız kısaltıldı (1.200 → ${ourDef} token, ölçüldü); en büyük kalem ` +
      `\`hukuk_sor\` (${m?.toolSurface?.perTool.find((t) => t.name === "hukuk_sor")?.tokens ?? "?"} token, ` +
      `toplamın ~%${round(100 * (m?.toolSurface?.perTool.find((t) => t.name === "hukuk_sor")?.tokens ?? 0) / Math.max(1, ourDef), 0)}'ü).`,
  );
  push();
  push(
    `Kaynak (docstring bütçesi): [dayanak MCP_CONTRACTS](${b.anchors.dayanakDocstring.sourceUrl}).`,
  );
  push();

  if (measured && ours !== undefined) {
    push("### İlk tur toplamı (tanım + tek yanıt)");
    push();
    const ourFirst = ours.toolDefinitionTokens + ours.resultTokensMedian;
    const coreFirst = core.schemasOnly + baseResultTokens;
    const fullFirst = full.schemasOnly + baseResultTokens;
    push(
      mdTable(
        ["yüzey", "tanım token", "tek yanıt token", "ilk tur toplam", "kanıt"],
        [
          ["hukuk-mcp", `${ours.toolDefinitionTokens}`, `${ours.resultTokensMedian}`, `**${ourFirst}**`, "ÖLÇÜLDÜ"],
          [`dayanak core (${core.toolCount} araç), 4 çağrı`, `${core.schemasOnly}`, `${baseResultTokens}`, `${coreFirst}`, "KARIŞIK"],
          [`dayanak core, iyimser 2 çağrı`, `${core.schemasOnly}`, `${b.optimistic.resultTokens}`, `${core.schemasOnly + b.optimistic.resultTokens}`, "KARIŞIK"],
          [`dayanak full (${full.toolCount} araç), 4 çağrı`, `${full.schemasOnly}`, `${baseResultTokens}`, `${fullFirst}`, "KARIŞIK"],
        ],
      ),
    );
    push();
    push(
      `Oran (ilk tur toplamı, rakip/biz): core 4 çağrı **${ratio(coreFirst, ourFirst)}**, ` +
        `core iyimser 2 çağrı **${ratio(core.schemasOnly + b.optimistic.resultTokens, ourFirst)}**, ` +
        `full **${ratio(fullFirst, ourFirst)}**.`,
    );
    push();
    push(
      "Taban " +
        `yanıt token'ı ${baseResultTokens} (2 arama + 2 tam metin; tam metin medyanı ` +
        `${b.anchors.corpus.medianDocTokens} token, kendi korpusumuzdan ÖLÇÜLDÜ). ` +
        `İyimser model tek arama + tek tam metin varsayar: ${b.optimistic.resultTokens} token.`,
    );
    push();
  }

  /* ---------------------------- per scenario --------------------------- */

  push("## 2. Senaryo bazında");
  push();
  push(
    "Her senaryo gerçekçi bir vatandaş sorusudur (`bench/scenarios.jsonl`). " +
      "Bizim sütunlarımız gerçek MCP çağrısıdır; taban sütunları modelledir.",
  );
  push();

  const rows: string[][] = [];
  for (const s of scenarios) {
    const o = ourScenarios.get(s.id);
    const bs = baselineByScenario.get(s.id);
    const ok = o !== undefined && o.error === null;
    const oCalls = ok ? `${o.calls}` : "PENDING";
    const oTokens = ok ? `${o.tokensMedian}` : "PENDING";
    const oMs = ok ? `${o.latencyP50}` : "PENDING";
    const bTokens = bs?.resultTokens ?? baseResultTokens;
    const bMs = bs?.latencyMs ?? baseLatencyMs;
    const bCalls = bs?.calls ?? b.anchors.callsStandard;

    const ourTotal = ok ? (ours?.toolDefinitionTokens ?? 0) + o.tokensMedian : 0;
    rows.push([
      s.id,
      oCalls,
      oTokens,
      oMs,
      `${bCalls}`,
      `${bTokens}`,
      `${bMs}`,
      ok ? ratio(core.schemasOnly + bTokens, ourTotal) : "—",
      ok ? ratio(full.schemasOnly + bTokens, ourTotal) : "—",
      ok ? ratio(bMs, o.latencyP50) : "—",
    ]);
  }

  push(
    mdTable(
      [
        "senaryo",
        "biz çağrı (ÖLÇÜLDÜ)",
        "biz yanıt tok (ÖLÇÜLDÜ)",
        "biz p50 ms (ÖLÇÜLDÜ)",
        "taban çağrı (TAHMİN)",
        "taban tok (KARIŞIK)",
        "taban ms (TAHMİN)",
        "token oranı vs core",
        "token oranı vs full",
        "süre oranı (model/biz)",
      ],
      rows,
    ),
  );
  push();

  push(
    "**Gecikme oranı nasıl okunmalı.** Son sütun, modellenen canlı yolun (4 çağrı × 940 ms) " +
      "bizim ölçülen p50'mize oranıdır. Oranı büyüten şey **ağ varsayımıdır**, ölçülmüş bir rakip " +
      "değildir; bu yüzden sütun bir yarış iddiası değil, **mimari fark** göstergesidir " +
      "(sorgu yolunda ağ yok).",
  );
  push();

  /* ------------------------------ our detail --------------------------- */

  if (measured && m?.toolSurface !== undefined && m.scenarios !== undefined) {
    push("## 3. Bizim sunucunun ölçülen ayrıntısı");
    push();
    push(
      mdTable(
        ["araç", "tanım token", "pay"],
        m.toolSurface.perTool.map((t) => [
          `\`${t.name}\``,
          `${t.tokens}`,
          `%${round((100 * t.tokens) / Math.max(1, m.toolSurface?.tokens ?? 1), 1)}`,
        ]),
      ),
    );
    push();
    push(
      `- Toplam tanım: **${m.toolSurface.tokens} token / ${m.toolSurface.count} araç** (ÖLÇÜLDÜ)\n` +
        `- Soğuk başlangıç (spawn → ilk \`tools/list\`): **${ours?.coldStartMs ?? 0} ms** (ÖLÇÜLDÜ)\n` +
        `- \`tools/list\` gidiş-dönüşü: **${ours?.toolsListMs ?? 0} ms** (ÖLÇÜLDÜ)\n` +
        `- Yanıt token medyanı: **${ours?.resultTokensMedian ?? 0}**, en yüksek: **${ours?.resultTokensMax ?? 0}** (ÖLÇÜLDÜ)\n` +
        `- Gecikme (kararlı hal, senaryo başına ilk çağrı hariç): p50 **${ours?.latencyP50 ?? 0} ms**, p95 **${ours?.latencyP95 ?? 0} ms** (yerel stdio; ÖLÇÜLDÜ)\n` +
        `- Senaryo başına ilk çağrı: p50 **${ours?.coldCallP50 ?? 0} ms**, p95 **${ours?.coldCallP95 ?? 0} ms** (ÖLÇÜLDÜ)\n` +
        `- Bütçeye uyum (\`butce\` alanına göre): **${ours?.budgetCompliance ?? "—"}** (ÖLÇÜLDÜ)`,
    );
    push();

    const sect = new Map<string, number>();
    let withCitations = 0;
    let withRoadmap = 0;
    for (const s of m.scenarios) {
      if (s.error !== null) continue;
      for (const sec of s.sections) sect.set(sec, (sect.get(sec) ?? 0) + 1);
      if (s.citationIds.length > 0) withCitations++;
      if (s.sections.some((x) => x === "YOL")) withRoadmap++;
    }
    const okCount = m.scenarios.filter((s) => s.error === null).length;
    push(
      `Yapısal kontrol (ÖLÇÜLDÜ): ${okCount} yanıtın **${withCitations}**'inde çözümlenebilir atıf kimliği ` +
        `(\`m:\`, \`k:\`, \`t/\`, \`s/\`, \`a:\`), **${withRoadmap}**'inde \`YOL\` (eylem yol haritası) bölümü bulundu.`,
    );
    if (runs !== null && runs.runs.length > 1) {
      push();
      push(
        `**Ölçüm tekrarı (ÖLÇÜLDÜ).** ${runs.runs.length} koşu: p50 ` +
          runs.runs.map((r) => `${r.p50}`).join(" / ") +
          ` ms, p95 ` + runs.runs.map((r) => `${r.p95}`).join(" / ") +
          ` ms, soğuk başlangıç ` + runs.runs.map((r) => `${r.coldStartMs}`).join(" / ") +
          ` ms. Kayıtlı ölçüm \`${runs.chosen}\` (medyan p50).`,
      );
      push(
        `Sebep: ${runs.note} Ölçüm anındaki load average: ` +
          `\`${runs.runs[0]?.loadavg?.join(", ") ?? "?"}\` (${runs.runs[0]?.cpus ?? "?"} CPU). ` +
          "Yani bu sayılar **alt sınır değil**, paylaşımlı bir makinede ölçülmüş gerçek değerlerdir.",
      );
    }
    push();
    push("Bölüm bulunma sayıları: " + [...sect.entries()].map(([k, v]) => `\`${k}\` ${v}`).join(" · "));
    push();
  }

  /* ----------------------------- methodology -------------------------- */

  if (measured && m?.server !== undefined) {
    push("### Korpus ve kapsam");
    push();
    const dbPath = m.server.db ?? "";
    const counts: Record<string, number | string> = {};
    if (dbPath !== "") {
      try {
        const db = new DatabaseSync(dbPath, { readOnly: true });
        for (const t of ["mevzuat", "madde", "karar", "dugum", "kart", "kural_parametre"]) {
          try {
            const row = db.prepare(`select count(*) c from ${t}`).get() as { c: number };
            counts[t] = row.c;
          } catch {
            counts[t] = "yok";
          }
        }
        db.close();
      } catch (err) {
        counts["hata"] = (err as Error).message;
      }
    }
    push(
      "_Satır sayıları rapor üretim anında okunur; ölçüm anındaki DB hash'i yukarıdadır. " +
        "Korpus derlemesi sürüyorsa sayılar ölçümden sonra değişmiş olabilir._",
    );
    push();
    push(
      "| varlık | satır |\n| --- | --- |\n" +
        Object.entries(counts)
          .map(([k, v]) => `| ${k} | ${v} |`)
          .join("\n"),
    );
    push();
    const answered = ours?.answered ?? 0;
    const clarify = ours?.clarify ?? 0;
    const fallback = ours?.fallback ?? 0;
    const total = answered + clarify + fallback;
    if (counts["kural_parametre"] === 0) {
      push(
        "> **Not (ÖLÇÜLDÜ):** `kural_parametre` tablosu bu veritabanında **0 satır**. Kural " +
          "değerleri `packages/rules/src/parametreler.ts` içindeki tarihli tablodan geliyor; " +
          "DB kopyası henüz derlenmemiş. Bu bir tutarsızlık riskidir (tek kaynak ilkesi) — " +
          "pipeline'ın bu tabloyu doldurması gerekir.",
      );
      push();
    }
    push(
      `**Kapsam (ÖLÇÜLDÜ):** ${total} senaryonun **${answered}**'i doğrudan yanıt üretti, ` +
        `**${clarify}**'i \`BELİRSİZ DÜĞÜM\` (\"hangi konu?\") netleştirmesi istedi, ` +
        `**${fallback}**'i \`DUGUM_BULUNAMADI\` fallback'ine düştü. Netleştirme ve fallback, ` +
        `ontoloji o konuyu tanımıyorsa **doğru** davranıştır (yanlış düğüme emin cevap vermekten ` +
        `iyidir) ama kapsam boşluğu olarak raporlanır.`,
    );
    const fb = (m.scenarios ?? []).filter((x) => x.fallback === true).map((x) => `\`${x.id}\``);
    if (fb.length > 0) push(`Fallback senaryoları: ${fb.join(", ")}`);
    push();

    // citation resolvability: every id must exist in the measured DB
    if (dbPath !== "") {
      const allIds = new Set<string>();
      for (const sc of m.scenarios ?? []) for (const id of sc.citationIds) allIds.add(id);
      let resolvable = 0;
      const unresolved: string[] = [];
      try {
        const db = new DatabaseSync(dbPath, { readOnly: true });
        const exists = (table: string, id: string): boolean => {
          try {
            return db.prepare(`select 1 as x from ${table} where id = ?`).get(id) !== undefined;
          } catch {
            return false;
          }
        };
        for (const id of allIds) {
          // versioned ids look like m:6502/11@2014-05-28 — resolve the base id
          const base = id.replace(/@\d{4}-\d{2}-\d{2}$/, "");
          let ok = false;
          if (base.startsWith("m:")) ok = exists("madde", base);
          else if (base.startsWith("k:")) ok = exists("karar", base);
          else if (/^(t|s)\//.test(base)) ok = exists("dugum", base);
          else if (base.startsWith("a:")) ok = exists("arguman", base);
          if (ok) resolvable++;
          else unresolved.push(id);
        }
        db.close();
      } catch (err) {
        unresolved.push(`db okunamadı: ${(err as Error).message}`);
      }
      push(
        `**Atıf çözümlenebilirliği (ÖLÇÜLDÜ):** yanıtlarda geçen **${allIds.size}** benzersiz kimliğin ` +
          `**${resolvable}**'i ölçülen veritabanında bulundu.`,
      );
      if (unresolved.length > 0) {
        push(
          `Çözümlenemeyen ${unresolved.length} kimlik: ` +
            unresolved.slice(0, 20).map((x) => `\`${x}\``).join(", ") +
            (unresolved.length > 20 ? " …" : ""),
        );
      }
      push();
    }
  }

  /* --------------------- db comparison (if measured) ------------------- */

  let files: string[] = [];
  try {
    files = readdirSync(benchPath("results")).filter(
      // measurement-run*.json are latency repeats of the same DB; they are
      // summarised in the "Ölçüm tekrarı" line, not as separate DB rows.
      (f) => /^measurements.*\.json$/.test(f) && !/^measurements-run/.test(f),
    );
  } catch {
    files = [];
  }
  const comparisons: Array<{ file: string; db: string; answered: number; fallback: number; tokens: number; p50: number; p95: number; when: string }> = [];
  for (const f of files) {
    const rec = readJson<Measurements>(benchPath("results", f));
    if (rec === null || rec.status !== "ok" || rec.summary === undefined) continue;
    comparisons.push({
      file: f,
      db: (rec.server?.db ?? "—").replace(repoShort(), ""),
      answered: rec.summary.answered ?? 0,
      fallback: rec.summary.fallback ?? 0,
      tokens: rec.summary.resultTokensMedian,
      p50: rec.summary.latencyP50,
      p95: rec.summary.latencyP95,
      when: rec.measuredAt ?? "—",
    });
  }
  // one row per DB: keep the most recent measurement of each path
  const byDb = new Map<string, (typeof comparisons)[number]>();
  for (const c of comparisons) {
    const prev = byDb.get(c.db);
    // measurements.json is the recorded snapshot; keep it over ad-hoc re-runs
    if (prev === undefined) byDb.set(c.db, c);
    else if (prev.file !== "measurements.json" && c.file === "measurements.json") byDb.set(c.db, c);
    else if (prev.file !== "measurements.json" && c.file !== "measurements.json" && c.when > prev.when)
      byDb.set(c.db, c);
  }
  const uniqueComparisons = [...byDb.values()].sort((a, b) => a.db.localeCompare(b.db));
  if (uniqueComparisons.length > 1) {
    push("## 4. Veritabanı karşılaştırması (aynı sunucu, farklı korpus)");
    push();
    push(
      "Sunucu aynı; yalnızca `HUKUK_DB` değişiyor. Bu tablo, cevap kalitesinin koddan çok " +
        "**korpusun doluluğuna** bağlı olduğunu gösterir. Hepsi ÖLÇÜLDÜ.",
    );
    push();
    push(
      mdTable(
        ["veritabanı", "yanıt", "fallback", "yanıt tok (p50)", "p50 ms", "p95 ms", "ölçüm"],
        uniqueComparisons.map((c) => [
          `\`${c.db}\``,
          `${c.answered}`,
          `${c.fallback}`,
          `${c.tokens}`,
          `${c.p50}`,
          `${c.p95}`,
          c.when,
        ]),
      ),
    );
    push();
  }

  push("## 5. Yöntem");
  push();
  push("**Bizim taraf (ÖLÇÜLDÜ).** `bench/measure.ts` sunucuyu gerçek bir MCP istemcisi gibi " +
    "başlatır (`StdioClientTransport`), `tools/list` payload'ını alır, her senaryo için " +
    "`hukuk_sor` çağırır ve dönen metnin token'ını `gpt-tokenizer` ile sayar. Gecikme duvar " +
    "saatiyle ölçülür; ilk çağrı JIT/ısınma etkisini dışlamak için tekrarlanır (`--iterations`).");
  push();
  push("**Taban taraf (BELGE + TAHMİN).** Rakibin araç yüzeyi, kamuya açık dokümandaki araç " +
    "sayısı ve parametre listelerinden yeniden kurulur; açıklamalar eklenmez (alt sınır). " +
    "Sorgu başına çağrı zinciri ve canlı tur süresi varsayımdır ve `bench/baseline.ts` içinde " +
    "tek tek sabit olarak yazılıdır. Rakip gecikmesi **ölçülmedi**.");
  push();
  push("**Varsayımlar (tamamı `bench/baseline.ts` içinde):**");
  push();
  push(
    mdTable(
      ["varsayım", "değer", "kaynak"],
      [
        ["arama başına sonuç", `${b.anchors.hitsPerSearch}`, "TAHMİN"],
        ["sonuç başına metadata", `${b.anchors.metadataTokensPerHit} token`, "TAHMİN"],
        ["snapshot/snippet", `${b.anchors.snippet.chars} karakter ≈ ${b.anchors.snippet.tokens} token`, b.anchors.snippet.evidence],
        ["tam karar metni", `${b.anchors.corpus.medianDocTokens} token (medyan)`, `${b.anchors.corpus.label} — kendi korpusumuz`],
        ["sorgu başına çağrı (standart)", `${b.anchors.callsStandard}`, "TAHMİN"],
        ["sorgu başına çağrı (iyimser)", `${b.anchors.callsOptimistic}`, "TAHMİN"],
        ["canlı tur süresi", `${b.anchors.roundTripMs} ms`, b.anchors.rttSource],
        ["çağrı başına ayrıştırma", `${b.anchors.parseMsPerCall} ms`, "TAHMİN"],
      ],
    ),
  );
  push();

  /* ------------------------------ reproduce --------------------------- */

  push("## 6. Yeniden üretim");
  push();
  push("```bash");
  push("# 0) bağımlılıklar (gpt-tokenizer + MCP SDK zaten kök package.json'da)");
  push("pnpm install");
  push("");
  push("# 1) korpus (gerçek db varsa atlanır; yoksa fixture + gerçek mevzuat birleştirilir)");
  push("node bench/merge-dbs.ts              # -> bench/results/merged.db (data/build'e dokunmaz)");
  push("");
  push("# 2) bizim sunucu (server yoksa PENDING kaydı yazar, çıkış kodu 0)");
  push("node bench/measure.ts --db data/build/hukuk.db --iterations 20   # --only <id> --verbose");
  push("");
  push("# 3) rakip alt sınırı (ağ gerekmez)");
  push("node bench/baseline.ts               # --live-rtt ile tek istek ölçümü (1 req/s, kendi UA)");
  push("");
  push("# 4) raporu yeniden üret (tip kontrolü kaydı bench.ts içinde)");
  push("node bench/report.ts");
  push("```");
  push();
  push("Tek komut: `node bench/bench.ts` (sırayla typecheck → measure → baseline → report).");
  push();

  /* ----------------------------- limitations -------------------------- */

  push("## 7. Sınırlar (dürüstlük bölümü)");
  push();
  let lim = 0;
  const limit = (text: string): void => {
    push(`${++lim}. ${text}`);
  };
  limit(
    "**Rakip gecikmesi ölçülmedi.** Taban süre sütunu varsayılan tur süresiyle modellenmiştir. " +
      "`--live-rtt` yalnızca *bu ağdan mevzuat.gov.tr'ye tek isteğin* süresini ölçer; rakip " +
      "sunucunun uçtan uca süresi değildir.",
  );
  limit(
    "**Rakip şemaları açıklamasız kuruldu.** Gerçek payload daha büyüktür; tablo alt sınırdır. " +
      "Açıklama payı için dayanak'ın belgelenmiş 20.000 karakter docstring bütçesi ayrıca raporlanır.",
  );
  limit(
    "**Senaryolar 5 aracın kapsamına göre seçildi** ve `bugun` sabitlendi (2026-10-22). " +
      "Farklı bir gün, kural sonuçlarını değiştirir; token/gidiş-dönüş sayılarını değiştirmez.",
  );
  limit(
    "**Ölçüm yerel stdio üzerindedir.** Ağ taşıması (streamable-http) ve istemci tarafı model " +
      "gecikmesi kapsam dışıdır.",
  );
  limit(
    "**Korpus hareketli bir hedefti.** Ölçüm tek bir DB sürümüne (`meta.surum`, yukarıda) aittir; " +
      "korpus derlemesi sürerken yeniden üretim farklı satır sayıları verebilir. Bu yüzden her " +
      "ölçüm kendi DB hash'ini ve sürümünü taşır.",
  );
  if (tc !== null && !tc.ok) {
    limit(
      `**Tip kontrolü ölçüm anında kırmızıydı** (${tc.errorCount} hata, ` +
        `${[...new Set(tc.errors.map((e) => e.split("(")[0] ?? e))].slice(0, 2).join(", ")}). ` +
        "Çalışma zamanını etkilemez (type stripping) ama \"typecheck yeşil\" denemez.",
    );
  }
  limit(
    "**Token sayısı `gpt-tokenizer` (cl100k_base) iledir.** Başka bir modelin tokenizer'ı farklı " +
      "sayar; sunucunun bütçesi de bu tokenizer'a göre tanımlıdır, bu yüzden iç tutarlılık var, " +
      "modeller arası karşılaştırma için +-%10 oynama beklenmelidir.",
  );
  push();

  if (!measured) {
    push("## 8. PENDING — ne bekleniyor");
    push();
    push(
      `Sunucu girişi \`${m?.expectedServerPath ?? "packages/mcp-server/src/index.ts"}\` henüz yok ` +
        `(\`measurements.json\` durumu: ${m?.status ?? "yok"}). ` +
        "Sunucu eklendiğinde `node bench/bench.ts` çalıştırılır ve bu bölüm gerçek sayılarla değişir.",
    );
    push();
  } else {
    const samples = (m?.scenarios ?? []).slice(0, 4);
    push("## 8. Örnek yanıt (kırpılmış)");
    push();
    for (const s of samples) {
      push(`**${s.id}** — ${s.tokensMedian} token, ${s.latencyP50} ms, bütçe içinde: ${s.withinBudget === true ? "evet" : "hayır"}`);
      push();
      push("```text");
      push(s.preview);
      push("```");
      push();
    }
  }

  push("---");
  push();
  push(
    `Üretim: \`node bench/report.ts\` · Taban modeli: \`bench/baseline.ts\` · ` +
      `Senaryolar: \`bench/scenarios.jsonl\` (${scenarios.length} adet) · Rapor zamanı: ${nowIso()}`,
  );

  const outPath = benchPath("report.md");
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`rapor yazıldı -> ${outPath}`);
  if (measured) {
    console.log(
      `başlık: ${ours?.tools} araç / ${ours?.toolDefinitionTokens} token tanım · ` +
        `${ours?.resultTokensMedian} token yanıt · p50 ${ours?.latencyP50} ms`,
    );
  } else {
    console.log("başlık: PENDING (sunucu yok) — baseline tablosu yine de üretildi");
  }
}

main();
