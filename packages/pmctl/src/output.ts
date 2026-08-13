/**
 * Output layer: the versioned `pmctl/v1` JSON envelope plus human renderers
 * (table / markdown).
 *
 * `--output json` always prints the envelope to stdout so a pipeline like
 * `pmctl status <id> --output json | jq '.data.status'` works. `table` (the
 * human default) and `md` print rendered text; errors in those modes go to
 * stderr, while a json error envelope still goes to stdout so consumers can
 * parse `.ok` / `.error.code`.
 */
import type { CliErrorCode } from "./exit-codes.js";

export type OutputFormat = "json" | "table" | "md";

export const OUTPUT_FORMATS: readonly OutputFormat[] = ["json", "table", "md"];

export function isOutputFormat(v: string): v is OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(v);
}

/**
 * Versioned response envelope — `data` on success, `error` on failure. The
 * `error.code` is a client-owned {@link CliErrorCode}, not a raw service wire
 * code, so a `jq '.error.code'` consumer sees the same taxonomy that drives the
 * process exit status (see `CLI_ERROR_EXIT`).
 */
export interface CliEnvelope<T> {
  schema: "pmctl/v1";
  ok: boolean;
  data?: T;
  error?: { code: CliErrorCode; message: string };
}

/** @deprecated Use {@link CliEnvelope}. Retained as a type alias for callers. */
export type Envelope<T> = CliEnvelope<T>;

export function successEnvelope<T>(data: T): CliEnvelope<T> {
  return { schema: "pmctl/v1", ok: true, data };
}

export function errorEnvelope(
  code: CliErrorCode,
  message: string,
): CliEnvelope<never> {
  return { schema: "pmctl/v1", ok: false, error: { code, message } };
}

/** Where rendered output goes. Injected so tests can capture it. */
export interface OutputSink {
  output: OutputFormat;
  write: (s: string) => void;
  writeErr: (s: string) => void;
}

/** Human renderers for a payload, one per non-json format. */
export interface HumanRender<T> {
  table: (data: T) => string;
  md: (data: T) => string;
}

export function emitSuccess<T>(
  sink: OutputSink,
  data: T,
  render: HumanRender<T>,
): void {
  if (sink.output === "json") {
    sink.write(`${JSON.stringify(successEnvelope(data))}\n`);
    return;
  }
  const text = sink.output === "md" ? render.md(data) : render.table(data);
  sink.write(`${text}\n`);
}

export function emitError(
  sink: OutputSink,
  code: CliErrorCode,
  message: string,
): void {
  if (sink.output === "json") {
    sink.write(`${JSON.stringify(errorEnvelope(code, message))}\n`);
    return;
  }
  sink.writeErr(`Error [${code}]: ${message}\n`);
}

/** Render a key/value list as an aligned two-column table. */
export function kvTable(rows: Array<[string, string]>): string {
  const width = rows.reduce((m, [k]) => Math.max(m, k.length), 0);
  return rows.map(([k, v]) => `${k.padEnd(width)}  ${v}`).join("\n");
}

/** Render a key/value list as a markdown bullet list. */
export function kvMarkdown(
  title: string,
  rows: Array<[string, string]>,
): string {
  const body = rows.map(([k, v]) => `- **${k}:** ${v}`).join("\n");
  return `## ${title}\n\n${body}`;
}
