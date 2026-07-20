/**
 * A Node HttpTransport backed by global fetch (Node 18+). Builds query strings,
 * sets JSON content-type for bodies, and returns parsed JSON bodies. No
 * LLM/provider SDK — a plain REST transport.
 */
import type { HttpRequest, HttpResponse, HttpTransport } from './types.js';

export class NodeHttpTransport implements HttpTransport {
  constructor(private readonly baseUrl: string) {}

  async request(opts: HttpRequest): Promise<HttpResponse> {
    const url = new URL(opts.path, this.baseUrl);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, { method: opts.method, headers, body });
    let parsed: unknown = undefined;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { message: text };
      }
    }
    return { status: res.status, body: parsed };
  }
}
