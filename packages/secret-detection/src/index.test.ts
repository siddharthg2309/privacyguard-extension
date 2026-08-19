import { createFragment } from "@privacy-guard/testing-fixtures";
import { describe, expect, it } from "vitest";

import { detectSecrets, shannonEntropy } from "./index.js";

describe("secret detection", () => {
  it.each([
    ["AWS access key", "AKIAIOSFODNN7EXAMPLE", "api_key"],
    ["OpenAI key", `sk-proj-${"A1b2".repeat(8)}`, "api_key"],
    ["GitHub token", `ghp_${"aB3".repeat(10)}`, "api_key"],
    ["Google API key", `AIza${"aB3_".repeat(8)}abc`, "api_key"],
    ["Slack token", `xoxb-${"a1B2".repeat(8)}`, "credential"],
    ["database URL", "postgres://user:password@example.invalid/database", "database_url"],
  ])("detects a synthetic %s", (_label, value, category) => {
    const detections = detectSecrets(createFragment(`value=${value}`));
    expect(detections.map((detection) => detection.category)).toContain(category);
    expect(JSON.stringify(detections)).not.toContain(value);
  });

  it("detects a structurally valid synthetic JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlX3Rlc3Q";
    expect(detectSecrets(createFragment(jwt)).map(({ category }) => category)).toContain("jwt");
  });

  it("detects contextual high-entropy assignments but ignores ordinary values", () => {
    const secret = detectSecrets(createFragment("client_secret=A1b2C3d4E5f6G7h8I9j0K1l2"));
    const ordinary = detectSecrets(createFragment("password=correcthorsebattery"));
    expect(secret.map(({ category }) => category)).toContain("credential");
    expect(ordinary).toHaveLength(0);
  });

  it("calculates entropy without special cases leaking NaN", () => {
    expect(shannonEntropy("")).toBe(0);
    expect(shannonEntropy("aaaaaaaa")).toBe(0);
    expect(shannonEntropy("a1B2c3D4")).toBeGreaterThan(2);
  });
});
