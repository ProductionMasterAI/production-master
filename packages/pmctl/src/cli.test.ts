import { describe, it, expect } from "vitest";
import { runCli, type Io } from "./cli.js";
import { EXIT } from "./exit-codes.js";

function mkIo(env: Record<string, string | undefined> = {}): {
  io: Io;
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { write: (s) => out.push(s), writeErr: (s) => err.push(s), env },
    out,
    err,
  };
}

describe("runCli", () => {
  it("prints usage with no args and exits 0", async () => {
    const { io, out } = mkIo();
    expect(await runCli([], io)).toBe(EXIT.OK);
    expect(out.join("")).toContain("Usage: pmctl <command>");
  });

  it("--help exits 0 and prints usage", async () => {
    const { io, out } = mkIo();
    expect(await runCli(["--help"], io)).toBe(EXIT.OK);
    expect(out.join("")).toContain("Commands:");
  });

  it("unknown command exits 2", async () => {
    const { io, err } = mkIo();
    expect(await runCli(["frobnicate"], io)).toBe(EXIT.USAGE);
    expect(err.join("")).toContain("Unknown command");
  });

  it("invalid --output exits 2", async () => {
    const { io } = mkIo({ PM_SERVICE_URL: "https://svc.test" });
    expect(await runCli(["status", "inv_1", "--output", "yaml"], io)).toBe(
      EXIT.USAGE,
    );
  });

  it("missing --service surfaces a usage error and json envelope", async () => {
    const { io, out } = mkIo({}); // no PM_SERVICE_URL
    const code = await runCli(["status", "inv_1", "--output", "json"], io);
    expect(code).toBe(EXIT.USAGE);
    const env = JSON.parse(out.join("").trim());
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("usage");
  });
});
