import { defaultCliConfig } from "@privacy-guard/configuration";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { discoverFiles, readTextFile } from "./filesystem.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "aiprivacy-workspace-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("safe filesystem adapter", () => {
  it("respects git and privacy ignore rules", async () => {
    const root = await workspace();
    await mkdir(join(root, "generated"));
    await writeFile(join(root, ".gitignore"), "ignored.txt\n", "utf8");
    await writeFile(join(root, ".aiprivacyignore"), "generated/\n", "utf8");
    await writeFile(join(root, "kept.txt"), "safe", "utf8");
    await writeFile(join(root, "ignored.txt"), "secret", "utf8");
    await writeFile(join(root, "generated", "output.txt"), "secret", "utf8");

    const result = await discoverFiles(root, defaultCliConfig.cli);
    expect(result.files.map(({ displayPath }) => displayPath)).toContain("kept.txt");
    expect(result.files.map(({ displayPath }) => displayPath)).not.toContain("ignored.txt");
    expect(result.skipped.map(({ reasonCode }) => reasonCode)).toContain("INPUT_IGNORED");
  });

  it("applies nested gitignore files relative to their directory", async () => {
    const root = await workspace();
    await mkdir(join(root, "service", "generated"), { recursive: true });
    await writeFile(join(root, "service", ".gitignore"), "generated/\n*.cache\n", "utf8");
    await writeFile(join(root, "service", "generated", "output.txt"), "ignored", "utf8");
    await writeFile(join(root, "service", "local.cache"), "ignored", "utf8");
    await writeFile(join(root, "service", "kept.txt"), "safe", "utf8");

    const result = await discoverFiles(root, defaultCliConfig.cli);
    expect(result.files.map(({ displayPath }) => displayPath)).toContain("service/kept.txt");
    expect(result.files.map(({ displayPath }) => displayPath)).not.toContain(
      "service/generated/output.txt",
    );
    expect(result.files.map(({ displayPath }) => displayPath)).not.toContain("service/local.cache");
  });

  it("never follows symbolic links", async () => {
    const root = await workspace();
    const target = join(root, "target.txt");
    await writeFile(target, "safe", "utf8");
    try {
      await symlink(target, join(root, "linked.txt"));
    } catch {
      return;
    }
    const result = await discoverFiles(root, defaultCliConfig.cli);
    expect(result.skipped).toContainEqual({
      path: "linked.txt",
      reasonCode: "INPUT_SYMLINK_SKIPPED",
    });
  });

  it("streams UTF-8 text and identifies binary input", async () => {
    const root = await workspace();
    const textPath = join(root, "text.txt");
    const binaryPath = join(root, "binary.dat");
    await writeFile(textPath, "hello 👋", "utf8");
    await writeFile(binaryPath, Buffer.from([0, 1, 2, 3]));
    await expect(
      readTextFile(
        { absolutePath: textPath, displayPath: "text.txt", sizeBytes: 10 },
        defaultCliConfig.cli.maxFileBytes,
      ),
    ).resolves.toEqual({ kind: "text", content: "hello 👋" });
    await expect(
      readTextFile(
        { absolutePath: binaryPath, displayPath: "binary.dat", sizeBytes: 4 },
        defaultCliConfig.cli.maxFileBytes,
      ),
    ).resolves.toEqual({ kind: "binary" });
  });

  it("cancels workspace discovery before reading entries", async () => {
    const root = await workspace();
    await writeFile(join(root, "input.txt"), "safe", "utf8");
    const controller = new AbortController();
    controller.abort();
    await expect(
      discoverFiles(root, defaultCliConfig.cli, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
