#!/usr/bin/env node
/**
 * cli — the Cursor thin-client binary. Mirrors adapter-codex/cli.ts: it
 * composes the single `createPluginRuntime` composition root with the
 * `CursorHostAdapter`, backed by terminal sinks, and never runs investigation
 * logic locally — the run executes entirely server-side (AD-7 runtime clause /
 * dev#104).
 *
 * Cursor supports two distinct invocation shapes, both served by this one
 * binary:
 *
 *   1. Direct dispatch — `login | investigate | connect | update | logout`,
 *      the same request/response shape Claude Code's cli.ts uses. Useful for
 *      shelling out from a script or a Cursor "run command" tool call.
 *
 *   2. `mcp` — a persistent JSON-RPC-over-stdio MCP tool server. This is the
 *      shape `.cursor/mcp.json`'s `mcpServers.production-master` block spawns:
 *      Cursor starts `node cli.js mcp` once and keeps it alive, speaking
 *      newline-delimited JSON-RPC 2.0 (`initialize`, `tools/list`,
 *      `tools/call`) so its own agent can call the `investigation.*` tool
 *      surface directly, without shelling out per call. Every `tools/call`
 *      forwards into the SAME `runtime.update()` the direct-dispatch `update`
 *      command uses — no protocol logic is duplicated, and mutations still go
 *      through the host's confirmation sink before anything reaches the
 *      service. `login`/`investigate`/`connect` are not exposed as MCP tools:
 *      they stream a run, which does not fit the single request/response
 *      `tools/call` shape; a user still runs `cli.js login` once beforehand.
 *
 * NO LLM/provider SDK and NO local pipeline live here — those belong to the
 * internal authoring tooling only, never to this customer path.
 *
 * Usage:
 *   node cli.js login       --service <url>
 *   node cli.js investigate --service <url> --input <ticket>
 *   node cli.js connect     <investigationId> --service <url>
 *   node cli.js update      <investigationId> <tool> [jsonArgs] --service <url>
 *   node cli.js logout      --service <url>
 *   node cli.js mcp         --service <url>   # persistent stdio MCP server
 *
 * `investigate` is the default subcommand when none is given. Every connection
 * value also falls back to a PM_* env var (PM_SERVICE_URL, PM_MCP_GATEWAY_URL,
 * PM_OAUTH_CLIENT_ID / PM_CLIENT_ID, PM_ACCOUNT_ID).
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  createPluginRuntime,
  TokenStore,
  InMemorySecretBackend,
  READ_TOOLS,
  MUTATION_TOOLS,
} from '@production-master/plugin-core';
import type {
  MutationPreviewV1,
  McpServerConfig,
  PluginRuntimeConfig,
  PluginRuntimeDeps,
  Scope,
} from '@production-master/plugin-core';
import { CursorHostAdapter } from './host.js';
import type { CursorHostSinks, CursorSidePanelState } from './host.js';
import type { RenderCommand } from '@production-master/plugin-core';

const DEFAULT_SCOPES: Scope[] = ['read-investigation', 'write-investigation', 'approve-action'];

/** Flatten a `CursorSidePanelState`'s commands into plain terminal lines. */
function formatPanelBlock(commands: RenderCommand[]): string[] {
  const lines: string[] = [];
  for (const cmd of commands) {
    switch (cmd.kind) {
      case 'statusline':
        lines.push(cmd.text);
        break;
      case 'pipeline':
        for (const step of cmd.steps) lines.push(`  ${step.glyph} ${step.label}`);
        break;
      case 'log-tail':
        for (const line of cmd.lines) lines.push(`  [${line.level}] ${line.text}`);
        break;
      case 'actions':
        for (const action of cmd.actions) {
          lines.push(`  ${action.actionable ? '[ ]' : '[x]'} ${action.summary} (${action.status})`);
        }
        break;
      case 'link':
        lines.push(`  ${cmd.label}: ${cmd.url}`);
        break;
    }
  }
  return lines;
}

/**
 * Terminal-backed Cursor sinks. Everything the adapter needs is a real side
 * effect on the current terminal; nothing here logs token material.
 */
export class TerminalSinks implements CursorHostSinks {
  private lastBlockLineCount = 0;

  constructor(
    private readonly out: NodeJS.WritableStream = process.stdout,
    private readonly err: NodeJS.WritableStream = process.stderr,
    private readonly isTty: boolean = Boolean(process.stdin.isTTY),
  ) {}

  renderSidePanel(state: CursorSidePanelState): void {
    // Cursor's native surface is a webview side panel; on a raw terminal we
    // paint a refreshing block — clear the previous block (TTY only) then
    // reprint.
    const lines = formatPanelBlock(state.commands);
    if (this.isTty && this.lastBlockLineCount > 0) {
      this.err.write(`\x1b[${this.lastBlockLineCount}A\x1b[0J`);
    }
    this.err.write(lines.length > 0 ? `${lines.join('\n')}\n` : '');
    this.lastBlockLineCount = lines.length;
  }

