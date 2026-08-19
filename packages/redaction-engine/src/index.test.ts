import type { Detection, TextFragment } from "@privacy-guard/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { redactFragment } from "./index.js";

const fragment: TextFragment = {
  id: "fragment-1",
  kind: "prompt",
  content: "Email person@example.com and call +1 415 555 2671.",
};

function detection(
  category: Detection["category"],
  start: number,
  end: number,
  placeholder: string,
): Detection {
  return {
    id: `${category}-${start}`,
    category,
    detectorId: "test",
    confidence: 1,
    severity: "high",
    location: { subjectId: fragment.id, subjectType: "text", start, end },
    explanationCode: "TEST",
    placeholder,
  };
}

describe("redaction", () => {
  it("applies multiple operations without offset drift", () => {
    const email = "person@example.com";
    const phone = "+1 415 555 2671";
    const result = redactFragment(fragment, [
      detection(
        "email",
        fragment.content.indexOf(email),
        fragment.content.indexOf(email) + email.length,
        "[EMAIL]",
      ),
      detection(
        "phone",
        fragment.content.indexOf(phone),
        fragment.content.indexOf(phone) + phone.length,
        "[PHONE]",
      ),
    ]);
    expect(result).toBe("Email [EMAIL] and call [PHONE].");
  });

  it("prefers the higher-priority detection when spans overlap", () => {
    const content = "secret-value";
    const localFragment = { ...fragment, content };
    const low = detection("person_name", 0, 6, "[PERSON]");
    const critical = {
      ...detection("api_key", 0, content.length, "[API_KEY]"),
      severity: "critical" as const,
    };
    expect(redactFragment(localFragment, [low, critical])).toBe("[API_KEY]");
  });

  it("never retains a selected arbitrary span", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (value) => {
        const localFragment: TextFragment = { ...fragment, content: `prefix:${value}:suffix` };
        const start = "prefix:".length;
        const result = redactFragment(localFragment, [
          {
            ...detection("credential", start, start + value.length, "[CREDENTIAL]"),
            location: {
              subjectId: localFragment.id,
              subjectType: "text",
              start,
              end: start + value.length,
            },
          },
        ]);
        expect(result).toBe("prefix:[CREDENTIAL]:suffix");
      }),
    );
  });
});
