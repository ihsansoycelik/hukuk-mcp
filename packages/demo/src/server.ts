/**
 * Public demo surface — the same deterministic core as the MCP server, reached
 * over plain HTTP so a friend with a phone can try it without installing
 * anything.
 *
 * Design constraints (see ADR-006):
 *  - the URL carries a secret path segment; there is no index and no navigation
 *    from anywhere else, so the page is "unlisted" rather than merely unlinked;
 *  - no JavaScript, no cookies, no third-party requests, so a CSP of
 *    `default-src 'none'` holds;
 *  - the question is never written to disk or to logs;
 *  - a request costs CPU, so per-IP rate limiting is part of the contract.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { HukukSorInput } from "@hukuk/schema";
import { hukukSor, yeniOturum } from "@hukuk/mcp-server/hukukSor";
import type { CorpusPort, KuralPort } from "@hukuk/mcp-server/ports";
import { bulunamadiSayfasi, formSayfasi, hataSayfasi, sonucSayfasi } from "./sayfa.ts";

/** Max form body: the textarea is capped at 400 chars, the rest is small. */
const GOVDE_SINIRI = 8 * 1024;

/** Defaults: comfortable for a person testing, hostile to a script. */
const VARSAYILAN_HIZ = { adet: 12, pencereMs: 60_000 };

export interface DemoSunucuAyari {
  /** Secret path segment; must match /^[A-Za-z0-9_-]{16,64}$/. */
  token: string;
  hizSiniri?: { adet: number; pencereMs: number };
  /** Injectable clock so rate-limit tests do not sleep. */
  simdi?: () => number;
  /** Receives one line per request; must never receive the question text. */
  logla?: (satir: string) => void;
}

function basliklar(res: ServerResponse, tur: string, kod: number): void {
  res.writeHead(kod, {
    "content-type": tur,
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "cache-control": "no-store",
  });
}

function html(res: ServerResponse, kod: number, govde: string): void {
  basliklar(res, "text/html; charset=utf-8", kod);
  res.end(govde);
}

function json(res: ServerResponse, kod: number, govde: unknown): void {
  basliklar(res, "application/json; charset=utf-8", kod);
  res.end(JSON.stringify(govde));
}

function govdeOku(req: IncomingMessage, sinir: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const parcalar: Buffer[] = [];
    let boyut = 0;
    let bitti = false;
    req.on("data", (parca: Buffer) => {
      if (bitti) return;
      boyut += parca.length;
      if (boyut > sinir) {
        bitti = true;
        reject(new Error("GOVDE_COK_BUYUK"));
        req.resume(); // drain, never destroy mid-body: the 413 must still be delivered
        return;
      }
      parcalar.push(parca);
    });
    req.on("end", () => {
      if (!bitti) resolve(Buffer.concat(parcalar).toString("utf8"));
    });
    req.on("error", (e) => {
      if (!bitti) reject(e);
    });
  });
}

function ipAdresi(req: IncomingMessage): string {
  // The app binds to loopback behind a reverse proxy; Cloudflare adds this header.
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.length > 0 && cf.length < 64) return cf;
  return req.socket.remoteAddress ?? "bilinmeyen";
}

/** Sliding window, in memory, no persistence by design. */
class HizSiniri {
  private readonly kayit = new Map<string, number[]>();
  private readonly adet: number;
  private readonly pencereMs: number;

  constructor(adet: number, pencereMs: number) {
    this.adet = adet;
    this.pencereMs = pencereMs;
  }

  izin(ip: string, simdi: number): boolean {
    const eski = this.kayit.get(ip) ?? [];
    const gecerli = eski.filter((t) => simdi - t < this.pencereMs);
    if (gecerli.length >= this.adet) {
      this.kayit.set(ip, gecerli);
      return false;
    }
    gecerli.push(simdi);
    this.kayit.set(ip, gecerli);
    if (this.kayit.size > 5000) {
      for (const [k, v] of this.kayit) {
        if (v.every((t) => simdi - t >= this.pencereMs)) this.kayit.delete(k);
      }
    }
    return true;
  }
}

