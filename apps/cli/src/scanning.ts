import type { CliConfig } from "@privacy-guard/configuration";
import type { ContentEnvelope, PrivacyDecision } from "@privacy-guard/contracts";
import { createPrivacyEngine } from "@privacy-guard/privacy-engine";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import { type ScanOutput, ScanOutputSchema, type ScanResult } from "./contracts.js";
import { CliError, ExitCode } from "./errors.js";
import {
  discoverFiles,
  readTextFile,
  type DiscoveredFile,
  type DiscoveryResult,
} from "./filesystem.js";

const cliCapabilities = {
  canCaptureText: true,
  canCaptureAttachments: true,
  canBlockSubmission: true,
  canResumeSubmission: false,
} as const;

export type ScanProgress = {
  completed: number;
  total: number;
  path: string;
};

function createCliEnvelope(
  content: string,
  label: string,
  locale: string,
  attachment?: DiscoveredFile,
): ContentEnvelope {
  return {
    schemaVersion: 1,
    requestId: randomUUID(),
    source: "cli",
    text: [{ id: "content", kind: attachment === undefined ? "stdin" : "file", content, label }],
    attachments:
      attachment === undefined
        ? []
        : [
            {
              id: "attachment",
              name: attachment.displayPath,
              path: attachment.displayPath,
              sizeBytes: attachment.sizeBytes,
            },
          ],
    context: { locale, sourceLabel: label },
    capabilities: cliCapabilities,
  };
}

export async function scanContent(
  content: string,
  label: string,
  config: CliConfig,
  signal?: AbortSignal,
  attachment?: DiscoveredFile,
): Promise<PrivacyDecision> {
  const engine = createPrivacyEngine({ config });
  return engine.scan(createCliEnvelope(content, label, config.locale, attachment), signal);
}

async function scanFile(
  file: DiscoveredFile,
  config: CliConfig,
  signal?: AbortSignal,
): Promise<ScanResult> {
  const input = await readTextFile(file, config.cli.maxFileBytes, signal);
  if (input.kind === "binary") {
    return { path: file.displayPath, status: "skipped", reasonCode: "INPUT_BINARY_SKIPPED" };
  }
  const decision = await scanContent(input.content, file.displayPath, config, signal, file);
  return { path: file.displayPath, status: "scanned", decision };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
  onCompleted?: (result: R, completed: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  let completed = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) {
        const result = await operation(value);
        results[index] = result;
        completed += 1;
        onCompleted?.(result, completed, values.length);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function scanDiscovery(
  command: "scan" | "workspace.scan",
  discovery: DiscoveryResult,
  config: CliConfig,
  signal?: AbortSignal,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanOutput> {
  const scanned = await mapWithConcurrency(
    discovery.files,
    config.cli.concurrency,
    (file) => scanFile(file, config, signal),
    (result, completed, total) => onProgress?.({ completed, total, path: result.path }),
  );
  const skipped: ScanResult[] = discovery.skipped.map((entry) => ({
    path: entry.path,
    status: "skipped",
    reasonCode: entry.reasonCode,
  }));
  const results = [...scanned, ...skipped].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const decisions = results.flatMap((result) =>
    result.decision === undefined ? [] : [result.decision],
  );
  const violations = decisions.filter(({ action }) => action !== "allow").length;
  return ScanOutputSchema.parse({
    schemaVersion: 1,
    command,
    status: violations === 0 ? "success" : "policy_violation",
    results,
    summary: {
      scanned: decisions.length,
      skipped: results.length - decisions.length,
      detections: decisions.reduce((total, decision) => total + decision.detections.length, 0),
      violations,
    },
  });
}

export async function scanPath(
  command: "scan" | "workspace.scan",
  path: string,
  config: CliConfig,
  signal?: AbortSignal,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanOutput> {
  return scanDiscovery(
    command,
    await discoverFiles(path, config.cli, signal),
    config,
    signal,
    onProgress,
  );
}

export async function readStandardInput(
  input: Readable,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let content = "";
  let bytesRead = 0;
  for await (const value of input) {
    signal?.throwIfAborted();
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    bytesRead += chunk.byteLength;
    if (bytesRead > maxBytes) {
      throw new CliError(
        "INPUT_STDIN_LIMIT_EXCEEDED",
        "Standard input exceeds the configured local scan limit.",
        ExitCode.unsafeRead,
      );
    }
    try {
      content += decoder.decode(chunk, { stream: true });
    } catch (error) {
      throw new CliError(
        "INPUT_UNSUPPORTED_ENCODING",
        "Standard input is not supported UTF-8 text.",
        ExitCode.unsupported,
        { cause: error },
      );
    }
  }
  content += decoder.decode();
  return content;
}

export async function scanStdin(
  input: Readable,
  config: CliConfig,
  signal?: AbortSignal,
): Promise<ScanOutput> {
  const content = await readStandardInput(input, config.cli.maxFileBytes, signal);
  const decision = await scanContent(content, "stdin", config, signal);
  return ScanOutputSchema.parse({
    schemaVersion: 1,
    command: "scan",
    status: decision.action === "allow" ? "success" : "policy_violation",
    results: [{ path: "stdin", status: "scanned", decision }],
    summary: {
      scanned: 1,
      skipped: 0,
      detections: decision.detections.length,
      violations: decision.action === "allow" ? 0 : 1,
    },
  });
}
