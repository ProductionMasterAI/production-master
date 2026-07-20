/**
 * @production-master/adapter-codex — Codex thin host adapter.
 *
 * Wires @production-master/plugin-core to the Codex investigation panel +
 * mutation modal. Renders / streams / triggers only — no LLM call, no local
 * pipeline.
 */
export { CodexHostAdapter } from './host.js';
export type { CodexHostSinks, CodexPanelState } from './host.js';
export { CapturingCodexSinks } from './__fixtures__/capturing-sinks.js';
