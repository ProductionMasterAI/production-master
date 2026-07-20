/**
 * Deterministic projection reducers — fold the event stream into the four UI
 * view-models every IDE surface renders, plus the pending-actions list.
 *
 * Pure functions / pure fold: replaying the same `events.jsonl` twice yields
 * byte-identical projections. No business logic, no I/O, no LLM.
 */
import type {
  AgentInvocationDetail,
  InvestigationEventEnvelope,
  LogLine,
  PanelView,
  PendingAction,
  PipelineRunGraph,
  PipelineStepState,
  RunStatus,
  RunSummary,
} from '../types.js';
import { normalizeAgentId } from '../contract/agents.js';

export interface ProjectionState {
  runSummary: RunSummary;
  pipeline: PipelineRunGraph;
  logs: LogLine[];
  agents: Map<string, AgentInvocationDetail>;
  pendingActions: Map<string, PendingAction>;
}

function num(payload: Record<string, unknown> | undefined, key: string): number {
  const v = payload?.[key];
  return typeof v === 'number' ? v : 0;
}
function str(payload: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = payload?.[key];
  return typeof v === 'string' ? v : undefined;
}

export function initialProjection(investigationId: string): ProjectionState {
  return {
    runSummary: { investigationId, status: 'created', costUsd: 0 },
    pipeline: { investigationId, steps: [] },
    logs: [],
    agents: new Map(),
    pendingActions: new Map(),
  };
}

function upsertStep(steps: PipelineStepState[], stepId: string, patch: Partial<PipelineStepState>): void {
  const existing = steps.find((s) => s.stepId === stepId);
  if (existing) {
    Object.assign(existing, patch);
  } else {
    steps.push({ stepId, label: patch.label ?? stepId, status: patch.status ?? 'pending' });
  }
}

const STATUS_BY_TYPE: Record<string, RunStatus> = {
  'investigation.created': 'created',
  'investigation.status_changed': 'running',
  'investigation.completed': 'completed',
  'investigation.failed': 'failed',
};

/** Apply one event to the projection state (mutating, in sequence order). */
export function reduce(state: ProjectionState, e: InvestigationEventEnvelope): ProjectionState {
  const p = e.payload;
  switch (e.type) {
    case 'investigation.created':
      state.runSummary.status = 'created';
      state.runSummary.title = str(p, 'title') ?? state.runSummary.title;
      state.runSummary.startedAt = e.timestamp;
      break;
    case 'investigation.status_changed':
      state.runSummary.status = (str(p, 'status') as RunStatus) ?? 'running';
      break;
    case 'investigation.completed':
      state.runSummary.status = 'completed';
      state.runSummary.completedAt = e.timestamp;
      state.runSummary.reportUri = str(p, 'reportUri') ?? state.runSummary.reportUri;
      break;
    case 'investigation.failed':
      state.runSummary.status = 'failed';
      state.runSummary.completedAt = e.timestamp;
      break;
    case 'phase.started':
      upsertStep(state.pipeline.steps, str(p, 'phaseId') ?? 'unknown', {
        label: str(p, 'label') ?? str(p, 'phaseId') ?? 'phase',
        status: 'running',
      });
      break;
    case 'phase.completed':
      upsertStep(state.pipeline.steps, str(p, 'phaseId') ?? 'unknown', { status: 'completed' });
      break;
    case 'agent.invoked': {
      const id = str(p, 'invocationId') ?? e.eventId;
      state.agents.set(id, {
        agentId: normalizeAgentId(str(p, 'agentId')) ?? 'agent',
        invocationId: id,
        status: 'invoked',
        startedAt: e.timestamp,
        costUsd: 0,
        toolCalls: 0,
      });
      break;
    }
    case 'agent.completed': {
      const id = str(p, 'invocationId') ?? '';
      const a = state.agents.get(id);
      if (a) {
        a.status = 'completed';
        a.completedAt = e.timestamp;
      }
      break;
    }
    case 'agent.tool_call.completed': {
      const id = str(p, 'invocationId') ?? '';
      const a = state.agents.get(id);
      if (a) a.toolCalls += 1;
      break;
    }
    case 'cost.consumed': {
      const delta = num(p, 'costUsd');
      state.runSummary.costUsd = round6(state.runSummary.costUsd + delta);
      const id = str(p, 'invocationId') ?? '';
      const a = state.agents.get(id);
      if (a) a.costUsd = round6(a.costUsd + delta);
      // Every cost.consumed event yields a log line (exit check E6, client side).
      state.logs.push({
        sequence: e.sequence,
        timestamp: e.timestamp,
        level: 'info',
        text: `cost +$${delta.toFixed(4)} (total $${state.runSummary.costUsd.toFixed(4)})`,
        agentId: normalizeAgentId(str(p, 'agentId')),
      });
      break;
    }
    case 'action.proposed':
      state.pendingActions.set(str(p, 'actionId') ?? e.eventId, {
        actionId: str(p, 'actionId') ?? e.eventId,
        kind: str(p, 'kind') ?? 'action',
        summary: str(p, 'summary') ?? '',
        status: 'proposed',
      });
      break;
    case 'action.approved': {
      const a = state.pendingActions.get(str(p, 'actionId') ?? '');
      if (a) a.status = 'approved';
      break;
    }
    case 'action.executed': {
      const a = state.pendingActions.get(str(p, 'actionId') ?? '');
      if (a) a.status = 'executed';
      break;
    }
    default: {
      // Generic log line for any other event carrying a `message`.
      const msg = str(p, 'message');
      if (msg) {
        state.logs.push({
          sequence: e.sequence,
          timestamp: e.timestamp,
          level: 'info',
          text: msg,
          agentId: normalizeAgentId(str(p, 'agentId')),
        });
      }
    }
  }
  if (STATUS_BY_TYPE[e.type]) state.runSummary.status = STATUS_BY_TYPE[e.type];
  return state;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Fold a full event list into a fresh projection state (deterministic). */
export function fold(investigationId: string, events: InvestigationEventEnvelope[]): ProjectionState {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const state = initialProjection(investigationId);
  for (const e of ordered) reduce(state, e);
  return state;
}

/** Materialize the host-facing PanelView from projection state. */
export function toPanelView(state: ProjectionState): PanelView {
  return {
    runSummary: { ...state.runSummary },
    pipeline: { investigationId: state.pipeline.investigationId, steps: state.pipeline.steps.map((s) => ({ ...s })) },
    logs: state.logs.map((l) => ({ ...l })),
    pendingActions: [...state.pendingActions.values()].map((a) => ({ ...a })),
  };
}
