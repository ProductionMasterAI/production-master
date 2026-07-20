import { describe, it, expect } from 'vitest';
import {
  CANONICAL_AGENT_ROLES,
  AGENT_ROLE_ALIASES,
  ROLE_SKILLS,
  AGENT_RESULT_EVENT_TYPES,
  isCanonicalAgentRole,
  canonicalAgentRole,
  normalizeAgentId,
  type CanonicalAgentRole,
} from './agents.js';

describe('canonical agent contract (service-schema parity, #25)', () => {
  it('pins exactly the canonical 8 roles in service order', () => {
    expect(CANONICAL_AGENT_ROLES).toEqual([
      'bug-context',
      'log-analyzer',
      'code-semantics',
      'change-analyzer',
      'hypothesis-gen',
      'verifier',
      'skeptic',
      'documenter',
    ]);
  });

  it('isCanonicalAgentRole accepts canonical, rejects aliases/unknowns', () => {
    expect(isCanonicalAgentRole('hypothesis-gen')).toBe(true);
    expect(isCanonicalAgentRole('log-analyzer')).toBe(true);
    // an alias is NOT itself canonical
    expect(isCanonicalAgentRole('hypotheses')).toBe(false);
    expect(isCanonicalAgentRole('grafana-analyzer')).toBe(false);
    expect(isCanonicalAgentRole('jira-agent')).toBe(false);
  });

  it('every alias resolves to one of the canonical 8', () => {
    for (const [alias, role] of Object.entries(AGENT_ROLE_ALIASES)) {
      expect(CANONICAL_AGENT_ROLES, alias).toContain(role);
    }
  });

  it('maps the deprecated local-pipeline agent names to canonical roles', () => {
    expect(canonicalAgentRole('grafana-analyzer')).toBe('log-analyzer');
    expect(canonicalAgentRole('codebase-semantics')).toBe('code-semantics');
    expect(canonicalAgentRole('production-analyzer')).toBe('change-analyzer');
    expect(canonicalAgentRole('root-cause')).toBe('hypothesis-gen');
    expect(canonicalAgentRole('evidence-synthesizer')).toBe('hypothesis-gen');
  });

  it('maps the service v1 snake_case aliases (parity with service AGENT_ROLE_ALIASES)', () => {
    expect(canonicalAgentRole('bug_context')).toBe('bug-context');
    expect(canonicalAgentRole('comms_analyzer')).toBe('change-analyzer');
    expect(canonicalAgentRole('hypothesis_generator')).toBe('hypothesis-gen');
    // issue-body spelling accepted as an alias of the wire ID
    expect(canonicalAgentRole('hypotheses')).toBe('hypothesis-gen');
  });

  it('returns undefined for local-only/utility agents with no canonical role', () => {
    expect(canonicalAgentRole('jira-agent')).toBeUndefined();
    expect(canonicalAgentRole('slack-agent')).toBeUndefined();
    expect(canonicalAgentRole('step-runner')).toBeUndefined();
    expect(canonicalAgentRole(undefined)).toBeUndefined();
  });

  it('normalizeAgentId rewrites known ids to canonical and passes unknowns through', () => {
    expect(normalizeAgentId('production-analyzer')).toBe('change-analyzer');
    expect(normalizeAgentId('hypothesis-gen')).toBe('hypothesis-gen');
    expect(normalizeAgentId('jira-agent')).toBe('jira-agent'); // unknown -> unchanged
    expect(normalizeAgentId(undefined)).toBeUndefined();
  });

  it('declares ROLE_SKILLS for each canonical role (service ROLE_SKILLS parity)', () => {
    for (const role of CANONICAL_AGENT_ROLES) {
      expect(ROLE_SKILLS[role as CanonicalAgentRole], role).toBeDefined();
      expect(ROLE_SKILLS[role as CanonicalAgentRole].length).toBeGreaterThan(0);
    }
    expect(ROLE_SKILLS['log-analyzer']).toEqual(['grafana']);
    expect(ROLE_SKILLS['change-analyzer']).toEqual(['code-search', 'jira']);
  });

  it('pins the canonical per-role result event types', () => {
    expect(AGENT_RESULT_EVENT_TYPES).toEqual([
      'evidence.collected',
      'hypothesis.proposed',
      'verifier.verdict',
      'documenter.reported',
    ]);
  });
});
