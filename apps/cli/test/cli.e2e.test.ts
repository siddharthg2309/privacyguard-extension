import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const cliPath = resolve("dist/cli.cjs");
const temporaryDirectories: string[] = [];

afterAll(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.map((path) => rm(path, { recursive: true })));
});

describe("packaged CLI", () => {
  it("runs the status command", async () => {
    const { stdout } = await executeFile(process.execPath, [cliPath, "--format", "json", "status"]);
    expect(JSON.parse(stdout)).toMatchObject({
      schemaVersion: 1,
      command: "status",
      localOnly: true,
      engine: "ready",
    });
  });

  it("scans paths containing spaces and Unicode", async () => {
    const directory = await mkdtemp(join(tmpdir(), "privacy guard 👋 "));
    temporaryDirectories.push(directory);
    const path = join(directory, "customer file.txt");
    await writeFile(path, "Contact person@example.com", "utf8");
    await expect(
      executeFile(process.execPath, [cliPath, "--format", "json", "scan", path]),
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('"schemaVersion":1'),
    });
  });
});
