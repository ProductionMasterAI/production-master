import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { KEYCHAIN_PROBES } from "./keychain.js";

// Seam test: run the keychain probe against the REAL OS binary, unmocked.
//
// keychain.test.ts mocks execFile, so it cannot tell whether the probe's
// arguments are ones the real CLI accepts — which is how `security --version`
// (an option macOS `security` does not have; exit 2) shipped green while every
// macOS login fell back to in-memory storage. Only the real binary can answer
// "does this probe succeed on a machine that has a keychain?".
const probe = KEYCHAIN_PROBES.darwin;

describe.runIf(process.platform === "darwin")("keychain probe (real macOS binary)", () => {
  it("the darwin probe succeeds against /usr/bin/security", () => {
    expect(probe).toBeDefined();
    const [cmd, args] = probe!;
    expect(() => execFileSync(cmd, [...args], { stdio: "ignore" })).not.toThrow();
  });
});

describe("keychain probe table", () => {
  it("never probes macOS with --version (not a `security` option)", () => {
    expect(probe?.[1]).not.toContain("--version");
  });
});
