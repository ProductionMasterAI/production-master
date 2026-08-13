#!/usr/bin/env node
/**
 * pmctl — operator CLI for Production Master.
 *
 * A thin surface over the SAME BFF as every IDE surface. It reuses
 * @production-master/plugin-core for ALL transport, auth, and streaming
 * (ServiceClient, DeviceCodeAuth, TokenStore, EventStream + NodeSseConnector).
 * It implements NO HTTP, auth, or SSE of its own, and imports NO LLM SDK.
 *
 * Entry flow: parse argv → resolve verb → build Deps (real Node transports) →
 * dispatch → map any error to a stable exit code + envelope.
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ServiceClient,
  NodeHttpTransport,
  NodeSseConnector,
  DeviceCodeAuth,
  createTokenStore,
  type Scope,
} from "@production-master/plugin-core";
import { parseArgs, strFlag, boolFlag, type ParsedArgs } from "./args.js";
import {
  isOutputFormat,
  type OutputFormat,
  emitError,
  type OutputSink,
} from "./output.js";
import {
  EXIT,
  UsageError,
  AuthError,
  classifyError,
  type ExitCode,
} from "./exit-codes.js";
import type { Deps } from "./deps.js";
import { loginCommand } from "./commands/login.js";
import { startCommand } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";
import { reportCommand } from "./commands/report.js";
import { eventsCommand } from "./commands/events.js";
import { approveCommand } from "./commands/approve.js";
import { rejectCommand } from "./commands/reject.js";

/** Injectable process I/O so the whole CLI is testable without real stdio. */
export interface Io {
  write: (s: string) => void;
  writeErr: (s: string) => void;
  env: Record<string, string | undefined>;
}

type Command = (deps: Deps, parsed: ParsedArgs) => Promise<number>;

const COMMANDS: Record<string, Command> = {
  login: loginCommand,
  start: startCommand,
  status: statusCommand,
  report: reportCommand,
  events: eventsCommand,
  approve: approveCommand,
  reject: rejectCommand,
};

const SCOPES: Scope[] = [
  "read-investigation",
  "write-investigation",
  "approve-action",
];

const USAGE = `pmctl — operator CLI for Production Master

Usage: pmctl <command> [args] [flags]

Commands:
  login                       Authenticate via device-code flow; store a scoped token
  start <ticket>              Create a run (POST /v1/runs).
                              Flags: --title, --mode {standard|deep},
                                     --max-usd <n>, --max-iterations <n>, --idempotency-key
  status <id>                 Show a run (GET /v1/runs/:id)
  report <id>                 Print the rendered report. Flag: --format {md|json|html}
  events <id> [--follow]      Stream investigation events. Flag: --since-seq <n>
  approve <id> <action>       Approve a proposed action (propose/approve only).
                              Q9 capability token — mint a session-scoped trust
                              grant that auto-approves later actions of the same
                              risk × reversibility class for this investigation
                              until it expires (revoke from web Settings):
                              Flags: --grant
                                     --risk {read_only|low|high|irreversible}
                                     --reversibility {reversible|compensable|irreversible}
                                     --ttl-minutes <1..1440>  (expiry)
                                     --session-label <text>
  reject <id> <action>        Reject a proposed action. Flag: --reason <text>

Global flags:
  --output {json|table|md}    Output format (default: table). json emits a versioned
                              envelope: {schema:"pmctl/v1", ok, data?, error?}
  --service <url>             BFF base URL (or PM_SERVICE_URL)
  --token <jwt>               Bearer token override (or PM_ACCESS_TOKEN); else token store
  --idempotency-key <key>     Stable key for mutating verbs (start/approve/reject)
  -h, --help                  Show this help

Exit codes: 0 ok · 2 usage · 3 auth · 4 budget_exhausted · 5 permission_denied · 6 idempotency_conflict`;

function resolveOutput(parsed: ParsedArgs): OutputFormat {
  const raw = strFlag(parsed, "output");
  if (raw === undefined) return "table";
  if (!isOutputFormat(raw)) {
    throw new UsageError(
      `--output must be one of json, table, md (got "${raw}")`,
    );
  }
  return raw;
}

