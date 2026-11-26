#!/usr/bin/env node
/**
 * Builds the publishable npm package into dist-npm/.
 *
 *   node scripts/build-npm.ts            # needs data/build/hukuk.db
 *   cd dist-npm && npm publish
 *
 * Layout of the package (paths matter: the ontology loaders read YAML from
 * `<dist>/../`, so the YAML files sit at the package root):
 *
 *   dist-npm/
 *     package.json  README.md  LICENSE  DATA-LICENSE.md
 *     dist/index.js            single-file ESM bundle (MCP SDK, zod, yaml, tokenizer inlined)
 *     tuketici.yaml sgk.yaml   ontology trees
 *     cards/*.yaml             hand-written cards
 *     data/hukuk.db            compiled corpus (read-only SQLite)
 */
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist-npm");
const DB = process.env.HUKUK_DB ?? join(ROOT, "data", "build", "hukuk.db");
const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };

if (!existsSync(DB)) {
  process.stderr.write(`korpus yok: ${DB}\nÖnce: uv run python pipeline/build.py\n`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "dist"), { recursive: true });
mkdirSync(join(OUT, "data"), { recursive: true });

await build({
  entryPoints: [join(ROOT, "packages", "mcp-server", "src", "cli.ts")],
  outfile: join(OUT, "dist", "index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false,
  legalComments: "external",
  // CJS deps inside an ESM bundle need a real `require`.
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module';",
      "const require = __cr(import.meta.url);",
    ].join("\n"),
  },
  define: { __HUKUK_VERSION__: JSON.stringify(rootPkg.version) },
  logLevel: "warning",
});

const ont = join(ROOT, "packages", "ontology");
cpSync(join(ont, "tuketici.yaml"), join(OUT, "tuketici.yaml"));
cpSync(join(ont, "sgk.yaml"), join(OUT, "sgk.yaml"));
cpSync(join(ont, "cards"), join(OUT, "cards"), { recursive: true });
cpSync(DB, join(OUT, "data", "hukuk.db"));
for (const f of ["README.md", "LICENSE", "DATA-LICENSE.md"]) {
  if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(OUT, f));
}

const pkg = {
  name: "hukuk-mcp",
  version: rootPkg.version,
  description:
    "Türk hukukunu vatandaşa çeviren MCP sunucusu: tüketici hukuku ve SGK. Kaynaklı, süreleri kuralla hesaplanmış, tek çağrılık yanıt. LLM'siz, çevrimdışı.",
  type: "module",
  bin: { "hukuk-mcp": "dist/index.js" },
  files: ["dist", "data", "cards", "tuketici.yaml", "sgk.yaml", "README.md", "LICENSE", "DATA-LICENSE.md"],
  engines: { node: ">=22.13" },
  keywords: [
    "mcp", "model-context-protocol", "turkish-law", "türk-hukuku", "tüketici", "tuketici-hukuku",
    "sgk", "6502", "legal", "claude", "mcp-server",
  ],
  license: "MIT",
  repository: { type: "git", url: "git+https://github.com/ihsansoycelik/hukuk-mcp.git" },
  homepage: "https://github.com/ihsansoycelik/hukuk-mcp#readme",
  bugs: { url: "https://github.com/ihsansoycelik/hukuk-mcp/issues" },
  mcpName: "io.github.ihsansoycelik/hukuk-mcp",
};
writeFileSync(join(OUT, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

const mb = (p: string): string => (statSync(p).size / 1e6).toFixed(1) + " MB";
process.stderr.write(`dist-npm hazır · bundle ${mb(join(OUT, "dist", "index.js"))} · db ${mb(join(OUT, "data", "hukuk.db"))}\n`);
