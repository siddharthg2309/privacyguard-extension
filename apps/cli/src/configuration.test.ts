import { defaultCliConfig } from "@privacy-guard/configuration";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { initializeCliConfig, loadCliConfig, resolveConfigPath } from "./configuration.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("CLI configuration", () => {
  it("resolves standard cross-platform configuration locations", () => {
    expect(resolveConfigPath("darwin", {}, "/home/user")).toContain(
      "Library/Application Support/AI Privacy Firewall/config.json",
    );
    expect(resolveConfigPath("linux", { XDG_CONFIG_HOME: "/config" }, "/home/user")).toBe(
      "/config/aiprivacy/config.json",
    );
    expect(
      resolveConfigPath(
        "win32",
        { APPDATA: "C:\\Users\\user\\AppData\\Roaming" },
        "C:\\Users\\user",
      ),
    ).toContain("AI Privacy Firewall");
  });

  it("initializes and validates a private local configuration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiprivacy-config-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "nested", "config.json");
    await initializeCliConfig(path);
    expect(await loadCliConfig(path)).toEqual(defaultCliConfig);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(defaultCliConfig);
    if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("uses defaults only when the configuration does not exist", async () => {
    expect(await loadCliConfig(join(tmpdir(), `missing-${crypto.randomUUID()}.json`))).toEqual(
      defaultCliConfig,
    );
  });
});
