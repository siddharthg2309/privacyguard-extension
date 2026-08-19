export type SafeDiagnosticEvent = {
  event: string;
  requestId?: string;
  durationBucket?: "under_50ms" | "under_250ms" | "under_1s" | "over_1s";
  errorCode?: string;
  count?: number;
};

export type SafeLogger = {
  debug(event: SafeDiagnosticEvent): void;
  info(event: SafeDiagnosticEvent): void;
  warn(event: SafeDiagnosticEvent): void;
  error(event: SafeDiagnosticEvent): void;
};

const discard = (): void => undefined;

export const noOpLogger: SafeLogger = {
  debug: discard,
  info: discard,
  warn: discard,
  error: discard,
};
