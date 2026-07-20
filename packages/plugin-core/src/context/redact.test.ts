import { describe, it, expect } from 'vitest';
import { redact, isBlockedPath, REDACTION_PLACEHOLDER, MAX_TEXT_BYTES } from './redact.js';

describe('isBlockedPath', () => {
  it('blocks env, credentials, service-account, ssh, keys', () => {
    expect(isBlockedPath('app/.env')).toBe(true);
    expect(isBlockedPath('.env.production')).toBe(true);
    expect(isBlockedPath('config/credentials.json')).toBe(true);
    expect(isBlockedPath('deploy/my-service-account-prod.json')).toBe(true);
    expect(isBlockedPath('/home/u/.ssh/known_hosts')).toBe(true);
    expect(isBlockedPath('secrets/id_rsa')).toBe(true);
    expect(isBlockedPath('certs/server.pem')).toBe(true);
  });
  it('allows ordinary source files', () => {
    expect(isBlockedPath('src/index.ts')).toBe(false);
    expect(isBlockedPath('README.md')).toBe(false);
    expect(isBlockedPath('environment.ts')).toBe(false);
  });
});

describe('redact', () => {
  // Synthetic credential fixtures assembled at runtime so the repo secret-scan
  // (a line-level git grep) never matches a literal here, while the redactor
  // still receives the fully-assembled string it is meant to mask.
  const fakeAwsKey = 'AKIA' + '1234567890ABCDEF';
  const fakeGitHubToken = 'ghp_' + '0123456789abcdefghijABCDEFGHIJ012345';

  it('masks AKIA, xox-, and PRIVATE KEY before any preview', () => {
    const r = redact(`key ${fakeAwsKey} and xoxb-abc-123 and a PRIVATE KEY here`);
    expect(r.text).not.toContain(fakeAwsKey);
    expect(r.text).not.toContain('xoxb-abc-123');
    expect(r.text).toContain(REDACTION_PLACEHOLDER);
    expect(r.redactedCount).toBeGreaterThanOrEqual(3);
  });
  it('masks GitHub tokens', () => {
    const r = redact(`token ${fakeGitHubToken}`);
    expect(r.text).toContain(REDACTION_PLACEHOLDER);
    expect(r.redactedCount).toBe(1);
  });
  it('is deterministic', () => {
    const input = fakeAwsKey;
    expect(redact(input).text).toBe(redact(input).text);
  });
  it('leaves clean text unchanged with zero redactions', () => {
    const r = redact('nothing secret here');
    expect(r.text).toBe('nothing secret here');
    expect(r.redactedCount).toBe(0);
  });
  it('flags oversize input as truncated (no silent truncation)', () => {
    const big = 'x'.repeat(MAX_TEXT_BYTES + 10);
    expect(redact(big).truncated).toBe(true);
  });
});
