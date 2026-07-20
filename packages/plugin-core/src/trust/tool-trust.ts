/**
 * Trust classification for the investigation.* mutation tools (Q9).
 *
 * Each mutation carries a fixed blast radius (risk x reversibility). A session
 * trust grant covering that class lets the mutation proceed without a fresh
 * prompt; anything broader than the active grants is a trust EXPANSION and must
 * be approved by the user. This is the client mirror of the service's grant
 * matching (see part-10 §04, action-layer trust model).
 */
import type { MutationTool } from '../mcp/types.js';
import type { TrustRiskClass, TrustReversibility } from './session-grants.js';

export interface MutationTrustClass {
  riskClass: TrustRiskClass;
  reversibility: TrustReversibility;
}

/** Baseline write capability established by a write-scoped connect. */
export const BASELINE_WRITE_TRUST: MutationTrustClass = {
  riskClass: 'low',
  reversibility: 'reversible',
};

const MUTATION_TRUST: Record<MutationTool, MutationTrustClass> = {
  // Additive, self-undoing record edits.
  'investigation.add_evidence': { riskClass: 'low', reversibility: 'reversible' },
  'investigation.correct_evidence': { riskClass: 'low', reversibility: 'reversible' },
  'investigation.add_correction': { riskClass: 'low', reversibility: 'reversible' },
  'investigation.create_snapshot': { riskClass: 'low', reversibility: 'reversible' },
  // Destructive but recoverable via a compensating correction.
  'investigation.invalidate_evidence': { riskClass: 'low', reversibility: 'compensable' },
  'investigation.invalidate_hypothesis': { riskClass: 'low', reversibility: 'compensable' },
  // Re-executes the pipeline (spend + downstream side effects).
  'investigation.rerun_from_phase': { riskClass: 'high', reversibility: 'compensable' },
  'investigation.resume': { riskClass: 'high', reversibility: 'compensable' },
};

export function classifyMutation(tool: MutationTool): MutationTrustClass {
  return MUTATION_TRUST[tool];
}
