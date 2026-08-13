import { describe, it, expect } from "vitest";
import {
  ServiceError,
  IdempotencyConflict,
} from "@production-master/plugin-core";
import {
  classifyError,
  EXIT,
  CLI_ERROR_CODES,
  CLI_ERROR_EXIT,
  UsageError,
  AuthError,
} from "./exit-codes.js";

describe("classifyError", () => {
  it("UsageError -> exit 2", () => {
    expect(classifyError(new UsageError("bad")).exit).toBe(EXIT.USAGE);
  });

  it("AuthError -> exit 3", () => {
    const c = classifyError(new AuthError("login"));
    expect(c.exit).toBe(EXIT.AUTH);
    expect(c.code).toBe("auth");
  });

  it("ServiceError 401 -> auth exit 3", () => {
    expect(classifyError(new ServiceError("UNKNOWN", 401, "no")).exit).toBe(
      EXIT.AUTH,
    );
  });

  it("BUDGET_EXHAUSTED / 402 -> exit 4", () => {
    const c = classifyError(new ServiceError("BUDGET_EXHAUSTED", 402, "broke"));
    expect(c.exit).toBe(EXIT.BUDGET_EXHAUSTED);
    expect(c.code).toBe("budget_exhausted");
  });

  it("PERMISSION_DENIED / 403 -> exit 5", () => {
    expect(
      classifyError(new ServiceError("PERMISSION_DENIED", 403, "no")).exit,
    ).toBe(EXIT.PERMISSION_DENIED);
  });

  it("IdempotencyConflict / 409 -> exit 6", () => {
    const c = classifyError(new IdempotencyConflict("dup"));
    expect(c.exit).toBe(EXIT.IDEMPOTENCY_CONFLICT);
    expect(c.code).toBe("idempotency_conflict");
  });

  it("plain Error -> generic exit 1", () => {
    const c = classifyError(new Error("boom"));
    expect(c.exit).toBe(EXIT.GENERIC);
    expect(c.code).toBe("generic");
    expect(c.message).toBe("boom");
  });

  it("NOT_FOUND -> not_found (folds to generic exit 1)", () => {
    const c = classifyError(new ServiceError("NOT_FOUND", 404, "gone"));
    expect(c.code).toBe("not_found");
    expect(c.exit).toBe(EXIT.GENERIC);
  });

  it("USER_REJECTED_CONFIRMATION -> user_rejected", () => {
    const c = classifyError(
      new ServiceError("USER_REJECTED_CONFIRMATION", 200, "no"),
    );
    expect(c.code).toBe("user_rejected");
    expect(c.exit).toBe(EXIT.GENERIC);
  });
});

describe("CLI_ERROR_EXIT map (fixed error→exit contract)", () => {
  it("every CliErrorCode has an exit mapping", () => {
    for (const code of CLI_ERROR_CODES) {
      expect(CLI_ERROR_EXIT[code]).toBeTypeOf("number");
    }
  });

  it("pins the documented distinct exit codes", () => {
    expect(CLI_ERROR_EXIT).toMatchObject({
      usage: EXIT.USAGE,
      auth: EXIT.AUTH,
      budget_exhausted: EXIT.BUDGET_EXHAUSTED,
      permission_denied: EXIT.PERMISSION_DENIED,
      idempotency_conflict: EXIT.IDEMPOTENCY_CONFLICT,
    });
  });

  it("classifyError always returns a code drawn from the taxonomy", () => {
    const c = classifyError(new ServiceError("UNKNOWN", 500, "x"));
    expect(CLI_ERROR_CODES).toContain(c.code);
    expect(c.exit).toBe(CLI_ERROR_EXIT[c.code]);
  });
});
