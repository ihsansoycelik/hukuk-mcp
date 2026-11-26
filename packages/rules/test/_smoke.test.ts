import test from "node:test";
import assert from "node:assert/strict";
import { kuralCalistir, VARSAYILAN_OKUYUCU, ORNEK_GIRDI, KURALLAR } from "../src/index.ts";

test("smoke: every rule runs with sample input", () => {
  for (const id of Object.keys(KURALLAR)) {
    const r = kuralCalistir(id, ORNEK_GIRDI[id], VARSAYILAN_OKUYUCU, "2026-10-22");
    assert.ok(r.sonuc !== "belirsiz", `${id}: ${JSON.stringify(r.eksik_girdiler)} ${r.uyarilar.join("|")}`);
    assert.ok(r.dayanak.length > 0, `${id} dayanak`);
  }
});
