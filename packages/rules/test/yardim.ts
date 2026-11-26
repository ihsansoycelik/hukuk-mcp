/** Test yardımcıları (test dosyası değil; `*.test.ts` glob'una girmez). */
import assert from "node:assert/strict";
import type { KuralSonucu } from "@hukuk/schema";
import { kuralCalistir, VARSAYILAN_OKUYUCU } from "../src/index.ts";

export const BUGUN = "2026-10-22";

export interface Vaka {
  ad: string;
  girdi: unknown;
  bugun?: string;
  sonuc: KuralSonucu["sonuc"];
  dayanak?: string[];
  onay?: KuralSonucu["onay_durumu"];
  uyariIcerir?: string[];
  eksik?: string[];
  kisaIcerir?: string;
}

export function calistir(kuralId: string, girdi: unknown, bugun = BUGUN): KuralSonucu {
  return kuralCalistir(kuralId, girdi, VARSAYILAN_OKUYUCU, bugun);
}

/** Tablo satırlarını tek tek çalıştırır; her satır için tüm beklentileri doğrular. */
export function vakalariDogrula(kuralId: string, vakalar: Vaka[]): void {
  for (const v of vakalar) {
    const r = calistir(kuralId, v.girdi, v.bugun ?? BUGUN);
    const etiket = `${kuralId} / ${v.ad}`;
    assert.deepEqual(r.sonuc, v.sonuc, `${etiket}: sonuc`);
    for (const d of v.dayanak ?? []) {
      assert.ok(r.dayanak.includes(d), `${etiket}: dayanak ${d} yok -> ${JSON.stringify(r.dayanak)}`);
    }
    if (v.onay) assert.equal(r.onay_durumu, v.onay, `${etiket}: onay`);
    for (const u of v.uyariIcerir ?? []) {
      assert.ok(
        r.uyarilar.some((x) => x.includes(u)),
        `${etiket}: uyarı '${u}' yok -> ${JSON.stringify(r.uyarilar)}`,
      );
    }
    for (const e of v.eksik ?? []) {
      assert.ok(
        r.eksik_girdiler.some((x) => x.includes(e)),
        `${etiket}: eksik '${e}' yok -> ${JSON.stringify(r.eksik_girdiler)}`,
      );
    }
    if (v.kisaIcerir) assert.ok(r.kisa.includes(v.kisaIcerir), `${etiket}: kisa`);
    // Sözleşme alanları her zaman dolu (dizi) olmalı.
    for (const alan of ["dayanak", "varsayimlar", "eksik_girdiler", "uyarilar"] as const) {
      assert.ok(Array.isArray(r[alan]), `${etiket}: ${alan} dizi değil`);
    }
    assert.equal(typeof r.parametre_surumu, "string");
    assert.ok(r.parametre_surumu.length > 0, `${etiket}: parametre_surumu boş`);
  }
}

export function sayiMi(r: KuralSonucu): number {
  assert.equal(typeof r.sonuc, "number", `sonuç sayı değil: ${JSON.stringify(r.sonuc)}`);
  return r.sonuc as number;
}

export function tarihMi(r: KuralSonucu): string {
  assert.ok(
    typeof r.sonuc === "object" && r.sonuc !== null && "tarih" in r.sonuc,
    `sonuç tarih değil: ${JSON.stringify(r.sonuc)}`,
  );
  return r.sonuc.tarih;
}
