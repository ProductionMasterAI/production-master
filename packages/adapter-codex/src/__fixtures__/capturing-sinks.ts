/** A capturing CodexHostSinks double for unit + conformance tests. */
import type { MutationPreviewV1, McpServerConfig } from '@production-master/plugin-core';
import type { CodexHostSinks, CodexPanelState } from '../host.js';

export class CapturingCodexSinks implements CodexHostSinks {
  readonly panels: CodexPanelState[] = [];
  readonly modalPreviews: MutationPreviewV1[] = [];
  readonly openedUrls: string[] = [];
  readonly mcpConfigs: McpServerConfig[] = [];

  constructor(private decision: 'approve' | 'reject' = 'approve') {}

  renderPanel(state: CodexPanelState): void {
    this.panels.push(state);
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
