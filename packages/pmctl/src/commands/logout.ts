/**
 * `pmctl logout` — revoke the stored login server-side (`POST /v1/oauth/revoke`,
 * RFC 7009) and wipe it from the token store. The local wipe happens even when
 * the revoke fails (network down, service error): no orphaned secret survives,
 * and the failure is reported on stderr. Runs under the same refresh lock as
 * every refresh, so it revokes the CURRENT refresh token even when another
 * process (the IDE plugin) just rotated it.
 *
 * Tokens are never printed — only whether the server-side revoke went through.
 */
import type { Deps } from "../deps.js";
import type { ParsedArgs } from "../args.js";
import { EXIT } from "../exit-codes.js";
import { emitSuccess, kvTable, kvMarkdown } from "../output.js";

interface LogoutResult {
  account: string;
  revoked: boolean;
}

export async function logoutCommand(deps: Deps, _parsed: ParsedArgs): Promise<number> {
  const outcome = await deps.refresher.logout();
  if (outcome.error !== undefined) {
    const why = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
    deps.writeErr(
      `Server-side revoke failed (${why}); the local session was wiped anyway and the login expires on its own.\n`,
    );
  }
  const result: LogoutResult = { account: deps.accountId, revoked: outcome.revoked };
  emitSuccess(deps, result, {
    table: (d) =>
      kvTable([
        ["account", d.account],
        ["revoked", String(d.revoked)],
      ]),
    md: (d) =>
      kvMarkdown("Logout", [
        ["account", d.account],
        ["revoked", String(d.revoked)],
      ]),
  });
  return EXIT.OK;
}
