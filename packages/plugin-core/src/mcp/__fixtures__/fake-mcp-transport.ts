/** Records MCP tool calls and returns canned responses keyed by tool name. */
import type { McpToolTransport } from '../types.js';

export class FakeMcpTransport implements McpToolTransport {
  readonly calls: Array<{ tool: string; args: Record<string, unknown>; sessionJwt: string; idempotencyKey?: string }> = [];
  private responses = new Map<string, { status: number; body: unknown }>();

  on(tool: string, status: number, body: unknown): this {
    this.responses.set(tool, { status, body });
    return this;
  }

  async call(opts: {
    endpoint: string;
    sessionJwt: string;
    tool: string;
    args: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<{ status: number; body: unknown }> {
    this.calls.push({ tool: opts.tool, args: opts.args, sessionJwt: opts.sessionJwt, idempotencyKey: opts.idempotencyKey });
    return this.responses.get(opts.tool) ?? { status: 200, body: { ok: true } };
  }
}
