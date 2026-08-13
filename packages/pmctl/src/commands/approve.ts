/**
 * `pmctl approve <id> <action>` — approve a proposed action via the BFF.
 *
 * PROPOSE/APPROVE ONLY (AD-10): pmctl never executes a side effect directly. It
 * records approval; the runtime performs the action. The ServiceClient carries
 * an Idempotency-Key (from `--idempotency-key`), so a repeat returns the
 * original ActionRef rather than double-approving.
 *
 * Q9 capability tokens: `--grant` additionally mints a session-scoped trust
 * grant so later actions of the same risk × reversibility class auto-approve for
 * this investigation until it expires. This is the CLI counterpart to the web
 * Settings "Trust grants" surface (which lists and revokes what this mints).
 */
import type {
  TrustRiskClass,
  TrustReversibility,
} from "@production-master/plugin-core";
import type { Deps } from "../deps.js";
import { type ParsedArgs, strFlag, boolFlag, numFlag } from "../args.js";
import { EXIT, UsageError } from "../exit-codes.js";
import { emitSuccess, kvTable, kvMarkdown } from "../output.js";

const RISK_CLASSES: readonly TrustRiskClass[] = [
  "read_only",
  "low",
  "high",
  "irreversible",
];
const REVERSIBILITIES: readonly TrustReversibility[] = [
  "reversible",
  "compensable",
  "irreversible",
];
const MAX_TTL_MINUTES = 24 * 60;

interface GrantSpec {
  riskClass: TrustRiskClass;
  reversibility: TrustReversibility;
  ttlMinutes: number;
  sessionLabel?: string;
}

/**
 * Parse and validate the capability-token flags. Returns undefined when
 * `--grant` is absent (plain approve). Error messages mirror the Settings UI
 * vocabulary: risk × reversibility classes, session-scoped, expiry.
 */
function parseGrant(parsed: ParsedArgs): GrantSpec | undefined {
  if (!boolFlag(parsed, "grant")) return undefined;

  const riskClass = strFlag(parsed, "risk") as TrustRiskClass | undefined;
  if (!riskClass || !RISK_CLASSES.includes(riskClass)) {
    throw new UsageError(`--grant requires --risk <${RISK_CLASSES.join("|")}>`);
  }
  const reversibility = strFlag(parsed, "reversibility") as
    TrustReversibility | undefined;
  if (!reversibility || !REVERSIBILITIES.includes(reversibility)) {
    throw new UsageError(
      `--grant requires --reversibility <${REVERSIBILITIES.join("|")}>`,
    );
  }
  const ttlMinutes = numFlag(parsed, "ttl-minutes");
  if (
    ttlMinutes === undefined ||
    !Number.isInteger(ttlMinutes) ||
    ttlMinutes < 1 ||
    ttlMinutes > MAX_TTL_MINUTES
  ) {
    throw new UsageError(
      `--grant requires --ttl-minutes <1..${MAX_TTL_MINUTES}> (expiry)`,
    );
  }
  const sessionLabel = strFlag(parsed, "session-label");
  return {
    riskClass,
    reversibility,
    ttlMinutes,
    ...(sessionLabel ? { sessionLabel } : {}),
  };
}

export async function approveCommand(
  deps: Deps,
  parsed: ParsedArgs,
): Promise<number> {
  const investigationId = parsed._[0];
  const actionId = parsed._[1];
  if (!investigationId || !actionId) {
    throw new UsageError(
      "approve <id> <action> requires a run id and an action id",
    );
  }
  // Validate the grant flags before any network call so a bad --grant never
  // approves the action and then fails half-way.
  const grantSpec = parseGrant(parsed);

  const ref = await deps.client.approveAction(actionId, deps.accountId);

  if (!grantSpec) {
    emitSuccess(deps, ref, {
      table: (r) =>
        kvTable([
          ["actionId", r.actionId],
          ["status", r.status],
        ]),
      md: (r) =>
        kvMarkdown("Action approved", [
          ["actionId", r.actionId],
          ["status", r.status],
        ]),
    });
    return EXIT.OK;
  }

  const grant = await deps.client.mintTrustGrant({
    investigationId,
    riskClass: grantSpec.riskClass,
    reversibility: grantSpec.reversibility,
    grantedBy: deps.accountId,
    ttlMinutes: grantSpec.ttlMinutes,
    ...(grantSpec.sessionLabel ? { sessionLabel: grantSpec.sessionLabel } : {}),
  });

  const payload = { action: ref, grant };
  const rows: Array<[string, string]> = [
    ["actionId", ref.actionId],
    ["status", ref.status],
    ["grantId", grant.id],
    ["risk", grant.riskClass],
    ["reversibility", grant.reversibility],
    ["expiresAt", grant.expiresAt],
  ];
  emitSuccess(deps, payload, {
    table: () => kvTable(rows),
    md: () => kvMarkdown("Action approved · capability token minted", rows),
  });
  return EXIT.OK;
}
