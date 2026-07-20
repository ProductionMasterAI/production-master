import { describe, it, expect, vi, afterEach } from 'vitest';
import { NodeHttpTransport } from './node-transport.js';

afterEach(() => vi.unstubAllGlobals());

describe('NodeHttpTransport', () => {
  it('builds URL + query and parses JSON body', async () => {
    const fetchMock = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toBe('https://svc.example/v1/runs?limit=2');
      expect(init.method).toBe('GET');
      return new Response(JSON.stringify({ runs: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const t = new NodeHttpTransport('https://svc.example');
    const res = await t.request({ method: 'GET', path: '/v1/runs', query: { limit: 2, status: undefined } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ runs: [] });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('serializes a JSON body with content-type and forwards headers', async () => {
    const fetchMock = vi.fn(async (_url: any, init: any) => {
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.headers['Idempotency-Key']).toBe('k1');
      expect(JSON.parse(init.body)).toEqual({ ticket: 'INC-1' });
      return new Response(JSON.stringify({ investigationId: 'inv_1' }), { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const t = new NodeHttpTransport('https://svc.example');
    const res = await t.request({
      method: 'POST',
      path: '/v1/runs',
      body: { ticket: 'INC-1' },
      headers: { 'Idempotency-Key': 'k1' },
    });
    expect(res.status).toBe(201);
  });

  it('wraps a non-JSON body as { message }', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('plain error', { status: 500 })));
    const t = new NodeHttpTransport('https://svc.example');
    const res = await t.request({ method: 'GET', path: '/x' });
    expect(res.body).toEqual({ message: 'plain error' });
  });
});
