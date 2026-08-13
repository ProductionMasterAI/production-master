/**
 * `pmctl report <id>` — fetch the rendered report via GET /v1/runs/:id/report.
 *
 * `--format {md|json|html}` selects the report body format (default md). In
 * `--output json` mode the whole ReportResponse is wrapped in the envelope;
 * in table/md mode the report content is printed verbatim.
 */
import type { Deps } from "../deps.js";
import { type ParsedArgs, strFlag } from "../args.js";
import { EXIT, UsageError } from "../exit-codes.js";
import { emitSuccess } from "../output.js";

const REPORT_FORMATS = ["md", "json", "html"] as const;
type ReportFormat = (typeof REPORT_FORMATS)[number];

export async function reportCommand(
  deps: Deps,
  parsed: ParsedArgs,
): Promise<number> {
  const id = parsed._[0];
  if (!id) {
    throw new UsageError("report <id> requires an investigation id");
  }
  const fmt = strFlag(parsed, "format") ?? "md";
  if (!(REPORT_FORMATS as readonly string[]).includes(fmt)) {
    throw new UsageError(
      `--format must be one of ${REPORT_FORMATS.join(", ")}`,
    );
  }
  const report = await deps.client.getReport(id, fmt as ReportFormat);

  emitSuccess(deps, report, {
    table: (r) => r.content,
    md: (r) => r.content,
  });
  return EXIT.OK;
}
