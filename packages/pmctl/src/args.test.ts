import { describe, it, expect } from "vitest";
import { parseArgs, strFlag, boolFlag, numFlag } from "./args.js";

describe("parseArgs", () => {
  it("collects positionals and string flags", () => {
    const p = parseArgs(["start", "ACME-1", "--title", "My Run"]);
    expect(p._).toEqual(["start", "ACME-1"]);
    expect(strFlag(p, "title")).toBe("My Run");
  });

  it("supports --flag=value", () => {
    const p = parseArgs(["--output=json", "status", "id"]);
    expect(strFlag(p, "output")).toBe("json");
    expect(p._).toEqual(["status", "id"]);
  });

  it("treats a flag followed by another flag as boolean", () => {
    const p = parseArgs(["events", "id", "--follow", "--since-seq", "3"]);
    expect(boolFlag(p, "follow")).toBe(true);
    expect(strFlag(p, "since-seq")).toBe("3");
  });

  it("-h is boolean", () => {
    expect(boolFlag(parseArgs(["-h"]), "h")).toBe(true);
  });
});

describe("numFlag", () => {
  it("parses a numeric flag value", () => {
    expect(
      numFlag(parseArgs(["start", "ACME-1", "--max-usd", "5"]), "max-usd"),
    ).toBe(5);
    expect(numFlag(parseArgs(["--max-iterations=8"]), "max-iterations")).toBe(
      8,
    );
  });

  it("returns undefined when absent or boolean-only", () => {
    expect(numFlag(parseArgs(["start", "ACME-1"]), "max-usd")).toBeUndefined();
    expect(numFlag(parseArgs(["--max-usd"]), "max-usd")).toBeUndefined();
  });

  it("throws a usage error on a non-numeric value", () => {
    expect(() => numFlag(parseArgs(["--max-usd", "lots"]), "max-usd")).toThrow(
      /must be a number/,
    );
  });
});
