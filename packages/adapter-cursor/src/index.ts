/**
 * @production-master/adapter-cursor — Cursor thin host adapter.
 *
 * Wires @production-master/plugin-core to the Cursor MCP server registration +
 * side panel + mutation modal. Renders / streams / triggers only — no LLM call,
 * no local pipeline.
 */
export { CursorHostAdapter } from './host.js';
export type { CursorHostSinks, CursorSidePanelState } from './host.js';
export { CapturingCursorSinks } from './__fixtures__/capturing-sinks.js';
