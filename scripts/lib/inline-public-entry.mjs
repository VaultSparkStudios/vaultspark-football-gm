import { createHash } from "node:crypto";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";

export const PUBLIC_ENTRY_MAX_BYTES = 512 * 1024;
export const PUBLIC_ENTRY_MAX_TRANSFER_RATIO = 1.05;

const normalize = (value) => String(value).replace(/\r\n/g, "\n");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function trustedBody(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}: nonempty trusted text required`);
  const body = normalize(value);
  if (/<\/(?:script|style)/i.test(body)) throw new Error(`${label}: raw script/style closer refused`);
  return body;
}

function stylesheet(value, label) {
  const body = trustedBody(value, label);
  // No current stylesheet needs URLs/imports. Refuse even escaped spellings:
  // moving a stylesheet into HTML must never silently change its URL base.
  const tokens = body.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\\(?:\r\n|[\n\r\f])/g, "")
    .replace(/\\([a-f0-9]{1,6})(?:\r\n|[ \t\n\r\f])?|\\([^\n\r\f])/gi, (_, hex, char) => {
      const point = hex ? parseInt(hex, 16) : null;
      return hex ? String.fromCodePoint(point > 0 && point <= 0x10ffff ? point : 0xfffd) : char;
    });
  if (/@import\b|url\s*\(/i.test(tokens)) throw new Error(`${label}: CSS URL/import base hazard refused`);
  return body;
}

function replaceTag(html, tagName, attribute, reference, replacement, exactTag = null) {
  const tags = [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))];
  const referencePath = reference.replace(/^\.\//, "");
  const matches = tags.filter(([tag]) => [...tag.matchAll(new RegExp(`\\s${attribute}\\s*=\\s*(["'])(.*?)\\1`, "gi"))]
    .some(([, , value]) => value.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0] === referencePath));
  if (matches.length !== 1) throw new Error(`${reference}: exactly one target tag required`);
  const match = matches[0], tag = match[0];
  const attributes = [...tag.matchAll(new RegExp(`\\s${attribute}\\s*=\\s*(["'])(.*?)\\1`, "gi"))];
  if (attributes.length !== 1 || attributes[0][2] !== reference || exactTag && tag !== exactTag) {
    throw new Error(`${reference}: target attributes changed`);
  }
  const value = typeof replacement === "function" ? replacement(tag) : replacement;
  return html.slice(0, match.index) + value + html.slice(match.index + tag.length);
}

function compressed(bytes, encoding) {
  return encoding === "gzip"
    ? gzipSync(bytes, { level: 9 }).length
    : brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).length;
}

// The old cold path transfers HTML, script, both CSS bodies, and identity JPEG.
// Compare both compression families with identical settings; this is a byte
// budget, not a substitute for native hosted performance measurements.
export function publicEntryTransferMetrics(beforeHtml, afterHtml, bodies, heroJpeg) {
  const decodedBytes = Buffer.byteLength(afterHtml);
  const encodings = {};
  for (const encoding of ["gzip", "brotli"]) {
    const beforeBytes = [beforeHtml, ...bodies].reduce((sum, body) => sum + compressed(body, encoding), heroJpeg.length);
    const afterBytes = compressed(afterHtml, encoding);
    encodings[encoding] = { beforeBytes, afterBytes, ratio: afterBytes / beforeBytes };
  }
  return { decodedBytes, decodedLimitBytes: PUBLIC_ENTRY_MAX_BYTES, maxTransferRatio: PUBLIC_ENTRY_MAX_TRANSFER_RATIO, encodings };
}

export function inlinePublicEntry({ pageName, html, themeBoot, styles, siteStyles, heroJpeg, styleHref, siteStyleHref }) {
  if (typeof html !== "string") throw new Error("Entry HTML must be text");
  if (pageName !== "index.html") return { html, metrics: null };
  const before = normalize(html);
  const script = trustedBody(themeBoot, "themeBoot");
  const css = stylesheet(styles, "styles"), siteCss = stylesheet(siteStyles, "site");
  for (const [name, href, body] of [["styles", styleHref, css], ["site", siteStyleHref, siteCss]]) {
    if (href !== `${name}.${sha(body).slice(0, 10)}.css`) throw new Error(`${name}: normalized content hash differs from stylesheet name`);
  }
  if (!Buffer.isBuffer(heroJpeg) || heroJpeg.length < 4 || heroJpeg[0] !== 0xff || heroJpeg[1] !== 0xd8
    || heroJpeg.at(-2) !== 0xff || heroJpeg.at(-1) !== 0xd9) throw new Error("Exact existing JPEG bytes required");
  const scriptTag = '<script src="./lib/themeBoot.js">';
  // Preserve the classic script's position and execution semantics, including
  // its empty external-script body, rather than replacing a module/async tag.
  let next = replaceTag(before, "script", "src", "./lib/themeBoot.js", scriptTag, scriptTag);
  const fullScript = scriptTag + "</script>";
  if (next.split(fullScript).length !== 2) throw new Error("themeBoot: one empty classic script required");
  next = next.replace(fullScript, () => `<script>${script}</script>`);
  for (const [href, body] of [[styleHref, css], [siteStyleHref, siteCss]]) {
    const tag = `<link rel="stylesheet" href="./${href}" />`;
    next = replaceTag(next, "link", "href", `./${href}`, `<style>${body}</style>`, tag);
  }
  const dataUrl = `data:image/jpeg;base64,${heroJpeg.toString("base64")}`;
  next = replaceTag(next, "img", "src", "./images/screens/hero.jpg", (tag) =>
    tag.replace(new RegExp(`(\\ssrc\\s*=\\s*)(["'])${escaped("./images/screens/hero.jpg")}\\2`, "i"), (_, prefix, quote) => `${prefix}${quote}${dataUrl}${quote}`));
  const metrics = publicEntryTransferMetrics(before, next, [script, css, siteCss], heroJpeg);
  if (metrics.decodedBytes > PUBLIC_ENTRY_MAX_BYTES) throw new Error("Public entry exceeds decoded 512 KiB budget");
  if (Object.values(metrics.encodings).some(({ ratio }) => ratio > PUBLIC_ENTRY_MAX_TRANSFER_RATIO)) {
    throw new Error("Public entry exceeds comparable cold-transfer budget");
  }
  return { html: next, metrics };
}