  async confirmMutation(preview: MutationPreviewV1): Promise<'approve' | 'reject'> {
    this.err.write(`\n[mutation preview] ${preview.tool}: ${preview.summary}\n`);
    if (!this.isTty) {
      this.err.write('Non-interactive terminal — auto-rejecting the mutation.\n');
      return 'reject';
    }
    const rl = createInterface({ input: process.stdin, output: this.err });
    try {
      const answer: string = await new Promise((resolve) =>
        rl.question('Approve this action? [y/N] ', resolve),
      );
      return /^y(es)?$/i.test(answer.trim()) ? 'approve' : 'reject';
    } finally {
      rl.close();
    }
  }

  openUrl(url: string): void {
    this.err.write(`\nOpen this URL in your browser:\n  ${url}\n`);
    openInBrowser(url);
  }

  registerMcpServer(_cfg: McpServerConfig): void {
    // Cursor's MCP registration is a static declaration in .cursor/mcp.json
    // (the persistent `node cli.js mcp` subprocess) — it is not something a
    // running process hands to the host dynamically per session. This
    // per-investigation grant is consumed internally by this same process's
    // McpTools / HttpMcpToolTransport (used by the direct-dispatch `update`
    // command and by the `mcp` subcommand's tools/call handler). No-op here,
    // and never log the endpoint or session JWT.
  }
}

/** Best-effort OS browser launch; failures are non-fatal (URL already printed). */
function openInBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Opener unavailable (headless/CI) — the printed URL is the fallback.
  }
}

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string>;
}

/** Split argv into positionals and `--key value` (or boolean `--key`) flags. */
function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = 'true';
      }
    } else {
      positionals.push(tok);
    }
  }
  return { positionals, flags };
}

const KNOWN = new Set(['login', 'investigate', 'connect', 'update', 'logout', 'mcp']);

function usage(err: NodeJS.WritableStream): void {
  err.write(
    'Usage: cli <login|investigate|connect|update|logout|mcp> [args] --service <url>\n' +
      '  investigate --input <ticket>\n' +
      '  connect <investigationId>\n' +
      '  update <investigationId> <tool> [jsonArgs]\n' +
      '  mcp                          (persistent JSON-RPC/stdio MCP tool server)\n',
  );
}

/** The narrow surface the `mcp` JSON-RPC loop needs from the runtime. */
interface McpToolRuntime {
  update(investigationId: string, tool: string, args?: Record<string, unknown>): Promise<unknown>;
}

const MCP_TOOL_DEFS = [...READ_TOOLS, ...MUTATION_TOOLS].map((name) => ({
  name,
  description: `Production Master investigation tool: ${name}`,
  inputSchema: {
    type: 'object',
    properties: {
      investigationId: { type: 'string', description: 'Target investigation id.' },
    },
    required: ['investigationId'],
    additionalProperties: true,
  },
}));

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> } & Record<string, unknown>;
}

/**
 * Run the `mcp` subcommand: a newline-delimited JSON-RPC 2.0 loop over
 * stdin/stdout implementing just enough of the MCP protocol
 * (`initialize`, `tools/list`, `tools/call`) for Cursor to call the
 * `investigation.*` tool surface. Every `tools/call` is forwarded into
 * `runtime.update()` — the identical path the direct-dispatch `update`
 * command uses, so mutation gating and session scoping are never
 * reimplemented here.
 */
