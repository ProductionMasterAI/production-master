/**
 * `pmctl start <ticket>` — create a run via POST /v1/runs.
 *
 * Honors `--title`, `--mode {standard|deep}`, and budget caps
 * (`--max-usd`, `--max-iterations`). The Idempotency-Key is set when the
 * ServiceClient is built (from `--idempotency-key`), so a repeat with the same
 * key returns the original run. Prints the run id and its
 * `investigation://<id>` URI.
 */
import type { Deps } from "../deps.js";
import type { CreateRunRequest, RunMode } from "@production-master/plugin-core";
import { type ParsedArgs, strFlag, numFlag } from "../args.js";
import { EXIT, UsageError } from "../exit-codes.js";
import { emitSuccess, kvTable, kvMarkdown } from "../output.js";

const RUN_MODES: readonly RunMode[] = ["standard", "deep"];

interface StartResult {
  investigationId: string;
  uri: string;
  status: string;
  title?: string;
}

function parseMode(parsed: ParsedArgs): RunMode | undefined {
  const raw = strFlag(parsed, "mode");
  if (raw === undefined) return undefined;
  if (!(RUN_MODES as readonly string[]).includes(raw)) {
    throw new UsageError(
      `--mode must be one of ${RUN_MODES.join(", ")} (got "${raw}")`,
    );
  }
  return raw as RunMode;
}

function parseBudget(parsed: ParsedArgs): CreateRunRequest["budget"] {
  const maxUsd = numFlag(parsed, "max-usd");
  const maxIterations = numFlag(parsed, "max-iterations");
  if (maxUsd === undefined && maxIterations === undefined) return undefined;
  return {
    ...(maxUsd !== undefined ? { maxUsd } : {}),
    ...(maxIterations !== undefined ? { maxIterations } : {}),
  };
}

export async function startCommand(
  deps: Deps,
  parsed: ParsedArgs,
): Promise<number> {
  const ticket = parsed._[0];
  if (!ticket) {
    throw new UsageError("start <ticket> requires a ticket reference");
  }
  const title = strFlag(parsed, "title");
  const mode = parseMode(parsed);
  const budget = parseBudget(parsed);

  const body: CreateRunRequest = {
    ticket,
    ...(title ? { title } : {}),
    ...(mode ? { mode } : {}),
    ...(budget ? { budget } : {}),
  };
  const run = await deps.client.createRun(body);

  const result: StartResult = {
    investigationId: run.investigationId,
    uri: `investigation://${run.investigationId}`,
    status: run.status,
    ...(run.title ? { title: run.title } : {}),
  };
  emitSuccess(deps, result, {
    table: (d) =>
      kvTable([
        ["investigationId", d.investigationId],
        ["uri", d.uri],
        ["status", d.status],
        ...(d.title ? [["title", d.title] as [string, string]] : []),
      ]),
    md: (d) =>
      kvMarkdown("Run started", [
        ["investigationId", d.investigationId],
        ["uri", d.uri],
        ["status", d.status],
        ...(d.title ? [["title", d.title] as [string, string]] : []),
      ]),
  });
  return EXIT.OK;
}
