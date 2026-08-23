import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertBrowserModuleReachability } from "./check-browser-module-reachability.mjs";
import { assertBrowserPromiseObservability } from "./check-browser-promise-observability.mjs";
import { assertApiContractParity } from "./check-api-contract-parity.mjs";
import { assertPublicFooterContract } from "./lib/public-footer.mjs";
import { assertPublicTruth } from "./check-public-truth.mjs";
import { emitEdgeSecurityPolicy } from "./lib/edge-security-policy.mjs";
import { emitServiceWorker, SW_REGISTRATION_SNIPPET } from "./lib/service-worker.mjs";
import { fingerprintArtifactDirectory } from "./lib/artifact-fingerprint.mjs";
import { staticGraphFor } from "./check-browser-boot-budget.mjs";
import { replaceSimulationAnchor, SIMULATION_ANCHOR_START } from "./lib/simulation-methodology.mjs";
// CANON-016: never the raw module — safe-spawn forces windowsHide so a build
// does not flash a console window per git call on Windows.
import { execFileSync } from "./lib/safe-spawn.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const srcDir = path.join(rootDir, "src");
const outDir = path.join(rootDir, "static");
const slug = process.env.GAME_SLUG || "franchise-architect-football";
const legacySlugs = [
  "vaultspark-football-gm",
  "franchise-architect",
  "games/vaultspark-football-gm",
  "games/franchise-architect",
  "games/franchise-architect-football"
];
const runtimeDefault = process.env.VSFGM_RUNTIME_DEFAULT || "client";
const explicitServerBaseUrl = (process.env.VITE_API_ORIGIN || "").trim()
  || (process.env.API_ORIGIN || "").trim()
  || (process.env.VITE_GAME_SERVICE_ORIGIN || "").trim()
  || ((process.env.API_DOMAIN || "").trim() ? `https://${String(process.env.API_DOMAIN).trim()}` : "");
const serverAvailable = explicitServerBaseUrl ? "true" : "false";
const browserEntryPoints = [path.join(srcDir, "app", "api", "localApiRuntime.js")];

// Cache-busting: playfranchisearchitect.com is Cloudflare-proxied with a 4h edge
// cache on styles.css and Cloudflare ignores query strings in its cache key, so
// `styles.css?v=` never busts. We emit a content-hashed copy (styles.<hash>.css)
// and point every HTML <link> at it, so each deploy that changes the theme
// serves fresh CSS via a brand-new URL (guaranteed cache miss) — no stale-theme
// window. styles.css is still emitted for back-compat / smoke assertions.
let hashedStyleHref = "styles.css";
let hashedCommunityStatsSrc = "community-stats.js";

// S94: module preload hints.
//
// Every page here loads its entry with <script type="module">, and a module's
// static imports are invisible to the browser's preload scanner — they are only
// discovered once the entry has been fetched, parsed, and its import list read.
// game.html's entry pulls a 49-module graph that way, so the browser spends a
// full round trip learning what it needs before it can begin fetching any of it.
// `rel="modulepreload"` moves that discovery into the HTML, where the scanner
// sees it immediately.
//
// The list is DERIVED from the same walk the boot-byte budget performs rather
// than hand-maintained, because a hand-maintained preload list is a second
// declaration of the boot graph and would drift from the first. Declared lazy
// roots are excluded and asserted absent: preloading a deliberately-lazy island
// would quietly pull it back onto the boot path and undo the island split
// without tripping the byte budget, which only measures the static graph.
const MODULE_PRELOAD_ENTRIES = Object.freeze({ "game.html": "app.js", "index.html": "setup.js" });
const modulePreloadLinks = new Map();

async function computeModulePreloads() {
  const manifest = JSON.parse(await fs.readFile(path.join(publicDir, "boot-manifest.json"), "utf8"));
  const lazyRoots = new Set(manifest.lazyRoots || []);
  for (const [page, entry] of Object.entries(MODULE_PRELOAD_ENTRIES)) {
    const graph = await staticGraphFor(entry);
    const leaked = graph.filter((module) => lazyRoots.has(module));
    if (leaked.length) {
      throw new Error(
        `modulepreload refuses to preload declared lazy roots reached from ${entry}: ${leaked.join(", ")}. ` +
        "Either the island regressed into the boot graph or boot-manifest.lazyRoots is stale."
      );
    }
    modulePreloadLinks.set(
      page,
      graph.map((module) => `    <link rel="modulepreload" href="./${module}" />`).join("\n")
    );
  }
  return modulePreloadLinks;
}
const htmlPages = [
  "index.html",
  "stats.html",
  "game.html",
  "about.html",
  "contact.html",
  "privacy.html",
  "terms.html",
  "status.html",
  "simulation.html",
  "404.html"
];

