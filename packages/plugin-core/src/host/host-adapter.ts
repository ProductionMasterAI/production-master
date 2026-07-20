/**
 * The single host-neutral seam every per-IDE adapter implements.
 *
 * Per-IDE adapters (Claude Code / Codex / Cursor) provide ONLY host wiring:
 * how the IDE registers an MCP server, paints a panel/statusline, shows a
 * mutation-confirmation modal, and opens an external URL. All protocol and
 * rendering logic lives in plugin-core, never in an adapter.
 */
import type { MutationPreviewV1, PanelView, Scope } from '../types.js';

/** Configuration passed to the host to register a scoped MCP server. */
export interface McpServerConfig {
  /** Per-investigation MCP endpoint minted by the service. */
  endpoint: string;
  /** Audience the session JWT is bound to. */
  audience: string;
  /** Short-lived session JWT scoping the MCP session to investigation(s). */
  sessionJwt: string;
  /** Scopes granted to this session. */
  scopes: Scope[];
}

/** Callback invoked by the host when the user interacts with the panel. */
export type UiEvent =
  | { type: 'approve-action'; actionId: string }
  | { type: 'reject-action'; actionId: string }
  | { type: 'refresh' }
  | { type: 'open-report' };

export type UiSubscription = () => void;

/**
 * Implemented once per IDE. Methods are intentionally minimal — anything that
 * can be host-neutral belongs in plugin-core, not here.
 */
export interface HostAdapter {
  /** Register a scoped MCP server with the host IDE. */
  registerMcpServer(cfg: McpServerConfig): Promise<void>;

  /**
   * Show a mutation preview and await the user's decision. A 'reject' must
   * prevent the mutation from ever reaching the service.
   */
  showMutationPreview(preview: MutationPreviewV1): Promise<'approve' | 'reject'>;

  /** Open a URL in the user's browser (e.g. device-code verification page). */
  openExternalUrl(url: string): Promise<void>;

  /** Paint the current panel view-model. */
  renderPanel(view: PanelView): void;

  /** Subscribe to UI events; returns an unsubscribe function. */
  subscribeUi(cb: (event: UiEvent) => void): UiSubscription;
}
