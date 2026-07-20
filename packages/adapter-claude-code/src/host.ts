/**
 * ClaudeCodeHostAdapter — the Claude Code wiring of the host-neutral
 * `HostAdapter` seam (V4-MVP issue #26 / Phase 5).
 *
 * Responsibilities (host wiring ONLY — all protocol/rendering lives in
 * @production-master/plugin-core):
 *   - registerMcpServer: hand the scoped MCP session config to Claude Code.
 *   - renderPanel: project the PanelView into host-neutral RenderCommands and
 *     paint them onto the Claude Code statusline (compact) + side-panel (full).
 *   - showMutationPreview: surface a mutation-confirmation modal and return the
 *     user's approve/reject decision; a reject NEVER reaches the service.
 *   - openExternalUrl: open the device-code verification / report URL.
 *   - subscribeUi: relay panel UI events (approve/reject/refresh/open-report).
 *
 * Every side effect is injected via `ClaudeCodeHostSinks` so the adapter is
 * unit- and conformance-testable headlessly (the production wiring passes real
 * Claude Code statusline/panel/modal callbacks). NO LLM/provider SDK.
 */
import {
  renderPanelCommands,
  statuslineText,
  type HostAdapter,
  type McpServerConfig,
  type MutationPreviewV1,
  type PanelView,
  type RenderCommand,
  type UiEvent,
  type UiSubscription,
} from '@production-master/plugin-core';

/** The concrete Claude Code surfaces the adapter drives. All injectable. */
export interface ClaudeCodeHostSinks {
  /** Paint the compact one-line statusline (Claude Code subagentStatusLine). */
  setStatusline(text: string): void;
  /** Paint the full side-panel from the host-neutral command list. */
  renderPanelCommands(commands: RenderCommand[]): void;
  /** Show the mutation-confirmation modal; resolve to the user's decision. */
  confirmMutation(preview: MutationPreviewV1): Promise<'approve' | 'reject'>;
  /** Open a URL in the user's browser. */
  openUrl(url: string): Promise<void> | void;
  /** Register the scoped MCP server with Claude Code. */
  registerMcpServer?(cfg: McpServerConfig): Promise<void> | void;
}

export class ClaudeCodeHostAdapter implements HostAdapter {
  /** The most recent MCP server config registered (for diagnostics/tests). */
  private mcpConfig: McpServerConfig | undefined;
  private subscribers = new Set<(event: UiEvent) => void>();

  constructor(private readonly sinks: ClaudeCodeHostSinks) {}

  async registerMcpServer(cfg: McpServerConfig): Promise<void> {
    this.mcpConfig = cfg;
    await this.sinks.registerMcpServer?.(cfg);
  }

  /** Exposed for tests/diagnostics; never logs the sessionJwt. */
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
    // Compact statusline (single line) + full side-panel (command list).
    this.sinks.setStatusline(statuslineText(view));
    this.sinks.renderPanelCommands(renderPanelCommands(view));
  }

  subscribeUi(cb: (event: UiEvent) => void): UiSubscription {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /**
   * Called by the host wiring when the user interacts with the panel
   * (approve/reject an action, refresh, open the report). Fans the event out to
   * every plugin-core subscriber.
   */
  emitUi(event: UiEvent): void {
    for (const cb of this.subscribers) cb(event);
  }
}
