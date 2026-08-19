import { describe, expect, it } from "vitest";

import { defaultCliConfig, defaultConfig, parseCliConfig, parseConfig } from "./index.js";

describe("configuration", () => {
  it("accepts the versioned default configuration", () => {
    expect(parseConfig(defaultConfig)).toEqual(defaultConfig);
  });

  it("rejects unknown configuration fields", () => {
    expect(() => parseConfig({ ...defaultConfig, rawTelemetry: true })).toThrow();
  });

  it("validates the versioned CLI scan limits", () => {
    expect(parseCliConfig(defaultCliConfig)).toEqual(defaultCliConfig);
    expect(() =>
      parseCliConfig({
        ...defaultCliConfig,
        cli: { ...defaultCliConfig.cli, concurrency: 0 },
      }),
    ).toThrow();
  });
});