function normalizeBasePath(value) {
  const trimmed = String(value || "").trim() || `/${slug}/`;
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

const basePath = normalizeBasePath(process.env.VITE_APP_BASE_PATH || "/");
// The Studio host can mount this artifact at any declared alias. Keep browser
// assets relative to the document directory so the same HTML remains valid at
// /franchise-architect/, /games/franchise-architect/, and GitHub Pages paths.
const assetBasePath = "./";
const canonicalBase = process.env.VITE_CANONICAL_URL || `https://playfranchisearchitect.com${basePath}`;
const ogImageUrl = process.env.VITE_OG_IMAGE_URL || `https://playfranchisearchitect.com${basePath}images/cover.png`;
const publishedMounts = [...new Set([
  basePath,
  ...[slug, ...legacySlugs].map((mount) => normalizeBasePath(mount))
])];

async function ensureCleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

// Artifact determinism (S70): a Windows checkout carries CRLF text while CI's
// Linux checkout carries LF, so byte-identical trees produced different
// artifact fingerprints and production parity could never verify against a
// locally built expectation. Every text asset is normalized to LF at copy
// time, making the artifact platform-independent.
const TEXT_EXTENSIONS = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt", ".xml", ".webmanifest", ".md"]);

function isTextAsset(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()) || path.basename(filePath) === "_headers";
}

async function copyFileNormalized(source, destination) {
  if (!isTextAsset(source)) {
    await fs.copyFile(source, destination);
    return;
  }
  const content = await fs.readFile(source, "utf8");
  await fs.writeFile(destination, content.replace(/\r\n/g, "\n"), "utf8");
}

