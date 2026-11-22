import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeSseConnector } from './node-sse-connector.js';
import type { SseHandlers } from './event-stream.js';

// A real loopback HTTP server: the connector is the one piece that touches the
// network, so it is exercised against a socket rather than a fetch stub.
interface Harness {
  url: string;
  requests: IncomingHttpHeaders[];
  responses: ServerResponse[];
}

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

function serve(handle: (res: ServerResponse) => void): Promise<Harness> {
  const requests: IncomingHttpHeaders[] = [];
  const responses: ServerResponse[] = [];
  server = createServer((req, res) => {
    requests.push(req.headers);
    responses.push(res);
    handle(res);
  });
  return new Promise((resolve) => {
    server!.listen(0, '127.0.0.1', () => {
      const { port } = server!.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/v1/stream`, requests, responses });
    });
  });
}

interface Recorded {
  messages: string[];
  errors: unknown[];
  closed: number;
}

function recorder(): { handlers: SseHandlers; rec: Recorded; settled: Promise<void> } {
  const rec: Recorded = { messages: [], errors: [], closed: 0 };
  let done!: () => void;
  const settled = new Promise<void>((resolve) => (done = resolve));
  const handlers: SseHandlers = {
    onMessage: (raw) => rec.messages.push(raw),
    onError: (err) => {
      rec.errors.push(err);
      done();
    },
    onClose: () => {
      rec.closed += 1;
      done();
    },
  };
  return { handlers, rec, settled };
}

function sseHead(res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
}

describe('NodeSseConnector', () => {
  it('parses data frames, joins multi-line data, and skips frames with no data', async () => {
    const h = await serve((res) => {
      sseHead(res);
      res.write('id: 1\nevent: investigation\ndata: {"sequence":1}\n\n');
      res.write(': keep-alive comment\n\n');
      res.write('data:no-space\n\n');
      res.write('data: line one\ndata: line two\n\n');
      res.end();
    });
    const { handlers, rec, settled } = recorder();

    new NodeSseConnector().connect({ url: h.url }, handlers);
    await settled;

    expect(rec.messages).toEqual(['{"sequence":1}', 'no-space', 'line one\nline two']);
    expect(rec.errors).toEqual([]);
    expect(rec.closed).toBe(1);
  });

  it('reassembles a frame split across network chunks', async () => {
    const h = await serve((res) => {
      sseHead(res);
      res.write('data: {"seq');
      setTimeout(() => {
        res.write('uence":7}\n');
        setTimeout(() => res.end('\n'), 5);
      }, 5);
    });
    const { handlers, rec, settled } = recorder();

    new NodeSseConnector().connect({ url: h.url }, handlers);
    await settled;

    expect(rec.messages).toEqual(['{"sequence":7}']);
  });

  it('sends Accept, caller headers, and Last-Event-ID on reconnect', async () => {
    const h = await serve((res) => {
      sseHead(res);
      res.end();
    });
    const { handlers, settled } = recorder();

    new NodeSseConnector().connect(
      { url: h.url, lastEventId: 'evt-42', headers: { Authorization: 'Bearer t0k' } },
      handlers,
    );
    await settled;

    expect(h.requests[0].accept).toBe('text/event-stream');
    expect(h.requests[0].authorization).toBe('Bearer t0k');
    expect(h.requests[0]['last-event-id']).toBe('evt-42');
  });

  it('omits Last-Event-ID on a first connect', async () => {
    const h = await serve((res) => {
      sseHead(res);
      res.end();
    });
    const { handlers, settled } = recorder();

    new NodeSseConnector().connect({ url: h.url }, handlers);
    await settled;

    expect(h.requests[0]).not.toHaveProperty('last-event-id');
  });

  it('reports a non-2xx response as an error with the status, not a close', async () => {
    const h = await serve((res) => {
      res.writeHead(401);
      res.end('unauthorized');
    });
    const { handlers, rec, settled } = recorder();

    new NodeSseConnector().connect({ url: h.url }, handlers);
    await settled;

    expect(rec.closed).toBe(0);
    expect(rec.errors).toHaveLength(1);
    expect((rec.errors[0] as Error).message).toBe('SSE connect failed: 401');
  });

  it('close() aborts the stream silently: no error and no close callback', async () => {
    let opened!: () => void;
    const streamOpen = new Promise<void>((resolve) => (opened = resolve));
    const h = await serve((res) => {
      sseHead(res);
      res.write('data: first\n\n', () => opened());
      // Never ends: only the client abort can stop it.
    });
    const { handlers, rec } = recorder();

    const conn = new NodeSseConnector().connect({ url: h.url }, handlers);
    await streamOpen;
    await expect.poll(() => rec.messages).toEqual(['first']);
    conn.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(rec.errors).toEqual([]);
    expect(rec.closed).toBe(0);
    expect(h.responses).toHaveLength(1);
  });
});
