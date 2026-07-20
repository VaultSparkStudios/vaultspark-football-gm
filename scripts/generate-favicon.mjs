#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(rootDir, "public", "images", "franchise-architect-mark.svg");
const outputPath = path.join(rootDir, "public", "favicon.ico");

function wrapPngAsIco(png, width = 64, height = 64) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(width === 256 ? 0 : width, 6);
  header.writeUInt8(height === 256 ? 0 : height, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

const svg = await fs.readFile(sourcePath, "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:64px;height:64px}</style>${svg}`);
  const png = await page.locator("svg").screenshot({ type: "png", omitBackground: true });
  await fs.writeFile(outputPath, wrapPngAsIco(png));
  console.log(`Generated ${path.relative(rootDir, outputPath)} from the canonical brand mark.`);
} finally {
  await browser.close();
}
