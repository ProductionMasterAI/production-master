/**
 * Deterministic secret redaction for local-context evidence.
 *
 * Two layers:
 *  1. A glob blocklist of file paths that must never be collected at all.
 *  2. A regex redactor that masks likely secret material in any text payload.
 *
 * Both are deterministic (same input -> same output). No LLM/provider SDK.
 */

/** Paths matching any of these globs are never collected. */
export const PATH_BLOCKLIST: readonly string[] = [
  '**/.env',
  '**/.env.*',
  '**/credentials.json',
  '**/*service-account*.json',
  '**/.ssh/**',
  '**/id_rsa',
  '**/id_rsa.*',
  '**/*.pem',
  '**/*.key',
];

/** 32 KiB cap on collected terminal/text excerpts. */
export const MAX_TEXT_BYTES = 32 * 1024;

const SECRET_PATTERNS: RegExp[] = [
  /\bPRIVATE KEY\b/g,
  /AKIA[0-9A-Z]{16}/g,
  /\bxox[baprs]-[A-Za-z0-9-]+/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
];

export const REDACTION_PLACEHOLDER = '[REDACTED_POTENTIAL_SECRET]';

/** Convert a glob (subset: ** and *) to a RegExp. */
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        // consume a trailing slash after ** so '**/x' matches 'x'
        if (glob[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if ('\\^$+?.()|[]{}'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

const BLOCKLIST_RE = PATH_BLOCKLIST.map(globToRegExp);

/** True when a path is on the blocklist and must not be collected. */
export function isBlockedPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return BLOCKLIST_RE.some((re) => re.test(normalized) || re.test(normalized.replace(/^.*\//, '')));
}

export interface RedactionResult {
  text: string;
  redactedCount: number;
  truncated: boolean;
}

/**
 * Redact secret material from text. Does NOT silently truncate oversize input:
 * callers must check `truncated` and ask the user to narrow.
 */
export function redact(input: string): RedactionResult {
  let redactedCount = 0;
  let text = input;
  for (const pat of SECRET_PATTERNS) {
    text = text.replace(pat, () => {
      redactedCount++;
      return REDACTION_PLACEHOLDER;
    });
  }
  const truncated = Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES;
  return { text, redactedCount, truncated };
}
