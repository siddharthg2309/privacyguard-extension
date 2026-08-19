import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures = [];
const checks = [];

function check(id, condition, detail) {
  checks.push({ id, status: condition ? "pass" : "fail", detail });
  if (!condition) failures.push(`${id}: ${detail}`);
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const wxtConfig = read("apps/browser-extension/wxt.config.ts");
check(
  "least_privilege_permissions",
  wxtConfig.includes('permissions: ["storage"]') && !wxtConfig.includes('"<all_urls>"'),
  "Manifest source must request only storage and bounded host access.",
);
check(
  "strict_extension_csp",
  wxtConfig.includes("script-src 'self'; object-src 'self'") &&
    !wxtConfig.includes("'unsafe-eval'"),
  "Extension CSP must allow local scripts only and prohibit unsafe evaluation.",
);

const productionFiles = execFileSync(
  "git",
  [
    "ls-files",
    "apps/browser-extension",
    "apps/cli/src",
    "packages",
    ":(exclude)**/*.test.ts",
    ":(exclude)**/*.test.tsx",
    ":(exclude)**/*.bench.ts",
  ],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);

const dynamicCode = /\b(?:eval|Function)\s*\(/u;
const remoteCode = /(?:import\s*\(|importScripts\s*\()["'`]https?:\/\//u;
const insecureTransport = /["'`]http:\/\//u;
const pemKey = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u;
let hasDynamicCode = false;
let hasRemoteCode = false;
let hasInsecureTransport = false;
let hasPrivateKey = false;
for (const file of productionFiles) {
  const content = read(file);
  hasDynamicCode ||= dynamicCode.test(content);
  hasRemoteCode ||= remoteCode.test(content);
  hasInsecureTransport ||= insecureTransport.test(content);
  hasPrivateKey ||= pemKey.test(content);
}
check("no_dynamic_code", !hasDynamicCode, "Production code must not evaluate generated strings.");
check("no_remote_code", !hasRemoteCode, "Extension code must be packaged, never loaded remotely.");
check("secure_transport_literals", !hasInsecureTransport, "Production URLs must not use HTTP.");
check("no_private_keys", !hasPrivateKey, "Tracked production files must not contain private keys.");

const agentAdapter = read("apps/cli/src/agent-adapters.ts");
check(
  "subprocess_without_shell",
  agentAdapter.includes('stdio: "inherit"') &&
    agentAdapter.includes("windowsHide: true") &&
    !agentAdapter.includes("shell:"),
  "Protected commands must use argument arrays without a command shell.",
);
check(
  "unsupported_agent_fail_closed",
  agentAdapter.includes("CLI_AGENT_UNSUPPORTED") &&
    agentAdapter.includes("CLI_AGENT_CONTEXT_UNSUPPORTED"),
  "Unknown agents and uninspectable context must be rejected explicitly.",
);

const lockfile = read("pnpm-lock.yaml");
check(
  "lockfile_secure_registry",
  !lockfile.includes("http://") && !lockfile.includes("git+http:"),
  "Dependency lockfile must not use insecure registries or Git transports.",
);

for (const result of checks) {
  process.stdout.write(`${result.status.toUpperCase()} ${result.id}\n`);
}
if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Security audit passed (${checks.length} controls).\n`);
}
