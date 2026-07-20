/**
 * Deterministic in-memory HttpTransport for ServiceClient contract tests.
 * Routes are matched by `METHOD path` (path without query). Each route returns
 * a canned HttpResponse and records the request it received (headers included)
 * so tests can assert Idempotency-Key + Authorization behavior.
 */
import type { HttpRequest, HttpResponse, HttpTransport } from '../types.js';

export type RouteHandler = (req: HttpRequest) => HttpResponse;

export class FakeTransport implements HttpTransport {
  readonly received: HttpRequest[] = [];
  private routes = new Map<string, RouteHandler>();

  on(method: HttpRequest['method'], path: string, handler: RouteHandler): this {
    this.routes.set(`${method} ${path}`, handler);
    return this;
  }

  async request(opts: HttpRequest): Promise<HttpResponse> {
    this.received.push(opts);
    const key = `${opts.method} ${opts.path}`;
    const handler = this.routes.get(key);
    if (!handler) {
      return { status: 404, body: { message: `no route: ${key}` } };
    }
    return handler(opts);
  }
}
