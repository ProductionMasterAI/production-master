/**
 * `pmctl events <id> [--follow] [--since-seq <n>]` — bridge the investigation
 * SSE stream to stdout.
 *
 * Without `--follow`: print a one-shot replay slice (`sequence > sinceSeq`) and
 * return.
 *
 * With `--follow`: attach plugin-core's EventStream over the injected
 * SseConnector. `--since-seq <n>` seeds the cursor — the durable slice after
 * `n` is replayed through the same dedupe/order path, which sets the
 * `Last-Event-ID` the live connect resumes from (gap-free). EventStream's own
 * reconnect also carries `Last-Event-ID`, so a mid-stream drop resumes without
 * gaps. The follow promise resolves when a terminal run event arrives.
 */
import { EventStream } from "@production-master/plugin-core";
import type { InvestigationEventEnvelope } from "@production-master/plugin-core";
import type { Deps } from "../deps.js";
import { type ParsedArgs, strFlag, boolFlag } from "../args.js";
import { EXIT, UsageError } from "../exit-codes.js";
import { successEnvelope } from "../output.js";

function isTerminal(e: InvestigationEventEnvelope): boolean {
  return (
    e.type === "investigation.completed" || e.type === "investigation.failed"
  );
}

export async function eventsCommand(
  deps: Deps,
  parsed: ParsedArgs,
): Promise<number> {
  const id = parsed._[0];
  if (!id) {
    throw new UsageError("events <id> requires an investigation id");
  }
  const follow = boolFlag(parsed, "follow");

  let sinceSeq: number | undefined;
  const sinceRaw = strFlag(parsed, "since-seq");
  if (sinceRaw !== undefined) {
    sinceSeq = Number(sinceRaw);
    if (!Number.isInteger(sinceSeq) || sinceSeq < 0) {
      throw new UsageError("--since-seq must be a non-negative integer");
    }
  }

  const printEvent = (e: InvestigationEventEnvelope): void => {
    if (deps.output === "json") {
      deps.write(`${JSON.stringify(successEnvelope(e))}\n`);
    } else {
      deps.write(`[${e.sequence}] ${e.type} ${e.timestamp}\n`);
    }
  };

  if (!follow) {
    const slice = await deps.client.getEventSlice(id, sinceSeq ?? 0);
    for (const e of slice.events) printEvent(e);
    return EXIT.OK;
  }

  const stream = new EventStream({
    url: deps.streamUrlFor(id),
    connector: deps.connector,
    headers: deps.streamHeaders(),
    ...(deps.scheduleReconnect
      ? { scheduleReconnect: deps.scheduleReconnect }
      : {}),
    ...(deps.reconnectMs !== undefined
      ? { reconnectMs: deps.reconnectMs }
      : {}),
    ...(deps.maxReconnects !== undefined
      ? { maxReconnects: deps.maxReconnects }
      : {}),
  });

  return await new Promise<number>((resolve, reject) => {
    let settled = false;
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      stream.close();
      resolve(code);
    };

    stream.subscribe((e) => {
      printEvent(e);
      if (isTerminal(e)) finish(EXIT.OK);
    });

    if (sinceSeq !== undefined) {
      deps.client.getEventSlice(id, sinceSeq).then(
        (slice) => {
          stream.applyReplay(slice.events);
          if (!settled) stream.open();
        },
        (err) => {
          if (settled) return;
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    } else {
      stream.open();
    }
  });
}
