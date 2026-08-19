import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const resultsDirectory = resolve(process.argv[2] ?? "codeql-results");
const files = (await readdir(resultsDirectory, { recursive: true }))
  .filter((file) => file.endsWith(".sarif"))
  .sort();

if (files.length === 0) {
  throw new Error(`No CodeQL SARIF reports were found in ${resultsDirectory}.`);
}

const findings = [];
for (const file of files) {
  const report = JSON.parse(await readFile(resolve(resultsDirectory, file), "utf8"));
  for (const run of report.runs ?? []) {
    for (const result of run.results ?? []) {
      findings.push({
        file,
        level: result.level ?? "warning",
        ruleId: result.ruleId ?? "unknown-rule",
      });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    process.stderr.write(`${finding.level} ${finding.ruleId} (${finding.file})\n`);
  }
  throw new Error(`CodeQL reported ${findings.length} security finding(s).`);
}

process.stdout.write(`CodeQL reported zero findings across ${files.length} SARIF report(s).\n`);
