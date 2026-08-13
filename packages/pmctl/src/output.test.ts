import { describe, it, expect } from "vitest";
import {
  successEnvelope,
  errorEnvelope,
  emitSuccess,
  emitError,
  kvTable,
  isOutputFormat,
  type OutputSink,
} from "./output.js";

function mkSink(output: OutputSink["output"]): {
  sink: OutputSink;
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  return {
    sink: { output, write: (s) => out.push(s), writeErr: (s) => err.push(s) },
    out,
    err,
  };
}

describe("envelope", () => {
  it("success envelope carries schema + ok + data", () => {
    expect(successEnvelope({ a: 1 })).toEqual({
      schema: "pmctl/v1",
      ok: true,
      data: { a: 1 },
    });
  });

  it("error envelope carries schema + ok:false + error", () => {
    expect(errorEnvelope("auth", "nope")).toEqual({
      schema: "pmctl/v1",
      ok: false,
      error: { code: "auth", message: "nope" },
    });
  });
});

describe("isOutputFormat", () => {
  it("accepts the three formats and rejects others", () => {
    expect(isOutputFormat("json")).toBe(true);
    expect(isOutputFormat("table")).toBe(true);
    expect(isOutputFormat("md")).toBe(true);
    expect(isOutputFormat("yaml")).toBe(false);
  });
});

describe("emitSuccess", () => {
  it("json mode writes a single envelope line to stdout, jq-friendly", () => {
    const { sink, out } = mkSink("json");
    emitSuccess(
      sink,
      { status: "running" },
      { table: () => "T", md: () => "M" },
    );
    const parsed = JSON.parse(out.join("").trim());
    expect(parsed.ok).toBe(true);
    expect(parsed.data.status).toBe("running");
  });

  it("table mode writes the rendered table", () => {
    const { sink, out } = mkSink("table");
    emitSuccess(sink, {}, { table: () => "TABLE", md: () => "MD" });
    expect(out.join("")).toBe("TABLE\n");
  });
});

describe("emitError", () => {
  it("json mode writes the error envelope to stdout", () => {
    const { sink, out, err } = mkSink("json");
    emitError(sink, "budget_exhausted", "no funds");
    expect(err).toEqual([]);
    expect(JSON.parse(out.join("").trim())).toEqual({
      schema: "pmctl/v1",
      ok: false,
      error: { code: "budget_exhausted", message: "no funds" },
    });
  });

  it("table mode writes a human error to stderr", () => {
    const { sink, out, err } = mkSink("table");
    emitError(sink, "auth", "login first");
    expect(out).toEqual([]);
    expect(err.join("")).toContain("Error [auth]: login first");
  });
});

describe("kvTable", () => {
  it("aligns keys", () => {
    expect(
      kvTable([
        ["a", "1"],
        ["long", "2"],
      ]),
    ).toBe("a     1\nlong  2");
  });
});
