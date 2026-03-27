/**
 * VaultSpark Football GM — esbuild Frontend Bundle Script
 *
 * Bundles and minifies the browser-facing JS/CSS using esbuild.
 * Produces a production-optimised artifact set in static/.
 *
 * Before using: npm install --save-dev esbuild
 *
 * Replaces the raw file-copy approach in build-pages.mjs for JS/CSS.
 * HTML injection and module-graph copy still runs from build-pages.mjs.
 *
 * Output targets:
 *   public/app.js   → static/app.js       (bundled + minified)
 *   public/setup.js → static/setup.js     (bundled + minified)
 *   public/styles.css → static/styles.css (processed + minified)
 *
 * Usage:
 *   node scripts/build-bundle.mjs
 *   node scripts/build-bundle.mjs --watch
 *   ANALYZE=1 node scripts/build-bundle.mjs  (print bundle size report)
 */

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir   = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const outDir    = path.join(rootDir, "static");

const isWatch   = process.argv.includes("--watch");
const isAnalyze = process.env.ANALYZE === "1";
const slug = process.env.GAME_SLUG || "vaultspark-football-gm";
const basePath = `/${slug}/`;

// ── Dynamic import of esbuild (gracefully degrade if not installed) ───────────

async function loadEsbuild() {
  try {
    const require = createRequire(import.meta.url);
    return require("esbuild");
  } catch {
    console.warn("[build-bundle] esbuild not found. Run: npm install --save-dev esbuild");
    console.warn("[build-bundle] Falling back to build:pages (file copy only).");
    return null;
  }
}

// ── Build options ─────────────────────────────────────────────────────────────

function jsBuildOptions(entryFile, outFile) {
  return {
    entryPoints: [entryFile],
    bundle: true,
    minify: true,
    sourcemap: true,
    format: "esm",
    target: ["es2020"],
    outfile: outFile,
    // Treat node: built-ins as external (not needed in browser)
    external: ["node:*", "path", "fs", "url", "os", "crypto"],
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.GAME_SLUG": JSON.stringify(slug),
      "process.env.VSFGM_BASE_PATH": JSON.stringify(basePath)
    },
    logLevel: "info",
    metafile: isAnalyze
  };
}

function cssBuildOptions(entryFile, outFile) {
  return {
    entryPoints: [entryFile],
    bundle: true,
    minify: true,
    outfile: outFile,
    logLevel: "info"
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const esbuild = await loadEsbuild();
  if (!esbuild) process.exit(0); // graceful degradation

  await fs.mkdir(outDir, { recursive: true });

  const builds = [
    jsBuildOptions(
      path.join(publicDir, "app.js"),
      path.join(outDir, "app.js")
    ),
    jsBuildOptions(
      path.join(publicDir, "setup.js"),
      path.join(outDir, "setup.js")
    ),
    cssBuildOptions(
      path.join(publicDir, "styles.css"),
      path.join(outDir, "styles.css")
    )
  ];

  if (isWatch) {
    console.log("[build-bundle] Watch mode — rebuilding on changes...");
    const contexts = await Promise.all(builds.map((opts) => esbuild.context(opts)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    return; // keep process alive
  }

  const results = await Promise.all(builds.map((opts) => esbuild.build(opts)));

  if (isAnalyze) {
    for (const result of results) {
      if (result.metafile) {
        const report = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
        console.log(report);
      }
    }
  }

  // Print size summary
  console.log("\n[build-bundle] Bundle sizes:");
  const files = [
    path.join(outDir, "app.js"),
    path.join(outDir, "setup.js"),
    path.join(outDir, "styles.css")
  ];
  for (const file of files) {
    try {
      const stat = await fs.stat(file);
      const kb = (stat.size / 1024).toFixed(1);
      console.log(`  ${path.basename(file)}: ${kb} KB`);
    } catch { /* file may not exist on CSS-only builds */ }
  }

  console.log("\n[build-bundle] Done. Run build:pages to inject HTML metadata.");
}

main().catch((err) => {
  console.error("[build-bundle] Build failed:", err);
  process.exitCode = 1;
});
