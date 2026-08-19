import { describe, expect, it } from "vitest";

import { normalizeOcrProgress } from "./index.js";

describe("OCR contracts", () => {
  it("normalizes bounded progress without carrying raw OCR data", () => {
    expect(normalizeOcrProgress("recognizing", 1.4)).toEqual({
      stage: "recognizing",
      progress: 1,
    });
    expect(normalizeOcrProgress("recognizing", Number.NaN)).toEqual({
      stage: "recognizing",
      progress: 0,
    });
    expect(normalizeOcrProgress("unknown", 0.5)).toBeUndefined();
  });
});
