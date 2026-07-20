/**
 * CursorHostAdapter — the Cursor wiring of the host-neutral `HostAdapter` seam
 * (V4-MVP issue #28 / Phase 5).
 *
 * Cursor registers a scoped MCP server and renders an investigation **side
 * panel** (a webview/tree). The adapter projects the PanelView into the shared
 * host-neutral `RenderCommand[]` and hands Cursor a serialized
 * `CursorSidePanelState` to paint, plus a mutation-confirmation modal. All
 * protocol + rendering logic stays in @production-master/plugin-core — this is
 * host wiring only. NO LLM/provider SDK, no local pipeline.
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

/** The serialized side-panel payload the Cursor webview renders. */
export interface CursorSidePanelState {
  schemaVersion: 'cursor-side-panel.v1';
  commands: RenderCommand[];
}

/** Concrete Cursor surfaces the adapter drives. All injectable for testing. */
export interface CursorHostSinks {
  /** Render the Cursor side panel from serialized state. */
  renderSidePanel(state: CursorSidePanelState): void;
  /** Show the mutation-confirmation modal; resolve to the decision. */
  confirmMutation(preview: MutationPreviewV1): Promise<'approve' | 'reject'>;
  /** Open a URL in the user's browser. */
  openUrl(url: string): Promise<void> | void;
  /** Register the scoped MCP server with Cursor (required surface for Cursor). */
  registerMcpServer(cfg: McpServerConfig): Promise<void> | void;
}

export class CursorHostAdapter implements HostAdapter {
  private mcpConfig: McpServerConfig | undefined;
  private subscribers = new Set<(event: UiEvent) => void>();

  constructor(private readonly sinks: CursorHostSinks) {}

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
    this.sinks.renderSidePanel({ schemaVersion: 'cursor-side-panel.v1', commands: renderPanelCommands(view) });
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
