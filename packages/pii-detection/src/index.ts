import {
  createDetectionId,
  type Detection,
  type DetectionCategory,
  type Detector,
  type ScanContext,
  type Severity,
  type TextFragment,
} from "@privacy-guard/contracts";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

const DETECTOR_ID = "builtin-pii";
const DETECTOR_VERSION = "0.1.0";

const localeCountries: Readonly<Record<string, CountryCode>> = {
  AU: "AU",
  CA: "CA",
  DE: "DE",
  FR: "FR",
  GB: "GB",
  IN: "IN",
  SG: "SG",
  US: "US",
};

type DetectionParameters = {
  category: DetectionCategory;
  confidence: number;
  end: number;
  explanationCode: string;
  fragment: TextFragment;
  placeholder: string;
  severity: Severity;
  start: number;
};

function createDetection(parameters: DetectionParameters): Detection {
  const { category, confidence, end, explanationCode, fragment, placeholder, severity, start } =
    parameters;
  return {
    id: createDetectionId(DETECTOR_ID, fragment.id, start, end, category),
    category,
    detectorId: DETECTOR_ID,
    confidence,
    severity,
    location: {
      subjectId: fragment.id,
      subjectType: "text",
      start,
      end,
    },
    explanationCode,
    placeholder,
  };
}

function countryFromLocale(locale: string): CountryCode | undefined {
  const region = locale.split("-")[1]?.toUpperCase();
  return region === undefined ? undefined : localeCountries[region];
}

function detectEmails(fragment: TextFragment): Detection[] {
  const emailPattern =
    /(?<![\w.+-])[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d.-]+\.[a-z]{2,63}(?![\w.-])/giu;
  return [...fragment.content.matchAll(emailPattern)].flatMap((match) => {
    return [
      createDetection({
        category: "email",
        confidence: 0.99,
        end: match.index + match[0].length,
        explanationCode: "PII_EMAIL_CONFIRMED",
        fragment,
        placeholder: "[EMAIL]",
        severity: "medium",
        start: match.index,
      }),
    ];
  });
}

function detectPhones(fragment: TextFragment, context: ScanContext): Detection[] {
  const candidatePattern = /(?<!\w)\+?\d[\d\s().-]{7,}\d(?!\w)/gu;
  const country = countryFromLocale(context.locale);

  return [...fragment.content.matchAll(candidatePattern)].flatMap((match) => {
    const candidate = match[0].trim();
    const parsed = parsePhoneNumberFromString(candidate, country);
    if (parsed?.isValid() !== true) {
      return [];
    }

    const leadingWhitespace = match[0].length - match[0].trimStart().length;
    const start = match.index + leadingWhitespace;
    return [
      createDetection({
        category: "phone",
        confidence: 0.97,
        end: start + candidate.length,
        explanationCode: "PII_PHONE_CONFIRMED",
        fragment,
        placeholder: "[PHONE]",
        severity: "high",
        start,
      }),
    ];
  });
}

function detectContextualNames(fragment: TextFragment): Detection[] {
  const namePattern =
    /(?:\b[Mm]y\s+name\s+is\b|\b[Ff]ull\s+name\s*[:=]|\b[Nn]ame\s*[:=])\s*([\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+){1,3})/gu;

  return [...fragment.content.matchAll(namePattern)].flatMap((match) => {
    const value = match[1];
    if (value === undefined) {
      return [];
    }
    const relativeStart = match[0].lastIndexOf(value);
    const start = match.index + relativeStart;
    return [
      createDetection({
        category: "person_name",
        confidence: 0.88,
        end: start + value.length,
        explanationCode: "PII_CONTEXTUAL_FULL_NAME",
        fragment,
        placeholder: "[PERSON]",
        severity: "medium",
        start,
      }),
    ];
  });
}

function detectContextualAddresses(fragment: TextFragment): Detection[] {
  const addressPattern =
    /(?:\baddress\s*[:=]|\bi\s+live\s+at\b)\s*([^\n,]{4,80}(?:,[^\n]{2,50})?)/giu;

  return [...fragment.content.matchAll(addressPattern)].flatMap((match) => {
    const value = match[1]?.trim();
    if (value === undefined || !/\d/u.test(value)) {
      return [];
    }
    const relativeStart = match[0].lastIndexOf(value);
    const start = match.index + relativeStart;
    return [
      createDetection({
        category: "address",
        confidence: 0.82,
        end: start + value.length,
        explanationCode: "PII_CONTEXTUAL_ADDRESS",
        fragment,
        placeholder: "[ADDRESS]",
        severity: "high",
        start,
      }),
    ];
  });
}

export function detectPii(fragment: TextFragment, context: ScanContext): Detection[] {
  return [
    ...detectEmails(fragment),
    ...detectPhones(fragment, context),
    ...detectContextualNames(fragment),
    ...detectContextualAddresses(fragment),
  ];
}

export const piiDetector: Detector = {
  id: DETECTOR_ID,
  version: DETECTOR_VERSION,
  supports: () => true,
  detect: (fragment, context, signal) => {
    signal?.throwIfAborted();
    return Promise.resolve(detectPii(fragment, context));
  },
};
