/**
 * A capturing HostAdapter test double. Records every call so unit and
 * conformance tests can assert identical projection + audit sequences across
 * adapters. `mutationDecision` controls the approve/reject response.
 */
import type {
  HostAdapter,
  McpServerConfig,
  UiEvent,
  UiSubscription,
} from '../host-adapter.js';
import type { MutationPreviewV1, PanelView } from '../../types.js';

export interface CapturedCall {
  method: keyof HostAdapter;
  arg?: unknown;
}

export class NoopHostAdapter implements HostAdapter {
  readonly calls: CapturedCall[] = [];
  readonly renderedViews: PanelView[] = [];
  readonly mutationPreviews: MutationPreviewV1[] = [];
  private subscribers: Array<(event: UiEvent) => void> = [];

  constructor(private mutationDecision: 'approve' | 'reject' = 'approve') {}

  async registerMcpServer(cfg: McpServerConfig): Promise<void> {
    this.calls.push({ method: 'registerMcpServer', arg: cfg });
  }

  async showMutationPreview(preview: MutationPreviewV1): Promise<'approve' | 'reject'> {
    this.calls.push({ method: 'showMutationPreview', arg: preview });
    this.mutationPreviews.push(preview);
    return this.mutationDecision;
  }

  async openExternalUrl(url: string): Promise<void> {
    this.calls.push({ method: 'openExternalUrl', arg: url });
  }

  renderPanel(view: PanelView): void {
    this.calls.push({ method: 'renderPanel', arg: view });
    this.renderedViews.push(view);
  }

  subscribeUi(cb: (event: UiEvent) => void): UiSubscription {
    this.calls.push({ method: 'subscribeUi' });
    this.subscribers.push(cb);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  /** Test helper: simulate the host emitting a UI event. */
  emitUi(event: UiEvent): void {
    for (const s of this.subscribers) s(event);
  }

  /** Test helper: control the mutation decision returned next. */
  setMutationDecision(decision: 'approve' | 'reject'): void {
    this.mutationDecision = decision;
  }
}
