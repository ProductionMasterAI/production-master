/**
 * `pmctl status <id>` — fetch a run via GET /v1/runs/:id.
 */
import type { Deps } from "../deps.js";
import type { ParsedArgs } from "../args.js";
import { EXIT, UsageError } from "../exit-codes.js";
import { emitSuccess, kvTable, kvMarkdown } from "../output.js";

export async function statusCommand(
  deps: Deps,
  parsed: ParsedArgs,
): Promise<number> {
  const id = parsed._[0];
  if (!id) {
    throw new UsageError("status <id> requires an investigation id");
  }
  const run = await deps.client.getRun(id);

  emitSuccess(deps, run, {
    table: (r) =>
      kvTable([
        ["investigationId", r.investigationId],
        ["status", r.status],
        ["title", r.title ?? "-"],
        ["createdAt", r.createdAt],
        ["completedAt", r.completedAt ?? "-"],
        ["costUsd", r.costUsd.toFixed(4)],
        ["reportUri", r.reportUri ?? "-"],
      ]),
    md: (r) =>
      kvMarkdown("Run status", [
        ["investigationId", r.investigationId],
        ["status", r.status],
        ["title", r.title ?? "-"],
        ["createdAt", r.createdAt],
        ["completedAt", r.completedAt ?? "-"],
        ["costUsd", r.costUsd.toFixed(4)],
        ["reportUri", r.reportUri ?? "-"],
      ]),
  });
  return EXIT.OK;
}
