import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { ExitCode } from "./errors.js";
import { runCli } from "./program.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

function capture(): { output: string[]; errors: string[] } {
  return { output: [], errors: [] };
}

describe("CLI program", () => {
  it("scans a verified Codex prompt and workspace before forwarding its exit code", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiprivacy-agent-safe-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "README.md"), "A safe local project.", "utf8");
    const writes = capture();
    const launches: string[][] = [];
    const exitCode = await runCli(["run", "--", "codex", "exec", "Explain binary search."], {
      cwd: directory,
      launchAgent: (plan) => {
        launches.push([...plan.command]);
        return Promise.resolve(37);
      },
      writeOut: (value) => writes.output.push(value),
      writeError: (value) => writes.errors.push(value),
      isInteractive: false,
    });
    expect(exitCode).toBe(37);
    expect(launches).toEqual([["codex", "exec", "Explain binary search."]]);
    expect(writes.errors.join("")).toContain("Protected adapter: codex-exec/v1");
    expect(writes.errors.join("")).toContain("ALLOW run");
  });

  it("blocks a sensitive agent prompt before the process is created", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiprivacy-agent-block-"));
    temporaryDirectories.push(directory);
    const writes = capture();
    let launched = false;
    const secret = `sk-proj-${"A1b2".repeat(8)}`;
    const exitCode = await runCli(
      ["--format", "json", "run", "--", "codex", "exec", `Use ${secret}`],
      {
        cwd: directory,
        launchAgent: () => {
          launched = true;
          return Promise.resolve(0);
        },
        writeOut: (value) => writes.output.push(value),
        writeError: (value) => writes.errors.push(value),
        isInteractive: false,
      },
    );
    expect(exitCode).toBe(ExitCode.policyViolation);
    expect(launched).toBe(false);
    expect(JSON.parse(writes.errors.join(""))).toMatchObject({
      schemaVersion: 1,
      command: "run",
      status: "policy_violation",
      launched: false,
      adapter: { id: "codex-exec", version: 1 },
      categories: ["api_key"],
    });
    expect(writes.errors.join("")).not.toContain(secret);
  });

  it("blocks sensitive workspace context before agent execution", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiprivacy-agent-context-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "private.txt"), "Contact person@example.com", "utf8");
    let launched = false;
    const exitCode = await runCli(["run", "--", "codex", "exec", "Summarize this project."], {
      cwd: directory,
      launchAgent: () => {
        launched = true;
        return Promise.resolve(0);
      },
      writeOut: () => undefined,
      writeError: () => undefined,
      isInteractive: false,
    });
    expect(exitCode).toBe(ExitCode.policyViolation);
    expect(launched).toBe(false);
  });

  it("provides stable JSON and a policy-violation exit code", async () => {
    const writes = capture();
    const secret = `sk-proj-${"A1b2".repeat(8)}`;
    const exitCode = await runCli(["--format", "json", "scan", "--stdin"], {
      input: Readable.from([`api_key=${secret}`]),
      writeOut: (value) => writes.output.push(value),
      writeError: (value) => writes.errors.push(value),
      isInteractive: false,
    });
    const output = JSON.parse(writes.output.join("")) as { schemaVersion: number; status: string };
    expect(exitCode).toBe(ExitCode.policyViolation);
    expect(output).toMatchObject({ schemaVersion: 1, status: "policy_violation" });
    expect(writes.output.join("")).not.toContain(secret);
    expect(writes.errors).toEqual([]);
  });

  it("returns a versioned JSON error for invalid input selection", async () => {
    const writes = capture();
    const exitCode = await runCli(["--format", "json", "scan"], {
      writeOut: (value) => writes.output.push(value),
      writeError: (value) => writes.errors.push(value),
      isInteractive: false,
    });
    expect(exitCode).toBe(ExitCode.invalidInput);
    expect(JSON.parse(writes.errors.join(""))).toMatchObject({
      schemaVersion: 1,
      command: "scan",
      status: "error",
      error: { code: "CLI_INPUT_REQUIRED" },
    });
  });

  it("does not modify a file during a redaction preview", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiprivacy-redact-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "input.txt");
    const original = "Contact person@example.com";
    await writeFile(path, original, "utf8");
    const writes = capture();
    const exitCode = await runCli(["redact", "--preview", path], {
      writeOut: (value) => writes.output.push(value),
      writeError: (value) => writes.errors.push(value),
      isInteractive: false,
    });
    expect(exitCode).toBe(ExitCode.policyViolation);
    expect(writes.output.join("")).toContain("[EMAIL]");
    expect(await readFile(path, "utf8")).toBe(original);
  });

  it("requires explicit authorization for in-place modification", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiprivacy-write-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "input.txt");
    await writeFile(path, "Contact person@example.com", "utf8");
    const writes = capture();
    const denied = await runCli(["redact", "--write", path], {
      writeOut: (value) => writes.output.push(value),
      writeError: (value) => writes.errors.push(value),
      isInteractive: false,
    });
    expect(denied).toBe(ExitCode.invalidInput);
    expect(await readFile(path, "utf8")).toContain("person@example.com");

    const approved = await runCli(["redact", "--write", "--force", path], {
      writeOut: (value) => writes.output.push(value),
      writeError: (value) => writes.errors.push(value),
      isInteractive: false,
    });
    expect(approved).toBe(ExitCode.policyViolation);
    expect(await readFile(path, "utf8")).toContain("[EMAIL]");
  });

  it("writes to an explicit output without changing the source", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiprivacy-output-"));
    temporaryDirectories.push(directory);
    const source = join(directory, "source.txt");
    const destination = join(directory, "sanitized.txt");
    const original = "Contact person@example.com";
    await writeFile(source, original, "utf8");
    const writes = capture();
    const exitCode = await runCli(["redact", "--output", destination, source], {
      writeOut: (value) => writes.output.push(value),
      writeError: (value) => writes.errors.push(value),
      isInteractive: false,
    });
    expect(exitCode).toBe(ExitCode.policyViolation);
    expect(await readFile(source, "utf8")).toBe(original);
    expect(await readFile(destination, "utf8")).toBe("Contact [EMAIL]");
  });

  it("initializes, validates, and reports local configuration status", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiprivacy-command-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "config.json");
    const writes = capture();
    expect(
      await runCli(["--config", configPath, "config", "init"], {
        writeOut: (value) => writes.output.push(value),
        writeError: (value) => writes.errors.push(value),
        isInteractive: false,
      }),
    ).toBe(ExitCode.success);
    expect(
      await runCli(["--config", configPath, "config", "validate"], {
        writeOut: (value) => writes.output.push(value),
        writeError: (value) => writes.errors.push(value),
        isInteractive: false,
      }),
    ).toBe(ExitCode.success);

    const statusOutput = capture();
    expect(
      await runCli(["--format", "json", "--config", configPath, "status"], {
        writeOut: (value) => statusOutput.output.push(value),
        writeError: (value) => statusOutput.errors.push(value),
        isInteractive: false,
      }),
    ).toBe(ExitCode.success);
    expect(JSON.parse(statusOutput.output.join(""))).toMatchObject({
      schemaVersion: 1,
      command: "status",
      localOnly: true,
      configPath,
    });
  });

  it("reports progress separately from human scan results", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiprivacy-progress-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "safe.txt"), "Explain binary search.", "utf8");
    const writes = capture();
    expect(
      await runCli(["workspace", "scan", directory], {
        writeOut: (value) => writes.output.push(value),
        writeError: (value) => writes.errors.push(value),
        isInteractive: false,
      }),
    ).toBe(ExitCode.success);
    expect(writes.errors.join("")).toContain("Scanning 1/1: safe.txt");
    expect(writes.output.join("")).toContain("Scanned 1");
  });
});
