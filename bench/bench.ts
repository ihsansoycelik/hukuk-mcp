/**
 * bench/bench.ts — one command that runs the whole measurement.
 *
 *   node bench/bench.ts               # measure -> baseline -> report
 *   node bench/bench.ts --skip-measure # only baseline + report (e.g. no network)
 *
 * `measure` is allowed to report PENDING (exit 0) when the server is not ready;
 * in that case baseline + report still run and the report table stays PENDING.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { benchPath, nowIso, repoRoot, writeJson, resultsPath } from "./util.ts";

function run(script: string, extra: string[]): number {
  const path = benchPath(script);
  if (!existsSync(path)) {
    console.error(`bench adımı yok: ${path}`);
    return 1;
  }
  console.log(`\n=== ${script} ===`);
  const res = spawnSync(process.execPath, [path, ...extra], {
    cwd: repoRoot(),
    stdio: "inherit",
  });
  return res.status ?? 1;
}

/** Record whether `tsc --noEmit` is green, so report.md can state it without guessing. */
function typecheck(): number {
  console.log("\n=== tsc --noEmit ===");
  const bin = existsSync(`${repoRoot()}/node_modules/.bin/tsc`)
    ? `${repoRoot()}/node_modules/.bin/tsc`
    : "tsc";
  const res = spawnSync(bin, ["--noEmit", "-p", "tsconfig.json"], {
    cwd: repoRoot(),
    encoding: "utf8",
  });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  const errors = out.split("\n").filter((l) => l.includes("error TS"));
  writeJson(resultsPath("typecheck.json"), {
    ok: (res.status ?? 1) === 0,
    checkedAt: nowIso(),
    errorCount: errors.length,
    errors: errors.slice(0, 20),
    command: "node_modules/.bin/tsc --noEmit -p tsconfig.json",
  });
  const ok0 = (res.status ?? 1) === 0;
  console.log(ok0 ? "yeşil (0 hata)" : `KIRMIZI (${errors.length} hata)`);
  return res.status ?? 1;
}

const argv = process.argv.slice(2);
let code = 0;
if (!argv.includes("--skip-measure")) {
  const measureCode = run("measure.ts", argv.filter((a) => a.startsWith("--iterations") || a.startsWith("--verbose")));
  // 0 = measured or pending; 1 = hard failure — keep going so the report is honest.
  if (measureCode !== 0) {
    console.error("measure adımı hata verdi; yine de taban + rapor üretiliyor.");
    code = measureCode;
  }
}
code = typecheck() || code;
code = run("baseline.ts", argv.filter((a) => a === "--live-rtt")) || code;
code = run("report.ts", []) || code;
process.exit(code);
