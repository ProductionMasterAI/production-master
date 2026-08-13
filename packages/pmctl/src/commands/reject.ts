/**
 * `pmctl reject <id> <action> [--reason <text>]` — reject a proposed action.
 *
 * Like approve, this never executes a side effect — it records the rejection
 * via `ServiceClient.rejectAction`. The Idempotency-Key (from
 * `--idempotency-key`) makes a repeat return the original ActionRef.
 */
import type { Deps } from "../deps.js";
import { type ParsedArgs, strFlag } from "../args.js";
import { EXIT, UsageError } from "../exit-codes.js";
import { emitSuccess, kvTable, kvMarkdown } from "../output.js";

export async function rejectCommand(
  deps: Deps,
  parsed: ParsedArgs,
): Promise<number> {
  const actionId = parsed._[1];
  if (!parsed._[0] || !actionId) {
    throw new UsageError(
      "reject <id> <action> requires a run id and an action id",
    );
  }
  const ref = await deps.client.rejectAction(
    actionId,
    deps.accountId,
    strFlag(parsed, "reason") ?? "",
  );

  emitSuccess(deps, ref, {
    table: (r) =>
      kvTable([
        ["actionId", r.actionId],
        ["status", r.status],
      ]),
    md: (r) =>
      kvMarkdown("Action rejected", [
        ["actionId", r.actionId],
        ["status", r.status],
      ]),
  });
  return EXIT.OK;
}
