import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertBrowserModuleReachability } from "./check-browser-module-reachability.mjs";
import { assertBrowserPromiseObservability } from "./check-browser-promise-observability.mjs";

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
const htmlPages = [
  "index.html",
  "game.html",
  "landing.html",
  "about.html",
  "play.html",
  "contact.html",
  "privacy.html",
  "terms.html",
  "ip.html",
  "status.html",
  "changelog.html"
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

async function copyDir(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  await fs.cp(source, destination, { recursive: true });
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
    await fs.copyFile(modulePath, destination);
  }
}

function injectHtmlDefaults(html, pagePath) {
  const canonicalUrl = new URL(pagePath, canonicalBase).toString();
  let next = html;
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

async function emitHashedStylesheet() {
  const cssPath = path.join(outDir, "styles.css");
  const css = await fs.readFile(cssPath, "utf8");
  const hash = createHash("sha256").update(css).digest("hex").slice(0, 10);
  hashedStyleHref = `styles.${hash}.css`;
  await fs.writeFile(path.join(outDir, hashedStyleHref), css, "utf8");
  return hashedStyleHref;
}

async function emitDeployEvidence() {
  const identity = JSON.parse(await fs.readFile(path.join(publicDir, "public-identity.json"), "utf8"));
  const sourceRevision = String(
    process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.SOURCE_REVISION || "local-worktree"
  ).trim();
  const generatedAt = new Date().toISOString();
  const deployManifest = {
    schemaVersion: "1.0",
    service: identity.slug,
    canonicalOrigin: identity.canonicalOrigin,
    repository: identity.repository,
    sourceRevision,
    styleAsset: hashedStyleHref,
    basePath,
    assetBasePath,
    publishedMounts,
    runtimeDefault,
    serverAvailable: serverAvailable === "true",
    generatedAt
  };
  const health = {
    status: "ok",
    service: identity.slug,
    sourceRevision,
    styleAsset: hashedStyleHref,
    generatedAt,
    launchReady: false,
    launchNote: "Runtime health is green; launch readiness still requires separate email, edge-header, deploy-currency, and founder-approval evidence."
  };
  await fs.writeFile(path.join(outDir, "deploy-manifest.json"), `${JSON.stringify(deployManifest, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outDir, "_health"), `${JSON.stringify(health, null, 2)}\n`, "utf8");
}

async function main() {
  await assertBrowserPromiseObservability({ publicDir });
  await assertBrowserModuleReachability({ publicDir });
  await ensureCleanDir(outDir);
  await copyDir(publicDir, outDir);
  await copyBrowserModules();
  await emitHashedStylesheet();
  for (const pageName of htmlPages) {
    await writeHtml(pageName);
  }
  await emitDeployEvidence();
  await fs.copyFile(path.join(outDir, "index.html"), path.join(outDir, "404.html"));
  await mirrorProjectPaths();
  console.log(`Built Pages bundle in ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
