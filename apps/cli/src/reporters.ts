import type { PrivacyDecision } from "@privacy-guard/contracts";

import { ErrorOutputSchema, type CliFormat, type ScanOutput } from "./contracts.js";
import type { CliError } from "./errors.js";

export type Writer = (value: string) => void;

export function reportScan(output: ScanOutput, format: CliFormat, write: Writer): void {
  if (format === "json") {
    write(`${JSON.stringify(output)}\n`);
    return;
  }
  for (const result of output.results) {
    if (result.status === "skipped") {
      write(`SKIP  ${result.path} (${result.reasonCode ?? "INPUT_SKIPPED"})\n`);
      continue;
    }
    const decision = result.decision;
    if (decision !== undefined) {
      write(
        `${decision.action.toUpperCase().padEnd(5)} ${result.path} (${decision.detections.length} detections, risk ${decision.riskScore})\n`,
      );
    }
  }
  write(
    `Scanned ${output.summary.scanned}; skipped ${output.summary.skipped}; detections ${output.summary.detections}; violations ${output.summary.violations}.\n`,
  );
}

export function reportError(
  command: string,
  error: CliError,
  format: CliFormat,
  write: Writer,
): void {
  if (format === "json") {
    write(
      `${JSON.stringify(
        ErrorOutputSchema.parse({
          schemaVersion: 1,
          command,
          status: "error",
          error: { code: error.code, message: error.message },
        }),
      )}\n`,
    );
    return;
  }
  write(`Error [${error.code}]: ${error.message}\n`);
}

export function sanitizedText(decision: PrivacyDecision): string | undefined {
  return decision.sanitizedContent?.content;
}
