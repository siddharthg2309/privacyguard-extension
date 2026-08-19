import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../packages", import.meta.url));
const forbiddenRuntimeImports =
  /from\s+["'](?:node:|react(?:\/|["'])|wxt(?:\/|["'])|commander(?:\/|["'])|@inquirer\/)/u;

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectTypeScriptFiles(path);
      }
      return entry.isFile() && path.endsWith(".ts") ? [path] : [];
    }),
  );
  return nested.flat();
}

const files = await collectTypeScriptFiles(sourceRoot);
const violations = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  if (forbiddenRuntimeImports.test(source)) {
    violations.push(file);
  }
}

if (violations.length > 0) {
  console.error("Shared packages must not import browser, UI, CLI, or Node runtime APIs:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Architecture check passed for ${files.length} TypeScript files.`);
}
