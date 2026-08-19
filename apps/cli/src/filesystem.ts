import type { CliScanConfig } from "@privacy-guard/configuration";
import createIgnore, { type Ignore } from "ignore";
import { createReadStream, type Stats } from "node:fs";
import { lstat, opendir, readFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

import { CliError, ExitCode } from "./errors.js";

export type DiscoveredFile = {
  absolutePath: string;
  displayPath: string;
  sizeBytes: number;
};

export type DiscoveryResult = {
  files: DiscoveredFile[];
  skipped: { path: string; reasonCode: string }[];
};

function portablePath(value: string): string {
  return value.split(sep).join("/");
}

async function addIgnoreFile(ignoreRules: Ignore, path: string): Promise<void> {
  try {
    ignoreRules.add(await readFile(path, "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

async function addNestedGitignore(
  ignoreRules: Ignore,
  directory: string,
  root: string,
): Promise<void> {
  const base = portablePath(relative(root, directory));
  if (base.length === 0) return;
  try {
    const source = await readFile(join(directory, ".gitignore"), "utf8");
    const scopedPatterns = source.split(/\r?\n/u).flatMap((line) => {
      if (line.length === 0 || line.startsWith("#") || line.startsWith("\\#")) return [line];
      const negated = line.startsWith("!");
      const pattern = negated ? line.slice(1) : line;
      const prefix = negated ? "!" : "";
      if (pattern.startsWith("/")) return [`${prefix}${base}/${pattern.slice(1)}`];
      if (pattern.includes("/")) return [`${prefix}${base}/${pattern}`];
      return [`${prefix}${base}/${pattern}`, `${prefix}${base}/**/${pattern}`];
    });
    ignoreRules.add(scopedPatterns);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

export async function discoverFiles(
  inputPath: string,
  config: CliScanConfig,
  signal?: AbortSignal,
): Promise<DiscoveryResult> {
  const absoluteRoot = resolve(inputPath);
  const rootStats = await safeLstat(absoluteRoot);
  if (rootStats.isSymbolicLink()) {
    throw new CliError(
      "INPUT_UNSAFE_SYMLINK",
      "Symbolic-link inputs are not followed by default.",
      ExitCode.unsafeRead,
    );
  }
  if (rootStats.isFile()) {
    return {
      files: [
        {
          absolutePath: absoluteRoot,
          displayPath: basename(absoluteRoot),
          sizeBytes: rootStats.size,
        },
      ],
      skipped: [],
    };
  }
  if (!rootStats.isDirectory()) {
    throw new CliError(
      "INPUT_UNSUPPORTED_TYPE",
      "The input is not a regular file or directory.",
      ExitCode.unsupported,
    );
  }

  const ignoreRules = createIgnore().add([".git/", "node_modules/"]);
  if (config.respectGitignore) await addIgnoreFile(ignoreRules, join(absoluteRoot, ".gitignore"));
  await addIgnoreFile(ignoreRules, join(absoluteRoot, config.privacyIgnoreFile));

  const files: DiscoveredFile[] = [];
  const skipped: DiscoveryResult["skipped"] = [];
  let totalBytes = 0;

  async function visit(directory: string): Promise<void> {
    signal?.throwIfAborted();
    if (config.respectGitignore) await addNestedGitignore(ignoreRules, directory, absoluteRoot);
    const entries = [];
    for await (const entry of await opendir(directory)) entries.push(entry);
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      signal?.throwIfAborted();
      const absolutePath = join(directory, entry.name);
      const displayPath = portablePath(relative(absoluteRoot, absolutePath));
      const ignorePath = `${displayPath}${entry.isDirectory() ? "/" : ""}`;
      if (ignoreRules.ignores(ignorePath)) {
        skipped.push({ path: displayPath, reasonCode: "INPUT_IGNORED" });
        continue;
      }

      if (entry.isSymbolicLink()) {
        skipped.push({ path: displayPath, reasonCode: "INPUT_SYMLINK_SKIPPED" });
        continue;
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        skipped.push({ path: displayPath, reasonCode: "INPUT_UNSUPPORTED_TYPE" });
        continue;
      }

      const stats = await safeLstat(absolutePath);
      if (stats.size > config.maxFileBytes) {
        skipped.push({ path: displayPath, reasonCode: "INPUT_FILE_LIMIT_EXCEEDED" });
        continue;
      }
      if (files.length >= config.maxFiles || totalBytes + stats.size > config.maxTotalBytes) {
        throw new CliError(
          "INPUT_WORKSPACE_LIMIT_EXCEEDED",
          "The workspace exceeds the configured local scan limits.",
          ExitCode.unsafeRead,
        );
      }
      totalBytes += stats.size;
      files.push({ absolutePath, displayPath, sizeBytes: stats.size });
    }
  }

  await visit(absoluteRoot);
  return { files, skipped };
}

export async function readTextFile(
  file: DiscoveredFile,
  maxFileBytes: number,
  signal?: AbortSignal,
): Promise<{ kind: "text"; content: string } | { kind: "binary" }> {
  if (file.sizeBytes > maxFileBytes) {
    throw new CliError(
      "INPUT_FILE_LIMIT_EXCEEDED",
      "The file exceeds the configured local scan limit.",
      ExitCode.unsafeRead,
    );
  }

  const stream = createReadStream(file.absolutePath, { highWaterMark: 64 * 1024 });
  const abort = (): void => {
    stream.destroy(new DOMException("Cancelled", "AbortError"));
  };
  signal?.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let content = "";
  let bytesRead = 0;
  let firstChunk = true;

  try {
    for await (const value of stream) {
      signal?.throwIfAborted();
      const chunk = value as Buffer;
      bytesRead += chunk.byteLength;
      if (bytesRead > maxFileBytes) {
        throw new CliError(
          "INPUT_FILE_LIMIT_EXCEEDED",
          "The file grew beyond the configured local scan limit.",
          ExitCode.unsafeRead,
        );
      }
      if (firstChunk && isProbablyBinary(chunk)) {
        stream.destroy();
        return { kind: "binary" };
      }
      firstChunk = false;
      try {
        content += decoder.decode(chunk, { stream: true });
      } catch (error) {
        throw new CliError(
          "INPUT_UNSUPPORTED_ENCODING",
          "The file is not supported UTF-8 text.",
          ExitCode.unsupported,
          { cause: error },
        );
      }
    }
    content += decoder.decode();
    return { kind: "text", content };
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

async function safeLstat(path: string): Promise<Stats> {
  try {
    return await lstat(path);
  } catch (error) {
    throw new CliError(
      "INPUT_UNREADABLE",
      "The input could not be read safely.",
      ExitCode.unsafeRead,
      {
        cause: error,
      },
    );
  }
}

function isProbablyBinary(chunk: Buffer): boolean {
  if (chunk.includes(0)) return true;
  const sampleLength = Math.min(chunk.length, 8_192);
  if (sampleLength === 0) return false;
  let controls = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = chunk[index];
    if (byte !== undefined && byte < 9) controls += 1;
  }
  return controls / sampleLength > 0.05;
}
