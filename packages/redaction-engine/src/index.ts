import {
  severityRank,
  type Detection,
  type DetectionCategory,
  type TextFragment,
} from "@privacy-guard/contracts";

const defaultPlaceholders: Readonly<Record<DetectionCategory, string>> = {
  email: "[EMAIL]",
  phone: "[PHONE]",
  person_name: "[PERSON]",
  address: "[ADDRESS]",
  government_id: "[GOVERNMENT_ID]",
  financial_identifier: "[FINANCIAL_IDENTIFIER]",
  api_key: "[API_KEY]",
  jwt: "[JWT]",
  private_key: "[PRIVATE_KEY]",
  database_url: "[DATABASE_URL]",
  credential: "[CREDENTIAL]",
  sensitive_file: "[SENSITIVE_FILE]",
  personal_image: "[PERSONAL_IMAGE]",
};

function priority(detection: Detection): number {
  return severityRank[detection.severity] * 10 + detection.confidence;
}

function selectNonOverlapping(detections: readonly Detection[]): Detection[] {
  const selected: Detection[] = [];
  const prioritized = [...detections].sort((left, right) => {
    const priorityDifference = priority(right) - priority(left);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }
    const leftLength = left.location.end - left.location.start;
    const rightLength = right.location.end - right.location.start;
    return rightLength - leftLength;
  });

  for (const candidate of prioritized) {
    const overlaps = selected.some(
      ({ location }) =>
        candidate.location.start < location.end && candidate.location.end > location.start,
    );
    if (!overlaps) {
      selected.push(candidate);
    }
  }

  return selected;
}

export function redactFragment(fragment: TextFragment, detections: readonly Detection[]): string {
  const applicable = selectNonOverlapping(
    detections.filter(
      ({ location }) => location.subjectType === "text" && location.subjectId === fragment.id,
    ),
  ).sort((left, right) => right.location.start - left.location.start);

  let content = fragment.content;
  for (const detection of applicable) {
    const { start, end } = detection.location;
    if (end > content.length || start >= end) {
      continue;
    }
    const placeholder = detection.placeholder ?? defaultPlaceholders[detection.category];
    content = `${content.slice(0, start)}${placeholder}${content.slice(end)}`;
  }
  return content;
}

export function redactFragments(
  fragments: readonly TextFragment[],
  detections: readonly Detection[],
): Record<string, string> {
  return Object.fromEntries(
    fragments.map((fragment) => [fragment.id, redactFragment(fragment, detections)]),
  );
}
