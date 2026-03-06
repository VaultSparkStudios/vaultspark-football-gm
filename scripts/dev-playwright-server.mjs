import fs from "node:fs";
import path from "node:path";

const saveDir = path.resolve(".pw-saves");
process.env.VSFGM_SAVE_DIR = saveDir;
process.env.PORT = process.env.PORT || "4173";

try {
  fs.rmSync(saveDir, { recursive: true, force: true });
  fs.mkdirSync(saveDir, { recursive: true });
} catch {
  // If cleanup fails, server can still start using existing data.
}

await import("../src/server.js");
