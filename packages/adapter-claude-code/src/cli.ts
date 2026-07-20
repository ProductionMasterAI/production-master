#!/usr/bin/env node
/**
 * cli — the Claude Code thin-client binary. This is the entry point that the
 * customer `/investigate` (and `/login`) skills exec for Mode B (AD-7 runtime
 * clause / dev#104): the investigation runs entirely server-side and this
 * binary only authenticates, triggers, streams and renders.
 *
 * It composes the single `createPluginRuntime` composition root with the
 * `ClaudeCodeHostAdapter`, backed by terminal sinks: the compact statusline
 * paints live progress to stderr, the device-code / report URL is opened via
 * the OS browser, and mutations are preview-gated interactively (a TTY y/N
 * prompt; a safe reject when non-interactive — NEVER a blanket auto-reject).
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
 *
 * `investigate` is the default subcommand when none is given. Every connection
 * value also falls back to a PM_* env var (PM_SERVICE_URL, PM_MCP_GATEWAY_URL,
 * PM_OAUTH_CLIENT_ID / PM_CLIENT_ID, PM_ACCOUNT_ID).
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createPluginRuntime, TokenStore, InMemorySecretBackend } from '@production-master/plugin-core';
import type {
  MutationPreviewV1,
  RenderCommand,
  McpServerConfig,
  PluginRuntimeConfig,
  PluginRuntimeDeps,
  Scope,
} from '@production-master/plugin-core';
import { ClaudeCodeHostAdapter } from './host.js';
import type { ClaudeCodeHostSinks } from './host.js';

const DEFAULT_SCOPES: Scope[] = ['read-investigation', 'write-investigation', 'approve-action'];

/**
 * Terminal-backed Claude Code sinks. Everything the adapter needs is a real
 * side effect on the current terminal; nothing here logs token material.
 */
export class TerminalSinks implements ClaudeCodeHostSinks {
  constructor(
    private readonly out: NodeJS.WritableStream = process.stdout,
    private readonly err: NodeJS.WritableStream = process.stderr,
    private readonly isTty: boolean = Boolean(process.stdin.isTTY),
  ) {}

  setStatusline(text: string): void {
    // Live one-line progress; carriage-return keeps it on a single line.
    this.err.write(`\r${text}   `);
  }

  renderPanelCommands(_commands: RenderCommand[]): void {
    // The full side-panel is a GUI surface; on a terminal the compact
    // statusline already carries live state and main() prints the final
    // summary. Intentionally a no-op here.
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
    // This binary IS the MCP client (plugin-core's HttpMcpToolTransport); there
    // is no separate host IDE to register a server with. No-op — and never log
    // the endpoint or session JWT.
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

const KNOWN = new Set(['login', 'investigate', 'connect', 'update', 'logout']);

function usage(err: NodeJS.WritableStream): void {
  err.write(
    'Usage: cli <login|investigate|connect|update|logout> [args] --service <url>\n' +
      '  investigate --input <ticket>\n' +
      '  connect <investigationId>\n' +
      '  update <investigationId> <tool> [jsonArgs]\n',
  );
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
    host: new ClaudeCodeHostAdapter(new TerminalSinks()),
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