async function copyDir(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else if (entry.isFile()) await copyFileNormalized(from, to);
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveImport(fromFile, specifier) {
  const baseDir = path.dirname(fromFile);
  const candidates = [
    path.resolve(baseDir, specifier),
    path.resolve(baseDir, `${specifier}.js`),
    path.resolve(baseDir, specifier, "index.js")
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error(`Unable to resolve browser import '${specifier}' from ${fromFile}`);
}

function findRelativeImports(source) {
  const imports = [];
  const pattern = /\b(?:import|export)\b\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g;
  let match = pattern.exec(source);
  while (match) {
    const specifier = match[1];
    if (specifier.startsWith(".")) imports.push(specifier);
    match = pattern.exec(source);
  }
  return imports;
}

async function collectBrowserModuleGraph(entryPoints) {
  const visited = new Set();
  const queue = [...entryPoints];
  while (queue.length) {
    const current = queue.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const source = await fs.readFile(current, "utf8");
    for (const specifier of findRelativeImports(source)) {
      queue.push(await resolveImport(current, specifier));
    }
  }
  return visited;
}

async function copyBrowserModules() {
  const destinationRoot = path.join(outDir, "src");
  const browserModules = await collectBrowserModuleGraph(browserEntryPoints);
  for (const modulePath of browserModules) {
    const relativePath = path.relative(srcDir, modulePath);
    const destination = path.join(destinationRoot, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await copyFileNormalized(modulePath, destination);
  }
}

function injectHtmlDefaults(html, pagePath) {
  const canonicalUrl = new URL(pagePath, canonicalBase).toString();
  // Served HTML carries no development comments (internal sprint annotations
  // are for the source tree, not view-source on the product), and is always
  // LF-normalized so Windows and Linux builds emit identical bytes.
  let next = html.replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
  if (!next.includes("<base ")) {
    next = next.replace("<head>", `<head>\n    <base href=\"${assetBasePath}\" />`);
  }
  if (next.includes('meta name="vsfgm-runtime-default"')) {
    next = next.replace(
      /<meta name="vsfgm-runtime-default" content="[^"]*" \/>/,
      `<meta name="vsfgm-runtime-default" content="${runtimeDefault}" />`
    );
  } else {
    next = next.replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <meta name="vsfgm-runtime-default" content="${runtimeDefault}" />`
    );
  }
  if (next.includes('meta name="vsfgm-server-available"')) {
    next = next.replace(
      /<meta name="vsfgm-server-available" content="[^"]*" \/>/,
      `<meta name="vsfgm-server-available" content="${serverAvailable}" />`
    );
  } else {
    next = next.replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <meta name="vsfgm-server-available" content="${serverAvailable}" />`
    );
  }
  if (next.includes('meta name="vsfgm-server-base-url"')) {
    next = next.replace(
      /<meta name="vsfgm-server-base-url" content="[^"]*" \/>/,
      `<meta name="vsfgm-server-base-url" content="${explicitServerBaseUrl}" />`
    );
  } else {
    next = next.replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <meta name="vsfgm-server-base-url" content="${explicitServerBaseUrl}" />`
    );
  }
  if (hashedStyleHref !== "styles.css") {
    // Rewrite ./styles.css (optionally with an existing ?query) to the hashed file.
    next = next.replace(/href="\.\/styles\.css(?:\?[^"]*)?"/g, `href="./${hashedStyleHref}"`);
  }
  if (hashedCommunityStatsSrc !== "community-stats.js") {
    // Community Pulse updates must not inherit a stale custom-domain edge or
    // service-worker cache entry. A content-derived URL makes every copy
    // change a new request while keeping the source module readable in public/.
    next = next.replace(/src="\.\/community-stats\.js(?:\?[^"]*)?"/g, `src="./${hashedCommunityStatsSrc}"`);
  }
  if (!next.includes('rel="canonical"')) {
    next = next.replace("</title>", `</title>\n    <link rel=\"canonical\" href=\"${canonicalUrl}\" />`);
  }
  if (!next.includes('property="og:url"')) {
    next = next.replace("</title>", `</title>\n    <meta property=\"og:url\" content=\"${canonicalUrl}\" />`);
  } else {
    next = next.replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property=\"og:url\" content=\"${canonicalUrl}\" />`);
  }
  if (!next.includes('property="og:image"')) {
    next = next.replace("</title>", `</title>\n    <meta property=\"og:image\" content=\"${ogImageUrl}\" />`);
  } else {
    next = next.replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property=\"og:image\" content=\"${ogImageUrl}\" />`);
  }
  // S94: the methodology page's figures are rendered from the simulation's own
  // constants, so the page cannot drift from the engine it describes.
  if (next.includes(SIMULATION_ANCHOR_START)) {
    next = replaceSimulationAnchor(next);
  }
  const preloadPage = pagePath === "./" ? "index.html" : pagePath;
  const preloads = modulePreloadLinks.get(preloadPage);
  if (preloads && !next.includes('rel="modulepreload"')) {
    next = next.replace("</head>", `${preloads}\n  </head>`);
  }
  // Precache service worker (S62): registered only in built app shells, never
  // in dev public/. Mount-relative scope; the edge policy hashes this inline
  // snippet like every other.
  if (["./", "index.html", "game.html"].includes(pagePath) && !next.includes("navigator.serviceWorker.register")) {
    next = next.replace("</body>", `${SW_REGISTRATION_SNIPPET}\n</body>`);
  }
  return next;
}

async function writeHtml(pageName) {
  const sourcePath = path.join(publicDir, pageName);
  const outputPath = path.join(outDir, pageName);
  const source = await fs.readFile(sourcePath, "utf8");
  const pagePath = pageName === "index.html" ? "./" : pageName;
  await fs.writeFile(outputPath, injectHtmlDefaults(source, pagePath), "utf8");
}

async function mirrorPath(mirrorSlug) {
  const projectDir = path.join(outDir, ...mirrorSlug.split("/"));
  const entries = await fs.readdir(outDir, { withFileTypes: true });
  await fs.mkdir(projectDir, { recursive: true });

  for (const entry of entries) {
    if ([slug, "vaultspark-football-gm", "games"].includes(entry.name)) continue;
    const source = path.join(outDir, entry.name);
    const destination = path.join(projectDir, entry.name);
    if (entry.isDirectory()) {
      await fs.cp(source, destination, { recursive: true });
    } else {
      await fs.copyFile(source, destination);
    }
  }
}

