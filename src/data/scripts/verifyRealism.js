import fs from "node:fs";
import path from "node:path";
import { createSession } from "../../runtime/bootstrap.js";

function parseArgs(argv) {
  const args = {
    seasons: 12,
    seed: 2026,
    startYear: new Date().getFullYear(),
    realismProfilePath: null,
    careerRealismProfilePath: null,
    outFile: "output/realism-verification.json"
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--seasons") args.seasons = Number(argv[i + 1]);
    if (arg === "--seed") args.seed = Number(argv[i + 1]);
    if (arg === "--startYear") args.startYear = Number(argv[i + 1]);
    if (arg === "--realismProfilePath") args.realismProfilePath = argv[i + 1];
    if (arg === "--careerRealismProfilePath") args.careerRealismProfilePath = argv[i + 1];
    if (arg === "--outFile") args.outFile = argv[i + 1];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const session = createSession({
    seed: Number.isFinite(args.seed) ? args.seed : 2026,
    startYear: Number.isFinite(args.startYear) ? args.startYear : new Date().getFullYear(),
    realismProfilePath: args.realismProfilePath || null,
    careerRealismProfilePath: args.careerRealismProfilePath || null
  });
  const report = session.runRealismVerification({ seasons: Number.isFinite(args.seasons) ? args.seasons : 12 });

  const outPath = path.resolve(args.outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Realism verification report written: ${outPath}`);
  console.log(
    `Season => on-target ${report.statusSummary?.season?.onTarget || 0}, watch ${report.statusSummary?.season?.watch || 0}, out ${report.statusSummary?.season?.outOfRange || 0}`
  );
  console.log(
    `Career => on-target ${report.statusSummary?.career?.onTarget || 0}, watch ${report.statusSummary?.career?.watch || 0}, out ${report.statusSummary?.career?.outOfRange || 0}`
  );
}

main();
