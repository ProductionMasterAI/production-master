/**
 * @production-master/adapter-claude-code — Claude Code thin host adapter.
 *
 * Wires the host-neutral @production-master/plugin-core thin client to the
 * Claude Code statusline + side-panel + mutation modal. Renders, streams, and
 * triggers ONLY — no LLM call, no local pipeline.
 */
export { ClaudeCodeHostAdapter } from './host.js';
export type { ClaudeCodeHostSinks } from './host.js';
export { CapturingSinks } from './__fixtures__/capturing-sinks.js';
