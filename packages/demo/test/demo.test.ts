/**
 * The demo is a public surface, so the tests are about the contract a stranger
 * experiences: the unlisted path, the form, the size and rate limits, and the
 * privacy headers. They run against the same fixture corpus as the MCP e2e tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { corpusPort, kuralPort } from "@hukuk/mcp-server/adapters";
import { olusturDemoSunucu, type DemoSunucuAyari } from "../src/server.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DB = join(ROOT, "data/build/fixture.db");
const TOKEN = "test-token-0123456789abcdef";

interface Kosan {
  taban: string;
  kapat: () => Promise<void>;
}

async function sunucuBaslat(ek: Partial<DemoSunucuAyari> = {}): Promise<Kosan> {
  const corpus = corpusPort(DB);
  const kural = await kuralPort(DB);
  const sunucu: Server = olusturDemoSunucu(corpus, kural, { token: TOKEN, ...ek });
  await new Promise<void>((c) => sunucu.listen(0, "127.0.0.1", () => c()));
  const { port } = sunucu.address() as AddressInfo;
  return {
    taban: `http://127.0.0.1:${port}`,
    kapat: () =>
      new Promise<void>((c) => {
        sunucu.close(() => {
          corpus.close();
          c();
        });
      }),
  };
}

async function formGonder(taban: string, alanlar: Record<string, string>, fazla = "") {
  return fetch(`${taban}/${TOKEN}/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(alanlar).toString() + fazla,
  });
}

test("bilinmeyen yol 404 döner ve var olan bir yol hakkında ipucu vermez", async (t) => {
  if (!existsSync(DB)) return t.skip("fixture.db yok: node packages/mcp-server/test/make-fixture.ts");
  const s = await sunucuBaslat();
  try {
    for (const yol of ["/", "/rastgele", `/${TOKEN}x/`]) {
      const r = await fetch(`${s.taban}${yol}`);
      assert.equal(r.status, 404, `${yol} 404 olmalı`);
      const g = await r.text();
      assert.doesNotMatch(g, /form|Hukuk asistanı/);
    }
  } finally {
    await s.kapat();
  }
});

test("gizli yolda form açılır, güvenlik başlıkları gelir", async (t) => {
  if (!existsSync(DB)) return t.skip("fixture.db yok");
  const s = await sunucuBaslat();
  try {
    const r = await fetch(`${s.taban}/${TOKEN}/`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /text\/html/);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.match(r.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    assert.match(r.headers.get("x-robots-tag") ?? "", /noindex/);
    assert.equal(r.headers.get("set-cookie"), null, "çerez yazılmamalı");
    const g = await r.text();
    assert.match(g, new RegExp(`action="/${TOKEN}/"`));
    assert.match(g, /<form method="post"/);
  } finally {
    await s.kapat();
  }
});

test("gerçek soru etiketli yanıt üretir", async (t) => {
  if (!existsSync(DB)) return t.skip("fixture.db yok");
  const s = await sunucuBaslat();
  try {
    const r = await formGonder(s.taban, {
      ozet: "Bayiden aldığım aracın şanzımanı 3 ayda 4 kez arıza yaptı, paramı geri alabilir miyim?",
      urun_hizmet: "oto",
      tutar_tl: "250000",
    });
    assert.equal(r.status, 200);
    const g = await r.text();
    assert.match(g, /DÜĞÜM t\/ayipli-mal\/arac/);
    assert.match(g, /\[m:6502\/11\]/);
    assert.match(g, /Yeni bir soru sor/);
  } finally {
    await s.kapat();
  }
});

test("boş özet 400, aşırı büyük gövde 413", async (t) => {
  if (!existsSync(DB)) return t.skip("fixture.db yok");
  const s = await sunucuBaslat();
  try {
    const bos = await formGonder(s.taban, { ozet: "   " });
    assert.equal(bos.status, 400);

    const buyuk = await formGonder(s.taban, { ozet: "a" }, "x".repeat(9000));
    assert.equal(buyuk.status, 413);
  } finally {
    await s.kapat();
  }
});

test("IP başına hız sınırı uygulanır", async (t) => {
  if (!existsSync(DB)) return t.skip("fixture.db yok");
  const s = await sunucuBaslat({ hizSiniri: { adet: 2, pencereMs: 60_000 } });
  try {
    const sor = { ozet: "ayıplı mal" };
    assert.equal((await formGonder(s.taban, sor)).status, 200);
    assert.equal((await formGonder(s.taban, sor)).status, 200);
    const ucuncu = await formGonder(s.taban, sor);
    assert.equal(ucuncu.status, 429);
    const metin = await ucuncu.text();
    assert.match(metin, /Çok hızlı soruyorsunuz/);
    // hız sınırı yanıtı da sızdırmamalı: soru metni sayfada yok
    assert.doesNotMatch(metin, /ayıplı/);
  } finally {
    await s.kapat();
  }
});

test("sağlık ucu sürüm ve kural durumu verir", async (t) => {
  if (!existsSync(DB)) return t.skip("fixture.db yok");
  const s = await sunucuBaslat();
  try {
    const r = await fetch(`${s.taban}/${TOKEN}/saglik`);
    assert.equal(r.status, 200);
    const j = (await r.json()) as { durum: string; surum: string; kurallar: boolean };
    assert.equal(j.durum, "hazir");
    assert.ok(j.surum.startsWith("v"));
    assert.equal(typeof j.kurallar, "boolean");
  } finally {
    await s.kapat();
  }
});

test("kısa token ile sunucu açılmaz", async () => {
  const corpus = corpusPort(DB);
  const kural = await kuralPort(DB);
  try {
    assert.throws(() => olusturDemoSunucu(corpus, kural, { token: "kisa" }), /DEMO_TOKEN/);
  } finally {
    corpus.close();
  }
});
