import { describe, it, expect } from 'vitest';
import { LocalContextCollector } from './collector.js';

describe('LocalContextCollector', () => {
  it('collects nothing when opt-in is off (default)', () => {
    const c = new LocalContextCollector();
    expect(c.isEnabled()).toBe(false);
    expect(c.collect({ kind: 'git_branch', branch: 'main' })).toBeUndefined();
    expect(c.preview()).toHaveLength(0);
  });

  it('collects a git branch as a pinned code_reference when enabled', () => {
    const c = new LocalContextCollector({ enabled: true, resolveCommitSha: () => 'abc123' });
    const ev = c.collect({ kind: 'git_branch', branch: 'fix/bug' });
    expect(ev?.evidenceType).toBe('code_reference');
    expect(ev?.commitSha).toBe('abc123');
  });

  it('filters blocked files out of modified_files', () => {
    const c = new LocalContextCollector({ enabled: true });
    const ev = c.collect({ kind: 'modified_files', files: ['src/a.ts', '.env', 'config/credentials.json'] });
    expect(ev?.signal).toMatchObject({ kind: 'modified_files', files: ['src/a.ts'] });
  });

  it('drops a cursor_location inside a blocked file', () => {
    const c = new LocalContextCollector({ enabled: true });
    expect(c.collect({ kind: 'cursor_location', file: '.env', line: 3 })).toBeUndefined();
  });

  it('redacts secrets in a terminal excerpt before it is buffered', () => {
    const c = new LocalContextCollector({ enabled: true });
    // Assembled at runtime so the repo secret-scan never matches a literal here.
    const fakeAwsKey = 'AKIA' + '1234567890ABCDEF';
    const ev = c.collect({ kind: 'terminal_excerpt', text: `export AWS=${fakeAwsKey}` });
    expect(ev?.evidenceType).toBe('user_provided');
    const sig = ev?.signal as { kind: 'terminal_excerpt'; text: string };
    expect(sig.text).not.toContain(fakeAwsKey);
    expect(ev?.redaction?.redactedCount).toBe(1);
  });

  it('throws (ask-to-narrow) on an oversize terminal excerpt — no silent truncation', () => {
    const c = new LocalContextCollector({ enabled: true });
    const big = 'y'.repeat(33 * 1024);
    expect(() => c.collect({ kind: 'terminal_excerpt', text: big })).toThrow(/narrow/);
  });

  it('confirm() drains the buffer so nothing is sent twice', () => {
    const c = new LocalContextCollector({ enabled: true });
    c.collect({ kind: 'git_branch', branch: 'main' });
    expect(c.preview()).toHaveLength(1);
    const drained = c.confirm();
    expect(drained).toHaveLength(1);
    expect(c.preview()).toHaveLength(0);
  });

  it('clear() discards the buffer without sending', () => {
    const c = new LocalContextCollector({ enabled: true });
    c.collect({ kind: 'git_branch', branch: 'main' });
    c.clear();
    expect(c.preview()).toHaveLength(0);
  });
});
