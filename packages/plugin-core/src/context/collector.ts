/**
 * LocalContextCollector — the ONE place the thin client reads local IDE state.
 *
 * Strictly opt-in (default OFF, per investigation). Collected signals are
 * redacted and staged into a preview buffer; nothing is sent to the service
 * until the user confirms, at which point it lands as typed evidence via the
 * investigation.add_evidence mutation tool (which is itself preview-gated).
 *
 * No LLM/provider SDK; no network here — collection + redaction only.
 */
import { isBlockedPath, redact, MAX_TEXT_BYTES, type RedactionResult } from './redact.js';

export type LocalContextSignal =
  | { kind: 'git_branch'; branch: string }
  | { kind: 'modified_files'; files: string[] }
  | { kind: 'cursor_location'; file: string; line: number }
  | { kind: 'terminal_excerpt'; text: string };

export interface CollectedEvidence {
  /** code_reference for git/file signals; user_provided for terminal text. */
  evidenceType: 'code_reference' | 'user_provided';
  signal: LocalContextSignal;
  /** Redaction metadata for the signal's text payload (if any). */
  redaction?: RedactionResult;
  /** Present for code_reference: the commit SHA the reference is pinned to. */
  commitSha?: string;
}

export interface CollectorOptions {
  /** Master opt-in switch (default false). */
  enabled?: boolean;
  /** Resolves the current commit SHA for code_reference pinning. */
  resolveCommitSha?: () => string | undefined;
}

export class LocalContextCollector {
  private buffer: CollectedEvidence[] = [];
  private readonly enabled: boolean;
  private readonly resolveCommitSha: () => string | undefined;

  constructor(opts: CollectorOptions = {}) {
    this.enabled = opts.enabled ?? false;
    this.resolveCommitSha = opts.resolveCommitSha ?? (() => undefined);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Stage a signal into the preview buffer. Returns the collected evidence, or
   * `undefined` if collection is disabled or the signal is blocked. Throws if a
   * terminal excerpt exceeds the size cap (ask-to-narrow; no silent truncation).
   */
  collect(signal: LocalContextSignal): CollectedEvidence | undefined {
    if (!this.enabled) return undefined;

    if (signal.kind === 'modified_files') {
      const files = signal.files.filter((f) => !isBlockedPath(f));
      const evidence: CollectedEvidence = {
        evidenceType: 'code_reference',
        signal: { kind: 'modified_files', files },
        commitSha: this.resolveCommitSha(),
      };
      this.buffer.push(evidence);
      return evidence;
    }

    if (signal.kind === 'cursor_location') {
      if (isBlockedPath(signal.file)) return undefined;
      const evidence: CollectedEvidence = {
        evidenceType: 'code_reference',
        signal,
        commitSha: this.resolveCommitSha(),
      };
      this.buffer.push(evidence);
      return evidence;
    }

    if (signal.kind === 'git_branch') {
      const evidence: CollectedEvidence = {
        evidenceType: 'code_reference',
        signal,
        commitSha: this.resolveCommitSha(),
      };
      this.buffer.push(evidence);
      return evidence;
    }

    // terminal_excerpt — redact + enforce size cap.
    const redaction = redact(signal.text);
    if (redaction.truncated) {
      throw new Error(
        `terminal excerpt exceeds ${MAX_TEXT_BYTES} bytes after redaction; narrow the selection and retry`,
      );
    }
    const evidence: CollectedEvidence = {
      evidenceType: 'user_provided',
      signal: { kind: 'terminal_excerpt', text: redaction.text },
      redaction,
    };
    this.buffer.push(evidence);
    return evidence;
  }

  /** The staged, redacted evidence buffer (nothing has been sent yet). */
  preview(): readonly CollectedEvidence[] {
    return this.buffer;
  }

  /** Clear the buffer (e.g. after the user cancels). */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Confirm and drain the buffer. The caller forwards each item to the
   * investigation.add_evidence mutation tool. Returns the drained items and
   * empties the buffer so nothing is sent twice.
   */
  confirm(): CollectedEvidence[] {
    const drained = this.buffer;
    this.buffer = [];
    return drained;
  }
}