export async function runMcpServer(
  runtime: McpToolRuntime,
  io: { stdin: NodeJS.ReadableStream; stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream } = {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  },
): Promise<number> {
  const rl = createInterface({ input: io.stdin, crlfDelay: Infinity });
  const send = (msg: Record<string, unknown>): void => {
    io.stdout.write(`${JSON.stringify(msg)}\n`);
  };

  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;

    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(line) as JsonRpcMessage;
    } catch {
      io.stderr.write('cli mcp: dropping malformed JSON-RPC line\n');
      continue;
    }
    const { id, method, params } = msg;
    if (!method) continue; // a response frame, not a request — ignore.

    const respond = (result: unknown): void => {
      if (id !== undefined) send({ jsonrpc: '2.0', id, result });
    };
    const respondError = (code: number, message: string): void => {
      if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code, message } });
    };

    switch (method) {
      case 'initialize':
        respond({
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'production-master', version: '0.1.0' },
          capabilities: { tools: {} },
        });
        break;
      case 'notifications/initialized':
        // Notification — no response.
        break;
      case 'tools/list':
        respond({ tools: MCP_TOOL_DEFS });
        break;
      case 'tools/call': {
        const toolName = params?.name;
        const args = params?.arguments ?? {};
        const investigationId = typeof args.investigationId === 'string' ? args.investigationId : '';
        if (!toolName || !investigationId) {
          respondError(-32602, 'tools/call requires arguments.investigationId');
          break;
        }
        const { investigationId: _drop, ...rest } = args;
        try {
          const result = await runtime.update(investigationId, toolName, rest);
          respond({ content: [{ type: 'text', text: JSON.stringify(result) }], isError: false });
        } catch (err) {
          const message = (err as Error).message ?? String(err);
          respond({ content: [{ type: 'text', text: message }], isError: true });
        }
        break;
      }
      case 'shutdown':
        respond(null);
        rl.close();
        return 0;
      default:
        respondError(-32601, `method not found: ${method}`);
    }
  }
  return 0;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const { positionals, flags } = parseArgs(argv);
  // Default subcommand is `investigate`; a leading bare word selects another.
  const command = positionals[0] && KNOWN.has(positionals[0]) ? positionals.shift()! : 'investigate';

  const serviceUrl = flags.service ?? process.env.PM_SERVICE_URL;
  if (!serviceUrl) {
    process.stderr.write('cli: --service <url> (or PM_SERVICE_URL) is required.\n');
    return 2;
  }

  // Bridge the `PM_OAUTH_CLIENT_ID` env name the skills document to the
  // runtime's `clientId`; the runtime also honours PM_CLIENT_ID on its own.
  const clientId = flags.client ?? process.env.PM_OAUTH_CLIENT_ID;
  const accountId = flags.account ?? process.env.PM_ACCOUNT_ID ?? 'default';
  const config: PluginRuntimeConfig = { serviceUrl, accountId };
  if (flags.gateway) config.mcpGatewayUrl = flags.gateway;
  if (clientId) config.clientId = clientId;

  // Non-interactive auth: a pre-provisioned bearer token (`--token` or
  // PM_ACCESS_TOKEN) is seeded into the token store so headless / CI /
  // automation callers can trigger runs without the interactive device flow.
  // This is real auth against the real service (NOT a mock stand-in) and still
  // passes through the same ensureAuth gate. Never for `login`, which
  // establishes and persists its own session via the default keychain store.
  const deps: PluginRuntimeDeps = {};
  const presetToken = flags.token ?? process.env.PM_ACCESS_TOKEN;
  if (presetToken && command !== 'login') {
    const store = new TokenStore({ backend: new InMemorySecretBackend(), issuer: serviceUrl });
    await store.save(accountId, {
      accessToken: presetToken,
      refreshToken: '',
      // Far-future so ensureAuth never tries to refresh a token it cannot
      // refresh; a shorter-lived real token is rejected by the service at call
      // time instead.
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      scopes: DEFAULT_SCOPES,
    });
    deps.tokenStore = store;
  }

  const runtime = createPluginRuntime({
    host: new CursorHostAdapter(new TerminalSinks()),
    config,
    deps,
  });

  try {
    switch (command) {
      case 'login': {
        const result = await runtime.login();
        process.stdout.write(
          `\n✓ Logged in (account ${result.accountId}) — scopes ${result.scopes.join(', ')}\n`,
        );
        return 0;
      }
      case 'investigate': {
        const input = flags.input ?? '';
        if (!input) {
          process.stderr.write('cli investigate: --input <ticket> is required.\n');
          return 2;
        }
        const result = await runtime.investigate({ ticket: input });
        process.stdout.write(`\nRun ${result.investigationId} → ${result.status}\n`);
        if (result.reportUri) process.stdout.write(`Report: ${result.reportUri}\n`);
        return result.status === 'completed' ? 0 : 1;
      }
      case 'connect': {
        const id = positionals[0];
        if (!id) {
          process.stderr.write('cli connect: <investigationId> is required.\n');
          return 2;
        }
        const result = await runtime.connect(id);
        process.stdout.write(`\nRun ${result.investigationId} → ${result.status}\n`);
        if (result.reportUri) process.stdout.write(`Report: ${result.reportUri}\n`);
        return result.status === 'completed' ? 0 : 1;
      }
      case 'update': {
        const id = positionals[0];
        const tool = positionals[1];
        if (!id || !tool) {
          process.stderr.write('cli update: <investigationId> <tool> [jsonArgs] are required.\n');
          return 2;
        }
        const args = positionals[2] ? (JSON.parse(positionals[2]) as Record<string, unknown>) : {};
        const result = await runtime.update(id, tool, args);
        process.stdout.write(`\n${JSON.stringify(result)}\n`);
        return 0;
      }
      case 'logout': {
        await runtime.logout();
        process.stdout.write('\n✓ Logged out.\n');
        return 0;
      }
      case 'mcp': {
        return await runMcpServer(runtime);
      }
      default: {
        usage(process.stderr);
        return 2;
      }
    }
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    if (/not authenticated/i.test(message)) {
      process.stderr.write('\nNot authenticated — run /login first.\n');
      return 4;
    }
    process.stderr.write(`\ncli error: ${message}\n`);
    return 1;
  }
}

// Execute when run directly as a CLI.
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`cli fatal: ${(err as Error).message ?? String(err)}\n`);
      process.exit(1);
    },
  );
}
