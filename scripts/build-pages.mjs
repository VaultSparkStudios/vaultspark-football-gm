import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const srcDir = path.join(rootDir, "src");
const outDir = path.join(rootDir, "static");
const slug = process.env.GAME_SLUG || "vaultspark-football-gm";
const runtimeDefault = process.env.VSFGM_RUNTIME_DEFAULT || "client";
const explicitServerBaseUrl = (process.env.VITE_GAME_SERVICE_ORIGIN || "").trim()
  || ((process.env.API_DOMAIN || "").trim() ? `https://${String(process.env.API_DOMAIN).trim()}` : "");
const serverAvailable = explicitServerBaseUrl ? "true" : "false";
const browserEntryPoints = [path.join(srcDir, "app", "api", "localApiRuntime.js")];

function normalizeBasePath(value) {
  const trimmed = String(value || "").trim() || `/${slug}/`;
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

const basePath = normalizeBasePath(process.env.VITE_APP_BASE_PATH || `/${slug}/`);
const canonicalBase = process.env.VITE_CANONICAL_URL || `https://vaultsparkstudios.com${basePath}`;
const ogImageUrl = process.env.VITE_OG_IMAGE_URL || `https://vaultsparkstudios.com${basePath}images/cover.png`;

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
    next = next.replace("<head>", `<head>\n    <base href=\"${basePath}\" />`);
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

async function main() {
  await ensureCleanDir(outDir);
  await copyDir(publicDir, outDir);
  await copyBrowserModules();
  await writeHtml("index.html");
  await writeHtml("game.html");
  await fs.copyFile(path.join(outDir, "index.html"), path.join(outDir, "404.html"));
  console.log(`Built Pages bundle in ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