async function mirrorProjectPaths() {
  for (const mirrorSlug of [slug, ...legacySlugs]) {
    await mirrorPath(mirrorSlug);
  }
}

// S94: sitemap lastmod, derived instead of declared.
//
// Nine of twelve URLs carried lastmod 2026-08-03 because nothing ever
// regenerated the file -- the same rot that let status.html tell visitors the
// game had been idle. A date a human has to remember to update is a date that
// will eventually be wrong, and a wrong lastmod actively misleads crawlers about
// what is worth re-reading. Git already records when each source page last
// genuinely changed, so the sitemap can read it rather than assert it.
//
// Falls back to the value already in the file when git history is unavailable
// (shallow CI clones): an unchanged stale date is honest-by-omission, whereas
// stamping "today" on every build would claim a change that did not happen.
function sitemapSourceFor(loc) {
  const route = loc.replace(/^https?:\/\/[^/]+/, "") || "/";
  if (route === "/") return "public/index.html";
  if (route === "/stats") return "public/stats.html";
  return `public${route}`;
}

async function stampSitemapLastmod() {
  const sitemapPath = path.join(outDir, "sitemap.xml");
  let xml;
  try {
    xml = await fs.readFile(sitemapPath, "utf8");
  } catch {
    return { stamped: 0 };
  }
  let stamped = 0;
  const next = xml.replace(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g, (whole, loc, current) => {
    const source = sitemapSourceFor(loc);
    if (!fsSync.existsSync(path.join(rootDir, source))) return whole;
    let committed = "";
    try {
      committed = String(
        execFileSync("git", ["log", "-1", "--format=%cs", "--", source], { cwd: rootDir, stdio: ["ignore", "pipe", "ignore"] })
      ).trim();
    } catch {
      return whole;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(committed) || committed === current) return whole;
    stamped += 1;
    return `<loc>${loc}</loc><lastmod>${committed}</lastmod>`;
  });
  if (stamped) await fs.writeFile(sitemapPath, next, "utf8");
  return { stamped };
}

// S94: retired routes become real 301s instead of meta-refresh documents.
//
// changelog.html, ip.html and play.html were each a full HTML document whose
// only job was <meta http-equiv="refresh"> to somewhere else, and landing.html
// is now merged into the root page. A refresh document is slower than a redirect
// (the browser parses a page to learn it should be elsewhere), is a weaker
// signal to crawlers than a 301, and is four more files to keep in step with the
// design system. Declared once here so the route map has a single home.
const RETIRED_ROUTES = Object.freeze([
  ["/landing.html", "/#why", "merged into the root page (S94)"],
  ["/changelog.html", "/status.html", "release notes live on Status & Updates"],
  ["/ip.html", "/terms.html", "rights notice lives on Terms"],
  ["/play.html", "/", "the root page is the play surface"]
]);

async function emitRetiredRouteRedirects() {
  const body = RETIRED_ROUTES
    .map(([from, to, why]) => [`# ${why}`, `${from} ${to} 301`].join("\n"))
    .join("\n");
  await fs.writeFile(path.join(outDir, "_redirects"), `${body}\n`, "utf8");
  return RETIRED_ROUTES.length;
}

async function emitHashedStylesheet() {
  const cssPath = path.join(outDir, "styles.css");
  const css = await fs.readFile(cssPath, "utf8");
  const hash = createHash("sha256").update(css).digest("hex").slice(0, 10);
  hashedStyleHref = `styles.${hash}.css`;
  await fs.writeFile(path.join(outDir, hashedStyleHref), css, "utf8");
  return hashedStyleHref;
}

async function emitHashedCommunityStats() {
  const sourcePath = path.join(outDir, "community-stats.js");
  const source = await fs.readFile(sourcePath, "utf8");
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 10);
  hashedCommunityStatsSrc = `community-stats.${hash}.js`;
  await fs.writeFile(path.join(outDir, hashedCommunityStatsSrc), source, "utf8");
  return hashedCommunityStatsSrc;
}

