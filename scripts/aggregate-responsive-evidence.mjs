#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { aggregateResponsiveEvidence, publishResponsiveAggregateReport } from './lib/responsive-evidence-aggregate.mjs';

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: node scripts/aggregate-responsive-evidence.mjs --input <shard-directory> --expected <deploy-manifest.json> --output <aggregate-directory>');
    return 0;
  }
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!['--input', '--expected', '--output'].includes(flag) || values[flag] || !value || value.startsWith('--')) throw new Error('Explicit unique input, expected and output paths are required.');
    values[flag] = value;
  }
  if (Object.keys(values).length !== 3) throw new Error('Input, expected and output paths are required.');
  const output = path.resolve(values['--output']);
  const expected = JSON.parse(await fs.readFile(values['--expected'], 'utf8'));
  const report = await aggregateResponsiveEvidence({ inputDir: values['--input'], expected, outputDir: output });
  await publishResponsiveAggregateReport(output, report);
  console.log(`Responsive aggregate ${report.status}: ${report.coverage.completedRequiredCaptures}/${report.coverage.requiredCaptures} records across ${report.shards.length}/3 profiles.`);
  if (!report.complete) console.error(report.failures.join('\n'));
  return report.complete ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
