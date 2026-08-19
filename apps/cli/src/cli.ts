import { runCli } from "./program.js";

const controller = new AbortController();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    controller.abort(new DOMException("Cancelled", "AbortError"));
  });
}

async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv.slice(2), { signal: controller.signal });
}

void main();