// Boot-payload receipt (S70): what a first paint actually costs vs what stays
// behind the lazy runtime import. Recomputed every build so payload regressions
// are visible in the deploy manifest instead of anecdotal.
async function measureBootPayload() {
  async function bytesOf(relative) {
    try {
      return (await fs.stat(path.join(outDir, relative))).size;
    } catch {
      return 0;
    }
  }
  async function dirBytes(relative) {
    let total = 0;
    async function walk(dir) {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const target = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(target);
        else if (entry.name.endsWith(".js")) total += (await fs.stat(target)).size;
      }
    }
    await walk(path.join(outDir, relative));
    return total;
  }
  const bootJsBytes = (await bytesOf("app.js")) + (await bytesOf("setup.js")) + (await dirBytes("lib"));
  const lazyEngineBytes = (await dirBytes("src")) + (await dirBytes("public"));
  const cssBytes = await bytesOf(hashedStyleHref);
  return { bootJsBytes, lazyEngineBytes, cssBytes };
}

async function emitDeployEvidence(edgePolicy, artifactFingerprint) {
  const identity = JSON.parse(await fs.readFile(path.join(publicDir, "public-identity.json"), "utf8"));
  const sourceRevision = String(
    process.env.SOURCE_REVISION || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "local-worktree"
  ).trim();
  const generatedAt = new Date().toISOString();
  const deployManifest = {
    schemaVersion: "1.1",
    service: identity.slug,
    canonicalOrigin: identity.canonicalOrigin,
    repository: identity.repository,
    sourceRevision,
    artifactFingerprint,
    styleAsset: hashedStyleHref,
    communityStatsAsset: hashedCommunityStatsSrc,
    basePath,
    assetBasePath,
    publishedMounts,
    runtimeDefault,
    serverAvailable: serverAvailable === "true",
    edgePolicyFingerprint: edgePolicy.policyFingerprint,
    edgePolicyStatus: "source-authored-not-host-observed",
    bootPayload: await measureBootPayload(),
    generatedAt
  };
  const health = {
    status: "ok",
    service: identity.slug,
    sourceRevision,
    artifactFingerprint,
    styleAsset: hashedStyleHref,
    communityStatsAsset: hashedCommunityStatsSrc,
    edgePolicyFingerprint: edgePolicy.policyFingerprint,
    edgePolicyAppliedToHostedOrigin: false,
    generatedAt,
    launchReady: false,
    launchNote: "Runtime health is green; launch readiness still requires separate contact-channel, edge-header, deploy-currency, and release-approval evidence."
  };
  await fs.writeFile(path.join(outDir, "deploy-manifest.json"), `${JSON.stringify(deployManifest, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outDir, "_health"), `${JSON.stringify(health, null, 2)}\n`, "utf8");
}

async function main() {
  await assertApiContractParity({ rootDir });
  assertPublicFooterContract(publicDir);
  assertPublicTruth(rootDir);
  await assertBrowserPromiseObservability({ publicDir });
  await assertBrowserModuleReachability({ publicDir });
  await ensureCleanDir(outDir);
  await copyDir(publicDir, outDir);
  await copyBrowserModules();
  await emitHashedStylesheet();
  await emitHashedCommunityStats();
  await computeModulePreloads();
  for (const pageName of htmlPages) {
    await writeHtml(pageName);
  }
  const sourceRevision = String(
    process.env.SOURCE_REVISION || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "local-worktree"
  ).trim();
  const redirects = await emitRetiredRouteRedirects();
  console.log(`retired routes served as 301s: ${redirects}`);
  const sitemap = await stampSitemapLastmod();
  if (sitemap.stamped) console.log(`sitemap lastmod refreshed from git history: ${sitemap.stamped} URL(s)`);
  const edgePolicy = await emitEdgeSecurityPolicy({ outDir, htmlPages, sourceRevision });
  const swManifest = await emitServiceWorker(outDir);
  console.log(
    `Service worker precache v${swManifest.version}: ${swManifest.assetCount} assets · ${Math.round(swManifest.totalBytes / 1024)} KB (repeat loads serve from cache)`
  );
  // 404.html is a real not-found page (written via writeHtml above), not an
  // index copy — a mistyped URL should say so instead of silently booting the app.
  const artifactFingerprint = await fingerprintArtifactDirectory(outDir);
  await emitDeployEvidence(edgePolicy, artifactFingerprint);
  await mirrorProjectPaths();
  console.log(`Built Pages bundle in ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
