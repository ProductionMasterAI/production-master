/**
 * CodexHostAdapter — the Codex wiring of the host-neutral `HostAdapter` seam
 * (V4-MVP issue #27 / Phase 5).
 *
 * Codex surfaces an investigation **panel** (a serialized webview state) rather
 * than a one-line statusline. The adapter projects the PanelView into the
 * shared host-neutral `RenderCommand[]` and hands Codex a single serialized
 * `CodexPanelState` to paint, plus a mutation-confirmation modal. All protocol
 * + rendering logic stays in @production-master/plugin-core — this file is host
 * wiring only. NO LLM/provider SDK, no local pipeline.
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

/** The serialized panel payload the Codex webview renders. */
export interface CodexPanelState {
  schemaVersion: 'codex-panel.v1';
  commands: RenderCommand[];
}

/** Concrete Codex surfaces the adapter drives. All injectable for testing. */
export interface CodexHostSinks {
  /** Render the Codex investigation panel from serialized state. */
  renderPanel(state: CodexPanelState): void;
  /** Show the mutation-confirmation modal; resolve to the decision. */
  confirmMutation(preview: MutationPreviewV1): Promise<'approve' | 'reject'>;
  /** Open a URL in the user's browser. */
  openUrl(url: string): Promise<void> | void;
  /** Register the scoped MCP server with Codex. */
  registerMcpServer?(cfg: McpServerConfig): Promise<void> | void;
}

export class CodexHostAdapter implements HostAdapter {
  private mcpConfig: McpServerConfig | undefined;
  private subscribers = new Set<(event: UiEvent) => void>();

  constructor(private readonly sinks: CodexHostSinks) {}

  async registerMcpServer(cfg: McpServerConfig): Promise<void> {
    this.mcpConfig = cfg;
    await this.sinks.registerMcpServer?.(cfg);
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
    this.sinks.renderPanel({ schemaVersion: 'codex-panel.v1', commands: renderPanelCommands(view) });
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
