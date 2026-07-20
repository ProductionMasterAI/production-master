/**
 * Unit tests for HttpMcpToolTransport and createMcpToolTransport.
 *
 * Verifies that when PM_MCP_GATEWAY_URL is set (modelled by constructing
 * HttpMcpToolTransport directly or via createMcpToolTransport with
 * transport:"http"), the transport makes HTTP POST calls to the gateway rather
 * than using stdio.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMcpToolTransport, HttpMcpToolTransport } from './http-transport.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchArgs = [string, RequestInit];

function stubFetch(status: number, body: unknown): FetchArgs[] {
  const calls: FetchArgs[] = [];
  const mockFetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    return {
      status,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', mockFetch);
  return calls;
}

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// HttpMcpToolTransport
// ---------------------------------------------------------------------------

describe('HttpMcpToolTransport', () => {
  it('POSTs to /v1/mcp/call with the correct headers and body', async () => {
    const calls = stubFetch(200, { ok: true });

    const transport = new HttpMcpToolTransport(
      'https://mcp.test',
      () => 'gw-token',
    );
    const result = await transport.call({
      endpoint: 'https://session.endpoint',
      sessionJwt: 'sess-jwt',
      tool: 'investigation.get_summary',
      args: { investigationId: 'inv_1' },
    });

    expect(result.status).toBe(200);
    expect(calls).toHaveLength(1);

    const [url, init] = calls[0];
    expect(url).toBe('https://mcp.test/v1/mcp/call');
    expect(init.method).toBe('POST');

    const hdrs = init.headers as Record<string, string>;
    expect(hdrs['Authorization']).toBe('Bearer gw-token');
    expect(hdrs['X-Mcp-Session-Jwt']).toBe('sess-jwt');
    expect(hdrs['X-Mcp-Endpoint']).toBe('https://session.endpoint');
    expect(hdrs['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['tool']).toBe('investigation.get_summary');
    expect((body['args'] as Record<string, unknown>)['investigationId']).toBe('inv_1');
  });

  it('includes Idempotency-Key when provided', async () => {
    const calls = stubFetch(200, {});

    const transport = new HttpMcpToolTransport('https://mcp.test');
    await transport.call({
      endpoint: 'https://session.endpoint',
      sessionJwt: 'sess-jwt',
      tool: 'investigation.add_evidence',
      args: { investigationId: 'inv_1', text: 'log line' },
      idempotencyKey: 'idem-abc',
    });

    const hdrs = calls[0][1].headers as Record<string, string>;
    expect(hdrs['Idempotency-Key']).toBe('idem-abc');
  });

  it('omits Authorization when no token getter is provided', async () => {
    const calls = stubFetch(200, {});

    const transport = new HttpMcpToolTransport('https://mcp.test');
    await transport.call({
      endpoint: 'https://ep',
      sessionJwt: 'jwt',
      tool: 'investigation.get_summary',
      args: {},
    });

    const hdrs = calls[0][1].headers as Record<string, string>;
    expect(hdrs['Authorization']).toBeUndefined();
  });

  it('strips trailing slash from gatewayUrl', async () => {
    const calls = stubFetch(200, {});

    const transport = new HttpMcpToolTransport('https://mcp.test/');
    await transport.call({
      endpoint: 'https://ep',
      sessionJwt: 'jwt',
      tool: 'investigation.get_summary',
      args: {},
    });

    expect(calls[0][0]).toBe('https://mcp.test/v1/mcp/call');
  });

  it('maps service non-200 back as-is', async () => {
    stubFetch(403, { message: 'forbidden' });

    const transport = new HttpMcpToolTransport('https://mcp.test', () => 'tok');
    const result = await transport.call({
      endpoint: 'https://ep',
      sessionJwt: 'jwt',
      tool: 'investigation.get_summary',
      args: {},
    });

    expect(result.status).toBe(403);
    expect((result.body as Record<string, unknown>)['message']).toBe('forbidden');
  });
});

// ---------------------------------------------------------------------------
// createMcpToolTransport — env-var-driven HTTP transport selection
// ---------------------------------------------------------------------------

describe('createMcpToolTransport', () => {
  it('returns HttpMcpToolTransport when transport is "http"', () => {
    const transport = createMcpToolTransport({
      transport: 'http',
      gatewayUrl: 'https://mcp.production-master.ai',
    });
    expect(transport).toBeInstanceOf(HttpMcpToolTransport);
  });

  it('throws when transport is "http" but no gatewayUrl provided', () => {
    expect(() => createMcpToolTransport({ transport: 'http' })).toThrow(
      'gatewayUrl',
    );
  });

  it('throws for "stdio" because stdio is host-adapter responsibility', () => {
    expect(() => createMcpToolTransport({ transport: 'stdio' })).toThrow();
  });
});
