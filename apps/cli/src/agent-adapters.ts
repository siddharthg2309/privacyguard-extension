import { spawn } from "node:child_process";
import { basename, resolve } from "node:path";

import { CliError, ExitCode } from "./errors.js";

export const AGENT_ADAPTER_VERSION = 1 as const;

export type AgentInvocation = {
  command: readonly string[];
  cwd: string;
};

export type AgentInspectionPlan = {
  adapterVersion: typeof AGENT_ADAPTER_VERSION;
  adapterId: "codex-exec";
  command: readonly string[];
  cwd: string;
  prompt: string;
  contextRoots: readonly string[];
  disclosures: readonly string[];
};

export interface AgentAdapter {
  readonly id: AgentInspectionPlan["adapterId"];
  readonly version: typeof AGENT_ADAPTER_VERSION;
  supports(invocation: AgentInvocation): boolean;
  inspect(invocation: AgentInvocation): AgentInspectionPlan;
}

const valueOptions = new Set([
  "-c",
  "--config",
  "--enable",
  "--disable",
  "-m",
  "--model",
  "--local-provider",
  "-p",
  "--profile",
  "-s",
  "--sandbox",
  "-C",
  "--cd",
  "--add-dir",
  "--output-schema",
  "--color",
  "-o",
  "--output-last-message",
]);

const flagOptions = new Set([
  "--oss",
  "--strict-config",
  "--approve-for-me",
  "--dangerously-bypass-approvals-and-sandbox",
  "--dangerously-bypass-hook-trust",
  "--skip-git-repo-check",
  "--ephemeral",
  "--ignore-user-config",
  "--ignore-rules",
  "--json",
]);

function unsupported(message: string): never {
  throw new CliError("CLI_AGENT_CONTEXT_UNSUPPORTED", message, ExitCode.unsupported);
}

function executableName(value: string): string {
  return basename(value)
    .toLowerCase()
    .replace(/\.(?:exe|cmd|bat)$/u, "");
}

function optionName(value: string): string {
  const separator = value.indexOf("=");
  return separator === -1 ? value : value.slice(0, separator);
}

function optionInlineValue(value: string): string | undefined {
  const separator = value.indexOf("=");
  return separator === -1 ? undefined : value.slice(separator + 1);
}

export const codexExecAdapter: AgentAdapter = {
  id: "codex-exec",
  version: AGENT_ADAPTER_VERSION,
  supports: ({ command }) => command[0] !== undefined && executableName(command[0]) === "codex",
  inspect: ({ command, cwd }) => {
    if (command[1] !== "exec") {
      unsupported(
        "Only fresh `codex exec` invocations are protected. Resume, fork, review, and interactive sessions may contain context that cannot be inspected before execution.",
      );
    }

    let effectiveCwd = resolve(cwd);
    const additionalRoots: string[] = [];
    const positionals: string[] = [];
    let positionalOnly = false;

    for (let index = 2; index < command.length; index += 1) {
      const argument = command[index];
      if (argument === undefined) continue;
      if (positionalOnly) {
        positionals.push(argument);
        continue;
      }
      if (argument === "--") {
        positionalOnly = true;
        continue;
      }

      const name = optionName(argument);
      if (name === "-i" || name === "--image") {
        unsupported(
          "Codex image inputs are not yet protected by the CLI run adapter. Scan them with the browser extension or remove the image before running the command.",
        );
      }
      if (flagOptions.has(name)) continue;
      if (valueOptions.has(name)) {
        const inlineValue = optionInlineValue(argument);
        const value = inlineValue ?? command[index + 1];
        if (value === undefined || value.length === 0) {
          throw new CliError(
            "CLI_AGENT_ARGUMENTS_INVALID",
            `Agent option ${name} requires a value.`,
            ExitCode.invalidInput,
          );
        }
        if (inlineValue === undefined) index += 1;
        if (name === "-C" || name === "--cd") effectiveCwd = resolve(cwd, value);
        if (name === "--add-dir") additionalRoots.push(resolve(effectiveCwd, value));
        continue;
      }
      if (argument.startsWith("-")) {
        unsupported(`Codex option ${name} is not recognized by adapter version 1.`);
      }
      positionals.push(argument);
    }

    const prompt = positionals[0];
    if (positionals.length !== 1 || prompt === undefined || prompt === "-") {
      unsupported(
        "The protected Codex adapter requires exactly one positional prompt. Prompts read from stdin and exec subcommands cannot be inspected and replayed safely.",
      );
    }

    return {
      adapterVersion: AGENT_ADAPTER_VERSION,
      adapterId: "codex-exec",
      command,
      cwd: effectiveCwd,
      prompt,
      contextRoots: [...new Set([effectiveCwd, ...additionalRoots])],
      disclosures: [
        "The initial prompt and readable files in the declared workspace roots are scanned before launch.",
        "User configuration, MCP responses, network responses, and context discovered after launch cannot be pre-inspected.",
      ],
    };
  },
};

const adapters: readonly AgentAdapter[] = [codexExecAdapter];

export function inspectAgentInvocation(invocation: AgentInvocation): AgentInspectionPlan {
  if (invocation.command.length === 0) {
    throw new CliError(
      "CLI_AGENT_COMMAND_REQUIRED",
      "Provide an agent command after `aiprivacy run --`.",
      ExitCode.invalidInput,
    );
  }
  const adapter = adapters.find((candidate) => candidate.supports(invocation));
  if (adapter === undefined) {
    throw new CliError(
      "CLI_AGENT_UNSUPPORTED",
      "No verified adapter protects this command. Adapter version 1 supports positional `codex exec` invocations only.",
      ExitCode.unsupported,
    );
  }
  return adapter.inspect(invocation);
}

export async function launchAgent(
  plan: AgentInspectionPlan,
  signal?: AbortSignal,
): Promise<number> {
  signal?.throwIfAborted();
  const [executable, ...arguments_] = plan.command;
  if (executable === undefined) return ExitCode.invalidInput;

  return new Promise<number>((resolvePromise, reject) => {
    const child = spawn(executable, arguments_, {
      cwd: plan.cwd,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    let cancelled = false;
    const abort = () => {
      cancelled = true;
      child.kill("SIGTERM");
    };
    signal?.addEventListener("abort", abort, { once: true });
    child.once("error", reject);
    child.once("exit", (code, childSignal) => {
      signal?.removeEventListener("abort", abort);
      if (cancelled) {
        resolvePromise(ExitCode.cancelled);
      } else if (code !== null) {
        resolvePromise(code);
      } else {
        resolvePromise(childSignal === "SIGINT" ? 130 : 143);
      }
    });
  });
}
