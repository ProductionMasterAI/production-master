/**
 * OpenCodeHostAdapter — the OpenCode wiring of the host-neutral `HostAdapter`
 * seam (AD-7 / 4th platform; issues #86 + #150).
 *
 * OpenCode is a terminal-native coding agent. It registers a scoped MCP server
 * via its `opencode.json` `mcp` map and renders an investigation **TUI panel**
 * (a serialized terminal view) rather than a webview. The adapter projects the
 * PanelView into the shared host-neutral `RenderCommand[]` and hands OpenCode a
 * single serialized `OpenCodeTuiPanelState` to paint, plus a
 * mutation-confirmation prompt. All protocol + rendering logic stays in
 * @production-master/plugin-core — this file is host wiring only. NO
 * LLM/provider SDK, no local pipeline.
 */
import {
  renderPanelCommands,
  type HostAdapter,
  type McpServerConfig,
  type MutationPreviewV1,
  type PanelView,
  type RenderCommand,
  type UiEvent,
  type UiSubscription,
} from '@production-master/plugin-core';

/** The serialized TUI-panel payload the OpenCode terminal view renders. */
export interface OpenCodeTuiPanelState {
  schemaVersion: 'opencode-tui-panel.v1';
  commands: RenderCommand[];
}

/** Concrete OpenCode surfaces the adapter drives. All injectable for testing. */
export interface OpenCodeHostSinks {
  /** Render the OpenCode investigation TUI panel from serialized state. */
  renderTuiPanel(state: OpenCodeTuiPanelState): void;
  /** Show the mutation-confirmation prompt; resolve to the decision. */
  confirmMutation(preview: MutationPreviewV1): Promise<'approve' | 'reject'>;
  /** Open a URL in the user's browser. */
  openUrl(url: string): Promise<void> | void;
  /** Register the scoped MCP server with OpenCode (required surface for OpenCode). */
  registerMcpServer(cfg: McpServerConfig): Promise<void> | void;
}

export class OpenCodeHostAdapter implements HostAdapter {
  private mcpConfig: McpServerConfig | undefined;
  private subscribers = new Set<(event: UiEvent) => void>();

  constructor(private readonly sinks: OpenCodeHostSinks) {}

  async registerMcpServer(cfg: McpServerConfig): Promise<void> {
    this.mcpConfig = cfg;
    await this.sinks.registerMcpServer(cfg);
  }

  getRegisteredEndpoint(): string | undefined {
    return this.mcpConfig?.endpoint;
  }

  async showMutationPreview(preview: MutationPreviewV1): Promise<'approve' | 'reject'> {
    return this.sinks.confirmMutation(preview);
  }

  async openExternalUrl(url: string): Promise<void> {
    await this.sinks.openUrl(url);
  }

  renderPanel(view: PanelView): void {
    this.sinks.renderTuiPanel({ schemaVersion: 'opencode-tui-panel.v1', commands: renderPanelCommands(view) });
  }

  subscribeUi(cb: (event: UiEvent) => void): UiSubscription {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  emitUi(event: UiEvent): void {
    for (const cb of this.subscribers) cb(event);
  }
}
