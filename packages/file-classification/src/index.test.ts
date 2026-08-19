import { describe, expect, it } from "vitest";

import { classifyAttachment } from "./index.js";

describe("file classification", () => {
  it.each([
    [".env.production", "critical"],
    ["config/credentials.json", "critical"],
    ["keys/private.pem", "critical"],
    ["exports/customer-data.csv", "high"],
  ])("classifies %s as sensitive", (path, severity) => {
    expect(classifyAttachment({ id: "file-1", name: path, path })).toEqual([
      expect.objectContaining({ category: "sensitive_file", severity }),
    ]);
  });

  it("does not flag an ordinary source file by name", () => {
    expect(classifyAttachment({ id: "file-1", name: "src/auth.ts" })).toEqual([]);
  });
});
