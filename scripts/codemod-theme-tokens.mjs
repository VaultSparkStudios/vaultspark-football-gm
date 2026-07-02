import fs from "node:fs";

const FILE = "public/styles.css";
let css = fs.readFileSync(FILE, "utf8");
const before = css;

// Substring replacements. Order matters: longer/gradient strings first so we
// don't partially rewrite a substring of a larger declaration.
// Each entry: [needle, replacement]. All replaceAll (global, literal).
const MAP = [
  // --- panel base gradients -> --panel-grad ---
  ["linear-gradient(180deg, rgba(23, 34, 38, 0.94), rgba(14, 22, 25, 0.96))", "var(--panel-grad)"],
  ["linear-gradient(180deg, rgba(20, 30, 34, 0.94), rgba(12, 19, 22, 0.96))", "var(--panel-grad)"],
  ["linear-gradient(180deg, rgba(18, 27, 31, 0.94), rgba(12, 18, 21, 0.92))", "var(--panel-grad)"],
  ["linear-gradient(180deg, rgba(17, 26, 29, 0.95), rgba(11, 18, 20, 0.95))", "var(--panel-grad)"],
  ["linear-gradient(180deg, rgba(18, 28, 32, 0.95), rgba(10, 16, 19, 0.98))", "var(--panel-grad)"],
  ["linear-gradient(180deg, rgba(22, 33, 37, 0.98), rgba(12, 19, 22, 0.985))", "var(--panel-grad)"],
  ["linear-gradient(180deg, rgba(18, 27, 31, 0.98), rgba(18, 27, 31, 0.84))", "var(--panel-grad)"],

  // --- card base gradients (usually layered under an accent radial) -> --card-grad ---
  ["linear-gradient(180deg, rgba(18, 27, 31, 0.92), rgba(12, 18, 21, 0.9))", "var(--card-grad)"],
  ["linear-gradient(180deg, rgba(15, 23, 27, 0.84), rgba(9, 15, 17, 0.92))", "var(--card-grad)"],
  ["linear-gradient(180deg, rgba(14, 21, 24, 0.88), rgba(8, 14, 16, 0.92))", "var(--card-grad)"],
  ["linear-gradient(180deg, rgba(12, 19, 21, 0.76), rgba(8, 14, 16, 0.88))", "var(--card-grad)"],
  ["linear-gradient(180deg, rgba(12, 19, 21, 0.92), rgba(8, 14, 16, 0.96))", "var(--card-grad)"],
  ["linear-gradient(135deg, rgba(25, 37, 42, 0.98), rgba(11, 18, 21, 0.98))", "var(--card-grad)"],

  // --- warm gold spotlight surfaces -> --wash-gold ---
  ["linear-gradient(145deg, rgba(77, 57, 27, 0.88), rgba(24, 20, 16, 0.98))", "var(--wash-gold)"],
  ["linear-gradient(145deg, rgba(77, 57, 27, 0.98), rgba(36, 30, 22, 0.98))", "var(--wash-gold)"],
  ["linear-gradient(135deg, rgba(38, 30, 18, 0.94), rgba(18, 16, 10, 0.96))", "var(--wash-gold)"],
  ["linear-gradient(180deg, rgba(31, 23, 18, 0.92), rgba(15, 14, 18, 0.92))", "var(--wash-gold)"],

  // --- raised / elevated button surfaces -> --raised ---
  ["linear-gradient(145deg, rgba(31, 48, 51, 0.96), rgba(17, 28, 31, 0.98))", "var(--raised)"],
  ["linear-gradient(140deg, rgba(43, 62, 67, 0.96), rgba(26, 40, 44, 0.98))", "var(--raised)"],
  ["linear-gradient(145deg, rgba(50, 70, 75, 0.9), rgba(30, 45, 50, 0.95))", "var(--raised)"],
  ["linear-gradient(135deg, #1a1030, #1e2230)", "var(--raised)"],
  ["linear-gradient(145deg, #3a3a2e, #2a2a22)", "var(--raised)"],

  // --- danger surface ---
  ["linear-gradient(145deg, #5c2a2a, #472222)", "var(--danger-surface)"],

  // --- deep inset solids -> --inset ---
  ["rgba(8, 14, 16, 0.58)", "var(--inset)"],
  ["rgba(9, 15, 17, 0.62)", "var(--inset)"],
  ["rgba(9, 16, 18, 0.76)", "var(--inset)"],
  ["rgba(10, 16, 18, 0.62)", "var(--inset)"],
  ["rgba(10, 16, 18, 0.46)", "var(--inset)"],
  ["rgba(10, 16, 18, 0.6)", "var(--inset)"],
  ["rgba(10, 16, 18, 0.55)", "var(--inset)"],
  ["rgba(10, 16, 19, 0.5)", "var(--inset)"],
  ["rgba(10, 17, 19, 0.72)", "var(--inset)"],
  ["rgba(10, 17, 19, 0.68)", "var(--inset)"],
  ["rgba(11, 18, 20, 0.74)", "var(--inset)"],
  ["rgba(11, 19, 21, 0.74)", "var(--inset)"],
  ["rgba(12, 20, 22, 0.8)", "var(--inset)"],
  ["rgba(13, 20, 23, 0.72)", "var(--inset)"],
  ["rgba(18, 27, 31, 0.96)", "var(--inset)"],
  ["rgba(19, 30, 32, 0.95)", "var(--inset)"],
  ["rgba(10, 24, 18, 0.55)", "var(--inset)"],
  ["#101820", "var(--inset)"],
  ["#1c2330", "var(--inset)"],
  ["#21262d", "var(--inset)"],
  ["#30363d", "var(--line)"], // used both as border and surface chrome

  // --- modal scrims -> --scrim ---
  ["rgba(0, 0, 0, 0.7)", "var(--scrim)"],
  ["rgba(0,0,0,0.7)", "var(--scrim)"],
  ["rgba(0,0,0,0.72)", "var(--scrim)"],
  ["rgba(0,0,0,0.8)", "var(--scrim)"],

  // --- light-gray text colors that vanish on light bg -> --ink-dim ---
  ["#b9c7c1", "var(--ink-dim)"],
  ["#bfcbc6", "var(--ink-dim)"],
  ["#b9c9c3", "var(--ink-dim)"],
  ["#c9d6d1", "var(--ink-dim)"],
  ["#d7e4df", "var(--ink-dim)"],
  ["#d7e2dd", "var(--ink-dim)"],
  ["#d9e5e1", "var(--ink-dim)"],
  ["#d6e1dd", "var(--ink-dim)"],
  ["#e6edf3", "var(--ink-dim)"],
  ["#aab5ff", "var(--accent-3)"],

  // --- hardcoded teal border hexes -> --line ---
  ["#354b4a", "var(--line)"],
  ["#334746", "var(--line)"],
  ["#314043", "var(--line)"],
  ["#304241", "var(--line)"],
  ["#425156", "var(--line)"],
  ["#425957", "var(--line)"],
  ["#486166", "var(--line)"],
  ["#4d5a5d", "var(--line)"],
];

const counts = {};
for (const [needle, repl] of MAP) {
  const parts = css.split(needle);
  const n = parts.length - 1;
  if (n > 0) {
    css = parts.join(repl);
    counts[needle] = n;
  }
}

fs.writeFileSync(FILE, css, "utf8");

let total = 0;
for (const [k, v] of Object.entries(counts)) total += v;
console.log(`Replacements applied: ${total} across ${Object.keys(counts).length} patterns`);
const missed = MAP.filter(([n]) => !counts[n]).map(([n]) => n);
if (missed.length) {
  console.log("\nPatterns not found (may be already handled or spacing differs):");
  for (const m of missed) console.log("  MISS:", m.slice(0, 60));
}
console.log(`\nFile size: ${before.length} -> ${css.length}`);
