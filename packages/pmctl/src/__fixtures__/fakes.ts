/**
 * Local test doubles for pmctl unit tests.
 *
 * plugin-core does NOT export its `__fixtures__` (only `.` and `./testing`), so
 * pmctl ships its own minimal FakeTransport (route map) and FixtureConnector
 * (SSE replayer with mid-stream drop + Last-Event-ID resume). These live under
 * a tsconfig-excluded path so they never land in `dist/`. NO network is used.
 */
import type {
  HttpTransport,
  HttpRequest,
  HttpResponse,
  SseConnector,
  SseConnection,
  SseHandlers,
  InvestigationEventEnvelope,
} from "@production-master/plugin-core";

type PathMatcher = string | RegExp;
type Handler = (req: HttpRequest) => HttpResponse;

interface Route {
  method: HttpRequest["method"];
  match: PathMatcher;
  handler: Handler;
}

/** A route-map HttpTransport. Unrouted requests resolve to 404. */
export class FakeTransport implements HttpTransport {
  private routes: Route[] = [];
  readonly received: HttpRequest[] = [];

  on(
    method: HttpRequest["method"],
    match: PathMatcher,
    handler: Handler,
  ): this {
    this.routes.push({ method, match, handler });
    return this;
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    this.received.push(req);
    for (const r of this.routes) {
      if (r.method !== req.method) continue;
      const hit =
        typeof r.match === "string"
          ? r.match === req.path
          : r.match.test(req.path);
      if (hit) return r.handler(req);
    }
    return {
      status: 404,
      body: { message: `no route for ${req.method} ${req.path}` },
    };
  }
}

export interface FixtureConnectorOptions {
  /**
   * On the FIRST connect, deliver this many frames (counted from the start
   * cursor) then fire onClose to force a Last-Event-ID reconnect.
   */
  dropAfter?: number;
}

/** Replays recorded SSE frames; supports a mid-stream drop + resume. */
export class FixtureConnector implements SseConnector {
  readonly connectCalls: Array<{ url: string; lastEventId?: string }> = [];
  private connectCount = 0;
  private readonly frames: InvestigationEventEnvelope[];
  private readonly dropAfter?: number;

  constructor(
    frames: InvestigationEventEnvelope[],
    opts: FixtureConnectorOptions = {},
  ) {
    this.frames = frames;
    this.dropAfter = opts.dropAfter;
  }

  connect(
    opts: {
      url: string;
      lastEventId?: string;
      headers?: Record<string, string>;
    },
    handlers: SseHandlers,
  ): SseConnection {
    this.connectCalls.push({ url: opts.url, lastEventId: opts.lastEventId });
    this.connectCount += 1;
    const isFirst = this.connectCount === 1;

    const startIdx = opts.lastEventId
      ? this.frames.findIndex((f) => f.eventId === opts.lastEventId) + 1
      : 0;

    let closed = false;
    let delivered = 0;
    for (let i = startIdx; i < this.frames.length; i++) {
      if (closed) break;
      if (
        isFirst &&
        this.dropAfter !== undefined &&
        delivered >= this.dropAfter
      ) {
        handlers.onClose();
        return {
          close: () => {
            closed = true;
          },
        };
      }
      handlers.onMessage(JSON.stringify(this.frames[i]));
      delivered += 1;
    }
    return {
      close: () => {
        closed = true;
      },
    };
  }
}

/** Build a minimal valid event envelope. */
export function evt(
  sequence: number,
  type: string,
  investigationId = "inv_1",
): InvestigationEventEnvelope {
  return {
    eventId: `evt_${sequence}`,
    investigationId,
    type,
    timestamp: `2026-06-30T00:00:0${sequence % 10}.000Z`,
    sequence,
    schemaVersion: "1",
  };
}
