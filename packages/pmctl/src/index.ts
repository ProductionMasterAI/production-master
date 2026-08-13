/**
 * @production-master/pmctl — public surface.
 *
 * The package primarily ships the `pmctl` bin (see `./cli.js`). These exports
 * let tests and adapters drive the CLI in-process and reuse its envelope /
 * exit-code contract. NO LLM/provider SDK is imported anywhere in this package.
 */
export { runCli } from "./cli.js";
export type { Io } from "./cli.js";
export type { Deps } from "./deps.js";
export {
  EXIT,
  CLI_ERROR_CODES,
  CLI_ERROR_EXIT,
  UsageError,
  AuthError,
  classifyError,
  type ExitCode,
  type CliErrorCode,
  type ClassifiedError,
} from "./exit-codes.js";
export {
  successEnvelope,
  errorEnvelope,
  isOutputFormat,
  OUTPUT_FORMATS,
  type CliEnvelope,
  type Envelope,
  type OutputFormat,
} from "./output.js";
export { parseArgs, type ParsedArgs } from "./args.js";
