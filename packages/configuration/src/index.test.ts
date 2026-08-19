import { describe, expect, it } from "vitest";

import { defaultConfig, parseConfig } from "./index.js";

describe("configuration", () => {
  it("accepts the versioned default configuration", () => {
    expect(parseConfig(defaultConfig)).toEqual(defaultConfig);
  });

  it("rejects unknown configuration fields", () => {
    expect(() => parseConfig({ ...defaultConfig, rawTelemetry: true })).toThrow();
  });
});
