import fs from "node:fs";
import path from "node:path";
import { buildCareerProfileFromPfrRows, buildWeightedProfileFromPfrRows } from "../../stats/realismCalibrator.js";

function parseArgs(argv) {
  const args = {
    input: null,
    output: "src/stats/profiles/pfr-recent-generated.profile.json",
    careerOutput: "src/stats/profiles/pfr-career-generated.profile.json",
    fromYear: 2019,
    toYear: 2025,
    halfLife: 2.2,
    careerFromYear: 2000
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[i + 1];
    if (arg === "--output") args.output = argv[i + 1];
    if (arg === "--fromYear") args.fromYear = Number(argv[i + 1]);
    if (arg === "--toYear") args.toYear = Number(argv[i + 1]);
    if (arg === "--halfLife") args.halfLife = Number(argv[i + 1]);
    if (arg === "--careerOutput") args.careerOutput = argv[i + 1];
    if (arg === "--careerFromYear") args.careerFromYear = Number(argv[i + 1]);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Missing --input path to season-level PFR rows (JSON array).");
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!Array.isArray(rows)) {
    console.error("Input JSON must be an array of season rows.");
    process.exit(1);
  }

  const profile = buildWeightedProfileFromPfrRows(rows, {
    fromYear: args.fromYear,
    toYear: args.toYear,
    halfLife: args.halfLife
  });
  const careerProfile = buildCareerProfileFromPfrRows(rows, {
    fromYear: args.careerFromYear,
    toYear: args.toYear,
    minCareerSeasons: 2
  });

  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  const careerOutputPath = path.resolve(args.careerOutput);
  fs.mkdirSync(path.dirname(careerOutputPath), { recursive: true });
  fs.writeFileSync(careerOutputPath, `${JSON.stringify(careerProfile, null, 2)}\n`, "utf8");

  console.log(`Wrote realism profile: ${outputPath}`);
  console.log(`Wrote career realism profile: ${careerOutputPath}`);
  console.log(`Rows processed: ${rows.length}`);
}

main();
