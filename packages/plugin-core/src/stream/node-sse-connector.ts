/**
 * A Node SSE connector backed by global fetch (Node 18+). Streams an
 * text/event-stream response, parsing `data:` lines into frames. Sends
 * Last-Event-ID on reconnect. Kept dependency-free and host-neutral.
 *
 * This is the one place that touches the network for streaming. It contains no
 * LLM/provider SDK — it is a plain SSE reader.
 */
import type { SseConnection, SseConnector, SseHandlers } from './event-stream.js';

export class NodeSseConnector implements SseConnector {
  connect(
    opts: { url: string; lastEventId?: string; headers?: Record<string, string> },
    handlers: SseHandlers,
  ): SseConnection {
    const controller = new AbortController();
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      ...(opts.headers ?? {}),
    };
    if (opts.lastEventId) headers['Last-Event-ID'] = opts.lastEventId;

    (async () => {
      try {
        const res = await fetch(opts.url, { headers, signal: controller.signal });
        if (!res.ok || !res.body) {
          handlers.onError(new Error(`SSE connect failed: ${res.status}`));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE frames are separated by a blank line.
          let sep: number;
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const dataLines = frame
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trimStart());
            if (dataLines.length > 0) handlers.onMessage(dataLines.join('\n'));
          }
        }
        handlers.onClose();
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        handlers.onError(err);
      }
    })();

    return { close: () => controller.abort() };
  }
}
