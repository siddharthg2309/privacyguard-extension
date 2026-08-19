import { execFile, spawn } from "node:child_process";
import { chmod, copyFile, link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const releaseDirectory = resolve(root, "artifacts/release");
const packageMetadata = JSON.parse(await readFile(resolve(root, "apps/cli/package.json"), "utf8"));
const archive = resolve(releaseDirectory, `privacy-guard-cli-${packageMetadata.version}.tgz`);
const sandbox = await mkdtemp(join(tmpdir(), "privacy-guard-install-test-"));
const prefix = join(sandbox, "global prefix");
const npmCache = join(sandbox, "npm cache");
const fixture = join(sandbox, "customer file.txt");
const config = join(sandbox, "configuration.json");
const executable =
  process.platform === "win32" ? process.execPath : join(prefix, "bin", "aiprivacy");
const executableArguments =
  process.platform === "win32"
    ? [join(prefix, "node_modules", "@privacy-guard", "cli", "dist", "cli.cjs")]
    : [];
const runtimeEnvironment = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
};

async function command(arguments_, expectedCode = 0, options = {}) {
  try {
    const output = await execute(executable, [...executableArguments, ...arguments_], {
      env: runtimeEnvironment,
      ...options,
    });
    if (expectedCode !== 0) throw new Error(`Expected exit code ${expectedCode}.`);
    return output;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === expectedCode
    ) {
      return {
        stdout: "stdout" in error && typeof error.stdout === "string" ? error.stdout : "",
        stderr: "stderr" in error && typeof error.stderr === "string" ? error.stderr : "",
      };
    }
    throw error;
  }
}

async function commandWithInput(arguments_, input) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, [...executableArguments, ...arguments_], {
      env: runtimeEnvironment,
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (value) => {
      stderr += value;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Piped CLI command failed with ${code}: ${stderr}`));
    });
    child.stdin.end(input);
  });
}

async function installPackage(additionalArguments = []) {
  const arguments_ = [
    "install",
    "--global",
    "--cache",
    npmCache,
    "--prefix",
    prefix,
    archive,
    ...additionalArguments,
  ];
  if (process.platform !== "win32") {
    return execute("npm", arguments_, { env: runtimeEnvironment });
  }

  const locatedNpm = await execute("where.exe", ["npm.cmd"], { env: runtimeEnvironment });
  const npmCommand = locatedNpm.stdout.split(/\r?\n/u).find((value) => value.trim().length > 0);
  if (!npmCommand) throw new Error("Could not locate npm.cmd on Windows.");
  const npmCli = join(dirname(npmCommand.trim()), "node_modules", "npm", "bin", "npm-cli.js");
  return execute(process.execPath, [npmCli, ...arguments_], { env: runtimeEnvironment });
}

try {
  await installPackage();
  const version = await command(["--version"]);
  if (version.stdout.trim() !== packageMetadata.version)
    throw new Error("Installed version mismatch.");

  await command(["--config", config, "config", "init"]);
  await command(["--config", config, "config", "validate"]);
  await command(["--config", config, "config", "show"]);
  await command(["--config", config, "config", "path"]);
  await command(["--config", config, "doctor"]);
  await command(["--format", "json", "--config", config, "status"]);
  await commandWithInput(
    ["--format", "json", "--config", config, "scan", "--stdin"],
    "Explain binary search.",
  );

  const safeWorkspace = join(sandbox, "safe agent workspace");
  const fakeCodex = join(sandbox, process.platform === "win32" ? "codex.exe" : "codex");
  await mkdir(safeWorkspace);
  await writeFile(join(safeWorkspace, "README.md"), "Safe synthetic workspace.", "utf8");
  await writeFile(join(safeWorkspace, "exec"), "process.exit(37);\n", "utf8");
  await command(["--config", config, "workspace", "scan", safeWorkspace]);
  await link(process.execPath, fakeCodex).catch(() => copyFile(process.execPath, fakeCodex));
  if (process.platform !== "win32") await chmod(fakeCodex, 0o755);
  const protectedRun = await command(
    [
      "--config",
      config,
      "run",
      "--",
      fakeCodex,
      "exec",
      "--cd",
      safeWorkspace,
      "Explain this safe fixture.",
    ],
    37,
  );
  if (!protectedRun.stderr.includes("ALLOW run")) {
    throw new Error("Verified agent integration did not launch after a clean inspection.");
  }

  const secret = `sk-proj-${"A1b2".repeat(8)}`;
  await writeFile(fixture, `Contact person@example.com and ${secret}`, "utf8");
  const scan = await command(["--format", "json", "--config", config, "scan", fixture], 1);
  if (scan.stdout.includes(secret)) throw new Error("Packaged CLI exposed a detected secret.");
  const preview = await command(["--config", config, "redact", "--preview", fixture], 1);
  if (!preview.stdout.includes("[EMAIL]") || !preview.stdout.includes("[API_KEY]")) {
    throw new Error("Packaged redaction features did not produce sanitized output.");
  }
  const sanitizedFile = join(sandbox, "sanitized output.txt");
  await command(["--config", config, "redact", "--output", sanitizedFile, fixture], 1);
  const sanitizedContent = await readFile(sanitizedFile, "utf8");
  if (sanitizedContent.includes(secret)) throw new Error("Redaction output retained a secret.");
  const inPlaceFile = join(sandbox, "in-place input.txt");
  await copyFile(fixture, inPlaceFile);
  await command(["--config", config, "redact", "--write", "--force", inPlaceFile], 1);
  if ((await readFile(inPlaceFile, "utf8")).includes(secret)) {
    throw new Error("Authorized in-place redaction retained a secret.");
  }
  const blockedRun = await command(
    ["--config", config, "run", "--", "codex", "exec", `Use ${secret}`],
    1,
  );
  if (
    !blockedRun.stderr.includes("the agent was not started") ||
    blockedRun.stderr.includes(secret)
  ) {
    throw new Error("Protected run did not fail closed without disclosing the secret.");
  }
  const unsupportedRun = await command(
    ["--config", config, "run", "--", "claude", "Safe prompt"],
    4,
  );
  if (!unsupportedRun.stderr.includes("No verified adapter")) {
    throw new Error("Unsupported agent behavior was not disclosed.");
  }

  // A reinstall exercises the supported in-place upgrade mechanism and must preserve config.
  await installPackage(["--force"]);
  await command(["--config", config, "config", "validate"]);
  process.stdout.write("Packaged CLI install, commands, redaction, and reinstall checks passed.\n");
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
