import { defaultCliConfig } from "@privacy-guard/configuration";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

import { ScanOutputSchema } from "./contracts.js";
import { readStandardInput, scanStdin } from "./scanning.js";

describe("CLI scanning", () => {
  it("returns a versioned policy violation without exposing the detected value", async () => {
    const secret = `sk-proj-${"A1b2".repeat(8)}`;
    const output = await scanStdin(Readable.from([`api_key=${secret}`]), defaultCliConfig);
    expect(ScanOutputSchema.parse(output).status).toBe("policy_violation");
    expect(JSON.stringify(output)).not.toContain(secret);
  });

  it("bounds streamed standard input", async () => {
    await expect(readStandardInput(Readable.from(["12345"]), 4)).rejects.toMatchObject({
      code: "INPUT_STDIN_LIMIT_EXCEEDED",
    });
  });

  it("honors cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      scanStdin(Readable.from(["safe"]), defaultCliConfig, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
