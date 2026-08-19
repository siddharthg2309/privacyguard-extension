import { execPath } from "node:process";
import { describe, expect, it } from "vitest";

import { AGENT_ADAPTER_VERSION, inspectAgentInvocation, launchAgent } from "./agent-adapters.js";
import { CliError, ExitCode } from "./errors.js";

describe("agent adapter contract", () => {
  it("extracts the Codex prompt and every declared workspace root", () => {
    const plan = inspectAgentInvocation({
      command: ["codex.exe", "exec", "--cd", "project", "--add-dir=../shared", "safe prompt"],
      cwd: "/work",
    });
    expect(plan).toMatchObject({
      adapterVersion: AGENT_ADAPTER_VERSION,
      adapterId: "codex-exec",
      cwd: "/work/project",
      prompt: "safe prompt",
      contextRoots: ["/work/project", "/work/shared"],
    });
  });

  it.each([
    [["claude", "hello"], "CLI_AGENT_UNSUPPORTED"],
    [["codex", "exec", "-"], "CLI_AGENT_CONTEXT_UNSUPPORTED"],
    [["codex", "exec", "--image", "private.png", "hello"], "CLI_AGENT_CONTEXT_UNSUPPORTED"],
    [["codex", "resume", "last"], "CLI_AGENT_CONTEXT_UNSUPPORTED"],
  ])("discloses unsupported invocation %#", (command, expectedCode) => {
    try {
      inspectAgentInvocation({ command, cwd: "/work" });
      throw new Error("Expected the invocation to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe(expectedCode);
    }
  });

  it("forwards the child exit code without a shell", async () => {
    const code = await launchAgent({
      adapterVersion: AGENT_ADAPTER_VERSION,
      adapterId: "codex-exec",
      command: [execPath, "-e", "process.exit(37)"],
      cwd: process.cwd(),
      prompt: "safe",
      contextRoots: [process.cwd()],
      disclosures: [],
    });
    expect(code).toBe(37);
  });

  it("terminates the child when the wrapper is cancelled", async () => {
    const controller = new AbortController();
    const running = launchAgent(
      {
        adapterVersion: AGENT_ADAPTER_VERSION,
        adapterId: "codex-exec",
        command: [execPath, "-e", "setInterval(() => undefined, 1000)"],
        cwd: process.cwd(),
        prompt: "safe",
        contextRoots: [process.cwd()],
        disclosures: [],
      },
      controller.signal,
    );
    setTimeout(() => controller.abort(), 25);
    await expect(running).resolves.toBe(ExitCode.cancelled);
  });
});
