/**
 * @production-master/adapter-opencode — OpenCode thin host adapter.
 *
 * Wires @production-master/plugin-core to the OpenCode MCP server registration +
 * TUI panel + mutation prompt. Renders / streams / triggers only — no LLM call,
 * no local pipeline.
 */
export { OpenCodeHostAdapter } from './host.js';
export type { OpenCodeHostSinks, OpenCodeTuiPanelState } from './host.js';
export { CapturingOpenCodeSinks } from './__fixtures__/capturing-sinks.js';
