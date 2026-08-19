import {
  ContentEnvelopeSchema,
  type ContentEnvelope,
  type TextFragment,
} from "@privacy-guard/contracts";

export function normalizeText(content: string): string {
  return content
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\0", "")
    .normalize("NFC");
}

export function normalizeFragment(fragment: TextFragment): TextFragment {
  return {
    ...fragment,
    content: normalizeText(fragment.content),
  };
}

export function normalizeEnvelope(input: unknown): ContentEnvelope {
  const envelope = ContentEnvelopeSchema.parse(input);
  const seenIds = new Set<string>();

  for (const fragment of envelope.text) {
    if (seenIds.has(fragment.id)) {
      throw new Error(`Duplicate text fragment id: ${fragment.id}`);
    }
    seenIds.add(fragment.id);
  }

  return {
    ...envelope,
    text: envelope.text.map(normalizeFragment),
  };
}
