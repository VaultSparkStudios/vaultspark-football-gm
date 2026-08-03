import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function checkProjectAuthorityContract(root = process.cwd()) {
  const contractPath = path.join(root, "context", "PROJECT_AUTHORITY_CONTRACT.json");
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const errors = [];

  for (const [relativePath, exports] of Object.entries(contract.requiredExports || {})) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`${relativePath}: missing`);
      continue;
    }
    try {
      const moduleUrl = `${pathToFileURL(absolutePath).href}?authority-check=${Date.now()}`;
      const loaded = await import(moduleUrl);
      for (const name of exports) {
        if (typeof loaded[name] !== "function") errors.push(`${relativePath}: missing export ${name}`);
      }
    } catch (error) {
      errors.push(`${relativePath}: import failed (${error.message})`);
    }
  }

  for (const relativePath of contract.statusMutators || []) {
    const absolutePath = path.join(root, relativePath);
    const source = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
    if (!source) {
      errors.push(`${relativePath}: missing`);
      continue;
    }
    if (!/updateProjectStatus/.test(source)) errors.push(`${relativePath}: bypasses updateProjectStatus`);
    if (/writeFileSync\((?:STATUS|statusPath),/.test(source)) errors.push(`${relativePath}: writes PROJECT_STATUS directly`);
  }

  for (const [relativePath, tokens] of Object.entries(contract.requiredSourceTokens || {})) {
    const absolutePath = path.join(root, relativePath);
    const source = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
    for (const token of tokens) {
      if (!source.includes(token)) errors.push(`${relativePath}: missing authority token ${token}`);
    }
  }

  for (const relativePath of contract.forbiddenFiles || []) {
    if (fs.existsSync(path.join(root, relativePath))) errors.push(`${relativePath}: forbidden generic authority present`);
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (packageJson.scripts?.test !== contract.canonicalTestCommand) {
    errors.push(`package.json: canonical test command drift (${packageJson.scripts?.test || "missing"})`);
  }

  return {
    schemaVersion: contract.schemaVersion,
    project: contract.project,
    ok: errors.length === 0,
    errors
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)))) {
  const result = await checkProjectAuthorityContract();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
