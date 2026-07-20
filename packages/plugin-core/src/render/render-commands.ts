/**
 * Host-neutral render layer.
 *
 * Every per-IDE adapter (Claude Code / Codex / Cursor) consumes the SAME
 * declarative `RenderCommand[]` produced by `renderPanelCommands(view)` and only
 * differs in how it physically paints them (statusline string, webview HTML,
 * side-panel tree). Keeping the projection->commands mapping here — not in the
 * adapters — is what lets the conformance suite assert that all three adapters
 * render byte-identical command sequences for the same event stream.
 *
 * Pure functions only. No I/O, no host API, no LLM/provider SDK.
 */
import type { PanelView, PendingAction, PipelineStepState, RunStatus } from '../types.js';

/** A single status-line summary command (compact one-liner). */
export interface StatuslineCommand {
  kind: 'statusline';
  /** Stable machine status used for icon/coloring decisions by the host. */
  status: RunStatus;
  /** Pre-rendered host-neutral text the adapter may show verbatim. */
  text: string;
}

/** A pipeline-graph render command — one row per step. */
export interface PipelineCommand {
  kind: 'pipeline';
  steps: ReadonlyArray<{ stepId: string; label: string; status: PipelineStepState['status']; glyph: string }>;
}

/** A tail of recent log lines to show in the panel body. */
export interface LogTailCommand {
  kind: 'log-tail';
  lines: ReadonlyArray<{ sequence: number; level: string; text: string }>;
}

/** The pending-actions list with their approve/reject affordances. */
export interface ActionsCommand {
  kind: 'actions';
  actions: ReadonlyArray<{ actionId: string; kind: string; summary: string; status: PendingAction['status']; actionable: boolean }>;
}

/** A link affordance (e.g. open the final report). */
export interface LinkCommand {
  kind: 'link';
  label: string;
  url: string;
}

export type RenderCommand =
  | StatuslineCommand
  | PipelineCommand
  | LogTailCommand
  | ActionsCommand
  | LinkCommand;

/** How many of the most-recent log lines the panel body shows. */
export const LOG_TAIL = 8;

const STEP_GLYPH: Record<PipelineStepState['status'], string> = {
  pending: 'o',
  running: '~',
  completed: '*',
  failed: 'x',
  skipped: '-',
};

const STATUS_LABEL: Record<RunStatus, string> = {
  created: 'created',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
};

function fmtCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

/**
 * Project a `PanelView` into an ordered, host-neutral command list.
 *
 * Deterministic: identical input -> identical output (asserted by the
 * conformance suite across all three adapters).
 */
export function renderPanelCommands(view: PanelView): RenderCommand[] {
  const { runSummary, pipeline, logs, pendingActions } = view;

  const stepsDone = pipeline.steps.filter((s) => s.status === 'completed').length;
  const statusText =
    `PM ${STATUS_LABEL[runSummary.status]} - ${stepsDone}/${pipeline.steps.length} steps - ` +
    `${fmtCost(runSummary.costUsd)} - ${pendingActions.filter((a) => a.status === 'proposed').length} pending`;

  const commands: RenderCommand[] = [
    { kind: 'statusline', status: runSummary.status, text: statusText },
    {
      kind: 'pipeline',
      steps: pipeline.steps.map((s) => ({
        stepId: s.stepId,
        label: s.label,
        status: s.status,
        glyph: STEP_GLYPH[s.status],
      })),
    },
    {
      kind: 'log-tail',
      lines: logs.slice(-LOG_TAIL).map((l) => ({ sequence: l.sequence, level: l.level, text: l.text })),
    },
    {
      kind: 'actions',
      actions: pendingActions.map((a) => ({
        actionId: a.actionId,
        kind: a.kind,
        summary: a.summary,
        status: a.status,
        actionable: a.status === 'proposed',
      })),
    },
  ];

  if (runSummary.reportUri) {
    commands.push({ kind: 'link', label: 'Open report', url: runSummary.reportUri });
  }

  return commands;
}

/**
 * Render the statusline command alone as a plain string. Adapters that only own
 * a single-line status surface (e.g. Claude Code statusline) use this directly.
 */
export function statuslineText(view: PanelView): string {
  const cmd = renderPanelCommands(view).find((c): c is StatuslineCommand => c.kind === 'statusline');
  return cmd ? cmd.text : '';
}
