/**
 * `pmctl login` — RFC-8628 device-code flow via plugin-core's DeviceCodeAuth.
 *
 * Headless-friendly: prints the verification URL + user code to stderr so the
 * operator can authorize from any browser, then polls to completion and stores
 * a scoped token via the TokenStore (keychain seam; in-memory fallback).
 *
 * Tokens are NEVER written to stdout/stderr — only the account id, scopes, and
 * expiry are reported.
 */
import type { Deps } from "../deps.js";
import type { ParsedArgs } from "../args.js";
import { EXIT } from "../exit-codes.js";
import { emitSuccess, kvTable, kvMarkdown } from "../output.js";

interface LoginResult {
  account: string;
  scopes: string[];
  expiresAt: string;
}

export async function loginCommand(
  deps: Deps,
  _parsed: ParsedArgs,
): Promise<number> {
  const start = await deps.deviceAuth.start();
  deps.writeErr(`To authenticate, open: ${start.verificationUriComplete}\n`);
  deps.writeErr(`Verification URL: ${start.verificationUri}\n`);
  deps.writeErr(`User code:        ${start.userCode}\n`);
  deps.writeErr("Waiting for authorization...\n");

  const tokens = await deps.deviceAuth.waitForTokens();
  await deps.tokenStore.save(deps.accountId, tokens);

  const result: LoginResult = {
    account: deps.accountId,
    scopes: tokens.scopes,
    expiresAt: new Date(tokens.expiresAt).toISOString(),
  };
  emitSuccess(deps, result, {
    table: (d) =>
      kvTable([
        ["account", d.account],
        ["scopes", d.scopes.join(", ")],
        ["expiresAt", d.expiresAt],
      ]),
    md: (d) =>
      kvMarkdown("Login", [
        ["account", d.account],
        ["scopes", d.scopes.join(", ")],
        ["expiresAt", d.expiresAt],
      ]),
  });
  return EXIT.OK;
}
