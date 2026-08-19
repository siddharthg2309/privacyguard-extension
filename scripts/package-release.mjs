import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { basename, delimiter, dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const releaseDirectory = resolve(root, "artifacts/release");
const npmCache = resolve(root, "artifacts/.npm-cache");
const cliDirectory = resolve(root, "apps/cli");
const extensionDirectory = resolve(root, "apps/browser-extension/.output/chrome-mv3");
const cliPackage = JSON.parse(readFileSync(join(cliDirectory, "package.json"), "utf8"));
const extensionPackage = JSON.parse(
  readFileSync(resolve(root, "apps/browser-extension/package.json"), "utf8"),
);
const releaseVersion = cliPackage.version;
const releaseEnvironment = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
};

if (releaseVersion !== extensionPackage.version) {
  throw new Error("CLI and extension versions must match before packaging.");
}
if (!statSync(resolve(cliDirectory, "dist/cli.cjs")).isFile()) {
  throw new Error("Build the CLI before packaging.");
}
if (!statSync(resolve(extensionDirectory, "manifest.json")).isFile()) {
  throw new Error("Build the extension before packaging.");
}

rmSync(releaseDirectory, { recursive: true, force: true });
mkdirSync(releaseDirectory, { recursive: true });
rmSync(npmCache, { recursive: true, force: true });
mkdirSync(npmCache, { recursive: true });

execFileSync("npm", ["pack", "--cache", npmCache, "--pack-destination", releaseDirectory], {
  cwd: cliDirectory,
  env: releaseEnvironment,
  stdio: "inherit",
});
rmSync(npmCache, { recursive: true, force: true });
const generatedTarball = readdirSync(releaseDirectory).find((file) => file.endsWith(".tgz"));
if (generatedTarball === undefined) throw new Error("npm did not create the CLI package.");
const cliArtifact = `privacy-guard-cli-${releaseVersion}.tgz`;
if (generatedTarball !== cliArtifact) {
  copyFileSync(join(releaseDirectory, generatedTarball), join(releaseDirectory, cliArtifact));
  rmSync(join(releaseDirectory, generatedTarball));
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(absolute) : [absolute];
    })
    .sort();
}

const fixedTime = new Date("1980-01-01T00:00:00.000Z");
const extensionFiles = filesUnder(extensionDirectory);
for (const file of extensionFiles) utimesSync(file, fixedTime, fixedTime);
const extensionArtifact = `privacy-guard-extension-${releaseVersion}-chromium.zip`;
execFileSync(
  "zip",
  [
    "-X",
    "-q",
    resolve(releaseDirectory, extensionArtifact),
    ...extensionFiles.map((file) => relative(extensionDirectory, file)),
  ],
  { cwd: extensionDirectory },
);

for (const installer of ["install.sh", "install.ps1"]) {
  copyFileSync(resolve(root, "distribution", installer), join(releaseDirectory, installer));
}

const packageDirectories = [resolve(root, "node_modules/.pnpm")];
const components = new Map();
for (const packageDirectory of packageDirectories) {
  for (const storeEntry of readdirSync(packageDirectory, { withFileTypes: true })) {
    if (!storeEntry.isDirectory()) continue;
    const modules = join(packageDirectory, storeEntry.name, "node_modules");
    try {
      for (const packageJson of filesUnder(modules).filter((file) =>
        file.endsWith("package.json"),
      )) {
        const metadata = JSON.parse(readFileSync(packageJson, "utf8"));
        if (typeof metadata.name !== "string" || typeof metadata.version !== "string") continue;
        const key = `${metadata.name}@${metadata.version}`;
        const packageUrlName = metadata.name.split("/").map(encodeURIComponent).join("/");
        components.set(key, {
          type: "library",
          name: metadata.name,
          version: metadata.version,
          purl: `pkg:npm/${packageUrlName}@${encodeURIComponent(metadata.version)}`,
        });
      }
    } catch {
      // An optional package may not expose a node_modules directory on this platform.
    }
  }
}
const sbom = {
  $schema: "https://cyclonedx.org/schema/bom-1.6.schema.json",
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "application",
      name: "AI Privacy Firewall",
      version: releaseVersion,
    },
  },
  components: [...components.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  ),
};
writeFileSync(
  join(releaseDirectory, `privacy-guard-${releaseVersion}.cdx.json`),
  `${JSON.stringify(sbom, null, 2)}\n`,
);

const artifacts = readdirSync(releaseDirectory)
  .filter((file) => file !== "SHA256SUMS")
  .sort();
const checksums = artifacts.map((file) => {
  const digest = createHash("sha256")
    .update(readFileSync(join(releaseDirectory, file)))
    .digest("hex");
  return `${digest}  ${basename(file)}`;
});
writeFileSync(join(releaseDirectory, "SHA256SUMS"), `${checksums.join("\n")}\n`);
process.stdout.write(`Created ${artifacts.length + 1} release artifacts for v${releaseVersion}.\n`);
