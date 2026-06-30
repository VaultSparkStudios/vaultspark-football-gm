import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const staticDir = path.join(rootDir, "static");
const slug = "vaultspark-football-gm";
const mountPath = `/${slug}`;
const host = "127.0.0.1";
const port = 4310;
const baseUrl = `http://${host}:${port}${mountPath}/`;

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
      res.on("end", () => resolve({ statusCode: res.statusCode, body }));
    }).on("error", reject);
  });
}

async function assertStaticPath(pathname, expectedPattern) {
  const response = await fetchStaticText(pathname);
  if (response.statusCode !== 200) throw new Error(`Expected 200 for ${pathname}, received ${response.statusCode}`);
  if (expectedPattern && !expectedPattern.test(response.body)) {
    throw new Error(`Expected ${pathname} to match ${expectedPattern}`);
  }
}
async function createServer() {
  if (!(await fileExists(path.join(staticDir, "index.html")))) {
    throw new Error("Missing static/index.html. Run `npm run build:pages` first.");
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    if (url.pathname === "/") {
      res.writeHead(302, { Location: `${mountPath}/` });
      res.end();
      return;
    }
    if (!url.pathname.startsWith(mountPath)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const relativePath = url.pathname.slice(mountPath.length).replace(/^\/+/, "");
    const targetPath = relativePath || "index.html";
    const safePath = path.normalize(targetPath).replace(/^(\.\.[\\/])+/, "");
    let filePath = path.join(staticDir, safePath);
    if (!(await fileExists(filePath))) filePath = path.join(staticDir, "404.html");

    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  });
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
    await page.waitForURL(`**/${slug}/game.html`, { timeout: 15000 });
    await page.waitForSelector("#refreshBtn");
    await page.waitForFunction(() => {
      const text = document.getElementById("topMetaText")?.textContent || "";
      return text.includes("Team:") && !text.includes("Loading");
    });

    await page.goto(`${baseUrl}game.html`, { waitUntil: "networkidle" });
    await page.waitForSelector("#refreshBtn");

    await page.goto(`${baseUrl}missing-route`, { waitUntil: "networkidle" });
    await page.waitForSelector("#createLeagueBtn");
    await assertStaticPath(`${mountPath}/contact.html`, /footballgm@vaultsparkstudios\.com/);
    await assertStaticPath(`${mountPath}/privacy.html`, /Browser-First Beta/);
    await assertStaticPath(`${mountPath}/terms.html`, /All rights reserved/);
    await assertStaticPath(`${mountPath}/agents.json`, /Proprietary - All Rights Reserved/);
    await assertStaticPath(`${mountPath}/.well-known/llms.txt`, /VaultSpark Football GM/);
    await assertStaticPath(`${mountPath}/sitemap.xml`, /contact\.html/);
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
