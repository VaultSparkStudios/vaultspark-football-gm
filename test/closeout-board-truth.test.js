import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "../scripts/lib/safe-spawn.mjs";
import { validateCloseoutBoard } from "../scripts/validate-closeout-board-format.mjs";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)));
const renderer = join(root, "scripts", "render-closeout-board.mjs");
const validator = join(root, "scripts", "validate-closeout-board-format.mjs");

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "Never",
      GIT_PAGER: "cat",
      ...options.env
    },
    input: options.input
  });
  assert.equal(result.status, options.status ?? 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result;
}

function write(file, body) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}

function initFixture() {
  const base = mkdtempSync(join(tmpdir(), "fa-closeout-board-"));
  const repo = join(base, "project");
  const remote = join(base, "remote.git");
  mkdirSync(repo, { recursive: true });
  write(join(repo, "context", "PROJECT_STATUS.json"), JSON.stringify({
    currentSession: 60,
    name: "Fixture Franchise",
    slug: "fixture-franchise",
    silScore: 900,
    silMax: 1000,
    sessionMode: "builder",
    lastAgent: "codex",
    testsPassing: 4,
    testsTotal: 4,
    doctorScore: { passing: 5, total: 5 },
    complianceScore: 7,
    complianceTotal: 7,
    truthAuditStatus: "green",
    stagingType: "local",
    stagingUrl: "http://127.0.0.1:3000/",
    runtimeUrl: "https://fixture.invalid/",
    silCategoriesV3: Object.fromEntries([
      "devHealth", "creativeAlignment", "momentum", "engagement", "processQuality",
      "crossRepoCoherence", "securityPosture", "ecosystemIntegration", "capitalEfficiency", "automationCoverage"
    ].map((key) => [key, 90]))
  }, null, 2));
  write(join(repo, "context", "LATEST_HANDOFF.md"), "## Where We Left Off — Session 60\n\n- Fixture authority shipped.\n");
  write(join(repo, "context", "TASK_BOARD.md"), "# Tasks\n");
  write(join(repo, ".cache", "genius-list.json"), JSON.stringify({
    status: "exhausted",
    items: [],
    closed: ["fixture"],
    exhaustedReason: "Fixture queue complete."
  }));
  write(join(repo, "README.md"), "fixture\n");

  run("git", ["init", "-b", "main"], repo);
  run("git", ["config", "user.email", "fixture@invalid.example"], repo);
  run("git", ["config", "user.name", "Fixture"], repo);
  run("git", ["add", "."], repo);
  run("git", ["commit", "-m", "fixture baseline"], repo);
  run("git", ["init", "--bare", remote], base);
  run("git", ["remote", "add", "origin", remote], repo);
  run("git", ["push", "-u", "origin", "main"], repo);
  return { base, repo, remote };
}

function render(repo) {
  const result = run(process.execPath, [renderer, "--project", repo, "--stdout"], root);
  assert.equal(existsSync(join(repo, "docs", "CLOSEOUT_STATUS_BOARD.md")), false, "--stdout must not write the board");
  assert.equal(validateCloseoutBoard(result.stdout).ok, true);
  const stdinValidation = run(process.execPath, [validator, "--stdin", "--json"], root, { input: result.stdout });
  assert.equal(JSON.parse(stdinValidation.stdout).ok, true);
  return result.stdout;
}

test("clean synchronized fixture renders exact git and stale-receipt truth without writes", () => {
  const { repo } = initFixture();
  const board = render(repo);
  assert.match(board, /Changes: 0 files/);
  assert.match(board, /Ahead: 0\s+·\s+Behind: 0/);
  assert.match(board, /Branch: main/);
  assert.match(board, /Tests:\s+4\/4 · STALE/);
  assert.match(board, /Latest audit exhausted/);
});

test("dirty and ahead states cannot render synchronized or clean", () => {
  const { repo } = initFixture();
  writeFileSync(join(repo, "context", "TASK_BOARD.md"), "# Tasks\n\nlocal change\n");
  const dirty = render(repo);
  assert.match(dirty, /Changes: 1 files/);
  assert.match(dirty, /M:1/);

  run("git", ["add", "context/TASK_BOARD.md"], repo);
  run("git", ["commit", "-m", "local closeout change"], repo);
  const ahead = render(repo);
  assert.match(ahead, /Changes: 0 files/);
  assert.match(ahead, /Ahead: 1\s+·\s+Behind: 0/);
});

test("malformed or missing project inputs fail closed but retain canonical shape", () => {
  const base = mkdtempSync(join(tmpdir(), "fa-closeout-malformed-"));
  const repo = join(base, "project");
  mkdirSync(repo, { recursive: true });
  write(join(repo, "context", "PROJECT_STATUS.json"), "{not-json");
  run("git", ["init", "-b", "main"], repo);
  const board = render(repo);
  assert.match(board, /S\?/);
  assert.match(board, /Doctor:\s+—/);
  assert.match(board, /no genius cache/);
});