async function buildDeps(
  parsed: ParsedArgs,
  io: Io,
  output: OutputFormat,
): Promise<Deps> {
  const service = strFlag(parsed, "service") ?? io.env.PM_SERVICE_URL;
  if (!service) {
    throw new UsageError("--service <url> (or PM_SERVICE_URL) is required");
  }
  const accountId = io.env.PM_ACCOUNT_ID ?? "default";
  const clientId = io.env.PM_CLIENT_ID ?? "pmctl";
  const tokenStore = createTokenStore();
  const transport = new NodeHttpTransport(service);
  const deviceAuth = new DeviceCodeAuth({
    transport,
    clientId,
    scopes: SCOPES,
  });

  // Token precedence: explicit flag > env > token store. A flag/env override
  // is used as given (the caller owns its lifetime); a stored session is
  // refreshed proactively when within its skew of expiry, mirroring
  // PluginRuntime#ensureAuth, so a long-lived pmctl session doesn't start
  // failing with exit 3 the moment the access token ages out even though a
  // valid refresh token is sitting right next to it in the store.
  let token = strFlag(parsed, "token") ?? io.env.PM_ACCESS_TOKEN;
  if (!token) {
    let stored = await tokenStore.load(accountId).catch(() => undefined);
    if (stored && deviceAuth.needsRefresh(stored)) {
      try {
        stored = await deviceAuth.refresh(stored.refreshToken);
        await tokenStore.save(accountId, stored);
      } catch {
        // Refresh token itself expired/revoked, or the service is
        // unreachable — fall through with the stale access token. The
        // service will 401 it and classifyError maps that to AuthError,
        // which tells the user to `pmctl login` again rather than failing
        // silently here.
      }
    }
    token = stored?.accessToken;
  }

  const idempotencyKey = strFlag(parsed, "idempotency-key");
  const client = new ServiceClient({
    transport,
    getAuthToken: () => token,
    ...(idempotencyKey ? { newIdempotencyKey: () => idempotencyKey } : {}),
  });

  const streamHeaders = (): Record<string, string> =>
    token ? { Authorization: `Bearer ${token}` } : {};

  return {
    client,
    output,
    write: io.write,
    writeErr: io.writeErr,
    connector: new NodeSseConnector(),
    streamUrlFor: (id) =>
      new URL(`/v1/runs/${encodeURIComponent(id)}/stream`, service).toString(),
    streamHeaders,
    deviceAuth,
    tokenStore,
    accountId,
  };
}

/** Run the CLI. Returns the process exit code. Never throws. */
export async function runCli(argv: string[], io: Io): Promise<number> {
  const parsed = parseArgs(argv);
  const verb = parsed._[0];
  const wantsHelp = boolFlag(parsed, "help", "h");

  if (!verb || (wantsHelp && !COMMANDS[verb])) {
    io.write(`${USAGE}\n`);
    return verb && !COMMANDS[verb] ? EXIT.USAGE : EXIT.OK;
  }

  const command = COMMANDS[verb];
  if (!command) {
    io.writeErr(`Unknown command: ${verb}\n\n${USAGE}\n`);
    return EXIT.USAGE;
  }
  if (wantsHelp) {
    io.write(`${USAGE}\n`);
    return EXIT.OK;
  }

  // Strip the verb so positional indexing inside commands starts at the operand.
  const verbArgs: ParsedArgs = { _: parsed._.slice(1), flags: parsed.flags };

  let output: OutputFormat = "table";
  const sink = (): OutputSink => ({
    output,
    write: io.write,
    writeErr: io.writeErr,
  });
  try {
    output = resolveOutput(parsed);
    const deps = await buildDeps(verbArgs, io, output);
    return await command(deps, verbArgs);
  } catch (err) {
    const { code, message, exit } = classifyError(err);
    emitError(sink(), code, message);
    return exit;
  }
}

/* c8 ignore start — process wiring, exercised via the bin not unit tests. */
// Compare filesystem paths, not URL strings: when invoked through an npm bin
// symlink (npm link / npm install -g / a workspace dependency's
// node_modules/.bin — i.e. every real install of this CLI), Node resolves
// import.meta.url to the symlink's target while process.argv[1] stays the
// symlink path, so a naive `file://${...}` string comparison mismatches and
// the CLI silently exits 0 with no output. Comparing realpathSync'd
// filesystem paths (via fileURLToPath, not a hand-built file:// string) also
// avoids Windows path-shape and escaping mismatches (`C:\...` vs
// `file:///C:/...`, spaces/percent-encoding) that a literal `file://` prefix
// would still get wrong even after resolving the symlink.
function resolveRealPath(p: string): string | undefined {
  try {
    return realpathSync(p);
  } catch {
    return undefined;
  }
}
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  resolveRealPath(fileURLToPath(import.meta.url)) ===
    resolveRealPath(process.argv[1]);

if (isMain) {
  const io: Io = {
    write: (s) => process.stdout.write(s),
    writeErr: (s) => process.stderr.write(s),
    env: process.env,
  };
  runCli(process.argv.slice(2), io).then(
    (code: ExitCode | number) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(
        `pmctl: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(EXIT.GENERIC);
    },
  );
}
/* c8 ignore stop */

// Re-export AuthError so adapters/tests can throw it through the same mapping.
export { AuthError };
