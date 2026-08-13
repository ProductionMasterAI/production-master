/**
 * pmctl exit-code table + error classification.
 *
 * Distinct, stable exit codes let scripts branch on failure class without
 * parsing stderr. The JSON envelope carries the same `code` string in
 * `error.code`.
 */
import { ServiceError } from "@production-master/plugin-core";

export const EXIT = {
  /** Success. */
  OK: 0,
  /** Unclassified runtime error. */
  GENERIC: 1,
  /** Bad invocation (missing arg, unknown verb/flag, bad --output value). */
  USAGE: 2,
  /** Not authenticated / token rejected (401). */
  AUTH: 3,
  /** Investigation budget exhausted (BUDGET_EXHAUSTED / 402). */
  BUDGET_EXHAUSTED: 4,
  /** Caller lacks permission (PERMISSION_DENIED / 403). */
  PERMISSION_DENIED: 5,
  /** Idempotency key already used with a different payload (409). */
  IDEMPOTENCY_CONFLICT: 6,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/**
 * `CliErrorCode` — the client-owned error taxonomy carried in every
 * `CliEnvelope.error.code`. It PEERS the plugin's service `ToolErrorCode`
 * (`NOT_FOUND` / `PERMISSION_DENIED` / `IDEMPOTENCY_CONFLICT` /
 * `USER_REJECTED_CONFIRMATION` / `BUDGET_EXHAUSTED`) and adds the two purely
 * client-side classes a CLI needs — `usage` (bad invocation) and `auth`
 * (missing/rejected credentials) — plus a `generic` catch-all.
 *
 * This is deliberately NOT a shared wire type: the service owns `ToolErrorCode`
 * on the wire; the CLI/SDK own how those (plus transport/usage failures) map to
 * a stable, script-parseable code + process exit status.
 */
export const CLI_ERROR_CODES = [
  "usage",
  "auth",
  "budget_exhausted",
  "permission_denied",
  "idempotency_conflict",
  "not_found",
  "user_rejected",
  "generic",
] as const;

export type CliErrorCode = (typeof CLI_ERROR_CODES)[number];

/**
 * The single source of truth for the error→exit-code map. Scripts branch on the
 * exit status; the JSON envelope carries the same `code` string. Codes outside
 * the documented distinct set (`not_found`, `user_rejected`, `generic`) fold to
 * `EXIT.GENERIC` so the published exit table (0–6) stays stable.
 */
export const CLI_ERROR_EXIT: Record<CliErrorCode, ExitCode> = {
  usage: EXIT.USAGE,
  auth: EXIT.AUTH,
  budget_exhausted: EXIT.BUDGET_EXHAUSTED,
  permission_denied: EXIT.PERMISSION_DENIED,
  idempotency_conflict: EXIT.IDEMPOTENCY_CONFLICT,
  not_found: EXIT.GENERIC,
  user_rejected: EXIT.GENERIC,
  generic: EXIT.GENERIC,
};

/** Map a service `ToolErrorCode` (or `UNKNOWN`) to its CLI peer. */
function cliCodeForServiceCode(code: string): CliErrorCode {
  switch (code) {
    case "NOT_FOUND":
      return "not_found";
    case "PERMISSION_DENIED":
      return "permission_denied";
    case "IDEMPOTENCY_CONFLICT":
      return "idempotency_conflict";
    case "USER_REJECTED_CONFIRMATION":
      return "user_rejected";
    case "BUDGET_EXHAUSTED":
      return "budget_exhausted";
    default:
      return "generic";
  }
}

/** Bad invocation — maps to EXIT.USAGE. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** Missing/invalid credentials — maps to EXIT.AUTH. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface ClassifiedError {
  /** Stable machine code carried in the JSON envelope's `error.code`. */
  code: CliErrorCode;
  message: string;
  exit: ExitCode;
}

/** Build a ClassifiedError, deriving the exit from the fixed CLI_ERROR_EXIT map. */
function classified(code: CliErrorCode, message: string): ClassifiedError {
  return { code, message, exit: CLI_ERROR_EXIT[code] };
}

/** Map any thrown value to a stable { code, message, exit }. */
export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof UsageError) return classified("usage", err.message);
  if (err instanceof AuthError) return classified("auth", err.message);
  if (err instanceof ServiceError) {
    const message = err.message;
    // 401 has no ToolErrorCode peer — it's a pure transport/auth failure.
    if (err.httpStatus === 401) return classified("auth", message);
    // HTTP status wins where it disambiguates (402/409), else fall back to the
    // typed service code so a directly-constructed ServiceError still maps.
    if (err.httpStatus === 402) return classified("budget_exhausted", message);
    if (err.httpStatus === 409)
      return classified("idempotency_conflict", message);
    return classified(cliCodeForServiceCode(String(err.code)), message);
  }
  const message = err instanceof Error ? err.message : String(err);
  return classified("generic", message);
}
