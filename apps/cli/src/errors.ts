export const ExitCode = {
  success: 0,
  policyViolation: 1,
  invalidInput: 2,
  unsafeRead: 3,
  unsupported: 4,
  internalFailure: 5,
  cancelled: 130,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export class CliError extends Error {
  public readonly code: string;
  public readonly exitCode: ExitCodeValue;

  public constructor(
    code: string,
    message: string,
    exitCode: ExitCodeValue,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new CliError("CLI_CANCELLED", "The local scan was cancelled.", ExitCode.cancelled, {
      cause: error,
    });
  }
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    if (error.code.startsWith("INPUT_")) {
      return new CliError(error.code, error.message, ExitCode.unsafeRead, { cause: error });
    }
    if (error.code.startsWith("CONFIG_")) {
      return new CliError(error.code, error.message, ExitCode.invalidInput, { cause: error });
    }
  }
  return new CliError(
    "INTERNAL_UNEXPECTED_FAILURE",
    "The local scan failed unexpectedly.",
    ExitCode.internalFailure,
    { cause: error },
  );
}
