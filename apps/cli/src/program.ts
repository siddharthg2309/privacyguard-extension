import { confirm } from "@inquirer/prompts";
import type { CliConfig } from "@privacy-guard/configuration";
import { Command, CommanderError, Option } from "commander";
import { randomUUID } from "node:crypto";
import { access, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";

import { initializeCliConfig, loadCliConfig, resolveConfigPath } from "./configuration.js";
import {
  CliFormatSchema,
  DoctorOutputSchema,
  RedactOutputSchema,
  StatusOutputSchema,
  type CliFormat,
} from "./contracts.js";
import { CliError, ExitCode, type ExitCodeValue, toCliError } from "./errors.js";
import { discoverFiles, readTextFile } from "./filesystem.js";
import { reportError, reportScan, sanitizedText, type Writer } from "./reporters.js";
import { scanContent, scanPath, scanStdin } from "./scanning.js";

const VERSION = "0.2.0";

export type CliRuntime = {
  input: Readable;
  writeOut: Writer;
  writeError: Writer;
  isInteractive: boolean;
  signal?: AbortSignal;
};

const defaultRuntime: CliRuntime = {
  input: process.stdin,
  writeOut: (value) => process.stdout.write(value),
  writeError: (value) => process.stderr.write(value),
  isInteractive: process.stdin.isTTY && process.stdout.isTTY,
};

type GlobalOptions = { config?: string; format: CliFormat };

function globalOptions(program: Command): GlobalOptions {
  const options = program.opts<GlobalOptions>();
  return {
    format: CliFormatSchema.parse(options.format),
    ...(options.config ? { config: options.config } : {}),
  };
}

async function loadConfig(program: Command): Promise<{ config: CliConfig; path: string }> {
  const options = globalOptions(program);
  const path = options.config === undefined ? resolveConfigPath() : resolve(options.config);
  return { config: await loadCliConfig(path), path };
}

async function atomicWrite(path: string, content: string, force: boolean): Promise<void> {
  const destination = resolve(path);
  const destinationExists = await pathExists(destination);
  if (!force && destinationExists) {
    throw new CliError(
      "CLI_OUTPUT_EXISTS",
      "The output already exists; use --force to replace it.",
      ExitCode.invalidInput,
    );
  }
  const temporary = join(dirname(destination), `.aiprivacy-${randomUUID()}.tmp`);
  const backup = join(dirname(destination), `.aiprivacy-${randomUUID()}.backup`);
  let backupCreated = false;
  try {
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    if (destinationExists) {
      await rename(destination, backup);
      backupCreated = true;
    }
    await rename(temporary, destination);
    if (backupCreated) await unlink(backup);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    if (backupCreated) await rename(backup, destination).catch(() => undefined);
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function scanExitCode(violations: number): ExitCodeValue {
  return violations === 0 ? ExitCode.success : ExitCode.policyViolation;
}

function progressReporter(
  format: CliFormat,
  write: Writer,
): ((progress: { completed: number; total: number; path: string }) => void) | undefined {
  if (format === "json") return undefined;
  return ({ completed, total, path }) => {
    write(`Scanning ${completed}/${total}: ${path}\n`);
  };
}

export async function runCli(
  arguments_: readonly string[],
  runtimeOverrides: Partial<CliRuntime> = {},
): Promise<ExitCodeValue> {
  const runtime: CliRuntime = { ...defaultRuntime, ...runtimeOverrides };
  let exitCode: ExitCodeValue = ExitCode.success;
  let activeCommand = "cli";
  const program = new Command();
  program
    .name("aiprivacy")
    .description("Inspect content locally before sharing it with an AI service.")
    .version(VERSION)
    .option("--config <path>", "use an explicit local configuration file")
    .addOption(
      new Option("--format <format>", "output format").choices(["human", "json"]).default("human"),
    )
    .exitOverride()
    .configureOutput({
      writeOut: runtime.writeOut,
      writeErr: runtime.writeError,
    });

  async function execute(command: string, operation: () => Promise<ExitCodeValue>): Promise<void> {
    activeCommand = command;
    try {
      exitCode = await operation();
    } catch (error) {
      const cliError = toCliError(error);
      reportError(command, cliError, globalOptions(program).format, runtime.writeError);
      exitCode = cliError.exitCode;
    }
  }

  program
    .command("scan [path]")
    .description("scan a file, directory, or standard input")
    .option("--stdin", "read bounded UTF-8 content from standard input")
    .action(async (path: string | undefined, options: { stdin?: boolean }) => {
      await execute("scan", async () => {
        if ((path === undefined) === (options.stdin !== true)) {
          throw new CliError(
            "CLI_INPUT_REQUIRED",
            "Provide exactly one path or --stdin.",
            ExitCode.invalidInput,
          );
        }
        const { config } = await loadConfig(program);
        let output;
        if (options.stdin === true) {
          output = await scanStdin(runtime.input, config, runtime.signal);
        } else if (path !== undefined) {
          output = await scanPath(
            "scan",
            path,
            config,
            runtime.signal,
            progressReporter(globalOptions(program).format, runtime.writeError),
          );
        } else {
          throw new CliError("CLI_INPUT_REQUIRED", "Provide a path.", ExitCode.invalidInput);
        }
        reportScan(output, globalOptions(program).format, runtime.writeOut);
        return scanExitCode(output.summary.violations);
      });
    });

  program
    .command("redact <path>")
    .description("preview or explicitly write sanitized file content")
    .option("--preview", "print the exact sanitized output without modifying a file")
    .option("--output <path>", "write sanitized content to a new path")
    .option("--write", "replace the input file after explicit confirmation")
    .option("--force", "allow a requested overwrite without an interactive prompt")
    .action(
      async (
        path: string,
        options: { force?: boolean; output?: string; preview?: boolean; write?: boolean },
      ) => {
        await execute("redact", async () => {
          if (options.write === true && options.output !== undefined) {
            throw new CliError(
              "CLI_CONFLICTING_OPTIONS",
              "Use either --write or --output, not both.",
              ExitCode.invalidInput,
            );
          }
          const { config } = await loadConfig(program);
          const discovery = await discoverFiles(path, config.cli, runtime.signal);
          const file = discovery.files[0];
          if (file === undefined || discovery.files.length !== 1) {
            throw new CliError(
              "CLI_REDACT_REQUIRES_FILE",
              "Redaction requires exactly one regular text file.",
              ExitCode.invalidInput,
            );
          }
          const input = await readTextFile(file, config.cli.maxFileBytes, runtime.signal);
          if (input.kind === "binary") {
            throw new CliError(
              "INPUT_BINARY_UNSUPPORTED",
              "Binary files cannot be redacted.",
              ExitCode.unsupported,
            );
          }
          const decision = await scanContent(
            input.content,
            file.displayPath,
            config,
            runtime.signal,
            file,
          );
          const sanitized = sanitizedText(decision) ?? input.content;

          if (options.write === true) {
            let approved = options.force === true;
            if (!approved && runtime.isInteractive) {
              approved = await confirm({
                message: `Replace ${file.displayPath} with the displayed sanitized content?`,
                default: false,
              });
            }
            if (!approved) {
              throw new CliError(
                "CLI_WRITE_CONFIRMATION_REQUIRED",
                "In-place redaction requires confirmation or --force.",
                ExitCode.invalidInput,
              );
            }
            const originalMode = (await stat(file.absolutePath)).mode;
            await atomicWrite(file.absolutePath, sanitized, true);
            await import("node:fs/promises").then(({ chmod }) =>
              chmod(file.absolutePath, originalMode),
            );
            runtime.writeOut(`Redacted ${file.displayPath}.\n`);
          } else if (options.output !== undefined) {
            await atomicWrite(options.output, sanitized, options.force === true);
            runtime.writeOut(`Wrote sanitized content to ${options.output}.\n`);
          } else if (globalOptions(program).format === "json") {
            runtime.writeOut(
              `${JSON.stringify(
                RedactOutputSchema.parse({
                  schemaVersion: 1,
                  command: "redact",
                  status: decision.action === "allow" ? "success" : "policy_violation",
                  path: file.displayPath,
                  decision,
                  sanitizedContent: sanitized,
                }),
              )}\n`,
            );
          } else {
            runtime.writeOut(sanitized);
            if (!sanitized.endsWith("\n")) runtime.writeOut("\n");
          }
          return scanExitCode(decision.action === "allow" ? 0 : 1);
        });
      },
    );

  const workspace = program.command("workspace").description("workspace operations");
  workspace
    .command("scan [path]")
    .description("scan a bounded workspace while respecting ignore rules")
    .action(async (path: unknown = ".") => {
      await execute("workspace.scan", async () => {
        const workspacePath = typeof path === "string" ? path : ".";
        const { config } = await loadConfig(program);
        const output = await scanPath(
          "workspace.scan",
          workspacePath,
          config,
          runtime.signal,
          progressReporter(globalOptions(program).format, runtime.writeError),
        );
        reportScan(output, globalOptions(program).format, runtime.writeOut);
        return scanExitCode(output.summary.violations);
      });
    });

  program
    .command("config [action]")
    .description("show, validate, locate, or initialize local configuration")
    .option("--force", "replace an existing configuration during init")
    .action(async (action = "show", options: { force?: boolean }) => {
      await execute("config", async () => {
        const explicitConfigPath = globalOptions(program).config;
        const configPath =
          explicitConfigPath === undefined ? resolveConfigPath() : resolve(explicitConfigPath);
        if (action === "path") {
          runtime.writeOut(`${configPath}\n`);
          return ExitCode.success;
        }
        if (action === "init") {
          await initializeCliConfig(configPath, options.force === true);
          runtime.writeOut(`Initialized local configuration at ${configPath}.\n`);
          return ExitCode.success;
        }
        const config = await loadCliConfig(configPath);
        if (action === "validate") {
          runtime.writeOut("Configuration is valid.\n");
          return ExitCode.success;
        }
        if (action !== "show") {
          throw new CliError(
            "CLI_UNKNOWN_CONFIG_ACTION",
            "Config action must be show, validate, path, or init.",
            ExitCode.invalidInput,
          );
        }
        runtime.writeOut(`${JSON.stringify(config, null, 2)}\n`);
        return ExitCode.success;
      });
    });

  program
    .command("status")
    .description("show local protection and configuration status")
    .action(async () => {
      await execute("status", async () => {
        const { path } = await loadConfig(program);
        const output = StatusOutputSchema.parse({
          schemaVersion: 1,
          command: "status",
          localOnly: true,
          engine: "ready",
          configPath: path,
        });
        runtime.writeOut(
          globalOptions(program).format === "json"
            ? `${JSON.stringify(output)}\n`
            : `Local-only engine: ready\nConfiguration: ${path}\n`,
        );
        return ExitCode.success;
      });
    });

  program
    .command("doctor")
    .description("check the local runtime and configuration")
    .action(async () => {
      await execute("doctor", async () => {
        const checks: { id: string; status: "pass" | "fail" }[] = [];
        checks.push({
          id: "node_24_or_newer",
          status: Number(process.versions.node.split(".")[0]) >= 24 ? "pass" : "fail",
        });
        try {
          await loadConfig(program);
          checks.push({ id: "configuration", status: "pass" });
        } catch {
          checks.push({ id: "configuration", status: "fail" });
        }
        try {
          await access(process.cwd());
          checks.push({ id: "working_directory", status: "pass" });
        } catch {
          checks.push({ id: "working_directory", status: "fail" });
        }
        const healthy = checks.every(({ status }) => status === "pass");
        const output = DoctorOutputSchema.parse({
          schemaVersion: 1,
          command: "doctor",
          healthy,
          checks,
        });
        if (globalOptions(program).format === "json") {
          runtime.writeOut(`${JSON.stringify(output)}\n`);
        } else {
          for (const check of checks)
            runtime.writeOut(`${check.status.toUpperCase()} ${check.id}\n`);
        }
        return healthy ? ExitCode.success : ExitCode.internalFailure;
      });
    });

  try {
    await program.parseAsync([...arguments_], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
        return ExitCode.success;
      }
      const cliError = new CliError(
        "CLI_INVALID_ARGUMENTS",
        "The command-line arguments are invalid.",
        ExitCode.invalidInput,
        { cause: error },
      );
      reportError(activeCommand, cliError, globalOptions(program).format, runtime.writeError);
      return cliError.exitCode;
    }
    const cliError = toCliError(error);
    reportError(activeCommand, cliError, globalOptions(program).format, runtime.writeError);
    return cliError.exitCode;
  }
  return exitCode;
}
