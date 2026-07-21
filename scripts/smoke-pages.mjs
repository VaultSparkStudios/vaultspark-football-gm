import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const staticDir = path.join(rootDir, "static");
const slug = "franchise-architect-football";
const mountPath = `/${slug}`;
const legacyMountPath = "/games/vaultspark-football-gm";
const productionMountPath = "/games/franchise-architect";
const host = "127.0.0.1";
const port = 4310;
const baseUrl = `http://${host}:${port}/`;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function contentType(filePath) {
  return contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function fetchStaticText(pathname) {
  return new Promise((resolve, reject) => {
    http.get(`http://${host}:${port}${pathname}`, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({
        statusCode: res.statusCode,
        contentType: String(res.headers["content-type"] || ""),
        body
      }));
    }).on("error", reject);
  });
}

async function assertStaticPath(pathname, expectedPattern, expectedContentType) {
  const response = await fetchStaticText(pathname);
  if (response.statusCode !== 200) throw new Error(`Expected 200 for ${pathname}, received ${response.statusCode}`);
  if (expectedContentType && !response.contentType.startsWith(expectedContentType)) {
    throw new Error(`Expected ${pathname} to use ${expectedContentType}, received ${response.contentType || "no Content-Type"}`);
  }
  if (expectedPattern && !expectedPattern.test(response.body)) {
    throw new Error(`Expected ${pathname} to match ${expectedPattern}`);
  }
}

async function assertStaticFile(relativePath, expectedPattern) {
  const filePath = path.join(staticDir, ...relativePath.split("/"));
  if (!(await fileExists(filePath))) throw new Error(`Missing static file ${relativePath}`);
  if (expectedPattern) {
    const body = await fs.readFile(filePath, "utf8");
    if (!expectedPattern.test(body)) throw new Error(`Expected ${relativePath} to match ${expectedPattern}`);
  }
}
async function createServer() {
  if (!(await fileExists(path.join(staticDir, "index.html")))) {
    throw new Error("Missing static/index.html. Run `npm run build:pages` first.");
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    let relativePath = url.pathname.replace(/^\/+/, "");
    if (url.pathname.startsWith(`${mountPath}/`)) {
      relativePath = url.pathname.slice(mountPath.length).replace(/^\/+/, "");
    } else if (url.pathname.startsWith(`${legacyMountPath}/`)) {
      relativePath = url.pathname.slice(legacyMountPath.length).replace(/^\/+/, "");
    }
    const targetPath = relativePath || "index.html";
    const safePath = path.normalize(targetPath).replace(/^(\.\.[\\/])+/, "");
    let filePath = path.join(staticDir, safePath);
    if (!(await fileExists(filePath))) filePath = path.join(staticDir, "404.html");

    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  });
}

async function assertPublishedMountContract() {
  const manifest = JSON.parse(await fs.readFile(path.join(staticDir, "deploy-manifest.json"), "utf8"));
  if (!Array.isArray(manifest.publishedMounts) || !manifest.publishedMounts.includes(`${productionMountPath}/`)) {
    throw new Error(`Deploy manifest is missing the production mount ${productionMountPath}/`);
  }
  if (manifest.assetBasePath !== "./") {
    throw new Error(`Deploy manifest must declare a mount-relative asset base; received ${manifest.assetBasePath}.`);
  }
  for (const mount of manifest.publishedMounts) {
    const relativeMount = String(mount).replace(/^\/+|\/+$/g, "");
    const prefix = relativeMount ? `${relativeMount}/` : "";
    await assertStaticFile(`${prefix}index.html`, /<base href="\.\/" \/>/);
    await assertStaticFile(`${prefix}styles.css`, /:root/);
    await assertStaticFile(`${prefix}setup.js`, /createApiClient/);
    await assertStaticFile(`${prefix}favicon.ico`);
    await assertStaticPath(`${mount}styles.css`, /:root/, "text/css");
    await assertStaticPath(`${mount}setup.js`, /createApiClient/, "application/javascript");
    await assertStaticPath(`${mount}favicon.ico`, null, "image/x-icon");
  }
}