function sayiyaCevir(deger: string | null): number | undefined {
  if (deger === null) return undefined;
  const temiz = deger.trim();
  if (temiz === "") return undefined;
  const n = Number(temiz);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function tarihCevir(deger: string | null): string | undefined {
  if (deger === null) return undefined;
  const temiz = deger.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(temiz) ? temiz : undefined;
}

export function olusturDemoSunucu(
  corpus: CorpusPort,
  kural: KuralPort,
  ayar: DemoSunucuAyari,
): Server {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(ayar.token)) {
    throw new Error("DEMO_TOKEN en az 16 karakter olmalı (harf, rakam, - ve _)");
  }
  const kok = `/${ayar.token}`;
  const hiz = ayar.hizSiniri ?? VARSAYILAN_HIZ;
  const sinirlayici = new HizSiniri(hiz.adet, hiz.pencereMs);
  const simdi = ayar.simdi ?? (() => Date.now());
  const logla = ayar.logla ?? (() => {});

  /** Matches the secret root or a sub-page of it; never a prefix of another token. */
  function yolEslesir(pathname: string): "form" | "saglik" | null {
    if (pathname === kok || pathname === `${kok}/`) return "form";
    if (pathname === `${kok}/saglik`) return "saglik";
    return null;
  }

  return createServer((req, res) => {
    const baslangic = simdi();
    const url = new URL(req.url ?? "/", "http://yerel");
    const yol = yolEslesir(url.pathname);
    const ip = ipAdresi(req);

    res.on("finish", () => {
      // Method, status, path shape and duration only. No query, no body, no IP.
      logla(`${req.method} ${yol ?? "-"} ${res.statusCode} ${simdi() - baslangic}ms`);
    });

    if (yol === null) {
      html(res, 404, bulunamadiSayfasi());
      return;
    }

    if (yol === "saglik") {
      json(res, 200, {
        durum: "hazir",
        surum: corpus.yayinSurumu(),
        kurallar: kural.varMi("gorevli_merci"),
      });
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      html(res, 200, formSayfasi(ayar.token));
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, HEAD, POST");
      html(res, 405, formSayfasi(ayar.token, "Bu adres yalnızca form gönderimini kabul ediyor."));
      return;
    }

    if (!sinirlayici.izin(ip, baslangic)) {
      const { html: sayfa, kod } = hataSayfasi(
        ayar.token,
        "Çok hızlı soruyorsunuz. Bir dakika bekleyip tekrar deneyin.",
        429,
      );
      html(res, kod, sayfa);
      return;
    }

    govdeOku(req, GOVDE_SINIRI)
      .then((govde) => {
        const alanlar = new URLSearchParams(govde);
        const ozet = (alanlar.get("ozet") ?? "").trim();
        if (ozet.length === 0) {
          const { html: sayfa, kod } = hataSayfasi(ayar.token, "Önce yaşadığınızı yazmanız gerekiyor.");
          html(res, kod, sayfa);
          return;
        }
        const talep = alanlar.get("talep") ?? "";
        const rol = alanlar.get("kullanici_rolu") ?? "tuketici";
        const girdi = HukukSorInput.safeParse({
          ozet: ozet.slice(0, 400),
          urun_hizmet: (alanlar.get("urun_hizmet") ?? "").trim().slice(0, 80) || undefined,
          tutar_tl: sayiyaCevir(alanlar.get("tutar_tl")),
          olay_tarihi: tarihCevir(alanlar.get("olay_tarihi")),
          talep: talep === "" ? undefined : talep,
          kullanici_rolu: ["tuketici", "satici", "diger"].includes(rol) ? rol : "tuketici",
          butce: 1500,
        });
        if (!girdi.success) {
          const { html: sayfa, kod } = hataSayfasi(
            ayar.token,
            "Girdilerden biri anlaşılmadı. Tutarı sayı, tarihi gg.aa.yyyy biçiminde deneyin.",
          );
          html(res, kod, sayfa);
          return;
        }
        const t0 = simdi();
        try {
          const sonuc = hukukSor(girdi.data, corpus, kural, yeniOturum());
          html(res, 200, sonucSayfasi(ayar.token, sonuc.metin, simdi() - t0));
        } catch {
          // Never echo the error: it can contain corpus internals.
          const { html: sayfa, kod } = hataSayfasi(
            ayar.token,
            "Yanıt üretilemedi. Lütfen farklı bir cümleyle tekrar deneyin.",
            500,
          );
          html(res, kod, sayfa);
        }
      })
      .catch((err: unknown) => {
        const cokBuyuk = err instanceof Error && err.message === "GOVDE_COK_BUYUK";
        const { html: sayfa, kod } = hataSayfasi(
          ayar.token,
          cokBuyuk ? "Metin çok uzun. Kısaltıp tekrar deneyin." : "İstek okunamadı.",
          cokBuyuk ? 413 : 400,
        );
        html(res, kod, sayfa);
      });
  });
}
