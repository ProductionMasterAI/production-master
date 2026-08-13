/**
 * Tiny argv parser for pmctl. Supports `--flag value`, `--flag=value`, boolean
 * `--flag`, short `-h`, and positional arguments collected into `_`.
 *
 * Mirrors the lightweight style of plugin-core's remote-cli parser, extended
 * with `=` syntax and positional collection so the verb + its operands are
 * available as `_[0]`, `_[1]`, ...
 */
import { UsageError } from "./exit-codes.js";

export interface ParsedArgs {
  /** Positional operands in order (e.g. the verb, then its arguments). */
  _: string[];
  /** Named flags. Boolean flags resolve to `true`. */
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--") {
      // Everything after `--` is positional.
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        out.flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        out.flags[body] = next;
        i += 1;
      } else {
        out.flags[body] = true;
      }
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      // Short flags are boolean (only -h is meaningful today).
      for (const ch of token.slice(1)) out.flags[ch] = true;
      continue;
    }
    out._.push(token);
  }
  return out;
}

/** Read a flag as a string, or undefined when absent / boolean-only. */
export function strFlag(parsed: ParsedArgs, name: string): string | undefined {
  const v = parsed.flags[name];
  return typeof v === "string" ? v : undefined;
}

/** True when a boolean-style flag is present (`--name` or `--name=true`). */
export function boolFlag(parsed: ParsedArgs, ...names: string[]): boolean {
  return names.some((n) => {
    const v = parsed.flags[n];
    return v === true || v === "true";
  });
}

/**
 * Read a flag as a finite number, or undefined when absent entirely.
 * Throws a UsageError (exit 2) when present but not a finite number —
 * including a value-less presence like `--max-usd` with no value (e.g. from
 * an unset shell variable expanding to nothing, or a negative value like
 * `--max-usd -1` that parseArgs reads as a flag boundary rather than a
 * value). Silently treating either as "absent" would let a malformed budget
 * flag fall through to the caller's default, launching an uncapped run while
 * the user believes they set a cap.
 */
export function numFlag(parsed: ParsedArgs, name: string): number | undefined {
  const v = parsed.flags[name];
  if (v === undefined) return undefined;
  if (v === true) {
    throw new UsageError(`--${name} requires a numeric value (got none)`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new UsageError(`--${name} must be a number (got "${v}")`);
  }
  return n;
}
