import { createFragment } from "@privacy-guard/testing-fixtures";
import { describe, expect, it } from "vitest";

import { detectPii } from "./index.js";

const context = { locale: "en-US", sourceLabel: "synthetic-test" };

describe("PII detection", () => {
  it("detects a confirmed email without retaining its value", () => {
    const detections = detectPii(createFragment("Contact person@example.com for help."), context);
    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      category: "email",
      confidence: 0.99,
      placeholder: "[EMAIL]",
    });
    expect(JSON.stringify(detections)).not.toContain("person@example.com");
  });

  it("validates international phone candidates", () => {
    const detections = detectPii(createFragment("Call +1 415 555 2671 tomorrow."), context);
    expect(detections.map(({ category }) => category)).toContain("phone");
  });

  it("rejects invalid number-like text", () => {
    const detections = detectPii(createFragment("Build number 1234-5678-9012"), context);
    expect(detections.map(({ category }) => category)).not.toContain("phone");
  });

  it("detects names only with explicit context", () => {
    const positive = detectPii(createFragment("My name is Ada Lovelace."), context);
    const negative = detectPii(createFragment("Ada Lovelace wrote notes."), context);
    expect(positive.map(({ category }) => category)).toContain("person_name");
    expect(negative.map(({ category }) => category)).not.toContain("person_name");
  });
});
