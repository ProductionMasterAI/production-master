/**
 * A capturing ClaudeCodeHostSinks double. Records every statusline string,
 * panel-command batch, modal preview, and opened URL so unit + conformance
 * tests can assert exactly what the Claude Code surface would render.
 */
import type { MutationPreviewV1, RenderCommand, McpServerConfig } from '@production-master/plugin-core';
import type { ClaudeCodeHostSinks } from '../host.js';

export class CapturingSinks implements ClaudeCodeHostSinks {
  readonly statuslines: string[] = [];
  readonly panelBatches: RenderCommand[][] = [];
  readonly modalPreviews: MutationPreviewV1[] = [];
  readonly openedUrls: string[] = [];
  readonly mcpConfigs: McpServerConfig[] = [];

  constructor(private decision: 'approve' | 'reject' = 'approve') {}

  setStatusline(text: string): void {
    this.statuslines.push(text);
  }
  renderPanelCommands(commands: RenderCommand[]): void {
    this.panelBatches.push(commands);
  }
  async confirmMutation(preview: MutationPreviewV1): Promise<'approve' | 'reject'> {
    this.modalPreviews.push(preview);
    return this.decision;
  }
  openUrl(url: string): void {
    this.openedUrls.push(url);
  }
  registerMcpServer(cfg: McpServerConfig): void {
    this.mcpConfigs.push(cfg);
  }
  setDecision(d: 'approve' | 'reject'): void {
    this.decision = d;
  }
}
