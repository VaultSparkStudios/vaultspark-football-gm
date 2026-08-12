import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

async function filesUnder(root, dir = root) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll(path.sep, "/"));
  }
  return files;
}

// Source-bound evidence names the publication that observed an otherwise
// byte-identical product. Keep those receipts outside the deployable-content
// identity so a docs/status-only publication commit cannot fabricate product
// drift merely by embedding its own SHA.
export async function fingerprintArtifactDirectory(root, { exclude = ["_health", "deploy-manifest.json", "edge-policy-receipt.json"] } = {}) {
  const excluded = new Set(exclude.map((entry) => String(entry).replaceAll("\\", "/")));
  const files = (await filesUnder(root)).filter((relative) => !excluded.has(relative)).sort();
  const hash = createHash("sha256");
  for (const relative of files) {
    const body = await fs.readFile(path.join(root, ...relative.split("/")));
    hash.update(relative);
    hash.update("\0");
    hash.update(String(body.byteLength));
    hash.update("\0");
    hash.update(body);
    hash.update("\0");
  }
  return {
    algorithm: "sha256",
    digest: hash.digest("hex"),
    files: files.length,
    exclusions: [...excluded].sort()
  };
}