async function main() {
  const server = await createServer();
  await new Promise((resolve) => server.listen(port, host, resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("#createLeagueBtn");
    const runtimeMode = await page.$eval("#runtimeModeSelect", (el) => el.value);
    if (runtimeMode !== "client") throw new Error(`Expected client runtime default, received ${runtimeMode}`);
    const serverDisabled = await page.$eval("#runtimeModeSelect option[value=\"server\"]", (el) => el.disabled);
    if (!serverDisabled) throw new Error("Expected server-backed runtime option to be disabled in the Pages build.");
    const runtimeDescription = await page.$eval("#runtimeModeDescription", (el) => el.textContent || "");
    if (!runtimeDescription.includes("client-only")) {
      throw new Error(`Expected Pages runtime description to explain client-only mode, received: ${runtimeDescription}`);
    }

    await page.click("#createLeagueBtn");
    await page.waitForURL(`**/game.html`, { timeout: 15000 });
    await page.waitForSelector("#refreshBtn");
    await page.waitForFunction(() => {
      const text = document.getElementById("topMetaText")?.textContent || "";
      return text.includes("Team:") && !text.includes("Loading");
    });

    await page.goto(`${baseUrl}game.html`, { waitUntil: "networkidle" });
    await page.waitForSelector("#refreshBtn");

    await page.goto(`${baseUrl}missing-route`, { waitUntil: "networkidle" });
    await page.waitForSelector("#createLeagueBtn");
    await assertStaticPath(`/contact.html`, /football@playfranchisearchitect\.com/);
    await assertStaticPath(`/privacy.html`, /Browser-First Beta/);
    await assertStaticPath(`/terms.html`, /All rights reserved/);
    await assertStaticPath(`/agents.json`, /Proprietary - All Rights Reserved/);
    await assertStaticPath(`/.well-known/llms.txt`, /Franchise Architect: Football/);
    await assertStaticPath(`/sitemap.xml`, /contact\.html/);
    await assertStaticPath(`/_health`, /"launchReady": false/);
    await assertStaticPath(`/deploy-manifest.json`, /"repository": "VaultSparkStudios\/vaultspark-football-gm"/);

    await assertStaticFile(`${slug}/index.html`, /Franchise Architect: Football/);
    await assertStaticFile(`${slug}/game.html`, /Franchise Architect: Football/);
    await assertStaticFile(`${slug}/styles.css`, /:root/);
    await assertStaticFile(`${slug}/contact.html`, /football@playfranchisearchitect\.com/);
    await assertStaticFile(`${slug}/privacy.html`, /Browser-First Beta/);
    await assertStaticFile(`${slug}/terms.html`, /All rights reserved/);
    await assertStaticFile(`${slug}/agents.json`, /Proprietary - All Rights Reserved/);
    await assertStaticFile(`${slug}/.well-known/llms.txt`, /Franchise Architect: Football/);
    await assertStaticFile(`${slug}/sitemap.xml`, /contact\.html/);
    await assertStaticFile(`${slug}/_health`, /"styleAsset": "styles\.[a-f0-9]{10}\.css"/);
    await assertStaticFile(`${slug}/deploy-manifest.json`, /"sourceRevision":/);
    await assertStaticFile(`games/vaultspark-football-gm/styles.css`, /:root/);
    await assertStaticFile(`games/vaultspark-football-gm/setup.js`, /createApiClient/);
    await assertStaticPath(`${legacyMountPath}/styles.css`, /:root/);
    await assertStaticPath(`${legacyMountPath}/setup.js`, /createApiClient/);
    await assertStaticFile(`games/franchise-architect/styles.css`, /:root/);
    await assertStaticFile(`games/franchise-architect/setup.js`, /createApiClient/);
    await assertStaticFile(`games/franchise-architect/favicon.ico`);
    await assertStaticPath(`${productionMountPath}/styles.css`, /:root/, "text/css");
    await assertStaticPath(`${productionMountPath}/setup.js`, /createApiClient/, "application/javascript");
    await assertStaticPath(`${productionMountPath}/favicon.ico`, null, "image/x-icon");
    await assertPublishedMountContract();
    console.log("Static Pages smoke pass completed.");
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

// Watchdog: the smoke must never be the step that hangs a ship pipeline.
// unref() lets a healthy run exit naturally; a wedged run is force-failed.
const WATCHDOG_MS = 180_000;
const watchdog = setTimeout(() => {
  console.error(`Smoke watchdog: exceeded ${WATCHDOG_MS / 1000}s, forcing failure exit.`);
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref();

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
