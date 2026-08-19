import { defaultCliConfig, parseCliConfig, type CliConfig } from "@privacy-guard/configuration";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { CliError, ExitCode } from "./errors.js";

export type Platform = NodeJS.Platform;

export function resolveConfigPath(
  platform: Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory: string = homedir(),
): string {
  if (platform === "win32") {
    return join(
      environment.APPDATA ?? join(homeDirectory, "AppData", "Roaming"),
      "AI Privacy Firewall",
      "config.json",
    );
  }
  if (platform === "darwin") {
    return join(
      homeDirectory,
      "Library",
      "Application Support",
      "AI Privacy Firewall",
      "config.json",
    );
  }
  return join(
    environment.XDG_CONFIG_HOME ?? join(homeDirectory, ".config"),
    "aiprivacy",
    "config.json",
  );
}

export async function loadCliConfig(configPath = resolveConfigPath()): Promise<CliConfig> {
  try {
    const source = await readFile(configPath, "utf8");
    return parseCliConfig(JSON.parse(source) as unknown);
  } catch (error) {
    if (isMissingFileError(error)) return defaultCliConfig;
    if (error instanceof SyntaxError) {
      throw new CliError(
        "CONFIG_INVALID_JSON",
        "The local configuration file is not valid JSON.",
        ExitCode.invalidInput,
        { cause: error },
      );
    }
    if (error instanceof CliError) throw error;
    throw new CliError(
      "CONFIG_INVALID",
      "The local configuration is invalid or unreadable.",
      ExitCode.invalidInput,
      { cause: error },
    );
  }
}

export async function initializeCliConfig(
  configPath = resolveConfigPath(),
  force = false,
): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  try {
    await writeFile(configPath, `${JSON.stringify(defaultCliConfig, null, 2)}\n`, {
      encoding: "utf8",
      flag: force ? "w" : "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (isFileExistsError(error)) {
      throw new CliError(
        "CONFIG_ALREADY_EXISTS",
        "A local configuration already exists; use --force to replace it.",
        ExitCode.invalidInput,
        { cause: error },
      );
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
