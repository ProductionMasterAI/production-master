/** A capturing OpenCodeHostSinks double for unit + conformance tests. */
import type { MutationPreviewV1, McpServerConfig } from '@production-master/plugin-core';
import type { OpenCodeHostSinks, OpenCodeTuiPanelState } from '../host.js';

export class CapturingOpenCodeSinks implements OpenCodeHostSinks {
  readonly tuiPanels: OpenCodeTuiPanelState[] = [];
  readonly modalPreviews: MutationPreviewV1[] = [];
  readonly openedUrls: string[] = [];
  readonly mcpConfigs: McpServerConfig[] = [];

  constructor(private decision: 'approve' | 'reject' = 'approve') {}

  renderTuiPanel(state: OpenCodeTuiPanelState): void {
    this.tuiPanels.push(state);
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
