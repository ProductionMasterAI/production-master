import { describe, it, expect, afterEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { MutationPreviewV1 } from '@production-master/plugin-core';

// Never launch a real browser from the openUrl sink during tests. Partial mock:
// keep every real export (keychain uses execFile) and only stub spawn.
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn(() => ({ on: () => undefined, unref: () => undefined })),
}));

import { main, TerminalSinks, runMcpServer } from './cli.js';

/** A capturing writable double good enough for the sinks' `.write()` calls. */
function capture(): { sink: NodeJS.WritableStream; text: () => string } {
  const chunks: string[] = [];
  const sink = {
    write(chunk: string | Uint8Array): boolean {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    },
  } as unknown as NodeJS.WritableStream;
  return { sink, text: () => chunks.join('') };
}

const ORIGINAL_ACCOUNT = process.env.PM_ACCOUNT_ID;

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_ACCOUNT === undefined) delete process.env.PM_ACCOUNT_ID;
  else process.env.PM_ACCOUNT_ID = ORIGINAL_ACCOUNT;
});

describe('cli argument + exit-code contract', () => {
  it('errors without a service url', async () => {
    const code = await main(['investigate', '--input', 'INC-1']);
    expect(code).toBe(2);
  });

  it('errors when investigate is missing --input', async () => {
    const code = await main(['investigate', '--service', 'https://svc.example']);
    expect(code).toBe(2);
  });

  it('errors on an unknown-but-flagged command shape (no input, defaults to investigate)', async () => {
    // A bare word that is not a known subcommand is treated as a positional and
    // the command defaults to `investigate`, which then requires --input.
    const code = await main(['--service', 'https://svc.example']);
    expect(code).toBe(2);
  });

  it('errors when connect is missing the investigation id', async () => {
    const code = await main(['connect', '--service', 'https://svc.example']);
    expect(code).toBe(2);
  });

  it('errors when update is missing tool', async () => {
    const code = await main(['update', 'inv_1', '--service', 'https://svc.example']);
    expect(code).toBe(2);
  });

  it('returns the not-authenticated code (4) when investigating without a stored session', async () => {
    // Point at a keychain slot that cannot hold a prior session, so ensureAuth
    // always misses and the runtime reports "not authenticated" before any I/O.
    process.env.PM_ACCOUNT_ID = `test-noauth-${Math.random().toString(36).slice(2)}`;
    const code = await main(['investigate', '--service', 'https://svc.example', '--input', 'INC-1']);
    expect(code).toBe(4);
  });
});

describe('TerminalSinks', () => {
  const preview: MutationPreviewV1 = {
    tool: 'investigation.add_evidence',
    summary: 'attach log bundle',
  } as MutationPreviewV1;

  it('paints the side-panel block on the err stream', () => {
    const out = capture();
    const err = capture();
    const sinks = new TerminalSinks(out.sink, err.sink, false);
    sinks.renderSidePanel({
      schemaVersion: 'cursor-side-panel.v1',
      commands: [{ kind: 'statusline', status: 'running', text: 'PM running · 3 steps' }],
    });
    expect(err.text()).toContain('PM running · 3 steps');
    expect(out.text()).toBe('');
  });

  it('auto-rejects a mutation when the terminal is non-interactive', async () => {
    const out = capture();
    const err = capture();
    const sinks = new TerminalSinks(out.sink, err.sink, false);
    const decision = await sinks.confirmMutation(preview);
    expect(decision).toBe('reject');
    expect(err.text()).toContain('investigation.add_evidence');
    expect(err.text()).toContain('auto-rejecting');
  });

  it('prints the verification/report URL for the user to open', () => {
    const out = capture();
    const err = capture();
    const sinks = new TerminalSinks(out.sink, err.sink, false);
    sinks.openUrl('https://device.example/verify?code=ABCD-1234');
    expect(err.text()).toContain('https://device.example/verify?code=ABCD-1234');
  });

  it('registerMcpServer never leaks the session JWT (no-op, static .cursor/mcp.json registration)', () => {
    const out = capture();
    const err = capture();
    const sinks = new TerminalSinks(out.sink, err.sink, false);
    sinks.registerMcpServer({
      endpoint: 'mcp://fixture/inv_demo',
      audience: 'pm-mcp',
      sessionJwt: 'super-secret-jwt',
      scopes: ['read-investigation'],
    });
    expect(out.text()).toBe('');
    expect(err.text()).toBe('');
  });
});

describe('mcp subcommand (JSON-RPC/stdio loop)', () => {
  function run(lines: string[]): {
    resultPromise: Promise<number>;
    out: { sink: NodeJS.WritableStream; text: () => string };
    err: { sink: NodeJS.WritableStream; text: () => string };
    update: ReturnType<typeof vi.fn>;
  } {
    const out = capture();
    const err = capture();
    const update = vi.fn(async () => ({ ok: true }));
    const stdin = Readable.from([`${lines.join('\n')}\n`]);
    const resultPromise = runMcpServer(
      { update },
      { stdin, stdout: out.sink, stderr: err.sink },
    );
    return { resultPromise, out, err, update };
  }

  it('answers the initialize handshake', async () => {
    const { resultPromise, out } = run([JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })]);
    await resultPromise;
    const responses = out.text().trim().split('\n').map((l) => JSON.parse(l));
    expect(responses).toHaveLength(1);
    expect(responses[0].result.serverInfo.name).toBe('production-master');
  });

  it('lists the investigation.* tool surface', async () => {
    const { resultPromise, out } = run([JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })]);
    await resultPromise;
    const [response] = out.text().trim().split('\n').map((l) => JSON.parse(l));
    const names = response.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('investigation.get_summary');
    expect(names).toContain('investigation.add_evidence');
  });

  it('forwards tools/call into runtime.update and wraps the result', async () => {
    const { resultPromise, out, update } = run([
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'investigation.get_summary', arguments: { investigationId: 'inv_1' } },
      }),
    ]);
    await resultPromise;
    expect(update).toHaveBeenCalledWith('inv_1', 'investigation.get_summary', {});
    const [response] = out.text().trim().split('\n').map((l) => JSON.parse(l));
    expect(response.result.isError).toBe(false);
    expect(JSON.parse(response.result.content[0].text)).toEqual({ ok: true });
  });

  it('reports a tool error without crashing the loop', async () => {
    const out = capture();
    const err = capture();
    const update = vi.fn(async () => {
      throw new Error('not authenticated');
    });
    const stdin = Readable.from([
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'investigation.get_summary', arguments: { investigationId: 'inv_1' } },
      })}\n`,
    ]);
    const code = await runMcpServer({ update }, { stdin, stdout: out.sink, stderr: err.sink });
    expect(code).toBe(0);
    const [response] = out.text().trim().split('\n').map((l) => JSON.parse(l));
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toContain('not authenticated');
  });

  it('rejects an unknown method', async () => {
    const { resultPromise, out } = run([JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'not/a/method' })]);
    await resultPromise;
    const [response] = out.text().trim().split('\n').map((l) => JSON.parse(l));
    expect(response.error.code).toBe(-32601);
  });

  it('drops a malformed JSON-RPC line without crashing', async () => {
    const out = capture();
    const err = capture();
    const update = vi.fn();
    const stdin = Readable.from(['not json\n']);
    const code = await runMcpServer({ update }, { stdin, stdout: out.sink, stderr: err.sink });
    expect(code).toBe(0);
    expect(out.text()).toBe('');
    expect(err.text()).toContain('malformed');
  });
});
